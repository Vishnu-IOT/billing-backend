const express = require('express');
const router = express.Router();
const {
  getEInvoices,
  getEWayBills,
  generateEInvoice,
  generateEWayBill,
  cancelEInvoice,
  cancelEWayBill,
  getGSTR1,
  getGSTR3B,
} = require('../mysql-controllers/complianceController');

router.get('/get-EInvoices', getEInvoices);
router.get('/get-EWayBills', getEWayBills);
router.post('/generate-EInvoice', generateEInvoice);
router.post('/generate-EWayBill', generateEWayBill);
router.post('/cancel-EInvoice', cancelEInvoice);
router.post('/cancel-EWayBill', cancelEWayBill);
router.get('/get-GSTR1', getGSTR1);
router.get('/get-GSTR3B', getGSTR3B);

module.exports = router;
