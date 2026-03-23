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
} = require('../mysql-controllers/partyController');

router.post('/add-Party', createParty);
router.get('/get-Party', getParty);
router.delete('/delete-Party', deleteParty);
router.post('/update-Party', updateParty);
router
  .route('/:id')
  .get(getPartyById)
  .put(updateParty)
  .delete(deleteParty);

module.exports = router;
