const express = require('express');
const router = express.Router();
const {
  getCurrentShift,
  startShift,
  endShift,
  holdCart,
  getHoldCarts,
  resumeHoldCart,
  cancelHoldCart,
  getShiftDetails,
} = require('../mysql-controllers/posController');
const {
  authenticateLoyaltyUser,
  requireLoyaltyAdmin,
} = require('../middleware/loyaltyAuth');
const { requirePermission } = require('../middleware/rbacAuth');
const {
  listCounters,
  getAssignedCounters,
  createCounter,
  updateCounter,
} = require('../mysql-controllers/posCounterController');

router.get('/counters/assigned', authenticateLoyaltyUser, getAssignedCounters);
router.get('/counters', authenticateLoyaltyUser, requireLoyaltyAdmin, listCounters);
router.post('/counters', authenticateLoyaltyUser, requireLoyaltyAdmin, createCounter);
router.put('/counters/:id', authenticateLoyaltyUser, requireLoyaltyAdmin, updateCounter);
router.get('/shifts/current', authenticateLoyaltyUser, getCurrentShift);
router.post('/shifts/start', authenticateLoyaltyUser, startShift);
router.post('/shifts/end', authenticateLoyaltyUser, endShift);
router.get(
  '/shifts/all-shifts',
  authenticateLoyaltyUser,
  requirePermission('shifts.management.view'),
  getShiftDetails
);

router.post('/hold', holdCart);
router.get('/hold', getHoldCarts);
router.post('/hold/:id/resume', resumeHoldCart);
router.delete('/hold/:id', cancelHoldCart);

module.exports = router;
