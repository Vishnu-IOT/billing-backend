'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculatePrice,
  resolveSalePricing,
  calculateInvoiceItem,
  calculateInvoiceTotals,
  productWithMargin,
  resolveProductPricing,
} = require('../utils/productMargin');

test('calculates WITH_GST and WITHOUT_GST amounts for supported GST rates', () => {
  for (const rate of [5, 12, 18, 28]) {
    const exclusive = calculatePrice(500, 'WITHOUT_GST', rate);
    const inclusive = calculatePrice(exclusive.totalPrice, 'WITH_GST', rate);

    assert.equal(exclusive.basePrice, 500);
    assert.equal(exclusive.gstAmount, Math.round(500 * rate) / 100);
    assert.equal(inclusive.basePrice, 500);
    assert.equal(inclusive.gstAmount, exclusive.gstAmount);
  }
});

test('sales invoice lines use the saved product price mode without double-taxing', () => {
  const product = {
    purchasePrice: 500,
    salesPrice: 590,
    purchasePriceType: 'WITHOUT_GST',
    sellingPriceType: 'WITH_GST',
    taxRate: '18',
  };
  const sale = calculateInvoiceItem({ quantity: 1 }, product, 'sale');

  assert.deepEqual(
    { baseRate: sale.baseRate, taxAmount: sale.taxAmount, netRate: sale.netRate },
    { baseRate: 500, taxAmount: 90, netRate: 590 }
  );
});

test('GST-inclusive batch sale price remains exact on the saved invoice line', () => {
  const sale = calculateInvoiceItem(
    { price: 45, priceType: 'WITH_GST', quantity: 2 },
    { sellingPriceType: 'WITH_GST', taxRate: 18 },
    'sale'
  );

  assert.deepEqual(
    {
      baseRate: sale.baseRate,
      discountAmount: sale.discountAmount,
      taxAmount: sale.taxAmount,
      netRate: sale.netRate,
    },
    { baseRate: 76.28, discountAmount: 0, taxAmount: 13.72, netRate: 90 }
  );
});

test('invoice total rounds the aggregate while retaining exact POS line amounts', () => {
  const lines = [
    [314.5, 1],
    [45.75, 2],
    [9.99, 3],
  ].map(([price, quantity]) =>
    calculateInvoiceItem(
      { price, priceType: 'WITHOUT_GST', quantity },
      { sellingPriceType: 'WITHOUT_GST', taxRate: 0 },
      'sale'
    )
  );
  const rounded = calculateInvoiceTotals(lines);
  const exact = calculateInvoiceTotals(lines, 0, 0, {
    roundToWholeRupee: false,
  });

  assert.deepEqual(lines.map((line) => line.netRate), [314.5, 91.5, 29.97]);
  assert.equal(rounded.items[0].netRate, 314.5);
  assert.equal(rounded.totalAmount, 436);
  assert.equal(rounded.roundOff, 0.03);
  assert.equal(exact.totalAmount, 435.97);
  assert.equal(exact.roundOff, 0);

  const additionalLines = [
    [45.01, 1],
    [25.58, 2],
  ].map(([price, quantity]) =>
    calculateInvoiceItem(
      { price, priceType: 'WITHOUT_GST', quantity },
      { sellingPriceType: 'WITHOUT_GST', taxRate: 0 },
      'sale'
    )
  );
  assert.deepEqual(additionalLines.map((line) => line.netRate), [45.01, 51.16]);
});

test('discounted GST-inclusive sale lines use rounded unit base consistently', () => {
  const sale = calculateInvoiceItem(
    {
      price: 10,
      priceType: 'WITH_GST',
      quantity: 5,
      discountPercentage: 1,
      discountAmount: 0.48,
    },
    { sellingPriceType: 'WITH_GST', taxRate: 5 },
    'sale'
  );

  assert.deepEqual(
    {
      baseRate: sale.baseRate,
      discountAmount: sale.discountAmount,
      taxAmount: sale.taxAmount,
      netRate: sale.netRate,
    },
    { baseRate: 47.12, discountAmount: 0.48, taxAmount: 2.36, netRate: 49.48 }
  );
});

