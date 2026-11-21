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
  updatePaymentStatusById,
  getPaymentHistoryByPurchase,
  deletePurchase,
  updatePurchaseById,
} = require('../mysql-controllers/purchaseController');
const { authenticateLoyaltyUser } = require('../middleware/loyaltyAuth');

router.post('/add-purchase', authenticateLoyaltyUser, createPurchase);
router.get('/get-purchase', getPurchase);
router.get('/get-purchase-date', getPurchaseInvoicesByDate);
router.get('/get-purchase/:id', getPurchaseById);
router.delete('/delete-purchase/:id', deletePurchase);
router.put('/updatebyid-purchase/:id', authenticateLoyaltyUser, updatePurchaseById);
router.post('/updatepaymentout-purchase/:id', updatePaymentStatusById);
router.get('/payments-purchase/:id', getPaymentHistoryByPurchase);

// router.route('/').get(getInvoices).post(createInvoice);
// router.route('/:id').get(getInvoiceById);
// router.route('/:id/status').put(updateInvoiceStatus);

module.exports = router;
