const Product = require('../mysql-models/Product');
const sequelize = require('../config/sqldb');
const StockMovement = require('../mysql-models/StockMovement');
const SalesItem = require('../mysql-models/Sales-Items');
const PurchaseItem = require('../mysql-models/Purchase-Items');
const Purchase = require('../mysql-models/PurchaseBill');
const ProductBatch = require('../mysql-models/ProductBatch');
const ProductVariant = require('../mysql-models/ProductVariant');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const {
  productWithMargin,
  resolveProductPricing,
} = require('../utils/productMargin');
const {
  resolveProductUnitConfig,
  normalizeStockQuantity,
  normalizeProductQuantity,
} = require('../utils/productQuantity');
const { receivePurchaseBatch } = require('../utils/inventoryBatches');
const { adjustedUnbatchedAverageCost } = require('../utils/inventoryValuation');
const { getLatestBatchPriceHistory } = require('../utils/batchPriceHistory');

const isStaffRequest = (req) => req.authRole?.systemKey === 'STAFF';

const productForRequest = (req, product) => {
  const data = productWithMargin(product);
  if (isStaffRequest(req)) {
    for (const field of [
      'purchasePrice',
      'purchasePriceType',
      'unbatchedAverageCost',
      'profitMargin',
      'purchaseBasePrice',
      'purchaseGSTAmount',
      'profitAmount',
      'calculatedProfit',
    ]) {
      delete data[field];
    }
  }
  return data;
};

const batchForRequest = (req, batch) => {
  const data = typeof batch.toJSON === 'function' ? batch.toJSON() : { ...batch };
  if (isStaffRequest(req)) {
    delete data.purchasePrice;
    delete data.inventoryUnitCost;
  }
  return data;
};

const assertUnitTypeCanChange = async (product, unitConfig) => {
  if (unitConfig.unitType === product.unitType) {
    return;
  }

  const historyCounts = await Promise.all([
    SalesItem.count({ where: { productId: product.id } }),
    PurchaseItem.count({ where: { productId: product.id } }),
  ]);
  if (
    Number(product.stockQuantity || 0) !== 0 ||
    historyCounts.some((count) => count > 0)
  ) {
    throw new Error(
      'Product unit type cannot change after stock or sales/purchase history exists; create a new product for the other unit type'
    );
  }
};

