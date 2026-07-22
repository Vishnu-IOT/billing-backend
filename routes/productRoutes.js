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
  updateStockBulk,
  getProductBatches,
  addProductBatch,
  updateProductBatch,
  deleteProductBatch,
} = require('../mysql-controllers/productController');

// router.route('/').get(getProducts).post(createProduct);
router.post('/add-Products', createProduct);
router.get('/get-Products', getProducts);
router.delete('/delete-Products/:id', deleteProduct);
router.post('/update-Products/:id', updateProduct);
router.post('/updatebulk-Products', updateStockBulk);

// Product Batch Routes
router.get('/get-Batches/:productId', getProductBatches);
router.post('/add-Batch/:productId', addProductBatch);
router.post('/update-Batch/:productId/:batchId', updateProductBatch);
router.delete('/delete-Batch/:productId/:batchId', deleteProductBatch);

module.exports = router;

