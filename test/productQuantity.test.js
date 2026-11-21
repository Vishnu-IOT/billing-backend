'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateInvoiceItem } = require('../utils/productMargin');
const {
  normalizeProductQuantity,
  normalizeStockQuantity,
  resolveProductUnitConfig,
  getRemainingReturnableQuantity,
  validateReturnQuantity,
} = require('../utils/productQuantity');

const pieceProduct = {
  unitType: 'PIECE',
  baseUnit: 'PCS',
  allowDecimalQuantity: false,
};

const tomatoProduct = {
  unitType: 'WEIGHT',
  baseUnit: 'KG',
  allowDecimalQuantity: true,
  salesPrice: 40,
  purchasePrice: 30,
  taxRate: '0',
};

test('preserves whole-piece quantity behavior and rejects fractional or weight inputs', () => {
  assert.deepEqual(normalizeProductQuantity({ quantity: 5 }, pieceProduct), {
    quantity: 5,
    quantityUnit: 'PCS',
    inputQuantity: 5,
    inputUnit: 'PCS',
  });
  assert.throws(
    () => normalizeProductQuantity({ quantity: 1.5 }, pieceProduct),
    /whole number/
  );
  assert.throws(
    () => normalizeProductQuantity({ quantity: 250, quantityUnit: 'GRAM' }, pieceProduct),
    /not allowed/
  );
});

test('normalizes GRAM and KG inputs to three-decimal KG quantities', () => {
  assert.equal(
    normalizeProductQuantity({ quantity: 150, quantityUnit: 'GRAM' }, tomatoProduct).quantity,
    0.15
  );
  assert.equal(
    normalizeProductQuantity({ quantity: 250, quantityUnit: 'GRAM' }, tomatoProduct).quantity,
    0.25
  );
  assert.equal(
    normalizeProductQuantity({ quantity: 500, quantityUnit: 'GRAM' }, tomatoProduct).quantity,
    0.5
  );
  assert.equal(
    normalizeProductQuantity({ quantity: 1.25, quantityUnit: 'KG' }, tomatoProduct).quantity,
    1.25
  );
  assert.throws(
    () => normalizeProductQuantity({ quantity: 0.5, quantityUnit: 'GRAM' }, tomatoProduct),
    /representable/
  );
});

test('uses normalized weight quantities for purchase and sales calculations', () => {
  const saleQuantity = normalizeProductQuantity(
    { quantity: 250, quantityUnit: 'GRAM' },
    tomatoProduct
  );
  const sale = calculateInvoiceItem(
    { quantity: saleQuantity.quantity, price: tomatoProduct.salesPrice },
    tomatoProduct,
    'sale'
  );
  assert.equal(sale.baseRate, 10);
  assert.equal(sale.netRate, 10);

  const purchaseQuantity = normalizeProductQuantity(
    { quantity: 500, quantityUnit: 'GRAM' },
    tomatoProduct
  );
  const purchase = calculateInvoiceItem(
    { quantity: purchaseQuantity.quantity, price: tomatoProduct.purchasePrice },
    tomatoProduct,
    'purchase'
  );
  assert.equal(purchase.baseRate, 15);
});

test('normalizes opening stock and validates product unit configuration', () => {
  const weightConfig = resolveProductUnitConfig({ unitType: 'WEIGHT' });
  assert.deepEqual(weightConfig, {
    unitType: 'WEIGHT',
    baseUnit: 'KG',
    allowDecimalQuantity: true,
  });
  assert.equal(normalizeStockQuantity(250, 'GRAM', weightConfig), 0.25);
  assert.equal(normalizeStockQuantity(5, undefined, pieceProduct), 5);
  assert.throws(
    () => resolveProductUnitConfig({
      unitType: 'PIECE',
      baseUnit: 'KG',
      allowDecimalQuantity: true,
    }),
    /must use PCS/
  );
});

test('allows partial weight returns without permitting over-return', () => {
  assert.equal(getRemainingReturnableQuantity(0.75, 0.15), 0.6);
  assert.equal(validateReturnQuantity(0.75, 0.15, 0.25), 0.35);
  assert.throws(
    () => validateReturnQuantity(0.75, 0.15, 0.601),
    /unreturned sold quantity/
  );
  assert.throws(
    () => getRemainingReturnableQuantity(0.75, 0.751),
    /exceeds the sold quantity/
  );
});
