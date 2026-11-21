'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { Op } = require('sequelize');
const productQuantity = require('../utils/productQuantity');
const { calculatePromotionalFreeQuantity } = require('../utils/promotionalOffers');
const productMargin = require('../utils/productMargin');

const controllerPath = path.resolve(
  __dirname,
  '../mysql-controllers/promotionController.js'
);

const loadPromotionController = ({
  giftStockQuantity,
  batches = [],
  sellingPriceType = 'WITHOUT_GST',
}) => {
  const product = {
    id: 142,
    name: 'Qualifying product',
    barcode: '142',
    stockQuantity: 11,
    unitType: 'PIECE',
    baseUnit: 'PCS',
    salesPrice: 100,
    discount: 15,
    sellingPriceType,
    taxRate: 0,
    MRP: 150,
  };
  const giftProduct = {
    id: 77,
    name: 'Gift product',
    barcode: '77',
    stockQuantity: giftStockQuantity,
    unitType: 'PIECE',
    baseUnit: 'PCS',
    salesPrice: 50,
    sellingPriceType: 'WITHOUT_GST',
    taxRate: 0,
    MRP: 75,
  };
  const promotion = {
    id: 3,
    source: 'REGULAR',
    name: 'Gift offer',
    offerType: 'FREE_GIFT',
    giftProductId: giftProduct.id,
    buyQuantity: 2,
    giftQuantity: 1,
  };
  const giftBatches = giftStockQuantity > 0
    ? [{
        id: 77,
        productId: giftProduct.id,
        companyId: 1,
        availableQuantity: giftStockQuantity,
        expiryDate: null,
      }]
    : [];
  const dependencies = {
    '../mysql-models/PromotionalOffer': {},
    '../mysql-models/PromotionalCampaign': {},
    '../mysql-models/CampaignProduct': {},
    '../mysql-models/Product': {
      findByPk: async (id) => Number(id) === product.id ? product : giftProduct,
    },
    '../mysql-models/Category': {},
    '../mysql-models/Sales-Items': {},
    '../mysql-models/ProductBatch': {
      findAll: async ({ where } = {}) =>
        Number(where?.productId) === giftProduct.id ? giftBatches : batches,
      sum: async () => 0,
    },
    sequelize: { Op },
    '../utils/productQuantity': productQuantity,
    '../utils/productMargin': {
      calculatePrice: productMargin.calculatePrice,
      calculateInvoiceItem: productMargin.calculateInvoiceItem,
      calculateInvoiceTotals: productMargin.calculateInvoiceTotals,
      resolveSalePricing: productMargin.resolveSalePricing,
    },
    '../utils/promotionEngine': {
      getPromotionForProduct: async ({ paidQuantity }) => {
        const freeQuantity = calculatePromotionalFreeQuantity({
          ...promotion,
          paidQuantity,
        });
        return freeQuantity > 0 ? { ...promotion, freeQuantity } : null;
      },
      promotionPricing: (_promotion, price) => ({
        price: Number(price),
        discountPercentage: 0,
        discountAmount: 0,
      }),
    },
    '../utils/inventoryStock': require('../utils/inventoryStock'),
  };
  const originalLoad = Module._load;
  Module._load = function loadWithInventoryStubs(request, parent, isMain) {
    if (parent?.filename === controllerPath && dependencies[request]) {
      return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[controllerPath];
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
};

const makeResponse = () => ({
  statusCode: null,
  body: null,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const request = {
  query: {
    productId: '142',
    paidQuantity: '4',
    billType: 'B2B',
    quantityUnit: 'PCS',
    companyId: '1',
    discountPercentage: '28.57',
  },
};

test('promotion preview counts an unbatched gift product as available stock', async () => {
  const { previewPromotion } = loadPromotionController({ giftStockQuantity: 11 });
  const response = makeResponse();

  await previewPromotion(request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.promotion.giftAvailableQuantity, 11);
  assert.equal(response.body.data.promotion.freeQuantity, 2);
});

test('promotion preview rejects a gift only when product and batch stock are empty', async () => {
  const { previewPromotion } = loadPromotionController({ giftStockQuantity: 0 });
  const response = makeResponse();

  await previewPromotion(request, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /Insufficient stock for the configured gift product/);
});

test('FREE_GIFT qualifies at the configured paid threshold and respects the exact gift stock boundary', async () => {
  const { previewPromotion } = loadPromotionController({ giftStockQuantity: 2 });
  const response = makeResponse();

  await previewPromotion({
    ...request,
    query: { ...request.query, paidQuantity: '4' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.promotion.freeQuantity, 2);
  assert.equal(response.body.data.promotion.giftAvailableQuantity, 2);
});

test('FREE_GIFT does not require gift stock before the qualifying quantity is reached', async () => {
  const { previewPromotion } = loadPromotionController({ giftStockQuantity: 0 });
  const response = makeResponse();

  await previewPromotion({
    ...request,
    query: { ...request.query, paidQuantity: '1' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.promotion, null);
});

test('FREE_GIFT preview rejects stock just below the calculated gift quantity', async () => {
  const { previewPromotion } = loadPromotionController({ giftStockQuantity: 1.999 });
  const response = makeResponse();

  await previewPromotion({
    ...request,
    query: { ...request.query, paidQuantity: '4' },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /Insufficient stock for the configured gift product/);
});

test('promotion preview uses the selected batch price despite product-level B2C pricing', async () => {
  const { previewPromotion } = loadPromotionController({
    giftStockQuantity: 11,
    batches: [{
      id: 5,
      productId: 142,
      companyId: 1,
      batchNumber: 'B-5',
      availableQuantity: 8,
      mrp: 110,
      salePrice: 80,
      discount: 5,
      gstPercentage: 0,
      expiryDate: null,
    }],
  });
  const response = makeResponse();

  await previewPromotion({
    ...request,
    loyaltyUser: { companyId: 1 },
    query: {
      ...request.query,
      useProductSalesPrice: 'true',
      priceGroup: JSON.stringify({
        mrp: 110,
        salePrice: 80,
        taxRate: 0,
        priceType: 'WITHOUT_GST',
      }),
      priceGroupKey: '11000:8000:0:WITHOUT_GST',
      batchAllocations: JSON.stringify([{ batchId: 5, quantity: 4 }]),
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.pricing.unitPrice, 80);
  assert.equal(response.body.data.pricing.payableAmount, 320);
});

test('POS promotion preview preserves batch price paise for final invoice rounding', async () => {
  const { previewPromotion } = loadPromotionController({
    giftStockQuantity: 0,
    sellingPriceType: 'WITH_GST',
    batches: [{
      id: 8,
      productId: 142,
      companyId: 1,
      batchNumber: 'KETO-8',
      availableQuantity: 11,
      mrp: 340,
      salePrice: 314.5,
      discount: 0,
      gstPercentage: 5,
      expiryDate: null,
    }],
  });
  const response = makeResponse();

  await previewPromotion({
    ...request,
    loyaltyUser: { companyId: 1 },
    query: {
      ...request.query,
      paidQuantity: '1',
      billType: 'B2C',
      priceGroup: JSON.stringify({
        mrp: 340,
        salePrice: 314.5,
        taxRate: 5,
        priceType: 'WITH_GST',
      }),
      priceGroupKey: '34000:31450:500:WITH_GST',
      batchAllocations: JSON.stringify([{ batchId: 8, quantity: 1 }]),
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    {
      baseRate: response.body.data.pricing.baseRate,
      taxAmount: response.body.data.pricing.taxAmount,
      payableAmount: response.body.data.pricing.payableAmount,
    },
    {
      baseRate: 299.52,
      taxAmount: 14.98,
      payableAmount: 314.5,
    }
  );
});

test('B2C promotion preview requires a company-scoped selected batch price group', async () => {
  const { previewPromotion } = loadPromotionController({
    giftStockQuantity: 11,
    batches: [],
  });
  const response = makeResponse();

  await previewPromotion({
    ...request,
    loyaltyUser: { companyId: 1 },
    query: { ...request.query, billType: 'B2C' },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /Select an available batch price group/);
});
