const { connectDB } = require('../config/db');
const Category = require('../models/Category');

// @desc    ADD Category
// @route   POST /api/category/:id
// @access  Public
const addCategory = async (req, res) => {
  try {
    await connectDB();

    const { category } = req.body;
    const categorys = await Category.create({ category });

    if (!categorys) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(200).json({
      cat: { id: categorys._id, name: categorys.category },
      message: 'Category Created',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Category
// @route   GET /api/category/:id
// @access  Public
const getCategory = async (req, res) => {
  try {
    await connectDB();
    const products = await Category.find().select('_id category');
    res.status(200).json(products); //{cat: { id: products._id, name: products.category }}
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    delete Category
// @route   POST /api/category/:id
// @access  Public
const deleteCategory = async (req, res) => {
  try {
    const id = req.params.id;

    const deletedCategory = await Category.findByIdAndDelete(id);

    if (!deletedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({
      message: "Category deleted successfully",
      deletedCategory,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addCategory,
  getCategory,
  deleteCategory,
};
