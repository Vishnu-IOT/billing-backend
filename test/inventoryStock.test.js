'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getUnbatchedStockQuantity,
  getProductAvailableQuantity,
} = require('../utils/inventoryStock');

test('counts product stock not represented by batches as unbatched stock', () => {
  assert.equal(getUnbatchedStockQuantity(11, 0), 11);
  assert.equal(getUnbatchedStockQuantity(11, 4), 7);
  assert.equal(getUnbatchedStockQuantity(3, 5), 0);
});

test('uses the greater of aggregate product stock or available batch stock', () => {
  assert.equal(getProductAvailableQuantity(11, 0), 11);
  assert.equal(getProductAvailableQuantity(11, 4), 11);
  assert.equal(getProductAvailableQuantity(3, 5), 5);
  assert.equal(getProductAvailableQuantity(0, 0), 0);
});
