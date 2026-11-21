'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const makeBatch = (id, availableQuantity) => ({
  id,
  batchNumber: `B-${id}`,
  availableQuantity,
  expiryDate: null,
  update: async function update(values) {
    Object.assign(this, values);
  },
});

test('purchase receipt creates a batch with paid and supplier-free stock', async () => {
  const utilityPath = path.resolve(__dirname, '../utils/inventoryBatches.js');
  const transaction = { id: 'purchase-transaction' };
  let createdBatch;
  const originalLoad = Module._load;
  delete require.cache[utilityPath];
  Module._load = function loadWithPurchaseBatchStub(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === utilityPath
    ) {
      return {
        create: async (values, options) => {
          createdBatch = { values, options };
          return values;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { receivePurchaseBatch } = require('../utils/inventoryBatches');
    await receivePurchaseBatch({
      product: { id: 12 },
      batchNumber: 'PUR-1-1',
      paidQuantity: 10,
      freeQuantity: 1,
      purchasePrice: 65,
      mrp: 100,
      salePrice: 120,
      gstPercentage: 18,
      companyId: 1,
      transaction,
    });

    assert.equal(createdBatch.values.productId, 12);
    assert.equal(createdBatch.values.quantity, 11);
    assert.equal(createdBatch.values.freeQuantity, 1);
    assert.equal(createdBatch.values.totalReceivedQuantity, 11);
    assert.equal(createdBatch.values.availableQuantity, 11);
    assert.equal(createdBatch.options.transaction, transaction);
  } finally {
    Module._load = originalLoad;
    delete require.cache[utilityPath];
  }
});

test('manual paid batch allocation fills same-product gift stock FIFO', async () => {
  const batches = [makeBatch(1, 1), makeBatch(2, 5)];
  const originalLoad = Module._load;
  Module._load = function loadWithBatchStub(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === path.resolve(__dirname, '../utils/inventoryBatches.js')
    ) {
      return { findAll: async () => batches };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { allocateBatchStock } = require('../utils/inventoryBatches');
    const allocations = await allocateBatchStock({
      productId: 12,
      totalQuantity: 3,
      paidQuantity: 2,
      manualAllocations: [{ batchId: 2, quantity: 2 }],
      transaction: { LOCK: { UPDATE: 'UPDATE' } },
    });

    assert.deepEqual(
      allocations.map(({ batch, quantity, paidQuantity, freeQuantity }) => ({
        batchId: batch.id,
        quantity,
        paidQuantity,
        freeQuantity,
      })),
      [
        { batchId: 1, quantity: 1, paidQuantity: 0, freeQuantity: 1 },
        { batchId: 2, quantity: 2, paidQuantity: 2, freeQuantity: 0 },
      ],
    );
    assert.equal(batches[0].availableQuantity, 0);
    assert.equal(batches[1].availableQuantity, 3);
  } finally {
    Module._load = originalLoad;
  }
});

test('sales without a selected batch allocate available batches FIFO', async () => {
  const batches = [makeBatch(1, 2), makeBatch(2, 4)];
  const originalLoad = Module._load;
  const utilityPath = path.resolve(__dirname, '../utils/inventoryBatches.js');
  delete require.cache[utilityPath];
  Module._load = function loadWithAvailableBatches(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === utilityPath
    ) {
      return { findAll: async () => batches };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { allocateBatchStock } = require('../utils/inventoryBatches');
    const allocations = await allocateBatchStock({
      productId: 12,
      totalQuantity: 4,
      paidQuantity: 4,
      allowUnbatchedStock: true,
      unbatchedStockQuantity: 6,
      transaction: { LOCK: { UPDATE: 'UPDATE' } },
    });

    assert.deepEqual(
      allocations.map(({ batch, quantity }) => ({
        batchId: batch.id,
        quantity,
      })),
      [
        { batchId: 1, quantity: 2 },
        { batchId: 2, quantity: 2 },
      ],
    );
    assert.equal(batches[0].availableQuantity, 0);
    assert.equal(batches[1].availableQuantity, 2);
  } finally {
    Module._load = originalLoad;
    delete require.cache[utilityPath];
  }
});

test('price-group allocation validates the locked batches and expiry', async () => {
  const batches = [
    {
      ...makeBatch(1, 2),
      mrp: 200,
      salePrice: 180,
      gstPercentage: 5,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      ...makeBatch(2, 3),
      mrp: 400,
      salePrice: 360,
      gstPercentage: 5,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    },
    {
      ...makeBatch(3, 5),
      mrp: 200,
      salePrice: 180,
      gstPercentage: 5,
      expiryDate: new Date('2020-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-03T00:00:00Z'),
    },
  ];
  const originalLoad = Module._load;
  const utilityPath = path.resolve(__dirname, '../utils/inventoryBatches.js');
  delete require.cache[utilityPath];
  Module._load = function loadPriceGroupBatches(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === utilityPath
    ) {
      return { findAll: async () => batches };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { allocateBatchStock } = require('../utils/inventoryBatches');
    const priceGroup = {
      key: '20000:18000:500:WITHOUT_GST',
      mrp: 200,
      salePrice: 180,
      taxRate: 5,
      priceType: 'WITHOUT_GST',
    };
    const allocations = await allocateBatchStock({
      productId: 12,
      totalQuantity: 2,
      paidQuantity: 2,
      manualAllocations: [{ batchId: 1, quantity: 2 }],
      expectedPriceGroup: priceGroup,
      transaction: { LOCK: { UPDATE: 'UPDATE' } },
    });

    assert.deepEqual(allocations.map(({ batch }) => batch.id), [1]);
    await assert.rejects(
      allocateBatchStock({
        productId: 12,
        totalQuantity: 1,
        paidQuantity: 1,
        manualAllocations: [{ batchId: 2, quantity: 1 }],
        expectedPriceGroup: priceGroup,
        transaction: { LOCK: { UPDATE: 'UPDATE' } },
      }),
      /selected batch does not belong/,
    );
    await assert.rejects(
      allocateBatchStock({
        productId: 12,
        totalQuantity: 1,
        paidQuantity: 1,
        manualAllocations: [{ batchId: 1, quantity: 1 }],
        expectedPriceGroup: {
          key: '30000:28000:500:WITHOUT_GST',
          mrp: 300,
          salePrice: 280,
          taxRate: 5,
          priceType: 'WITHOUT_GST',
        },
        transaction: { LOCK: { UPDATE: 'UPDATE' } },
      }),
      /Selected MRP price group is no longer available/,
    );
    await assert.rejects(
      allocateBatchStock({
        productId: 12,
        totalQuantity: 1,
        paidQuantity: 1,
        manualAllocations: [{ batchId: 3, quantity: 1 }],
        expectedPriceGroup: priceGroup,
        transaction: { LOCK: { UPDATE: 'UPDATE' } },
      }),
      /selected batch does not belong/,
    );
  } finally {
    Module._load = originalLoad;
    delete require.cache[utilityPath];
  }
});

test('POS allocations are company-scoped, batch-only, and limited to the selected price group', async () => {
  const utilityPath = path.resolve(__dirname, '../utils/inventoryBatches.js');
  const originalLoad = Module._load;
  const batch = {
    ...makeBatch(1, 4),
    productId: 12,
    companyId: 1,
    mrp: 120,
    salePrice: 45.01,
    gstPercentage: 18,
  };
  let queryOptions;
  delete require.cache[utilityPath];
  Module._load = function loadCompanyScopedBatch(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === utilityPath
    ) {
      return {
        findAll: async (options) => {
          queryOptions = options;
          return [batch, { ...batch, id: 2, companyId: 2 }];
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { allocateBatchStock } = require('../utils/inventoryBatches');
    const priceGroup = {
      key: '12000:4501:1800:WITHOUT_GST',
      mrp: 120,
      salePrice: 45.01,
      taxRate: 18,
      priceType: 'WITHOUT_GST',
    };
    const allocations = await allocateBatchStock({
      productId: 12,
      totalQuantity: 2,
      paidQuantity: 2,
      manualAllocations: [{ batchId: 1, quantity: 2 }],
      expectedPriceGroup: priceGroup,
      requireBatchStock: true,
      requirePriceGroupAllocation: true,
      companyId: 1,
      allowUnbatchedStock: true,
      unbatchedStockQuantity: 50,
      transaction: { LOCK: { UPDATE: 'UPDATE' } },
    });

    assert.equal(queryOptions.where.companyId, 1);
    assert.deepEqual(allocations.map(({ batch: allocatedBatch }) => allocatedBatch.id), [1]);
    assert.equal(batch.availableQuantity, 2);

    await assert.rejects(
      allocateBatchStock({
        productId: 12,
        totalQuantity: 5,
        paidQuantity: 5,
        expectedPriceGroup: priceGroup,
        requireBatchStock: true,
        requirePriceGroupAllocation: true,
        companyId: 1,
        allowUnbatchedStock: true,
        unbatchedStockQuantity: 50,
        transaction: { LOCK: { UPDATE: 'UPDATE' } },
      }),
      /explicit batch allocations/,
    );
    await assert.rejects(
      allocateBatchStock({
        productId: 12,
        totalQuantity: 3,
        paidQuantity: 3,
        manualAllocations: [{ batchId: 2, quantity: 3 }],
        expectedPriceGroup: priceGroup,
        requireBatchStock: true,
        requirePriceGroupAllocation: true,
        companyId: 1,
        allowUnbatchedStock: true,
        unbatchedStockQuantity: 50,
        transaction: { LOCK: { UPDATE: 'UPDATE' } },
      }),
      /does not belong to this product/,
    );
    await assert.rejects(
      allocateBatchStock({
        productId: 12,
        totalQuantity: 3,
        paidQuantity: 3,
        manualAllocations: [{ batchId: 1, quantity: 3 }],
        expectedPriceGroup: priceGroup,
        requireBatchStock: true,
        requirePriceGroupAllocation: true,
        companyId: 1,
        allowUnbatchedStock: true,
        unbatchedStockQuantity: 50,
        transaction: { LOCK: { UPDATE: 'UPDATE' } },
      }),
      /Insufficient stock in batch/,
    );
  } finally {
    Module._load = originalLoad;
    delete require.cache[utilityPath];
  }
});

test('sales fill a product-stock remainder after using available batches FIFO', async () => {
  const batches = [makeBatch(1, 2)];
  const originalLoad = Module._load;
  const utilityPath = path.resolve(__dirname, '../utils/inventoryBatches.js');
  delete require.cache[utilityPath];
  Module._load = function loadWithPartiallyTrackedStock(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === utilityPath
    ) {
      return { findAll: async () => batches };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { allocateBatchStock } = require('../utils/inventoryBatches');
    const allocations = await allocateBatchStock({
      productId: 12,
      totalQuantity: 4,
      paidQuantity: 4,
      allowUnbatchedStock: true,
      unbatchedStockQuantity: 11,
      transaction: { LOCK: { UPDATE: 'UPDATE' } },
    });

    assert.deepEqual(
      allocations.map(({ batch, quantity }) => ({
        batchId: batch?.id || null,
        quantity,
      })),
      [
        { batchId: 1, quantity: 2 },
        { batchId: null, quantity: 2 },
      ],
    );
    assert.equal(batches[0].availableQuantity, 0);
  } finally {
    Module._load = originalLoad;
    delete require.cache[utilityPath];
  }
});

test('sale can use product stock when no batch records exist', async () => {
  const originalLoad = Module._load;
  const utilityPath = path.resolve(__dirname, '../utils/inventoryBatches.js');
  delete require.cache[utilityPath];
  Module._load = function loadWithoutBatches(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === utilityPath
    ) {
      return {
        findAll: async () => [],
        findOne: async () => null,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { allocateBatchStock } = require('../utils/inventoryBatches');
    const allocations = await allocateBatchStock({
      productId: 12,
      totalQuantity: 3,
      paidQuantity: 3,
      allowUnbatchedStock: true,
      unbatchedStockQuantity: 5,
      transaction: { LOCK: { UPDATE: 'UPDATE' } },
    });

    assert.deepEqual(allocations, [{
      batch: null,
      quantity: 3,
      paidQuantity: 3,
      freeQuantity: 0,
    }]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[utilityPath];
  }
});

test('unbatched sales cannot exceed product-level stock', async () => {
  const originalLoad = Module._load;
  const utilityPath = path.resolve(__dirname, '../utils/inventoryBatches.js');
  delete require.cache[utilityPath];
  Module._load = function loadWithoutBatches(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === utilityPath
    ) {
      return {
        findAll: async () => [],
        findOne: async () => null,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { allocateBatchStock } = require('../utils/inventoryBatches');
    await assert.rejects(
      allocateBatchStock({
        productId: 12,
        totalQuantity: 3,
        paidQuantity: 3,
        allowUnbatchedStock: true,
        unbatchedStockQuantity: 2,
        transaction: { LOCK: { UPDATE: 'UPDATE' } },
      }),
      /Insufficient .* stock/,
    );
  } finally {
    Module._load = originalLoad;
    delete require.cache[utilityPath];
  }
});

test('POS product-stock allocation ignores batch balances and preserves batch stock', async () => {
  const batch = makeBatch(8, 1);
  const originalLoad = Module._load;
  const utilityPath = path.resolve(__dirname, '../utils/inventoryBatches.js');
  delete require.cache[utilityPath];
  Module._load = function loadWithBatch(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === utilityPath
    ) {
      return {
        findAll: async () => {
          throw new Error('POS product-stock allocation should not query batches');
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { allocateBatchStock } = require('../utils/inventoryBatches');
    const allocations = await allocateBatchStock({
      productId: 12,
      totalQuantity: 3,
      paidQuantity: 3,
      manualBatchId: 8,
      manualAllocations: [{ batchId: 8, quantity: 3 }],
      useProductStockOnly: true,
      unbatchedStockQuantity: 10,
      transaction: { LOCK: { UPDATE: 'UPDATE' } },
    });

    assert.deepEqual(allocations, [{
      batch: null,
      quantity: 3,
      paidQuantity: 3,
      freeQuantity: 0,
    }]);
    assert.equal(batch.availableQuantity, 1);
    await assert.rejects(
      allocateBatchStock({
        productId: 12,
        totalQuantity: 11,
        paidQuantity: 11,
        useProductStockOnly: true,
        unbatchedStockQuantity: 10,
        transaction: { LOCK: { UPDATE: 'UPDATE' } },
      }),
      /Insufficient product stock/,
    );
  } finally {
    Module._load = originalLoad;
    delete require.cache[utilityPath];
  }
});

test('sales can use product stock left after existing batches are depleted', async () => {
  const originalLoad = Module._load;
  const utilityPath = path.resolve(__dirname, '../utils/inventoryBatches.js');
  delete require.cache[utilityPath];
  Module._load = function loadWithDepletedBatch(request, parent, isMain) {
    if (
      request === '../mysql-models/ProductBatch' &&
      parent?.filename === utilityPath
    ) {
      return {
        findAll: async () => [],
        findOne: async () => ({ id: 8 }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { allocateBatchStock } = require('../utils/inventoryBatches');
    const allocations = await allocateBatchStock({
      productId: 12,
      totalQuantity: 1,
      paidQuantity: 1,
      allowUnbatchedStock: true,
      unbatchedStockQuantity: 5,
      transaction: { LOCK: { UPDATE: 'UPDATE' } },
    });
    assert.deepEqual(allocations, [{
      batch: null,
      quantity: 1,
      paidQuantity: 1,
      freeQuantity: 0,
    }]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[utilityPath];
  }
});