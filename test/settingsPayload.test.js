'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getSettingsUpdate } = require('../utils/settingsPayload');

test('accepts flat settings updates and omits identity metadata', () => {
  assert.deepEqual(
    getSettingsUpdate({
      companyId: 7,
      loyaltyEnabled: true,
      loyaltyAmountPerPoint: 250,
      loyaltyPointsPerUnit: 2,
    }),
    {
      loyaltyEnabled: true,
      loyaltyAmountPerPoint: 250,
      loyaltyPointsPerUnit: 2,
    }
  );
});

test('preserves the existing nested settings request format', () => {
  assert.deepEqual(
    getSettingsUpdate({
      companyId: 7,
      settings: {
        companyId: 7,
        loyaltyEnabled: false,
        loyaltyAmountPerPoint: 250,
      },
    }),
    {
      loyaltyEnabled: false,
      loyaltyAmountPerPoint: 250,
    }
  );
});
