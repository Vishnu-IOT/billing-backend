'use strict';

const express = require('express');
const {
  getQuickSaleAliasAudit,
  listQuickSaleAliases,
  mapQuickSaleAlias,
  markQuickSaleAliasReviewed,
  quickSaleReport,
  resolveQuickSaleCode,
  unlinkQuickSaleAlias,
  verifyQuickSaleGst,
} = require('../mysql-controllers/quickSalesController');

const router = express.Router();

router.get('/resolve', resolveQuickSaleCode);
router.get('/aliases', listQuickSaleAliases);
router.get('/aliases/:id/audit', getQuickSaleAliasAudit);
router.patch('/aliases/:id/verify-gst', verifyQuickSaleGst);
router.patch('/aliases/:id/mapping', mapQuickSaleAlias);
router.patch('/aliases/:id/review', markQuickSaleAliasReviewed);
router.delete('/aliases/:id/mapping', unlinkQuickSaleAlias);
router.get('/reports', quickSaleReport);

module.exports = router;
