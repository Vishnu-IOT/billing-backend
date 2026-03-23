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
  getPurchaseById,
  createPurchase,
  updatePurchaseStatus,
  createPurchases,
  deletePurchase,
  updatePurchaseById,
} = require('../mysql-controllers/purchaseController');

router.post('/add-purchase', createPurchase);
router.get('/get-purchase', getPurchase);
router.post('/delete-purchase', deletePurchase);
router.put('/updatebyid-purchase/:id', updatePurchaseById);

// router.route('/').get(getInvoices).post(createInvoice);
// router.route('/:id').get(getInvoiceById);
// router.route('/:id/status').put(updateInvoiceStatus);

module.exports = router;
