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

router.post('/add-Party', createCustomer);
router.get('/get-Party', getCustomers);
router.delete('/delete-Party', deleteCustomer);
router.post('/update-Party', updateCustomer);
router
  .route('/:id')
  .get(getCustomerById)
  .put(updateCustomer)
  .delete(deleteCustomer);

module.exports = router;