// @desc    Get all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll();

    return res.status(200).json(products.map((product) => productForRequest(req, product)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    return res.status(200).json(productForRequest(req, product));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const lookupProductByBarcode = async (req, res) => {
  try {
    const barcode = String(req.query.barcode || '').trim();
    const companyId = Number(req.loyaltyUser?.companyId);
    if (!barcode || barcode.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'A valid barcode is required',
      });
    }
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'A company context is required for barcode lookup',
      });
    }

    const [products, variants] = await Promise.all([
      Product.findAll({ where: { barcode } }),
      ProductVariant.findAll({ where: { barcode } }),
    ]);
    const productIds = [
      ...new Set([
        ...products.map((product) => Number(product.id)),
        ...variants.map((variant) => Number(variant.productId)),
      ]),
    ];
    if (productIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No product was found for this barcode',
      });
    }

    const matches = [
      ...products
        .map((product) => ({ productId: Number(product.id), variant: null })),
      ...variants
        .map((variant) => ({
          productId: Number(variant.productId),
          variant,
        })),
    ];

    if (matches.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No product was found for this barcode',
      });
    }
    if (matches.length > 1) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_BARCODE',
        message: 'This barcode is assigned to multiple product records',
      });
    }

    const match = matches[0];
    const product = await Product.findByPk(match.productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'The product assigned to this barcode is unavailable',
      });
    }
    const batches = await ProductBatch.findAll({
      where: { productId: product.id, companyId },
      attributes: [
        'id',
        'batchNumber',
        'mfgDate',
        'expiryDate',
        'availableQuantity',
        'mrp',
        'salePrice',
        'purchasePrice',
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    });

    return res.status(200).json({
      success: true,
      data: {
        product: productForRequest(req, product),
        matchedBarcode: barcode,
        variant: match.variant
          ? {
              id: match.variant.id,
              sku: match.variant.sku,
              variantName: match.variant.variantName,
              attributes: match.variant.attributes,
              price: match.variant.price,
              barcode: match.variant.barcode,
            }
          : null,
        batches: batches.map((batch) => batchForRequest(req, batch)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Public
const createProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      name,
      HSNCode,
      MRP,
      stockQuantity,
      discount,
      unit,
      barcode,
      categoryId,
      sku,
      batchNo,
      serialNo,
      expiryDate,
      minStockLevel,
      reorderLevel,
      minOrderQuantity,
      brandId,
    } = req.body;

    const unitConfig = resolveProductUnitConfig(req.body);
    const normalizedStock = normalizeStockQuantity(
      stockQuantity ?? 0,
      req.body.stockUnit,
      unitConfig
    );
    const pricing = resolveProductPricing(req.body);
    const product = await Product.create({
      name,
      HSNCode: HSNCode?.trim() || null,
      MRP,
      taxRate: pricing.taxRate,
      salesPrice: pricing.sellingPrice,
      purchasePrice: pricing.purchasePrice,
      purchasePriceType: pricing.purchasePriceType,
      sellingPriceType: pricing.sellingPriceType,
      profitMargin: pricing.profitMargin,
      stockQuantity: normalizedStock,
      ...unitConfig,
      discount,
      unit,
      barcode,
      categoryId: categoryId === '' || categoryId === undefined ? null : categoryId,
      sku,
      batchNo,
      serialNo,
      expiryDate: expiryDate || null,
      minStockLevel: minStockLevel || 5,
      reorderLevel: reorderLevel || 10,
      minOrderQuantity: minOrderQuantity || 1,
      brandId: brandId || null,
    }, { transaction });

    if (normalizedStock > 0) {
      const batch = await receivePurchaseBatch({
        product,
        batchNumber: String(req.body.batchNumber || req.body.batchNo || `OPENING-${product.id}`),
        mfgDate: req.body.mfgDate,
        expiryDate: req.body.expiryDate,
        paidQuantity: normalizedStock,
        freeQuantity: 0,
        purchasePrice: pricing.purchasePrice,
        mrp: MRP,
        salePrice: pricing.sellingPrice,
        gstPercentage: pricing.taxRate,
        companyId: req.loyaltyUser?.companyId ?? req.body.companyId ?? null,
        transaction,
      });
      await StockMovement.create({
        warehouseId: req.body.warehouseId || 1,
        productId: product.id,
        batchId: batch.id,
        movementType: 'ADJUSTMENT',
        quantity: normalizedStock,
        quantityUnit: unitConfig.baseUnit,
        referenceType: 'ProductOpeningStock',
        referenceId: String(product.id),
        notes: `Opening stock batch ${batch.batchNumber}`,
        performedBy: req.body.userId || req.user?.id || null,
      }, { transaction });
    }

    await transaction.commit();
    return res.status(201).json(productWithMargin(product));
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return res.status(400).json({ message: error.message });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Public
const updateProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const product = await Product.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    const updates = { ...req.body };
    if (updates.categoryId === '') {
      updates.categoryId = null;
    }
    const incomingUnitCost = req.body.unbatchedAcquisitionCost;
    delete updates.unbatchedAcquisitionCost;
    delete updates.unbatchedAverageCost;
    delete updates.stockUnit;
    [
      'sellingPrice',
      'profitMargin',
      'calculatedProfit',
      'profit',
      'profitAmount',
      'gstRate',
      'purchaseBasePrice',
      'purchaseGSTAmount',
      'sellingBasePrice',
      'sellingGSTAmount',
    ].forEach((field) => delete updates[field]);

    const unitConfig = resolveProductUnitConfig(req.body, product);
    await assertUnitTypeCanChange(product, unitConfig);
    Object.assign(updates, unitConfig);
    if (req.body.stockQuantity !== undefined) {
      updates.stockQuantity = normalizeStockQuantity(
        req.body.stockQuantity,
        req.body.stockUnit,
        unitConfig
      );
      const batchQuantity = Number(await ProductBatch.sum('availableQuantity', {
        where: { productId: product.id },
        transaction,
      })) || 0;
      updates.unbatchedAverageCost = adjustedUnbatchedAverageCost({
        currentStock: product.stockQuantity,
        nextStock: updates.stockQuantity,
        batchQuantity,
        averageCost: product.unbatchedAverageCost,
        incomingQuantity: Math.max(
          0,
          updates.stockQuantity - Number(product.stockQuantity || 0)
        ),
        incomingUnitCost,
      });
    }

    const pricing = resolveProductPricing(req.body, product, { required: false });
    if (pricing) {
      Object.assign(updates, {
        purchasePrice: pricing.purchasePrice,
        salesPrice: pricing.sellingPrice,
        purchasePriceType: pricing.purchasePriceType,
        sellingPriceType: pricing.sellingPriceType,
        taxRate: pricing.taxRate,
        profitMargin: pricing.profitMargin,
      });
    }

    updates.expiryDate = req.body.expiryDate || null;

    await product.update(updates, { transaction });
    await transaction.commit();

    const updatedProduct = await Product.findByPk(req.params.id);

    return res.status(200).json(productWithMargin(updatedProduct));
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return res.status(400).json({ message: error.message });
  }
};

// @desc    Update product quantity Bulk
// @route   PUT /api/products/:id
// @access  Public
const updateStockBulk = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const items = req.body; // array of { id, stockQuantity }

    if (!Array.isArray(items)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid data format' });
    }

    for (const item of items) {
      if (!item.id) {
        throw new Error('Missing item Id');
      }

      const product = await Product.findByPk(item.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) throw new Error(`Product not found: ${item.id}`);
      const unitConfig = resolveProductUnitConfig(item, product);
      await assertUnitTypeCanChange(product, unitConfig);
      const updates = { ...unitConfig };
      if (item.stockQuantity !== undefined) {
        updates.stockQuantity = normalizeStockQuantity(
          item.stockQuantity,
          item.stockUnit,
          unitConfig
        );
        const batchQuantity = Number(await ProductBatch.sum('availableQuantity', {
          where: { productId: product.id },
          transaction,
        })) || 0;
        updates.unbatchedAverageCost = adjustedUnbatchedAverageCost({
          currentStock: product.stockQuantity,
          nextStock: updates.stockQuantity,
          batchQuantity,
          averageCost: product.unbatchedAverageCost,
          incomingQuantity: Math.max(
            0,
            updates.stockQuantity - Number(product.stockQuantity || 0)
          ),
          incomingUnitCost: item.unbatchedAcquisitionCost,
        });
      }
      if (item.discount !== undefined) {
        const discount = Number(item.discount);
        if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
          throw new Error('Discount must be between 0 and 100');
        }
        updates.discount = discount;
      }
      if (
        item.salesPrice !== undefined ||
        item.sellingPrice !== undefined ||
        item.purchasePrice !== undefined ||
        item.purchasePriceType !== undefined ||
        item.sellingPriceType !== undefined ||
        item.taxRate !== undefined
      ) {
        const pricing = resolveProductPricing(
          item,
          product,
          { required: false }
        );
        Object.assign(updates, {
          purchasePrice: pricing.purchasePrice,
          salesPrice: pricing.sellingPrice,
          purchasePriceType: pricing.purchasePriceType,
          sellingPriceType: pricing.sellingPriceType,
          taxRate: pricing.taxRate,
          profitMargin: pricing.profitMargin,
        });
      }
      await product.update(updates, { transaction });
    }

    await transaction.commit();

    // ✅ Fetch updated products (optional)
    const ids = items.map((i) => i.id);

    const updatedProducts = await Product.findAll({
      where: { id: ids },
    });

    return res.status(200).json({
      message: 'Stock updated successfully',
      data: updatedProducts.map(productWithMargin),
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return res.status(400).json({ message: error.message });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Public
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await Product.destroy({
      where: { id: req.params.id },
    });

    return res.status(200).json({
      id: req.params.id,
      message: 'Product deleted',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get product batches
const getProductBatches = async (req, res) => {
  try {
    const { productId } = req.params;
    const companyId = Number(req.loyaltyUser?.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(403).json({
        message: 'A valid authenticated company is required to view product batches',
      });
    }
    const where = { productId, companyId };
    if (String(req.query.historyOnly).toLowerCase() === 'true') {
      const batches = await ProductBatch.findAll({
        where,
        attributes: [
          'id',
          'batchNumber',
          'createdAt',
          'mrp',
          'salePrice',
          'purchasePrice',
        ],
        include: [
          {
            model: PurchaseItem,
            attributes: ['id', 'purchaseId'],
            required: false,
            include: [
              {
                model: Purchase,
                attributes: ['purchaseDate'],
                where: { companyId },
                required: false,
              },
            ],
          },
        ],
      });
      const history = getLatestBatchPriceHistory(batches);
      if (isStaffRequest(req)) {
        history.forEach((batch) => {
          delete batch.purchasePrice;
        });
      }
      return res.status(200).json(history);
    }
    if (String(req.query.availableOnly).toLowerCase() === 'true') {
      const includeBatchId = Number(req.query.includeBatchId);
      where[Op.or] = [
        { availableQuantity: { [Op.gt]: 0 } },
        ...(Number.isInteger(includeBatchId) && includeBatchId > 0
          ? [{ id: includeBatchId }]
          : []),
      ];
    }
    const batches = await ProductBatch.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
    return res.status(200).json(batches.map((batch) => batchForRequest(req, batch)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Add product batch
const addProductBatch = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { productId } = req.params;
    const {
      batchNumber,
      mfgDate,
      expiryDate,
      mrp,
      MRP,
      salePrice,
      purchasePrice,
      gstPercentage,
      companyId,
      userId,
      quantityUnit,
    } = req.body;
    const product = await Product.findByPk(productId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }
    if (!String(batchNumber || '').trim()) {
      await transaction.rollback();
      return res.status(400).json({ message: 'batchNumber is required' });
    }

    const unit = quantityUnit || product.baseUnit;
    const paid = normalizeProductQuantity({
      quantity: req.body.paidQuantity ?? req.body.quantity,
      quantityUnit: unit,
    }, product);
    const freeQuantity = normalizeProductQuantity({
      quantity: req.body.freeQuantity ?? 0,
      quantityUnit: unit,
    }, product, { allowZero: true }).quantity;
    const batch = await receivePurchaseBatch({
      product,
      batchNumber: String(batchNumber).trim(),
      mfgDate,
      expiryDate,
      paidQuantity: paid.quantity,
      freeQuantity,
      purchasePrice: purchasePrice ?? product.purchasePrice,
      mrp: mrp ?? MRP ?? product.MRP,
      salePrice: salePrice ?? product.salesPrice,
      gstPercentage: gstPercentage ?? product.taxRate,
      companyId: companyId ?? product.companyId ?? null,
      transaction,
    });
    const receivedQuantity = paid.quantity + freeQuantity;
    await product.increment('stockQuantity', {
      by: receivedQuantity,
      transaction,
    });
    await StockMovement.create({
      warehouseId: req.body.warehouseId || 1,
      productId: product.id,
      batchId: batch.id,
      movementType: 'PURCHASE',
      quantity: receivedQuantity,
      quantityUnit: paid.quantityUnit,
      referenceType: 'ProductBatch',
      referenceId: String(batch.id),
      notes: `Batch receipt ${batch.batchNumber}`,
      performedBy: userId || req.user?.id || null,
    }, { transaction });

    await transaction.commit();
    return res.status(201).json(batch);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return res.status(error.code === 'INVALID_PRODUCT_QUANTITY' ? 400 : 500)
      .json({ message: error.message });
  }
};

// @desc    Update product batch
const updateProductBatch = async (req, res) => {
  try {
    const { productId, batchId } = req.params;
    const batch = await ProductBatch.findOne({ where: { id: batchId, productId } });

    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    await batch.update(req.body);
    return res.status(200).json(batch);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Delete product batch
const deleteProductBatch = async (req, res) => {
  try {
    const { productId, batchId } = req.params;
    const batch = await ProductBatch.findOne({ where: { id: batchId, productId } });

    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    await batch.destroy();
    return res.status(200).json({ message: 'Batch deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  lookupProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStockBulk,
  getProductBatches,
  addProductBatch,
  updateProductBatch,
  deleteProductBatch,
};
