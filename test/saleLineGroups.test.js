'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { groupNormalizedSaleItems } = require('../utils/saleLineGroups');

test('combines paid quantities and batch allocations for promotion eligibility', () => {
  const product = { id: 12 };
  const groups = groupNormalizedSaleItems([
    {
      item: { productId: 12 },
      product,
      normalizedQuantity: { quantity: 5, quantityUnit: 'PCS' },
      manualAllocations: [{ batchId: 1, quantity: 5 }],
    },
    {
      item: { productId: 12 },
      product,
      normalizedQuantity: { quantity: 5, quantityUnit: 'PCS' },
      manualAllocations: [{ batchId: 2, quantity: 5 }],
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].paidQuantity, 10);
  assert.deepEqual(groups[0].manualAllocations, [
    { batchId: 1, quantity: 5 },
    { batchId: 2, quantity: 5 },
  ]);
});

test('rejects mixing manual batch selection and FIFO lines for one product', () => {
  const product = { id: 12 };
  assert.throws(() => groupNormalizedSaleItems([
    {
      item: { productId: 12 },
      product,
      normalizedQuantity: { quantity: 5, quantityUnit: 'PCS' },
      manualAllocations: [{ batchId: 1, quantity: 5 }],
    },
    {
      item: { productId: 12 },
      product,
      normalizedQuantity: { quantity: 5, quantityUnit: 'PCS' },
      manualAllocations: null,
    },
  ]), /either manual batch allocation or FIFO/);
});

test('keeps distinct MRP price groups separate for promotions and sale pricing', () => {
  const product = { id: 12 };
  const groups = groupNormalizedSaleItems([
    {
      item: {
        productId: 12,
        priceGroupKey: '20000:18000:5:WITHOUT_GST',
        priceGroup: {
          mrp: 200,
          salePrice: 180,
          taxRate: 5,
          priceType: 'WITHOUT_GST',
        },
      },
      product,
      normalizedQuantity: { quantity: 2, quantityUnit: 'PCS' },
      manualAllocations: [{ batchId: 1, quantity: 2 }],
    },
    {
      item: {
        productId: 12,
        priceGroupKey: '40000:36000:5:WITHOUT_GST',
        priceGroup: {
          mrp: 400,
          salePrice: 360,
          taxRate: 5,
          priceType: 'WITHOUT_GST',
        },
      },
      product,
      normalizedQuantity: { quantity: 3, quantityUnit: 'PCS' },
      manualAllocations: [{ batchId: 2, quantity: 3 }],
    },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.paidQuantity), [2, 3]);
  assert.deepEqual(groups.map((group) => group.priceGroupKey), [
    '20000:18000:5:WITHOUT_GST',
    '40000:36000:5:WITHOUT_GST',
  ]);
});

test('combines compatible price-group lines across batch allocations', () => {
  const product = { id: 12 };
  const priceGroup = {
    mrp: 200,
    salePrice: 180,
    taxRate: 5,
    priceType: 'WITHOUT_GST',
  };
  const groups = groupNormalizedSaleItems([
    {
      item: { productId: 12, priceGroupKey: '20000:18000:5:WITHOUT_GST', priceGroup },
      product,
      normalizedQuantity: { quantity: 2, quantityUnit: 'PCS' },
      manualAllocations: [{ batchId: 1, quantity: 2 }],
    },
    {
      item: { productId: 12, priceGroupKey: '20000:18000:5:WITHOUT_GST', priceGroup },
      product,
      normalizedQuantity: { quantity: 3, quantityUnit: 'PCS' },
      manualAllocations: [{ batchId: 2, quantity: 3 }],
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].paidQuantity, 5);
  assert.deepEqual(groups[0].manualAllocations, [
    { batchId: 1, quantity: 2 },
    { batchId: 2, quantity: 3 },
  ]);
});