test('selected batch pricing overrides product-level B2C pricing', () => {
  const product = {
    salesPrice: 120,
    MRP: 150,
    discount: 5,
  };
  const batch = {
    salePrice: 105,
    mrp: 125,
    discount: 10,
  };

  assert.deepEqual(
    resolveSalePricing(product, batch, {
      useProductSalesPrice: true,
      preferBatch: true,
    }),
    { price: 105, mrp: 125, discountPercentage: 0 }
  );
  assert.deepEqual(
    resolveSalePricing(product, batch, {
      useProductSalesPrice: true,
    }),
    { price: 114, mrp: 150, discountPercentage: 0 }
  );
  assert.deepEqual(
    resolveSalePricing(product, batch),
    { price: 105, mrp: 125, discountPercentage: 10 }
  );
  assert.deepEqual(
    resolveSalePricing(product, null, { useProductSalesPrice: true }),
    { price: 114, mrp: 150, discountPercentage: 0 }
  );
  const line = calculateInvoiceItem(
    { quantity: 2, price: 114 },
    { salesPrice: product.salesPrice, sellingPriceType: 'WITHOUT_GST', taxRate: 0 },
    'sale'
  );
  assert.equal(calculateInvoiceTotals([line]).totalAmount, 228);
});

test('POS batch pricing requires a batch and does not apply either product or batch discounts', () => {
  const product = {
    salesPrice: 120,
    MRP: 150,
    discount: 15,
  };
  const batch = {
    salePrice: 45.01,
    mrp: 120,
    discount: 25,
  };

  assert.throws(
    () => resolveSalePricing(product, null, { requireBatch: true }),
    /eligible product batch is required/,
  );
  assert.deepEqual(
    resolveSalePricing({}, batch, { requireBatch: true }),
    { price: 45.01, mrp: 120, discountPercentage: 0 },
  );
});

test('purchase invoice lines use the submitted rate and line discount values', () => {
  const purchase = calculateInvoiceItem(
    {
      price: 100,
      priceType: 'WITHOUT_GST',
      quantity: 2,
      discountPercentage: 7.5,
      discountAmount: 15,
    },
    {
      purchasePrice: 500,
      purchasePriceType: 'WITH_GST',
      taxRate: '12',
    },
    'purchase'
  );

  assert.deepEqual(
    {
      price: purchase.price,
      discountPercentage: purchase.discountPercentage,
      discountAmount: purchase.discountAmount,
      baseRate: purchase.baseRate,
      taxAmount: purchase.taxAmount,
      netRate: purchase.netRate,
    },
    {
      price: 100,
      discountPercentage: 7.5,
      discountAmount: 15,
      baseRate: 185,
      taxAmount: 22.2,
      netRate: 207.2,
    }
  );
});

test('purchase invoice lines require a submitted rate instead of using product price', () => {
  assert.throws(
    () =>
      calculateInvoiceItem(
        { quantity: 1 },
        { purchasePrice: 500, purchasePriceType: 'WITHOUT_GST', taxRate: '0' },
        'purchase'
      ),
    /item\.price is required/
  );
});

test('invoice line and global discounts reduce taxable value before GST', () => {
  const line = calculateInvoiceItem(
    { price: 590, quantity: 1, discountPercentage: 10 },
    { salesPrice: 590, sellingPriceType: 'WITH_GST', taxRate: '18' },
    'sale'
  );
  const totals = calculateInvoiceTotals([line], 0, 0);

  assert.equal(totals.items[0].discountAmount, 50);
  assert.equal(totals.baseRate, 450);
  assert.equal(totals.tax, 81);
  assert.equal(totals.totalAmount, 531);

  const invoiceDiscount = calculateInvoiceTotals([line], 10, 0);
  assert.equal(invoiceDiscount.globalDiscountAmount, 53.1);
  assert.equal(invoiceDiscount.baseRate, 405);
  assert.equal(invoiceDiscount.tax, 72.9);
  assert.equal(invoiceDiscount.totalAmount, 478);

  const fixedInvoiceDiscount = calculateInvoiceTotals([line], 0, 45);
  assert.equal(fixedInvoiceDiscount.globalDiscountAmount, 45);
  assert.equal(fixedInvoiceDiscount.totalAmount, 486);
});

test('purchase global percentage discounts taxable subtotal before recalculating GST', () => {
  const totals = calculateInvoiceTotals([
    {
      baseRate: 100,
      taxPercentage: 5,
      taxAmount: 5,
      netRate: 105,
      discountAmount: 0,
    },
    {
      baseRate: 100,
      taxPercentage: 18,
      taxAmount: 18,
      netRate: 118,
      discountAmount: 0,
    },
  ], 10, 0, { discountPercentageOnBase: true });

  assert.equal(totals.globalDiscountAmount, 20);
  assert.equal(totals.items[0].baseRate, 90);
  assert.equal(totals.items[0].taxAmount, 4.5);
  assert.equal(totals.items[1].baseRate, 90);
  assert.equal(totals.items[1].taxAmount, 16.2);
  assert.equal(totals.baseRate, 180);
  assert.equal(totals.tax, 20.7);
  assert.equal(totals.totalAmount, 201);
});

