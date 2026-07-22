const StockAdjustment = require('../mysql-models/StockAdjustment');
const Product = require('../mysql-models/Product');
const sequelize = require('../config/sqldb');

const getStockAdjustments = async (req, res) => {
  try {
    const adjustments = await StockAdjustment.findAll({
      include: [{ model: Product, attributes: ['id', 'name', 'stockQuantity', 'unit'] }],
      order: [['date', 'DESC']],
    });
    return res.status(200).json(adjustments);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const addStockAdjustment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { productId, adjustmentType, quantity, reason, date, companyId } = req.body;

    const product = await Product.findByPk(productId, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    const adjQty = Number(quantity);
    let newStock = Number(product.stockQuantity || 0);

    if (adjustmentType === 'ADD') {
      newStock += adjQty;
    } else if (adjustmentType === 'REMOVE') {
      newStock = Math.max(0, newStock - adjQty);
    } else if (adjustmentType === 'CORRECTION') {
      newStock = adjQty;
    }

    await product.update({ stockQuantity: newStock }, { transaction });

    const adjustment = await StockAdjustment.create(
      {
        productId,
        adjustmentType: adjustmentType || 'CORRECTION',
        quantity: adjQty,
        reason,
        date: date || new Date(),
        companyId: companyId || 1,
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).json(adjustment);
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getStockAdjustments,
  addStockAdjustment,
};
