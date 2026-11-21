'use strict';

const { Op } = require('sequelize');
const ProductBatch = require('../mysql-models/ProductBatch');
const StockMovement = require('../mysql-models/StockMovement');
const { receivePurchaseBatch } = require('./inventoryBatches');
const { normalizeProductQuantity } = require('./productQuantity');

const openingMovementTypes = ['OPENING_STOCK', 'ProductOpeningStock'];
const openingStockError = (message, status = 400) =>
  Object.assign(new Error(message), { status });

function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const date = String(value);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw openingStockError(`${label} must be a valid YYYY-MM-DD date`);
  }
  return date;
}

function nonNegativeAmount(value, fallback, label) {
  const amount = Number(value === undefined || value === null || value === '' ? fallback : value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw openingStockError(`${label} must be a valid non-negative amount`);
  }
  return amount;
}

async function initializeQuickSaleOpeningStock({
  alias,
  product,
  companyId,
  input,
  actorUserId,
  transaction,
}) {
  if (!Number.isInteger(Number(companyId)) || Number(companyId) <= 0) {
    throw openingStockError('A valid authenticated company is required', 403);
  }
  if (!alias || !product || Number(alias.linkedProductId) !== Number(product.id)) {
    throw openingStockError('Link the Quick Sale alias to this product before initializing stock', 409);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw openingStockError('Opening stock details are required');
  }
  if (input.confirmedPhysicalCount !== true) {
    throw openingStockError('Confirm that the entered quantity matches the physical stock count');
  }

  const quantity = normalizeProductQuantity({
    quantity: input.quantity,
    quantityUnit: input.quantityUnit ?? product.baseUnit,
  }, product);

  const currentStock = Number(product.stockQuantity || 0);
  if (!Number.isFinite(currentStock) || currentStock < 0) {
    throw openingStockError('Product stock is inconsistent; reconcile it before initializing opening stock', 409);
  }

  const companyBatches = await ProductBatch.findAll({
    where: { productId: product.id, companyId: Number(companyId) },
    attributes: ['id', 'availableQuantity'],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const companyBatchQuantity = companyBatches.reduce(
    (total, batch) => total + Number(batch.availableQuantity || 0),
    0,
  );
  const allBatchQuantity = Number(await ProductBatch.sum('availableQuantity', {
    where: { productId: product.id },
    transaction,
  })) || 0;
  if (currentStock > 0 || companyBatchQuantity > 0 || allBatchQuantity > 0) {
    throw openingStockError('This product already has inventory; opening stock was not added', 409);
  }

  const existingOpeningMovement = await StockMovement.findOne({
    where: {
      productId: product.id,
      movementType: 'ADJUSTMENT',
      referenceType: { [Op.in]: openingMovementTypes },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (existingOpeningMovement) {
    throw openingStockError('Opening stock has already been initialized for this product', 409);
  }

  const batchNumber = String(input.batchNumber || '').trim() ||
    `QS-OPENING-${product.id}-${Date.now()}`;
  if (batchNumber.length > 255) {
    throw openingStockError('Batch number must be 255 characters or fewer');
  }
  const mfgDate = optionalDate(input.mfgDate, 'Manufacturing date');
  const expiryDate = optionalDate(input.expiryDate, 'Expiry date');
  if (mfgDate && expiryDate && expiryDate < mfgDate) {
    throw openingStockError('Expiry date cannot be before the manufacturing date');
  }

  const mrp = nonNegativeAmount(input.mrp, product.MRP, 'MRP');
  const purchasePrice = nonNegativeAmount(
    input.purchasePrice,
    product.purchasePrice,
    'Purchase price',
  );
  const salePrice = nonNegativeAmount(input.salePrice, product.salesPrice, 'Selling price');
  const gstPercentage = nonNegativeAmount(
    input.gstPercentage,
    product.taxRate || 0,
    'GST percentage',
  );
  if (gstPercentage > 100) {
    throw openingStockError('GST percentage cannot exceed 100');
  }

  const reason = String(input.reason || '').trim();
  if (reason.length > 255) {
    throw openingStockError('Opening stock reason must be 255 characters or fewer');
  }

  const batch = await receivePurchaseBatch({
    product,
    batchNumber,
    mfgDate,
    expiryDate,
    paidQuantity: quantity.quantity,
    freeQuantity: 0,
    purchasePrice,
    mrp,
    salePrice,
    gstPercentage,
    companyId: Number(companyId),
    transaction,
  });
  const nextStock = currentStock + quantity.quantity;
  await product.update({ stockQuantity: nextStock }, { transaction });

  const movement = await StockMovement.create({
    warehouseId: 1,
    productId: product.id,
    batchId: batch.id,
    movementType: 'ADJUSTMENT',
    quantity: quantity.quantity,
    quantityUnit: quantity.quantityUnit,
    referenceType: 'OPENING_STOCK',
    referenceId: String(batch.id),
    notes: `Quick Sale alias #${alias.id} opening stock${reason ? `: ${reason}` : ''}`.slice(0, 255),
    performedBy: actorUserId,
  }, { transaction });

  return {
    batch,
    movement,
    quantity: quantity.quantity,
    quantityUnit: quantity.quantityUnit,
    previousStock: currentStock,
    nextStock,
    reason: reason || null,
  };
}

module.exports = {
  initializeQuickSaleOpeningStock,
};
