'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateLoyaltyPoints,
  validateLoyaltySettingsUpdate,
} = require('../utils/loyaltyEarning');
const {
  calculateLoyaltyRedemption,
  prorateLoyaltyPoints,
} = require('../utils/loyaltyRedemption');

test('calculates points from configured purchase thresholds', () => {
  assert.equal(
    calculateLoyaltyPoints(1000, {
      loyaltyEnabled: true,
      loyaltyAmountPerPoint: '100.00',
      loyaltyPointsPerUnit: 1,
    }),
    10
  );
  assert.equal(
    calculateLoyaltyPoints(1000, {
      loyaltyEnabled: true,
      loyaltyAmountPerPoint: '500.00',
      loyaltyPointsPerUnit: 1,
    }),
    2
  );
  assert.equal(
    calculateLoyaltyPoints(1000, {
      loyaltyEnabled: true,
      loyaltyAmountPerPoint: 200,
      loyaltyPointsPerUnit: 2,
    }),
    10
  );
});

test('awards no points when loyalty is disabled', () => {
  assert.equal(
    calculateLoyaltyPoints(1000, {
      loyaltyEnabled: false,
      loyaltyAmountPerPoint: 100,
      loyaltyPointsPerUnit: 1,
    }),
    0
  );
});

test('validates partial configuration against existing settings', () => {
  assert.deepEqual(
    validateLoyaltySettingsUpdate(
      { loyaltyAmountPerPoint: '500.00' },
      {
        loyaltyEnabled: true,
        loyaltyAmountPerPoint: '100.00',
        loyaltyPointsPerUnit: 1,
      }
    ),
    { loyaltyAmountPerPoint: 500 }
  );
  assert.throws(
    () => validateLoyaltySettingsUpdate(
      { loyaltyEnabled: true, loyaltyAmountPerPoint: 0 },
      {
        loyaltyEnabled: false,
        loyaltyAmountPerPoint: '100.00',
        loyaltyPointsPerUnit: 1,
      }
    ),
    /greater than zero/
  );
  assert.throws(
    () => validateLoyaltySettingsUpdate(
      { loyaltyPointsPerUnit: 1.5 },
      {
        loyaltyEnabled: true,
        loyaltyAmountPerPoint: '100.00',
        loyaltyPointsPerUnit: 1,
      }
    ),
    /positive whole number/
  );
});

test('rejects missing or invalid earning configuration', () => {
  assert.throws(
    () => calculateLoyaltyPoints(1000, null),
    /settings are unavailable/
  );
  assert.throws(
    () => calculateLoyaltyPoints(1000, {
      loyaltyEnabled: true,
      loyaltyAmountPerPoint: 0,
      loyaltyPointsPerUnit: 1,
    }),
    /greater than zero/
  );
});

test('validates company redemption settings and partial updates', () => {
  const existing = {
    loyaltyEnabled: true,
    loyaltyAmountPerPoint: 100,
    loyaltyPointsPerUnit: 1,
    loyaltyRedemptionEnabled: false,
    loyaltyRedemptionAmountPerPoint: 1,
    loyaltyMinimumRedemptionPoints: 1,
    loyaltyMaxRedemptionPercentage: 100,
  };
  assert.deepEqual(
    validateLoyaltySettingsUpdate(
      { loyaltyRedemptionEnabled: true, loyaltyMaxRedemptionPercentage: '35.5' },
      existing
    ),
    { loyaltyRedemptionEnabled: true, loyaltyMaxRedemptionPercentage: 35.5 }
  );
  assert.throws(
    () => validateLoyaltySettingsUpdate(
      { loyaltyRedemptionAmountPerPoint: 0 },
      existing
    ),
    /greater than zero/
  );
  assert.throws(
    () => validateLoyaltySettingsUpdate(
      { loyaltyMaxRedemptionPercentage: 100.001 },
      existing
    ),
    /between 0 and 100/
  );
  assert.throws(
    () => validateLoyaltySettingsUpdate(
      { loyaltyRedemptionEnabled: 'true' },
      existing
    ),
    /must be a boolean/
  );
  assert.throws(
    () => validateLoyaltySettingsUpdate(
      { loyaltyMinimumRedemptionPoints: 1.5 },
      existing
    ),
    /positive whole number/
  );
});

test('redemption uses server settings, balance, and post-credit payable caps', () => {
  const settings = {
    loyaltyRedemptionEnabled: true,
    loyaltyRedemptionAmountPerPoint: '0.50',
    loyaltyMinimumRedemptionPoints: 5,
    loyaltyMaxRedemptionPercentage: '50.00',
  };
  assert.deepEqual(
    calculateLoyaltyRedemption({
      requestedPoints: 10,
      balance: 20,
      totalAmount: 100,
      returnCreditAmount: 20,
      settings,
    }),
    { pointsRedeemed: 10, amount: 5 }
  );
  assert.throws(
    () => calculateLoyaltyRedemption({
      requestedPoints: 101,
      balance: 101,
      totalAmount: 100,
      settings,
    }),
    /company limit/
  );
  assert.throws(
    () => calculateLoyaltyRedemption({
      requestedPoints: 21,
      balance: 20,
      totalAmount: 100,
      settings,
    }),
    /enough loyalty points/
  );
  assert.throws(
    () => calculateLoyaltyRedemption({
      requestedPoints: 1,
      balance: 20,
      totalAmount: 100,
      settings: { ...settings, loyaltyRedemptionEnabled: false },
    }),
    /not enabled/
  );
  assert.throws(
    () => calculateLoyaltyRedemption({
      requestedPoints: 4,
      balance: 20,
      totalAmount: 100,
      settings,
    }),
    /At least 5/
  );
});

test('return reversal points are cumulative and restore all points on full return', () => {
  assert.equal(prorateLoyaltyPoints(101, 50, 200), 25);
  assert.equal(prorateLoyaltyPoints(101, 200, 200), 101);
  assert.equal(prorateLoyaltyPoints(101, 0, 200), 0);
});
