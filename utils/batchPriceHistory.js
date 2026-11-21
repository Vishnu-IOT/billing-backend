'use strict';

function toTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLatestBatchPriceHistory(batches) {
  return batches
    .map((batch) => {
      const record = typeof batch.get === 'function'
        ? batch.get({ plain: true })
        : batch;
      const purchaseDates = (record.PurchaseItems || [])
        .map((item) => item.Purchase?.purchaseDate)
        .filter(Boolean)
        .sort((a, b) => toTimestamp(b) - toTimestamp(a));

      return {
        id: record.id,
        batchNumber: record.batchNumber,
        purchaseDate: purchaseDates[0] || record.createdAt || null,
        mrp: record.mrp,
        salePrice: record.salePrice,
        purchasePrice: record.purchasePrice,
      };
    })
    .sort(
      (a, b) =>
        toTimestamp(b.purchaseDate) - toTimestamp(a.purchaseDate) ||
        Number(b.id) - Number(a.id)
    )
    .slice(0, 5);
}

module.exports = { getLatestBatchPriceHistory };
