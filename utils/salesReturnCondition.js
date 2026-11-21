'use strict';

const normalizeSalesReturnCondition = (value) => {
  const condition = String(value ?? 'GOOD').trim().toUpperCase();
  if (!['GOOD', 'DAMAGED', 'EXPIRED'].includes(condition)) {
    throw Object.assign(
      new Error('returnCondition must be GOOD, DAMAGED, or EXPIRED'),
      { status: 400 }
    );
  }
  return condition;
};

const normalizeReturnCreditItems = (items) => {
  const normalized = items.map((item) => {
    if (item.quickSaleItemId != null) {
      return {
        quickSaleItemId: Number(item.quickSaleItemId),
        quantity: item.quantity,
      };
    }
    const returnCondition = normalizeSalesReturnCondition(
      item.returnCondition ?? item.condition
    );
    return {
      saleItemId: Number(item.saleItemId),
      quantity: item.quantity,
      quantityUnit: item.quantityUnit,
      ...(returnCondition === 'GOOD' ? {} : { returnCondition }),
    };
  });
  const itemKey = (item) => item.quickSaleItemId != null
    ? `quick:${item.quickSaleItemId}`
    : `product:${item.saleItemId}:${item.returnCondition || 'GOOD'}`;
  if (new Set(normalized.map(itemKey)).size !== normalized.length) {
    throw Object.assign(
      new Error('Each sales item can be returned only once per condition'),
      { status: 400 }
    );
  }
  return normalized.sort((a, b) =>
    (a.quickSaleItemId || a.saleItemId) - (b.quickSaleItemId || b.saleItemId) ||
    String(a.returnCondition || '').localeCompare(String(b.returnCondition || ''))
  );
};

module.exports = {
  normalizeSalesReturnCondition,
  normalizeReturnCreditItems,
};
