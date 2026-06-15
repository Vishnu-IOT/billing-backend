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
router.get('/get-Cusotmer', getCustomers);
router.delete('/delete-Cusotmer', deleteCustomer);
router.post('/update-Cusotmer', updateCustomer);
router
  .route('/:id')
  .get(getCustomerById)
  .put(updateCustomer)
  .delete(deleteCustomer);

module.exports = router;
