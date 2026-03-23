const express = require('express');
const router = express.Router();
// const {
//   getProducts,
//   getProductById,
//   createProduct,
//   updateProduct,
//   deleteProduct,
// } = require('../controllers/productController');

const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../mysql-controllers/productController');

// router.route('/').get(getProducts).post(createProduct);
router.post('/add-Products', createProduct);
router.get('/get-Products', getProducts);
router.delete('/delete-Products/:id', deleteProduct);
router.post('/update-Products/:id', updateProduct);

// router
//   .route('/:id')
//   .get(getProductById)
//   .put(updateProduct)
//   .delete(deleteProduct);

module.exports = router;
