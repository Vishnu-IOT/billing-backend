const express = require('express');
const router = express.Router();
// const {
//   getInvoices,
//   getInvoiceById,
//   createInvoice,
//   updateInvoiceStatus,
// } = require('../controllers/invoiceController');

const {
  getPurchase,
  getPurchaseInvoicesByDate,
  getPurchaseById,
  createPurchase,
  updatePurchaseStatus,
  createPurchases,
  updatePaymentStatusById,
  deletePurchase,
  updatePurchaseById,
} = require('../mysql-controllers/purchaseController');

router.post('/add-purchase', createPurchase);
router.get('/get-purchase', getPurchase);
router.get('/get-purchase-date', getPurchaseInvoicesByDate);
router.delete('/delete-purchase/:id', deletePurchase);
router.put('/updatebyid-purchase/:id', updatePurchaseById);
router.post('/updatepaymentout-purchase/:id', updatePaymentStatusById);

// router.route('/').get(getInvoices).post(createInvoice);
// router.route('/:id').get(getInvoiceById);
// router.route('/:id/status').put(updateInvoiceStatus);

module.exports = router;
