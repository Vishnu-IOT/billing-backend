'use strict';

const { Op } = require('sequelize');
const ProductBatch = require('../mysql-models/ProductBatch');
const { getUnbatchedStockQuantity } = require('./inventoryStock');

const allocationError = (message) => Object.assign(new Error(message), {
  code: 'INVALID_BATCH_ALLOCATION',
});

const round3 = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const cents = (value) => Math.round((Number(value) + Number.EPSILON) * 100);

function priceGroupKey(priceGroup) {
  return [
    cents(priceGroup.mrp),
    cents(priceGroup.salePrice),
    cents(priceGroup.taxRate),
    priceGroup.priceType,
  ].join(':');
}

function batchExpiryDate(batch) {
  const expiryDate = batch.expiryDate;
  return expiryDate instanceof Date
    ? expiryDate.toISOString().slice(0, 10)
    : String(expiryDate || '').slice(0, 10);
}

const receivePurchaseBatch = async ({
  product,
  batchNumber,
  mfgDate,
  expiryDate,
  paidQuantity,
  freeQuantity,
  purchasePrice,
  mrp,
  salePrice,
  gstPercentage,
  companyId,
  transaction,
}) => {
  const paid = Number(paidQuantity);
  const free = Number(freeQuantity);
  const received = round3(paid + free);
  if (!Number.isFinite(paid) || paid <= 0 || !Number.isFinite(free) || free < 0) {
    throw allocationError('Purchase paid and free quantities are invalid');
  }

  return ProductBatch.create(
    {
      productId: product.id,
      batchNumber,
      mfgDate: mfgDate || null,
      expiryDate: expiryDate || null,
      quantity: received,
      freeQuantity: free,
      totalReceivedQuantity: received,
      availableQuantity: received,
      purchasePrice,
      inventoryUnitCost: purchasePrice,
      mrp,
      salePrice,
      gstPercentage,
      companyId: companyId || null,
    },
    { transaction }
  );
};

