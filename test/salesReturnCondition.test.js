'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeSalesReturnCondition,
  normalizeReturnCreditItems,
} = require('../utils/salesReturnCondition');

test('return conditions default to GOOD and normalize supported values', () => {
  assert.equal(normalizeSalesReturnCondition(undefined), 'GOOD');
  assert.equal(normalizeSalesReturnCondition(' damaged '), 'DAMAGED');
  assert.equal(normalizeSalesReturnCondition('EXPIRED'), 'EXPIRED');
});

test('unsupported return conditions are rejected as client input errors', () => {
  assert.throws(
    () => normalizeSalesReturnCondition('UNKNOWN'),
    (error) => error.status === 400 && /returnCondition/.test(error.message)
  );
});

test('return-credit idempotency items omit the legacy GOOD default but retain non-GOOD disposition', () => {
  assert.deepEqual(normalizeReturnCreditItems([
    { saleItemId: '4', quantity: 1, quantityUnit: 'PCS' },
    { saleItemId: '4', quantity: 1, quantityUnit: 'PCS', returnCondition: 'DAMAGED' },
    { saleItemId: '5', quantity: 2, quantityUnit: 'KG', returnCondition: 'GOOD' },
    { saleItemId: '6', quantity: 1, quantityUnit: 'PCS', condition: 'DAMAGED' },
    { quickSaleItemId: '7', quantity: 3 },
  ]), [
    { saleItemId: 4, quantity: 1, quantityUnit: 'PCS' },
    { saleItemId: 4, quantity: 1, quantityUnit: 'PCS', returnCondition: 'DAMAGED' },
    { saleItemId: 5, quantity: 2, quantityUnit: 'KG' },
    { saleItemId: 6, quantity: 1, quantityUnit: 'PCS', returnCondition: 'DAMAGED' },
    { quickSaleItemId: 7, quantity: 3 },
  ]);
});

test('return-credit normalization rejects duplicate product-condition allocations', () => {
  assert.throws(
    () => normalizeReturnCreditItems([
      { saleItemId: 4, quantity: 1 },
      { saleItemId: 4, quantity: 2, condition: 'GOOD' },
    ]),
    (error) => error.status === 400 && /once per condition/.test(error.message)
  );
});
