const express = require('express');
// const {
//   addCategory,
//   getCategory,
//   deleteCategory,
// } = require('../controllers/categoryController');
const {
  addCategory,
  getCategory,
  deleteCategory,
} = require('../mysql-controllers/categoryController');

const router = express.Router();

router.post('/add-category', addCategory);
router.get('/get-category', getCategory);
router.get('/delete-category/:id', deleteCategory);

module.exports = router;
