'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculatePurchaseReturnItem,
  calculateReturnTotals,
  round2,
} = require('../utils/purchaseReturns');

test('prorates the original GST-inclusive purchase line snapshot without adding GST twice', () => {
  const item = calculatePurchaseReturnItem(
    {
      quantity: 2,
      paidQuantity: 2,
      price: 59,
      priceType: 'WITH_GST',
      baseRate: 100,
      discountAmount: 0,
      taxAmount: 18,
      netRate: 118,
      taxPercentage: 18,
      cgstAmount: 9,
      sgstAmount: 9,
      igstAmount: 0,
    },
    { taxType: 'CGST_SGST' },
    1
  );

  assert.deepEqual(item, {
    purchaseRate: 59,
    priceType: 'WITH_GST',
    gstPercentage: 18,
    discountAmount: 0,
    taxableAmount: 50,
    cgstAmount: 4.5,
    sgstAmount: 4.5,
    igstAmount: 0,
    totalTax: 9,
    totalAmount: 59,
  });
});

test('uses saved discounts and IGST snapshots for a partial WITHOUT_GST return', () => {
  const item = calculatePurchaseReturnItem(
    {
      quantity: 4,
      price: 25,
      priceType: 'WITHOUT_GST',
      baseRate: 90,
      discountAmount: 10,
      taxAmount: 16.2,
      netRate: 106.2,
      taxPercentage: 18,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 16.2,
    },
    { taxType: 'IGST' },
    2
  );

  assert.deepEqual(item, {
    purchaseRate: 25,
    priceType: 'WITHOUT_GST',
    gstPercentage: 18,
    discountAmount: 5,
    taxableAmount: 45,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 8.1,
    totalTax: 8.1,
    totalAmount: 53.1,
  });
});

test('free units can be returned with zero credit and totals aggregate in paise', () => {
  const freeItem = calculatePurchaseReturnItem(
    {
      quantity: 3,
      paidQuantity: 1,
      price: 10,
      priceType: 'WITHOUT_GST',
      baseRate: 10,
      discountAmount: 0,
      taxAmount: 0,
      netRate: 10,
      taxPercentage: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
    },
    { taxType: 'CGST_SGST' },
    0
  );
  const totals = calculateReturnTotals([
    { taxableAmount: 0, discountAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalAmount: 0 },
    { taxableAmount: 45.75, discountAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalAmount: 45.75 },
    { taxableAmount: 9.99, discountAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalAmount: 9.99 },
  ]);

  assert.equal(freeItem.totalAmount, 0);
  assert.equal(totals.grandTotal, 55.74);
});

test('allows returning an item purchased entirely as free quantity', () => {
  const item = calculatePurchaseReturnItem(
    {
      quantity: 0,
      paidQuantity: 0,
      price: 20,
      priceType: 'WITHOUT_GST',
      baseRate: 0,
      discountAmount: 0,
      taxAmount: 0,
      netRate: 0,
      taxPercentage: 18,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
    },
    { taxType: 'CGST_SGST' },
    0
  );

  assert.equal(item.totalAmount, 0);
  assert.equal(item.taxableAmount, 0);
});

test('cumulative partial returns preserve the full original invoice-line amount', () => {
  const source = {
    quantity: 3,
    paidQuantity: 3,
    price: 0.39,
    priceType: 'WITHOUT_GST',
    baseRate: 1,
    discountAmount: 0,
    taxAmount: 0.18,
    netRate: 1.18,
    taxPercentage: 18,
    cgstAmount: 0.09,
    sgstAmount: 0.09,
    igstAmount: 0,
  };
  const emptyHistory = {
    paidQuantity: 0,
    taxableAmount: 0,
    discountAmount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    totalTax: 0,
    totalAmount: 0,
  };
  const first = calculatePurchaseReturnItem(source, { taxType: 'CGST_SGST' }, 1, emptyHistory);
  const second = calculatePurchaseReturnItem(source, { taxType: 'CGST_SGST' }, 1, {
    ...first,
    paidQuantity: 1,
  });
  const third = calculatePurchaseReturnItem(source, { taxType: 'CGST_SGST' }, 1, {
    paidQuantity: 2,
    taxableAmount: first.taxableAmount + second.taxableAmount,
    discountAmount: 0,
    cgstAmount: first.cgstAmount + second.cgstAmount,
    sgstAmount: first.sgstAmount + second.sgstAmount,
    igstAmount: 0,
    totalTax: first.totalTax + second.totalTax,
    totalAmount: first.totalAmount + second.totalAmount,
  });

  assert.equal(round2(first.totalAmount + second.totalAmount + third.totalAmount), 1.18);
  assert.equal(round2(first.taxableAmount + second.taxableAmount + third.taxableAmount), 1);
  assert.equal(round2(first.totalTax + second.totalTax + third.totalTax), 0.18);
});
