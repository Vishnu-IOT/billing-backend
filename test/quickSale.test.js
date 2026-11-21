'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateQuickSalePricing,
  validateQuickSaleInput,
} = require('../utils/quickSale');

const validInput = () => validateQuickSaleInput({
  name: ' Unregistered item ',
  barcode: ' 12345 ',
  mrp: '15.00',
  sellingPrice: '12.00',
  quantity: '2',
});

test('Quick Sale input is normalized and validated', () => {
  const input = validInput();

  assert.equal(input.name, 'Unregistered item');
  assert.equal(input.barcode, '12345');
  assert.equal(input.identityKey, 'barcode:12345');
  assert.equal(input.quantity, 2);
});

test('pending Quick Sale keeps the full entered amount payable and leaves GST unclassified', () => {
  const pricing = calculateQuickSalePricing(validInput(), {
    gstVerificationStatus: 'GST_PENDING',
  });

  assert.equal(pricing.taxVerificationStatus, 'GST_PENDING');
  assert.equal(pricing.lineAmount, 24);
  assert.equal(pricing.taxableAmount, null);
  assert.equal(pricing.taxPercentage, null);
  assert.equal(pricing.taxAmount, null);
  assert.equal(pricing.pricing.netRate, 24);
  assert.equal(pricing.pricing.baseRate, 0);
});

test('verified Quick Sale extracts GST from the inclusive selling price', () => {
  const pricing = calculateQuickSalePricing(validInput(), {
    gstVerificationStatus: 'GST_VERIFIED',
    verifiedTaxRate: 18,
    verifiedPriceType: 'WITH_GST',
  });

  assert.equal(pricing.taxVerificationStatus, 'GST_VERIFIED');
  assert.equal(pricing.taxableAmount, 20.34);
  assert.equal(pricing.taxAmount, 3.66);
  assert.equal(pricing.lineAmount, 24);
});

test('Quick Sale verification rejects an unverified non-inclusive price basis', () => {
  assert.throws(
    () => calculateQuickSalePricing(validInput(), {
      gstVerificationStatus: 'GST_VERIFIED',
      verifiedTaxRate: 18,
      verifiedPriceType: 'WITHOUT_GST',
    }),
    /GST-inclusive/,
  );
});
