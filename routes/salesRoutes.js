const express = require('express');
const router = express.Router();
// const {
//   getInvoices,
//   getInvoiceById,
//   createInvoice,
//   updateInvoiceStatus,
// } = require('../controllers/invoiceController');

const {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  updateInvoiceById,
} = require('../mysql-controllers/salesController');

router.post('/add-sales', createInvoice);
router.get('/get-sales', getInvoices);
router.post('/delete-sales', deleteInvoice);
router.put('/updatebyid-sales/:id', updateInvoiceById);

// router.route('/').get(getInvoices).post(createInvoice);
// router.route('/:id').get(getInvoiceById);
// router.route('/:id/status').put(updateInvoiceStatus);

module.exports = router;
