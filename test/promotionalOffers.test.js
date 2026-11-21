'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculatePromotionalFreeQuantity,
  calculatePromotionalPricing,
} = require('../utils/promotionalOffers');
const { calculateInvoiceItem } = require('../utils/productMargin');

test('BUY_X_GET_Y_FREE grants free units for each complete paid threshold', () => {
  assert.equal(calculatePromotionalFreeQuantity({ paidQuantity: 1, buyQuantity: 1, freeQuantity: 1 }), 1);
  assert.equal(calculatePromotionalFreeQuantity({ paidQuantity: 2, buyQuantity: 1, freeQuantity: 1 }), 2);
  assert.equal(calculatePromotionalFreeQuantity({ paidQuantity: 10, buyQuantity: 10, freeQuantity: 1 }), 1);
  assert.equal(calculatePromotionalFreeQuantity({ paidQuantity: 25, buyQuantity: 10, freeQuantity: 1 }), 2);
  assert.equal(calculatePromotionalFreeQuantity({
    paidQuantity: 0.3,
    buyQuantity: 0.1,
    freeQuantity: 0.2,
  }), 0.6);
});

test('BUY_X_GET_Y_FREE_FIXED grants its configured free quantity once after qualifying', () => {
  const offer = { offerType: 'BUY_X_GET_Y_FREE_FIXED', buyQuantity: 3, freeQuantity: 2 };

  assert.equal(calculatePromotionalFreeQuantity({ ...offer, paidQuantity: 2.999 }), 0);
  assert.equal(calculatePromotionalFreeQuantity({ ...offer, paidQuantity: 3 }), 2);
  assert.equal(calculatePromotionalFreeQuantity({ ...offer, paidQuantity: 12 }), 2);
});

test('BUY_N_GET_M_FREE uses its N/M fields as repeatable complete sets', () => {
  const offer = { offerType: 'BUY_N_GET_M_FREE', buyQuantity: 4, freeQuantity: 3 };

  assert.equal(calculatePromotionalFreeQuantity({ ...offer, paidQuantity: 3.999 }), 0);
  assert.equal(calculatePromotionalFreeQuantity({ ...offer, paidQuantity: 4 }), 3);
  assert.equal(calculatePromotionalFreeQuantity({ ...offer, paidQuantity: 8 }), 6);
});

test('FREE_GIFT uses buyQuantity as its threshold and giftQuantity as the repeated gift amount', () => {
  const offer = {
    offerType: 'FREE_GIFT',
    buyQuantity: 2,
    giftQuantity: 1.5,
    freeQuantity: 99,
  };

  assert.equal(calculatePromotionalFreeQuantity({ ...offer, paidQuantity: 1.999 }), 0);
  assert.equal(calculatePromotionalFreeQuantity({ ...offer, paidQuantity: 2 }), 1.5);
  assert.equal(calculatePromotionalFreeQuantity({ ...offer, paidQuantity: 4 }), 3);
});

test('unsupported legacy type strings do not create an offer', () => {
  assert.equal(calculatePromotionalFreeQuantity({
    paidQuantity: 25,
    offerType: 'BUY_10_GET_1_FREE',
  }), 0);
});

test('percentage and flat promotion discounts are capped at the payable subtotal', () => {
  const percentage = calculatePromotionalPricing({
    offerType: 'PERCENTAGE_DISCOUNT',
    paidQuantity: 2,
    price: 100,
    discountPercentage: 175,
  });
  const flat = calculatePromotionalPricing({
    offerType: 'FLAT_DISCOUNT',
    paidQuantity: 2,
    price: 100,
    discountAmount: 500,
  });

  assert.equal(percentage.discountPercentage, 100);
  assert.equal(percentage.discountAmount, 200);
  assert.equal(percentage.amount, 0);
  assert.equal(flat.discountAmount, 200);
  assert.equal(flat.amount, 0);
});

test('special price replaces the unit price without applying product discounts again', () => {
  const pricing = calculatePromotionalPricing({
    offerType: 'SPECIAL_PRICE',
    paidQuantity: 2,
    price: 100,
    specialPrice: 75,
    discountPercentage: 20,
    discountAmount: 10,
  });

  assert.equal(pricing.price, 75);
  assert.equal(pricing.discountPercentage, 0);
  assert.equal(pricing.discountAmount, 0);
  assert.equal(pricing.amount, 150);
});

test('invoice calculations ignore promotional freebies when only paid quantity is chargeable', () => {
  const item = calculateInvoiceItem(
    { quantity: 10, freeQuantity: 1, price: 100, discountPercentage: 10 },
    { salesPrice: 100, sellingPriceType: 'WITHOUT_GST', taxRate: '0' },
    'sale'
  );

  assert.equal(item.paidQuantity, 10);
  assert.equal(item.freeQuantity, 1);
  assert.equal(item.totalQuantity, 11);
  assert.equal(item.netRate, 900);
});
