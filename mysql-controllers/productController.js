const Product = require('../mysql-models/Product');
const { validationResult } = require('express-validator');

// @desc    Get all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll();

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    } = req.body;

    const product = await Product.create({
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
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
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

    await Product.update(req.body, {
      where: { id: req.params.id },
    });

    const updatedProduct = await Product.findByPk(req.params.id);

    res.status(200).json(updatedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
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

    res.status(200).json({
      message: 'Stock updated successfully',
      data: updatedProducts,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
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

    res.status(200).json({
      id: req.params.id,
      message: 'Product deleted',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStockBulk,
};
