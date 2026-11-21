'use strict';

const express = require('express');
const {
  redeemManual,
  redeemGift,
  listGifts,
  createGift,
  updateGift,
  getCustomerTransactions,
  reverseRedemption,
  adjustPoints,
} = require('../mysql-controllers/loyaltyController');
const {
  authenticateLoyaltyUser,
  requireLoyaltyAdmin,
} = require('../middleware/loyaltyAuth');

const router = express.Router();
router.use(authenticateLoyaltyUser);

router.get('/gifts', listGifts);
router.post('/gifts', requireLoyaltyAdmin, createGift);
router.patch('/gifts/:giftId', requireLoyaltyAdmin, updateGift);
router.post('/redeem/manual', redeemManual);
router.post('/redeem/gift', redeemGift);
router.get('/customers/:customerId/transactions', getCustomerTransactions);
router.post('/customers/:customerId/adjustments', requireLoyaltyAdmin, adjustPoints);
router.post('/redemptions/:redemptionId/reverse', requireLoyaltyAdmin, reverseRedemption);

module.exports = router;
