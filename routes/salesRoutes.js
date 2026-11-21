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
  getPaymentHistoryBySale,
  previewNextInvoiceNumber,
  getReturnableSaleByInvoiceNumber,
  getSalesReturnCredit,
  createSalesReturnCredit,
  createSalesReturn,
} = require('../mysql-controllers/salesController');
const { authenticateLoyaltyUser } = require('../middleware/loyaltyAuth');

const authenticateShiftSale = (req, res, next) => {
  return authenticateLoyaltyUser(req, res, next);
};

router.post('/add-sales', authenticateShiftSale, createInvoice);
router.get('/get-sales', getInvoices);
router.get('/get-sales-date', getInvoicesByDate);
router.get('/preview-next-number', previewNextInvoiceNumber);
router.get('/returnable-invoice/:invoiceNumber', getReturnableSaleByInvoiceNumber);
router.get('/return-credits/:code', getSalesReturnCredit);
router.post('/return-credits/:saleId', createSalesReturnCredit);
router.get('/get-sales/:id', getInvoiceById);
router.delete('/delete-sales/:id', deleteInvoice);
router.put('/updatebyid-sales/:id', authenticateShiftSale, updateInvoiceById);
router.post('/updatepaymentin-sales/:id', updatePaymentStatusById);
router.get('/payments-sales/:id', getPaymentHistoryBySale);
router.post('/return-sales/:saleId', createSalesReturn);

module.exports = router;
