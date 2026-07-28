const StockMovement = require('../mysql-models/StockMovement');
const StockTransfer = require('../mysql-models/StockTransfer');
const StockTransferItem = require('../mysql-models/StockTransferItem');
const Product = require('../mysql-models/Product');
const Warehouse = require('../mysql-models/Warehouse');
const sequelize = require('../config/sqldb');

// Get Stock Ledger audit logs
const getStockLedger = async (req, res) => {
  try {
    const { productId, warehouseId, limit = 50 } = req.query;
    const where = {};
    if (productId) where.productId = productId;
    if (warehouseId) where.warehouseId = warehouseId;

    const movements = await StockMovement.findAll({
      where,
      include: [
        { model: Product, attributes: ['id', 'name', 'sku', 'barcode'] },
        { model: Warehouse, attributes: ['id', 'name', 'code'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
    });

    return res.status(200).json({
      success: true,
      data: movements,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get Low Stock / Reorder Alerts
const getReorderAlerts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: sequelize.literal('stockQuantity <= reorderLevel'),
      order: [['stockQuantity', 'ASC']],
    });

    return res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get all Stock Transfers
const getTransfers = async (req, res) => {
  try {
    const transfers = await StockTransfer.findAll({
      include: [
        { model: Warehouse, as: 'FromWarehouse', attributes: ['id', 'name', 'code'] },
        { model: Warehouse, as: 'ToWarehouse', attributes: ['id', 'name', 'code'] },
        {
          model: StockTransferItem,
          as: 'items',
          include: [{ model: Product, attributes: ['id', 'name', 'sku'] }],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      success: true,
      data: transfers,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Create new Stock Transfer (Draft)
const createTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { fromWarehouseId, toWarehouseId, transferDate, notes, items } = req.body;

    if (!fromWarehouseId || !toWarehouseId || !items || !items.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Source warehouse, destination warehouse, and items are required' });
    }

    if (fromWarehouseId === toWarehouseId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Source and destination warehouse cannot be the same' });
    }

    const transferNumber = `TRF-${Date.now().toString().slice(-6)}`;
    const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantitySent || 0), 0);

    const transfer = await StockTransfer.create(
      {
        transferNumber,
        fromWarehouseId,
        toWarehouseId,
        transferDate: transferDate || new Date(),
        notes: notes || '',
        status: 'DISPATCHED',
        totalQuantity,
      },
      { transaction }
    );

    for (const item of items) {
      await StockTransferItem.create(
        {
          stockTransferId: transfer.id,
          productId: item.productId,
          quantitySent: Number(item.quantitySent),
          quantityReceived: 0,
        },
        { transaction }
      );

      // Deduct stock from source warehouse / product
      const product = await Product.findByPk(item.productId, { transaction });
      if (product) {
        await product.decrement('stockQuantity', { by: Number(item.quantitySent), transaction });
      }

      // Log Stock Movement OUT
      await StockMovement.create(
        {
          warehouseId: fromWarehouseId,
          productId: item.productId,
          movementType: 'TRANSFER_OUT',
          quantity: -Math.abs(Number(item.quantitySent)),
          referenceType: 'StockTransfer',
          referenceId: transfer.transferNumber,
          notes: `Transfer dispatched to warehouse #${toWarehouseId}`,
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Stock transfer dispatched successfully',
      data: transfer,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

// Receive Stock Transfer at Destination Warehouse
const receiveTransfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const transfer = await StockTransfer.findByPk(id, {
      include: [{ model: StockTransferItem, as: 'items' }],
      transaction,
    });

    if (!transfer) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Stock transfer not found' });
    }

    if (transfer.status === 'RECEIVED') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Stock transfer is already received' });
    }

    for (const item of transfer.items) {
      const qty = Number(item.quantitySent);
      await item.update({ quantityReceived: qty }, { transaction });

      // Add stock to destination
      const product = await Product.findByPk(item.productId, { transaction });
      if (product) {
        await product.increment('stockQuantity', { by: qty, transaction });
      }

      // Log Stock Movement IN
      await StockMovement.create(
        {
          warehouseId: transfer.toWarehouseId,
          productId: item.productId,
          movementType: 'TRANSFER_IN',
          quantity: qty,
          referenceType: 'StockTransfer',
          referenceId: transfer.transferNumber,
          notes: `Transfer received from warehouse #${transfer.fromWarehouseId}`,
        },
        { transaction }
      );
    }

    await transfer.update({ status: 'RECEIVED' }, { transaction });
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Stock transfer received and added to inventory',
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getStockLedger,
  getReorderAlerts,
  getTransfers,
  createTransfer,
  receiveTransfer,
};
