'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  adjustedUnbatchedAverageCost,
  calculateBatchUnitCost,
  calculateInventoryValuation,
} = require('../utils/inventoryValuation');

test('values batch-only, unbatched-only, and mixed inventory without double counting', () => {
  assert.equal(
    calculateInventoryValuation(
      [{ id: 1, stockQuantity: 10, unbatchedAverageCost: 80 }],
      [{ productId: 1, availableQuantity: 10, inventoryUnitCost: 100 }]
    ),
    1000
  );
  assert.equal(
    calculateInventoryValuation(
      [{ id: 1, stockQuantity: 8, unbatchedAverageCost: 110 }],
      []
    ),
    880
  );
  assert.equal(
    calculateInventoryValuation(
      [{ id: 1, stockQuantity: 23, unbatchedAverageCost: 110 }],
      [
        { productId: 1, availableQuantity: 10, inventoryUnitCost: 100 },
        { productId: 1, availableQuantity: 5, inventoryUnitCost: 120 },
      ]
    ),
    2480
  );
});

test('uses discounted acquisition line costs, includes non-recoverable GST, and divides free units', () => {
  assert.equal(
    calculateBatchUnitCost([{
      baseRate: 900,
      taxAmount: 90,
      totalQuantity: 10,
      Purchase: { itcEligible: true },
    }]),
    90
  );
  assert.equal(
    calculateBatchUnitCost([{
      baseRate: 900,
      taxAmount: 90,
      totalQuantity: 10,
      Purchase: { itcEligible: false },
    }]),
    99
  );
});

test('handles decimal quantities, zero stock, and missing costs safely', () => {
  assert.equal(
    calculateInventoryValuation(
      [{ id: 1, stockQuantity: 2.5, unbatchedAverageCost: 4 }],
      [
        { productId: 1, availableQuantity: 1.25, inventoryUnitCost: 10 },
        { productId: 1, availableQuantity: 0, inventoryUnitCost: 100 },
        { productId: 1, availableQuantity: 1, inventoryUnitCost: null },
      ]
    ),
    13.5
  );
  assert.equal(
    calculateInventoryValuation(
      [{ id: 1, stockQuantity: 0, unbatchedAverageCost: 5 }],
      [{ productId: 1, availableQuantity: 0, inventoryUnitCost: 50 }]
    ),
    0
  );
});

test('updates unbatched weighted average on receipt and preserves it on sales', () => {
  assert.equal(
    adjustedUnbatchedAverageCost({
      currentStock: 10,
      nextStock: 15,
      batchQuantity: 0,
      averageCost: 100,
      incomingQuantity: 5,
      incomingUnitCost: 130,
    }),
    110
  );
  assert.equal(
    adjustedUnbatchedAverageCost({
      currentStock: 15,
      nextStock: 12,
      batchQuantity: 0,
      averageCost: 110,
    }),
    110
  );
  assert.equal(
    adjustedUnbatchedAverageCost({
      currentStock: 10,
      nextStock: 12,
      batchQuantity: 0,
      averageCost: 100,
      incomingQuantity: 2,
      incomingUnitCost: 120,
    }),
    103.3333
  );
  assert.equal(
    adjustedUnbatchedAverageCost({
      currentStock: 23,
      nextStock: 26,
      batchQuantity: 15,
      averageCost: 110,
      incomingQuantity: 3,
      incomingUnitCost: 130,
    }),
    115.4545
  );
  assert.equal(
    adjustedUnbatchedAverageCost({
      currentStock: 23,
      nextStock: 21,
      batchQuantity: 15,
      averageCost: 110,
    }),
    110
  );
  assert.equal(
    adjustedUnbatchedAverageCost({
      currentStock: 12,
      nextStock: 0,
      batchQuantity: 0,
      averageCost: 110,
    }),
    null
  );
});

test('rejects unbatched stock increases without a valid acquisition cost', () => {
  assert.throws(
    () => adjustedUnbatchedAverageCost({
      currentStock: 0,
      nextStock: 2,
      batchQuantity: 0,
      averageCost: null,
    }),
    /acquisition cost/i
  );
});
