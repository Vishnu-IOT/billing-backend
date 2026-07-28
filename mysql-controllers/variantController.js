const ProductVariant = require('../mysql-models/ProductVariant');
const Product = require('../mysql-models/Product');

const getVariantsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const variants = await ProductVariant.findAll({
      where: { productId },
      order: [['variantName', 'ASC']],
    });
    return res.status(200).json({ success: true, data: variants });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createVariant = async (req, res) => {
  try {
    const { productId, sku, barcode, variantName, attributes, price, stockQuantity } = req.body;
    if (!productId || !sku || !variantName || price === undefined) {
      return res.status(400).json({ message: 'Product ID, SKU, Variant Name, and Price are required' });
    }

    const variant = await ProductVariant.create({
      productId,
      sku,
      barcode,
      variantName,
      attributes: typeof attributes === 'string' ? attributes : JSON.stringify(attributes || {}),
      price: Number(price),
      stockQuantity: Number(stockQuantity || 0),
    });

    return res.status(201).json({ success: true, message: 'Product variant created', data: variant });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const variant = await ProductVariant.findByPk(id);
    if (!variant) return res.status(404).json({ message: 'Variant not found' });

    await variant.destroy();
    return res.status(200).json({ success: true, message: 'Variant deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { getVariantsByProduct, createVariant, deleteVariant };
