const Product = require('../mysql-models/Product');
const { validationResult } = require('express-validator');

// @desc    Get all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll();

    return res.status(200).json(products);
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

    return res.status(200).json(product);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Public
const createProduct = async (req, res) => {
  try {
    const {
      name,
      HSNCode,
      MRP,
      taxRate,
      salesPrice,
      purchasePrice,
      stockQuantity,
      discount,
      unit,
      barcode,
      categoryId,
      sku,
      batchNo,
      serialNo,
      expiryDate,
    } = req.body;

    const product = await Product.create({
      name,
      HSNCode,
      MRP,
      taxRate,
      salesPrice,
      purchasePrice,
      // stockQuantity,
      discount,
      unit,
      barcode,
      categoryId,
      sku,
      batchNo,
      serialNo,
      expiryDate: expiryDate || null,
    });

    return res.status(201).json(product);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Public
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await Product.update({ ...req.body, expiryDate: req.body.expiryDate || null }, {
      where: { id: req.params.id },
    });

    const updatedProduct = await Product.findByPk(req.params.id);

    return res.status(200).json(updatedProduct);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// @desc    Update product quantity Bulk
// @route   PUT /api/products/:id
// @access  Public
const updateStockBulk = async (req, res) => {
  try {
    const items = req.body; // array of { id, stockQuantity }

    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'Invalid data format' });
    }

    const updatePromises = items.map((item) => {
      if (!item.id || item.stockQuantity == null) {
        throw new Error('Missing id or stockQuantity');
      }

      return Product.update(
        { stockQuantity: item.stockQuantity, salesPrice: item.salesPrice },
        { where: { id: item.id } }
      );
    });

    await Promise.all(updatePromises);

    // ✅ Fetch updated products (optional)
    const ids = items.map((i) => i.id);

    const updatedProducts = await Product.findAll({
      where: { id: ids },
    });

    return res.status(200).json({
      message: 'Stock updated successfully',
      data: updatedProducts,
    });
  } catch (error) {
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

const ProductBatch = require('../mysql-models/ProductBatch');

// @desc    Get product batches
const getProductBatches = async (req, res) => {
  try {
    const { productId } = req.params;
    const batches = await ProductBatch.findAll({
      where: { productId },
      order: [['createdAt', 'DESC']],
    });
    return res.status(200).json(batches);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Add product batch
const addProductBatch = async (req, res) => {
  try {
    const { productId } = req.params;
    const { batchNumber, mfgDate, expiryDate, quantity, mrp, salePrice, purchasePrice, companyId } = req.body;

    const batch = await ProductBatch.create({
      productId,
      batchNumber,
      mfgDate,
      expiryDate,
      quantity: quantity || 0,
      mrp: mrp || 0,
      salePrice: salePrice || 0,
      purchasePrice: purchasePrice || 0,
      companyId: companyId || 1,
    });

    return res.status(201).json(batch);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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
  createProduct,
  updateProduct,
  deleteProduct,
  updateStockBulk,
  getProductBatches,
  addProductBatch,
  updateProductBatch,
  deleteProductBatch,
};
