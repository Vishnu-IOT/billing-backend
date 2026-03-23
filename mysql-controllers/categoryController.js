const Category = require('../mysql-models/Category');


// @desc    ADD Category
// @route   POST /api/category
// @access  Public
const addCategory = async (req, res) => {
  try {
    const { category } = req.body;

    const newCategory = await Category.create({ category });

    res.status(201).json({
      cat: {
        id: newCategory.id,
        name: newCategory.category
      },
      message: "Category Created"
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// @desc    Get Categories
// @route   GET /api/category
// @access  Public
const getCategory = async (req, res) => {
  try {

    const categories = await Category.findAll({
      attributes: ["id", "category"]
    });

    res.status(200).json(categories);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// @desc    Delete Category
// @route   DELETE /api/category/:id
// @access  Public
const deleteCategory = async (req, res) => {
  try {

    const id = req.params.id;

    const deleted = await Category.destroy({
      where: { id }
    });

    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({
      message: "Category deleted successfully"
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


module.exports = {
  addCategory,
  getCategory,
  deleteCategory
};