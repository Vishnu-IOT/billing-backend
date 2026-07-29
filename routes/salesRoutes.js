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
  deleteInvoice,
  updateInvoiceById,
  getInvoicesByDate,
  updatePaymentStatusById,
} = require('../mysql-controllers/salesController');

router.post('/add-sales', createInvoice);
router.get('/get-sales', getInvoices);
router.get('/get-sales-date', getInvoicesByDate);
router.get('/get-sales/:id', getInvoiceById);
router.delete('/delete-sales/:id', deleteInvoice);
router.put('/updatebyid-sales/:id', updateInvoiceById);
router.post('/updatepaymentin-sales/:id', updatePaymentStatusById);

module.exports = router;
