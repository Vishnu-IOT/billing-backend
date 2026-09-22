const express = require('express');
const router = express.Router();
const {
  salesByParty,
  salesByUser,
  salesByItem,
  itemSalesByUser,
  stockSummary,
  gst2Report,
  partyOutstanding,
  customerStatement,
  purchaseByParty,
  purchaseByItem,
} = require('../mysql-controllers/reportsController');

router.get('/sales-by-party', salesByParty);
router.get('/sales-by-user', salesByUser);
router.get('/sales-by-item', salesByItem);
router.get('/item-sales-by-user', itemSalesByUser);
router.get('/stock-summary', stockSummary);
router.get('/gst2', gst2Report);
router.get('/party-outstanding', partyOutstanding);
router.get('/customer-statement', customerStatement);
router.get('/purchase-by-party', purchaseByParty);
router.get('/purchase-by-item', purchaseByItem);

module.exports = router;
