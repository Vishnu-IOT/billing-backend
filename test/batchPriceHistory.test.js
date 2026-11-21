'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getLatestBatchPriceHistory } = require('../utils/batchPriceHistory');

test('batch price history returns the five latest purchase batches with saved prices', () => {
  const batches = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    batchNumber: `B-${index + 1}`,
    createdAt: new Date(`2026-01-0${index + 1}T00:00:00.000Z`),
    mrp: index === 5 ? 0 : 100 + index,
    salePrice: 80 + index,
    purchasePrice: 60 + index,
    PurchaseItems: [
      {
        Purchase: {
          purchaseDate: new Date(`2026-02-0${index + 1}T00:00:00.000Z`),
        },
      },
    ],
  }));

  const history = getLatestBatchPriceHistory(batches);

  assert.equal(history.length, 5);
  assert.deepEqual(history.map((batch) => batch.batchNumber), [
    'B-6',
    'B-5',
    'B-4',
    'B-3',
    'B-2',
  ]);
  assert.equal(history[0].purchaseDate.toISOString(), '2026-02-06T00:00:00.000Z');
  assert.equal(history[0].mrp, 0);
  assert.equal(history[0].purchasePrice, 65);
  assert.equal(history[0].salePrice, 85);
});

test('batch price history uses the batch receipt date when no purchase record is linked', () => {
  const receiptDate = new Date('2026-03-01T00:00:00.000Z');
  const [batch] = getLatestBatchPriceHistory([{
    id: 8,
    batchNumber: 'MANUAL-8',
    createdAt: receiptDate,
    mrp: 120,
    salePrice: 110,
    purchasePrice: 90,
  }]);

  assert.equal(batch.purchaseDate, receiptDate);
});
