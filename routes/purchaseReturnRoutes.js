'use strict';

const express = require('express');
const router = express.Router();
const {
  getEligiblePurchaseInvoices,
  getPurchaseReturnSuppliers,
  getSupplierCredits,
  getSupplierCreditInvoices,
  applySupplierCredit,
  getPurchaseReturnItems,
  listPurchaseReturns,
  getPurchaseReturn,
  createPurchaseReturn,
  cancelPurchaseReturn,
} = require('../mysql-controllers/purchaseReturnController');

router.get('/suppliers', getPurchaseReturnSuppliers);
router.get('/eligible-invoices', getEligiblePurchaseInvoices);
router.get('/supplier-credits', getSupplierCredits);
router.get('/supplier-credits/invoices', getSupplierCreditInvoices);
router.post('/supplier-credits/apply', applySupplierCredit);
router.get('/purchase/:purchaseId/items', getPurchaseReturnItems);
router.get('/', listPurchaseReturns);
router.post('/', createPurchaseReturn);
router.get('/:id/print', getPurchaseReturn);
router.get('/:id', getPurchaseReturn);
router.post('/:id/cancel', cancelPurchaseReturn);

module.exports = router;