const allocateBatchStock = async ({
  productId,
  totalQuantity,
  paidQuantity,
  manualBatchId,
  manualAllocations,
  allowUnbatchedStock = false,
  useProductStockOnly = false,
  unbatchedStockQuantity = 0,
  expectedPriceGroup,
  requireBatchStock = false,
  requirePriceGroupAllocation = false,
  companyId,
  transaction,
}) => {
  const requested = round3(Number(totalQuantity));
  const paid = round3(Number(paidQuantity));
  if (
    !Number.isFinite(requested) || requested <= 0 ||
    !Number.isFinite(paid) || paid < 0 || paid > requested
  ) {
    throw allocationError('Requested batch quantity is invalid');
  }

  if (requireBatchStock && (!Number.isInteger(Number(companyId)) || Number(companyId) <= 0)) {
    throw allocationError('A valid authenticated company is required for batch allocation');
  }
  if (
    requireBatchStock &&
    (useProductStockOnly || (requirePriceGroupAllocation &&
      (!expectedPriceGroup || !Array.isArray(manualAllocations) || manualAllocations.length === 0)))
  ) {
    throw allocationError(
      'POS sales require a selected batch price group and explicit batch allocations'
    );
  }

  if (useProductStockOnly) {
    const availableStock = Number(unbatchedStockQuantity);
    if (!Number.isFinite(availableStock) || availableStock < requested) {
      throw allocationError(`Insufficient product stock for product ${productId}`);
    }

    return [{
      batch: null,
      quantity: requested,
      paidQuantity: paid,
      freeQuantity: round3(requested - paid),
    }];
  }

  const lockedCandidates = await ProductBatch.findAll({
    where: {
      productId,
      availableQuantity: { [Op.gt]: 0 },
      ...(requireBatchStock ? { companyId: Number(companyId) } : {}),
    },
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const scopedCandidates = lockedCandidates.filter((batch) =>
    !requireBatchStock ||
    (Number(batch.productId) === Number(productId) &&
      Number(batch.companyId) === Number(companyId))
  );
  const today = new Date().toISOString().slice(0, 10);
  let candidates = scopedCandidates.filter((batch) => {
    const expiryDate = batchExpiryDate(batch);
    return !expiryDate || expiryDate >= today;
  });
  if (expectedPriceGroup) {
    const expectedKey = priceGroupKey(expectedPriceGroup);
    if (
      !Number.isFinite(Number(expectedPriceGroup.mrp)) ||
      !Number.isFinite(Number(expectedPriceGroup.salePrice)) ||
      !Number.isFinite(Number(expectedPriceGroup.taxRate)) ||
      !['WITH_GST', 'WITHOUT_GST'].includes(expectedPriceGroup.priceType) ||
      String(expectedPriceGroup.key || '') !== expectedKey
    ) {
      throw allocationError('Selected MRP price group is invalid');
    }

    candidates = scopedCandidates.filter((batch) => {
      const expiryDate = batchExpiryDate(batch);
      return (
        (!expiryDate || expiryDate >= today) &&
        priceGroupKey({
          mrp: batch.mrp,
          salePrice: batch.salePrice,
          taxRate: batch.gstPercentage,
          priceType: expectedPriceGroup.priceType,
        }) === expectedKey
      );
    });
    if (!candidates.length) {
      throw allocationError('Selected MRP price group is no longer available');
    }
  }
  const batchAvailableQuantity = round3(
    candidates.reduce(
      (total, batch) => total + Number(batch.availableQuantity || 0),
      0
    )
  );
  const trackedBatchQuantity = round3(
    scopedCandidates.reduce(
      (total, batch) => total + Number(batch.availableQuantity || 0),
      0
    )
  );
  const productAvailableQuantity = Number(unbatchedStockQuantity);
  let unbatchedRemaining =
    !expectedPriceGroup &&
    !requireBatchStock &&
    allowUnbatchedStock &&
    Number.isFinite(productAvailableQuantity)
      ? getUnbatchedStockQuantity(productAvailableQuantity, trackedBatchQuantity)
      : 0;
  const candidatesById = new Map(
    candidates.map((batch) => [Number(batch.id), batch])
  );
  const paidByBatch = new Map();
  let unbatchedPaidQuantity = 0;

  if (Array.isArray(manualAllocations) && manualAllocations.length > 0) {
    const requestedAllocations = manualAllocations.map((allocation) => ({
      batchId: Number(allocation.batchId),
      quantity: round3(Number(allocation.quantity)),
    }));
    if (requestedAllocations.some((allocation) =>
      !Number.isInteger(allocation.batchId) ||
      !Number.isFinite(allocation.quantity) ||
      allocation.quantity <= 0
    )) {
      throw allocationError('Manual batch allocations require a batchId and positive quantity');
    }
    const manuallyAllocatedPaid = round3(
      requestedAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0)
    );
    if (Math.abs(manuallyAllocatedPaid - paid) > 0.001) {
      throw allocationError('Manual batch allocations must equal the paid quantity');
    }
    for (const allocation of requestedAllocations) {
      const batch = candidatesById.get(allocation.batchId);
      if (!batch) {
        throw allocationError('A selected batch does not belong to this product or has no available stock');
      }
      const nextPaid = round3(
        Number(paidByBatch.get(allocation.batchId) || 0) + allocation.quantity
      );
      if (Number(batch.availableQuantity || 0) < nextPaid) {
        throw allocationError(`Insufficient stock in batch ${batch.batchNumber}`);
      }
      paidByBatch.set(allocation.batchId, nextPaid);
    }
  } else if (manualBatchId !== undefined && manualBatchId !== null) {
    const selectedBatchId = Number(manualBatchId);
    const selectedBatch = candidatesById.get(selectedBatchId);
    if (!Number.isInteger(selectedBatchId) || !selectedBatch) {
      throw allocationError('The selected batch does not belong to this product or has no available stock');
    }
    if (Number(selectedBatch.availableQuantity || 0) < paid) {
      throw allocationError(`Insufficient stock in batch ${selectedBatch.batchNumber}`);
    }
    if (paid > 0) paidByBatch.set(selectedBatchId, paid);
  } else {
    let paidRemaining = paid;
    for (const batch of candidates) {
      if (paidRemaining <= 0) break;
      const quantity = round3(Math.min(
        Number(batch.availableQuantity || 0),
        paidRemaining,
      ));
      if (quantity > 0) {
        paidByBatch.set(Number(batch.id), quantity);
        paidRemaining = round3(paidRemaining - quantity);
      }
    }
    if (paidRemaining > unbatchedRemaining + 0.001) {
      throw allocationError(
        allowUnbatchedStock
          ? `Insufficient product stock for product ${productId}`
          : `Insufficient batch stock for product ${productId}`
      );
    }
    unbatchedPaidQuantity = paidRemaining;
    unbatchedRemaining = round3(unbatchedRemaining - unbatchedPaidQuantity);
  }

  let freeRemaining = round3(requested - paid);
  const freeByBatch = new Map();
  for (const batch of candidates) {
    if (freeRemaining <= 0) break;
    const batchId = Number(batch.id);
    const availableAfterPaid = round3(
      Number(batch.availableQuantity || 0) - Number(paidByBatch.get(batchId) || 0)
    );
    const freeQuantity = round3(Math.min(availableAfterPaid, freeRemaining));
    if (freeQuantity > 0) {
      freeByBatch.set(batchId, freeQuantity);
      freeRemaining = round3(freeRemaining - freeQuantity);
    }
  }
  if (freeRemaining > unbatchedRemaining + 0.001) {
    throw allocationError(
      allowUnbatchedStock
        ? `Insufficient product stock for product ${productId}`
        : `Insufficient batch stock for product ${productId}`
    );
  }
  const unbatchedFreeQuantity = freeRemaining;
  unbatchedRemaining = round3(unbatchedRemaining - unbatchedFreeQuantity);

  const allocations = [];
  for (const batch of candidates) {
    const batchId = Number(batch.id);
    const paidQuantity = Number(paidByBatch.get(batchId) || 0);
    const freeQuantity = Number(freeByBatch.get(batchId) || 0);
    const quantity = round3(paidQuantity + freeQuantity);
    if (quantity <= 0) continue;

    const available = Number(batch.availableQuantity || 0);
    if (available < quantity) {
      throw allocationError(`Insufficient stock in batch ${batch.batchNumber}`);
    }
    const nextAvailable = round3(available - quantity);
    await batch.update(
      { availableQuantity: nextAvailable, quantity: nextAvailable },
      { transaction }
    );
    allocations.push({ batch, quantity, paidQuantity, freeQuantity });
  }

  const unbatchedQuantity = round3(unbatchedPaidQuantity + unbatchedFreeQuantity);
  if (unbatchedQuantity > 0) {
    allocations.push({
      batch: null,
      quantity: unbatchedQuantity,
      paidQuantity: unbatchedPaidQuantity,
      freeQuantity: unbatchedFreeQuantity,
    });
  }

  return allocations;
};

const restoreBatchStock = async ({ batchId, quantity, transaction }) => {
  const batch = await ProductBatch.findByPk(batchId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!batch) {
    throw allocationError(`Batch not found: ${batchId}`);
  }
  const nextAvailable = round3(Number(batch.availableQuantity || 0) + Number(quantity));
  await batch.update(
    { availableQuantity: nextAvailable, quantity: nextAvailable },
    { transaction }
  );
  return batch;
};

module.exports = {
  allocateBatchStock,
  receivePurchaseBatch,
  restoreBatchStock,
};
