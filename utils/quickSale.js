'use strict';

const { calculatePrice } = require('./productMargin');

const round2 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const round3 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

const normalizeQuickSaleName = (value) =>
  String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-IN');

const normalizeQuickSaleBarcode = (value) =>
  String(value || '').trim().toUpperCase();

function getQuickSaleIdentityKey(name, barcode) {
  const normalizedBarcode = normalizeQuickSaleBarcode(barcode);
  return normalizedBarcode
    ? `barcode:${normalizedBarcode}`
    : `name:${normalizeQuickSaleName(name)}`;
}

function readPositiveDecimal(value, field, decimalPlaces, maximum) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`${field} is required`);
  }
  const text = String(value).trim();
  const decimalPattern = new RegExp(`^\\d+(?:\\.\\d{1,${decimalPlaces}})?$`);
  const amount = Number(text);
  if (
    !decimalPattern.test(text) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > maximum
  ) {
    throw new Error(`${field} must be greater than zero with at most ${decimalPlaces} decimal places`);
  }
  return decimalPlaces === 2 ? round2(amount) : round3(amount);
}

function validateQuickSaleInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Quick Sale item must be an object');
  }
  const name = String(input.name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 255) {
    throw new Error('Quick Sale product name is required and must be 255 characters or fewer');
  }
  const mrp = readPositiveDecimal(input.mrp, 'MRP', 2, 9999999999.99);
  const sellingPrice = readPositiveDecimal(
    input.sellingPrice,
    'Selling price',
    2,
    9999999999.99,
  );
  const quantity = readPositiveDecimal(
    input.quantity,
    'Quantity',
    3,
    999999999999.999,
  );
  if (sellingPrice > mrp) {
    throw new Error('Selling price cannot exceed MRP');
  }
  const barcode = String(input.barcode || '').trim();
  if (barcode.length > 255) {
    throw new Error('Barcode must be 255 characters or fewer');
  }

  return {
    name,
    mrp,
    sellingPrice,
    quantity,
    barcode: barcode || null,
    identityKey: getQuickSaleIdentityKey(name, barcode),
  };
}

function calculateQuickSalePricing(input, alias) {
  const lineAmount = round2(input.sellingPrice * input.quantity);
  if (alias.gstVerificationStatus !== 'GST_VERIFIED') {
    return {
      taxVerificationStatus: 'GST_PENDING',
      priceType: null,
      taxPercentage: null,
      taxableAmount: null,
      taxAmount: null,
      lineAmount,
      pricing: {
        price: input.sellingPrice,
        paidQuantity: input.quantity,
        baseRate: 0,
        taxPercentage: null,
        taxAmount: null,
        netRate: lineAmount,
        discountAmount: 0,
        discountPercentage: 0,
        gstVerificationStatus: 'GST_PENDING',
      },
    };
  }

  if (alias.verifiedTaxRate === null || alias.verifiedTaxRate === undefined) {
    throw new Error('Verified GST rate is missing from this Quick Sale alias');
  }
  if (alias.verifiedPriceType !== 'WITH_GST') {
    throw new Error('Quick Sale aliases must use GST-inclusive verified prices');
  }

  const unitPricing = calculatePrice(
    input.sellingPrice,
    'WITH_GST',
    alias.verifiedTaxRate,
  );
  const taxableAmount = round2(unitPricing.basePrice * input.quantity);
  const grossAmount = round2(unitPricing.totalPrice * input.quantity);
  const taxAmount = round2(grossAmount - taxableAmount);
  return {
    taxVerificationStatus: 'GST_VERIFIED',
    priceType: 'WITH_GST',
    taxPercentage: Number(alias.verifiedTaxRate),
    taxableAmount,
    taxAmount,
    lineAmount: grossAmount,
    pricing: {
      price: input.sellingPrice,
      paidQuantity: input.quantity,
      baseRate: taxableAmount,
      taxPercentage: Number(alias.verifiedTaxRate),
      taxAmount,
      netRate: grossAmount,
      discountAmount: 0,
      discountPercentage: 0,
      gstVerificationStatus: 'GST_VERIFIED',
    },
  };
}

module.exports = {
  calculateQuickSalePricing,
  getQuickSaleIdentityKey,
  normalizeQuickSaleBarcode,
  normalizeQuickSaleName,
  round2,
  round3,
  validateQuickSaleInput,
};
