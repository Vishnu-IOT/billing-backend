const express = require('express');
const router = express.Router();
const {
  getStockAdjustments,
  addStockAdjustment,
} = require('../mysql-controllers/inventoryController');

router.get('/get-Adjustments', getStockAdjustments);
router.post('/add-Adjustment', addStockAdjustment);

module.exports = router;
