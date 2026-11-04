const express = require('express');
const router = express.Router();
const {
  // sales
  salesReport,
  userReport,
  salesByParty,
  salesByUser,
  salesByItem,
  itemSalesByUser,
  itemSalesByParty,
  // purchase
  purchaseReport,
  purchaseByParty,
  purchaseByItem,
  // inventory
  stockReport,
  stockSummary,
  // gst
  gstr1Report,
  gstr3bReport,
  gst2Report,
  // party
  partyOutstanding,
  customerStatement,
  // category / brand
  categoryReport,
  brandReport,
} = require('../mysql-controllers/reportsController');

// ── Sales ───────────────────────────────────────────────
router.get('/sales-report', salesReport);
router.get('/user-report', userReport);
router.get('/sales-by-party', salesByParty);
router.get('/sales-by-user', salesByUser);
router.get('/sales-by-item', salesByItem);
router.get('/item-sales-by-user', itemSalesByUser);
router.get('/item-sales-by-party', itemSalesByParty);

// ── Purchase ────────────────────────────────────────────
router.get('/purchase-report', purchaseReport);
router.get('/purchase-by-party', purchaseByParty);
router.get('/purchase-by-item', purchaseByItem);

// ── Inventory ───────────────────────────────────────────
router.get('/stock-report', stockReport);
router.get('/stock-summary', stockSummary);

// ── GST ─────────────────────────────────────────────────
router.get('/gstr1', gstr1Report);
router.get('/gstr3b', gstr3bReport);
router.get('/gst2', gst2Report);

// ── Party ───────────────────────────────────────────────
router.get('/party-outstanding', partyOutstanding);
router.get('/customer-statement', customerStatement);

// ── Category / Brand ────────────────────────────────────
router.get('/category-report', categoryReport);
router.get('/brand-report', brandReport);

module.exports = router;
