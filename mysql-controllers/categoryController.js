const Category = require('../mysql-models/Category');


// @desc    ADD Category
// @route   POST /api/category
// @access  Public
const addCategory = async (req, res) => {
  try {
    const { category } = req.body;

    const newCategory = await Category.create({ category });

    return res.status(201).json({
      cat: {
        id: newCategory.id,
        category: newCategory.category
      },
      message: "Category Created"
    });

  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        message: 'A category with this name already exists',
      });
    }
    return res.status(500).json({ message: error.message });
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

    return res.status(200).json(categories);

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Update Category
// @route   PUT /api/category/update-category/:id
const updateCategory = async (req, res) => {
  const id = Number(req.params.id);
  const categoryName = String(req.body.category || '').trim();
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'A valid category ID is required' });
  }
  if (!categoryName) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  try {
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    await category.update({ category: categoryName });
    return res.status(200).json({
      cat: { id: category.id, category: category.category },
      message: 'Category updated successfully',
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'A category with this name already exists' });
    }
    console.error('Update category error:', error);
    return res.status(500).json({ message: 'Unable to update category' });
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

    return res.status(200).json({
      message: "Category deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


module.exports = {
  addCategory,
  getCategory,
  updateCategory,
  deleteCategory
};