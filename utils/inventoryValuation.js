'use strict';

const { getUnbatchedStockQuantity } = require('./inventoryStock');

const round4 = (value) => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
const finiteNonNegative = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

function adjustedUnbatchedAverageCost({
  currentStock,
  nextStock,
  batchQuantity,
  averageCost,
  incomingQuantity = 0,
  incomingUnitCost,
}) {
  const currentUnbatched = getUnbatchedStockQuantity(currentStock, batchQuantity);
  const nextUnbatched = getUnbatchedStockQuantity(nextStock, batchQuantity);
  const currentCost = finiteNonNegative(averageCost);
  if (nextUnbatched === 0) return null;

  const addedQuantity = Math.max(0, nextUnbatched - currentUnbatched);
  if (addedQuantity === 0) return currentCost;

  const receiptQuantity = finiteNonNegative(incomingQuantity);
  const receiptCost = finiteNonNegative(incomingUnitCost);
  if (
    receiptQuantity === null ||
    receiptQuantity + 0.001 < addedQuantity ||
    receiptCost === null
  ) {
    throw new Error('Enter a valid acquisition cost for the additional unbatched stock');
  }
  if (currentUnbatched > 0 && currentCost === null) {
    throw new Error('Existing unbatched stock has no recorded average cost');
  }

  const currentValue = currentUnbatched * (currentCost || 0);
  return round4(
    (currentValue + addedQuantity * receiptCost) / nextUnbatched
  );
}

function calculateInventoryValuation(products, batches) {
  const batchTotals = new Map();
  for (const batch of batches) {
    const quantity = finiteNonNegative(batch.availableQuantity);
    const cost = finiteNonNegative(batch.inventoryUnitCost);
    if (quantity === null || quantity === 0) continue;

    const productId = Number(batch.productId);
    const totals = batchTotals.get(productId) || { quantity: 0, value: 0 };
    totals.quantity += quantity;
    if (cost !== null) totals.value += quantity * cost;
    batchTotals.set(productId, totals);
  }

  return products.reduce((value, product) => {
    const stock = finiteNonNegative(product.stockQuantity) || 0;
    const batch = batchTotals.get(Number(product.id)) || { quantity: 0, value: 0 };
    const unbatchedQuantity = getUnbatchedStockQuantity(stock, batch.quantity);
    const averageCost = finiteNonNegative(product.unbatchedAverageCost);
    return value + batch.value +
      (averageCost === null ? 0 : unbatchedQuantity * averageCost);
  }, 0);
}

function calculateBatchUnitCost(lines) {
  let totalCost = 0;
  let totalQuantity = 0;
  for (const line of lines) {
    const quantity = finiteNonNegative(line.totalQuantity);
    const baseCost = finiteNonNegative(line.baseRate);
    const taxCost = finiteNonNegative(line.taxAmount);
    if (quantity === null || quantity === 0 || baseCost === null || taxCost === null) continue;
    const purchase = line.Purchase || line.purchase || {};
    const taxIsRecoverable = purchase.itcEligible === true ||
      purchase.itcEligible === 1 ||
      purchase.itcEligible === '1';
    totalQuantity += quantity;
    totalCost += baseCost + (taxIsRecoverable ? 0 : taxCost);
  }
  return totalQuantity > 0 ? round4(totalCost / totalQuantity) : null;
}

module.exports = {
  adjustedUnbatchedAverageCost,
  calculateBatchUnitCost,
  calculateInventoryValuation,
};