test('rounds only the final invoice total to the nearest rupee', () => {
  const totals = calculateInvoiceTotals([
    {
      baseRate: 760,
      taxPercentage: 18,
      taxAmount: 137.62,
      netRate: 897.62,
      discountAmount: 0,
    },
  ]);

  assert.equal(totals.baseRate, 760);
  assert.equal(totals.tax, 137.62);
  assert.equal(totals.totalAmount, 898);
  assert.equal(totals.roundOff, 0.38);
});

test('preserves paise in B2C invoice totals when whole-rupee rounding is disabled', () => {
  const totals = calculateInvoiceTotals(
    [
      {
        baseRate: 760.69,
        taxPercentage: 18,
        taxAmount: 136.93,
        netRate: 897.62,
        discountAmount: 0,
      },
    ],
    0,
    0,
    { roundToWholeRupee: false }
  );

  assert.equal(totals.totalAmount, 897.62);
  assert.equal(totals.roundOff, 0);
});

test('handles all independent purchase and selling price type combinations', () => {
  for (const purchasePriceType of ['WITH_GST', 'WITHOUT_GST']) {
    for (const sellingPriceType of ['WITH_GST', 'WITHOUT_GST']) {
      const product = resolveProductPricing({
        purchasePrice: purchasePriceType === 'WITH_GST' ? 590 : 500,
        purchasePriceType,
        sellingPrice: sellingPriceType === 'WITH_GST' ? 708 : 600,
        sellingPriceType,
        taxRate: 18,
      });

      assert.equal(product.purchaseBasePrice, 500);
      assert.equal(product.sellingBasePrice, 600);
    }
  }
});

test('calculates product margin from comparable GST-exclusive prices', () => {
  const product = resolveProductPricing({
    purchasePrice: 590,
    purchasePriceType: 'WITH_GST',
    sellingPrice: 700,
    sellingPriceType: 'WITHOUT_GST',
    taxRate: 18,
  });

  assert.equal(product.purchaseBasePrice, 500);
  assert.equal(product.purchaseGSTAmount, 90);
  assert.equal(product.sellingBasePrice, 700);
  assert.equal(product.sellingGSTAmount, 126);
  assert.equal(product.profitAmount, 200);
  assert.equal(product.profitMargin, 28.57);
});

test('exposes persisted prices and GST calculations in product API data', () => {
  const product = productWithMargin({
    purchasePrice: 500,
    salesPrice: 590,
    purchasePriceType: 'WITHOUT_GST',
    sellingPriceType: 'WITH_GST',
    taxRate: '18',
    profitMargin: 99,
  });

  assert.equal(product.purchasePrice, 500);
  assert.equal(product.sellingPrice, 590);
  assert.equal(product.purchasePriceType, 'WITHOUT_GST');
  assert.equal(product.sellingPriceType, 'WITH_GST');
  assert.equal(product.gstRate, 18);
  assert.equal(product.purchaseBasePrice, 500);
  assert.equal(product.purchaseGSTAmount, 90);
  assert.equal(product.sellingBasePrice, 500);
  assert.equal(product.sellingGSTAmount, 90);
  assert.equal(product.profitAmount, 0);
  assert.equal(product.profitMargin, 0);
});

test('supports zero GST, zero prices, and negative profit', () => {
  const zeroTax = calculatePrice(500, 'WITHOUT_GST', 0);
  assert.deepEqual(zeroTax, { basePrice: 500, gstAmount: 0, totalPrice: 500 });

  const zeroPrice = resolveProductPricing({
    purchasePrice: 0,
    sellingPrice: 0,
    taxRate: 18,
  });
  assert.equal(zeroPrice.profitAmount, 0);
  assert.equal(zeroPrice.profitMargin, null);

  const loss = resolveProductPricing({
    purchasePrice: 118,
    purchasePriceType: 'WITH_GST',
    sellingPrice: 90,
    sellingPriceType: 'WITHOUT_GST',
    taxRate: 18,
  });
  assert.equal(loss.profitAmount, -10);
  assert.equal(loss.profitMargin, -11.11);
});

test('recalculates when tax rate or a price type changes during update', () => {
  const current = {
    purchasePrice: 500,
    salesPrice: 590,
    taxRate: '0',
    purchasePriceType: 'WITHOUT_GST',
    sellingPriceType: 'WITH_GST',
  };

  const changedTax = resolveProductPricing({ taxRate: 18 }, current, { required: false });
  assert.equal(changedTax.purchaseBasePrice, 500);
  assert.equal(changedTax.sellingBasePrice, 500);
  assert.equal(changedTax.profitAmount, 0);

  const changedType = resolveProductPricing(
    { purchasePriceType: 'WITH_GST', taxRate: 18 },
    current,
    { required: false }
  );
  assert.equal(changedType.purchaseBasePrice, 423.73);
  assert.equal(changedType.sellingBasePrice, 500);
  assert.equal(changedType.profitMargin, 15.25);
});
