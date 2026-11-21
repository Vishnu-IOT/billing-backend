'use strict';

const UNIT_TYPES = ['PIECE', 'WEIGHT'];
const BASE_UNITS = ['PCS', 'KG'];

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const quantityError = (message) => Object.assign(new Error(message), {
  code: 'INVALID_PRODUCT_QUANTITY',
});

const normalizeUnitName = (value) => String(value || '').trim().toUpperCase();

const resolveProductUnitConfig = (values = {}, current = null) => {
  const unitType = values.unitType ?? current?.unitType ?? 'PIECE';
  if (!UNIT_TYPES.includes(unitType)) {
    throw quantityError('unitType must be PIECE or WEIGHT');
  }

  const baseUnit = values.baseUnit ?? current?.baseUnit ?? (unitType === 'WEIGHT' ? 'KG' : 'PCS');
  if (!BASE_UNITS.includes(baseUnit)) {
    throw quantityError('baseUnit must be PCS or KG');
  }

  const allowDecimalQuantity = values.allowDecimalQuantity ??
    current?.allowDecimalQuantity ??
    (unitType === 'WEIGHT');

  if (typeof allowDecimalQuantity !== 'boolean') {
    throw quantityError('allowDecimalQuantity must be a boolean');
  }
  if (
    (unitType === 'WEIGHT' && (baseUnit !== 'KG' || !allowDecimalQuantity)) ||
    (unitType === 'PIECE' && (baseUnit !== 'PCS' || allowDecimalQuantity))
  ) {
    throw quantityError('PIECE products must use PCS without decimals; WEIGHT products must use KG with decimals');
  }

  return { unitType, baseUnit, allowDecimalQuantity };
};

const readQuantity = (value, { allowZero = false } = {}) => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw quantityError('quantity must be a valid number');
  }

  const quantity = Number(value);
  if (
    !Number.isFinite(quantity) ||
    quantity > 999999999999.999 ||
    quantity < 0 ||
    (!allowZero && quantity === 0)
  ) {
    throw quantityError(allowZero
      ? 'quantity must be a non-negative number'
      : 'quantity must be a positive number');
  }

  return quantity;
};

const round3 = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000;

const normalizeProductQuantity = (
  item,
  product,
  { allowZero = false, defaultValue } = {}
) => {
  const config = resolveProductUnitConfig({}, product);
  const sourceValue = item.quantity ?? defaultValue;
  const inputQuantity = readQuantity(sourceValue, { allowZero });
  const requestedUnitValue = item.quantityUnit ?? item.inputUnit ?? item.unit;
  const requestedUnit = requestedUnitValue === undefined || requestedUnitValue === null
    ? config.baseUnit
    : normalizeUnitName(requestedUnitValue);

  if (config.unitType === 'PIECE') {
    if (['G', 'GM', 'GMS', 'GRAM', 'GRAMS', 'KG', 'KGS', 'KILOGRAM', 'KILOGRAMS'].includes(requestedUnit)) {
      throw quantityError('Weight units are not allowed for PIECE products');
    }
    if (!Number.isSafeInteger(inputQuantity)) {
      throw quantityError('PIECE product quantity must be a whole number');
    }
    return {
      quantity: inputQuantity,
      quantityUnit: 'PCS',
      inputQuantity,
      inputUnit: requestedUnit,
    };
  }

  let quantityKg;
  if (['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS'].includes(requestedUnit)) {
    quantityKg = inputQuantity;
  } else if (['G', 'GM', 'GMS', 'GRAM', 'GRAMS'].includes(requestedUnit)) {
    quantityKg = inputQuantity / 1000;
  } else {
    throw quantityError('WEIGHT products accept only KG or GRAM quantities');
  }

  const normalizedQuantity = round3(quantityKg);
  if (Math.abs(quantityKg - normalizedQuantity) > 1e-9) {
    throw quantityError('Weight quantity must be representable to three decimal places in KG');
  }
  if (!allowZero && normalizedQuantity <= 0) {
    throw quantityError('Normalized weight quantity must be greater than zero');
  }
  if (normalizedQuantity > 999999999999.999) {
    throw quantityError('Weight quantity exceeds the supported storage range');
  }

  return {
    quantity: normalizedQuantity,
    quantityUnit: 'KG',
    inputQuantity,
    inputUnit: ['G', 'GM', 'GMS', 'GRAM', 'GRAMS'].includes(requestedUnit)
      ? 'GRAM'
      : 'KG',
  };
};

const normalizeStockQuantity = (quantity, unit, product, { allowZero = true } = {}) =>
  normalizeProductQuantity(
    { quantity, quantityUnit: unit },
    product,
    { allowZero }
  ).quantity;

const getRemainingReturnableQuantity = (soldQuantity, returnedQuantity) => {
  const sold = Number(soldQuantity);
  const returned = Number(returnedQuantity);
  if (!Number.isFinite(sold) || !Number.isFinite(returned) || sold < 0 || returned < 0) {
    throw quantityError('Sold and returned quantities must be valid non-negative numbers');
  }
  const remaining = round3(sold - returned);
  if (remaining < 0) {
    throw quantityError('Previously returned quantity exceeds the sold quantity');
  }
  return remaining;
};

const validateReturnQuantity = (soldQuantity, returnedQuantity, requestQuantity) => {
  const remaining = getRemainingReturnableQuantity(soldQuantity, returnedQuantity);
  if (!Number.isFinite(requestQuantity) || requestQuantity <= 0 || requestQuantity > remaining) {
    throw quantityError('Return quantity exceeds the unreturned sold quantity');
  }
  return round3(remaining - requestQuantity);
};

module.exports = {
  UNIT_TYPES,
  BASE_UNITS,
  resolveProductUnitConfig,
  normalizeProductQuantity,
  normalizeStockQuantity,
  getRemainingReturnableQuantity,
  validateReturnQuantity,
};
