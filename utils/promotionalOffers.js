'use strict';

const normalizeNonNegativeNumber = (value, field, { allowZero = true } = {}) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0)) {
    throw new Error(`${field} must be a valid non-negative number`);
  }
  return number;
};

const roundQuantity = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

const calculatePromotionalFreeQuantity = ({
  paidQuantity,
  buyQuantity = 1,
  freeQuantity = 1,
  offerType = 'BUY_X_GET_Y_FREE',
  giftQuantity,
} = {}) => {
  const chargeable = normalizeNonNegativeNumber(paidQuantity, 'paidQuantity');
  const offerText = String(offerType || '').trim().toUpperCase();
  const supportedOfferTypes = new Set([
    'BUY_X_GET_Y_FREE',
    'BUY_X_GET_Y_FREE_FIXED',
    'BUY_N_GET_M_FREE',
    'FREE_GIFT',
  ]);
  if (!supportedOfferTypes.has(offerText)) return 0;

  const buy = normalizeNonNegativeNumber(buyQuantity, 'buyQuantity', { allowZero: false });
  const free = normalizeNonNegativeNumber(
    offerText === 'FREE_GIFT' ? (giftQuantity ?? freeQuantity) : freeQuantity,
    offerText === 'FREE_GIFT' ? 'giftQuantity' : 'freeQuantity'
  );

  if (chargeable === 0 || buy <= 0) {
    return 0;
  }

  const qualifyingSets = Math.floor((chargeable / buy) + Number.EPSILON * 10);
  if (offerText === 'BUY_X_GET_Y_FREE_FIXED') {
    return qualifyingSets > 0 ? roundQuantity(free) : 0;
  }
  return roundQuantity(qualifyingSets * free);
};

const calculatePromotionalPricing = ({
  paidQuantity,
  buyQuantity = 1,
  freeQuantity = 1,
  price = 0,
  offerType = 'BUY_X_GET_Y_FREE',
  giftQuantity,
  discountPercentage = 0,
  discountAmount = 0,
  specialPrice,
}) => {
  const chargeable = normalizeNonNegativeNumber(paidQuantity, 'paidQuantity');
  const free = calculatePromotionalFreeQuantity({
    paidQuantity: chargeable,
    buyQuantity,
    freeQuantity,
    offerType,
    giftQuantity,
  });
  const unitPrice = normalizeNonNegativeNumber(
    offerType === 'SPECIAL_PRICE' ? specialPrice : price,
    offerType === 'SPECIAL_PRICE' ? 'specialPrice' : 'price'
  );
  const percentage = Math.min(
    100,
    normalizeNonNegativeNumber(discountPercentage, 'discountPercentage')
  );
  const requestedFlatDiscount = normalizeNonNegativeNumber(
    discountAmount,
    'discountAmount'
  );
  const subtotal = roundTo2(chargeable * unitPrice);
  const appliedDiscount = offerType === 'PERCENTAGE_DISCOUNT'
    ? roundTo2(subtotal * percentage / 100)
    : offerType === 'FLAT_DISCOUNT'
      ? Math.min(requestedFlatDiscount, subtotal)
      : 0;
  const payableAmount = roundTo2(subtotal - appliedDiscount);
  const totalQuantity = chargeable + free;

  return {
    paidQuantity: chargeable,
    freeQuantity: free,
    totalQuantity,
    chargeableQuantity: chargeable,
    price: unitPrice,
    discountPercentage: offerType === 'PERCENTAGE_DISCOUNT' ? percentage : 0,
    discountAmount: appliedDiscount,
    amount: payableAmount,
    freeAmount: roundTo2(free * (offerType === 'SPECIAL_PRICE' ? price : unitPrice)),
    totalAmount: roundTo2(totalQuantity * unitPrice),
  };
};

const roundTo2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

module.exports = {
  normalizeNonNegativeNumber,
  calculatePromotionalFreeQuantity,
  calculatePromotionalPricing,
};
