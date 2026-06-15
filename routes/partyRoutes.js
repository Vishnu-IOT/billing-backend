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
  getParty,
  getPartyById,
  createParty,
  updateParty,
  deleteParty,
  getPartyInvoiceById,
} = require('../mysql-controllers/partyController');

router.post('/add-Party', createParty);
router.get('/get-Party', getParty);
router.delete('/delete-Party/:id', deleteParty);
router.post('/update-Party/:id', updateParty);
router.get('/invoiceById-Party/:id', getPartyInvoiceById);
router
  .route('/:id')
  .get(getPartyById)
  .put(updateParty)
  .delete(deleteParty);

module.exports = router;
