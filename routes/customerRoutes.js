const express = require('express');
const router = express.Router();

// const {
//   getCustomers,
//   getCustomerById,
//   createCustomer,
//   updateCustomer,
//   deleteCustomer,
// } = require('../controllers/customerController');

const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} = require('../mysql-controllers/customerController');

router.post('/add-Cusotmer', createCustomer);
router.post('/add-Customer', createCustomer);
router.get('/get-Cusotmer', getCustomers);
router.get('/get-Customer', getCustomers);
router.delete('/delete-Cusotmer', deleteCustomer);
router.delete('/delete-Customer', deleteCustomer);
router.post('/update-Cusotmer', updateCustomer);
router.post('/update-Customer', updateCustomer);
router
  .route('/:id')
  .get(getCustomerById)
  .put(updateCustomer)
  .delete(deleteCustomer);

module.exports = router;
