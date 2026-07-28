const express = require('express');
const router = express.Router();
const {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} = require('../mysql-controllers/warehouseController');

const {
  getStockLedger,
  getReorderAlerts,
  getTransfers,
  createTransfer,
  receiveTransfer,
} = require('../mysql-controllers/inventoryController');

// Warehouses
router.get('/warehouses', getWarehouses);
router.post('/warehouses', createWarehouse);
router.put('/warehouses/:id', updateWarehouse);
router.delete('/warehouses/:id', deleteWarehouse);

// Stock Ledger & Alerts
router.get('/ledger', getStockLedger);
router.get('/reorder-alerts', getReorderAlerts);

// Stock Transfers
router.get('/transfers', getTransfers);
router.post('/transfers', createTransfer);
router.post('/transfers/:id/receive', receiveTransfer);

module.exports = router;
