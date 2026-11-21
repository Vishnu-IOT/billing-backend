'use strict';

const batchAllocationError = (message) => Object.assign(new Error(message), {
  code: 'INVALID_BATCH_ALLOCATION',
});

const round3 = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

const groupNormalizedSaleItems = (entries) => {
  const groups = new Map();

  for (const entry of entries) {
    const productId = Number(entry.product.id);
    const priceGroupKey = String(entry.item.priceGroupKey || '');
    const groupId = `${productId}:${priceGroupKey}`;
    let group = groups.get(groupId);
    if (!group) {
      group = {
        item: entry.item,
        product: entry.product,
        priceGroupKey,
        priceGroup: entry.item.priceGroup || null,
        quantityUnit: entry.normalizedQuantity.quantityUnit,
        paidQuantity: 0,
        manualAllocations: [],
        allocationMode: null,
      };
      groups.set(groupId, group);
    } else if (
      JSON.stringify(group.priceGroup) !== JSON.stringify(entry.item.priceGroup || null)
    ) {
      throw batchAllocationError('A price group cannot contain inconsistent price snapshots');
    }

    if (group.quantityUnit !== entry.normalizedQuantity.quantityUnit) {
      throw batchAllocationError('A product cannot mix normalized quantity units');
    }
    group.paidQuantity = round3(
      group.paidQuantity + Number(entry.normalizedQuantity.quantity)
    );

    const mode = entry.manualAllocations ? 'MANUAL' : 'FIFO';
    if (group.allocationMode && group.allocationMode !== mode) {
      throw batchAllocationError(
        'All lines for a product must use either manual batch allocation or FIFO'
      );
    }
    group.allocationMode = mode;
    if (entry.manualAllocations) {
      group.manualAllocations.push(...entry.manualAllocations);
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    manualAllocations: group.allocationMode === 'MANUAL'
      ? group.manualAllocations
      : undefined,
  }));
};

module.exports = { groupNormalizedSaleItems };