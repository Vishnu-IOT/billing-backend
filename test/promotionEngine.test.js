'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { Op } = require('sequelize');

const enginePath = path.resolve(__dirname, '../utils/promotionEngine.js');

const loadPromotionEngine = ({ campaigns = [], offers = [] } = {}) => {
  const originalLoad = Module._load;
  Module._load = function loadWithPromotionStubs(request, parent, isMain) {
    if (parent?.filename === enginePath) {
      if (request === '../mysql-models/PromotionalOffer') {
        return {
          findAll: async ({ where } = {}) => offers.filter((offer) => {
            const clauses = where?.[Op.and] || [];
            const eligibility = clauses.find((clause) =>
              (clause[Op.or] || []).some((condition) =>
                Object.prototype.hasOwnProperty.call(condition, 'productId') ||
                Object.prototype.hasOwnProperty.call(condition, 'categoryId')
              )
            )?.[Op.or] || [];
            const productMatch = eligibility.some((condition) =>
              condition.productId !== undefined &&
              Number(offer.productId) === Number(condition.productId)
            );
            const categoryMatch = eligibility.some((condition) =>
              condition.categoryId !== undefined &&
              Number(offer.categoryId) === Number(condition.categoryId)
            );
            return (productMatch || categoryMatch) && offer.isActive === true;
          }),
        };
      }
      if (request === '../mysql-models/PromotionalCampaign') {
        return { findAll: async () => [] };
      }
      if (request === '../mysql-models/CampaignProduct') {
        return {
          findAll: async ({ where } = {}) => campaigns.filter((campaign) => {
            const eligibility = where?.[Op.or] || [];
            return eligibility.some((condition) =>
              Object.entries(condition).every(([key, value]) =>
                Number(campaign[key]) === Number(value)
              )
            ) && where?.isActive === campaign.isActive;
          }),
        };
      }
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[enginePath];
    return require(enginePath);
  } finally {
    Module._load = originalLoad;
  }
};

const record = (data) => ({
  ...data,
  toJSON() {
    return { ...this };
  },
});

test('eligible campaign takes priority over regular offer for the same product', async () => {
  const campaignProduct = record({
    id: 21,
    productId: 12,
    isActive: true,
    offerType: 'PERCENTAGE_DISCOUNT',
    discountPercentage: 10,
    eligibleBillType: 'B2C',
    campaign: {
      id: 4,
      name: 'Pongal Special',
      isActive: true,
      priority: 100,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-20T00:00:00.000Z',
    },
  });
  const regularOffer = record({
    id: 8,
    productId: 12,
    isActive: true,
    offerType: 'BUY_X_GET_Y_FREE',
    buyQuantity: 1,
    freeQuantity: 1,
    priority: 10,
    eligibleBillType: 'B2C',
  });
  const { getPromotionForProduct } = loadPromotionEngine({
    campaigns: [campaignProduct],
    offers: [regularOffer],
  });

  const selected = await getPromotionForProduct({
    product: { id: 12, categoryId: 3 },
    billType: 'B2C',
    paidQuantity: 1,
    now: new Date('2026-01-10T12:00:00.000Z'),
  });

  assert.equal(selected.source, 'CAMPAIGN');
  assert.equal(selected.campaignId, 4);
  assert.equal(selected.name, 'Pongal Special');
  assert.equal(selected.freeQuantity, 0);
});

test('regular buy/get offer grants complete qualifying sets when no campaign applies', async () => {
  const regularOffer = record({
    id: 8,
    productId: 12,
    isActive: true,
    offerType: 'BUY_X_GET_Y_FREE',
    buyQuantity: 10,
    freeQuantity: 1,
    priority: 10,
    eligibleBillType: 'B2C',
  });
  const { getPromotionForProduct } = loadPromotionEngine({ offers: [regularOffer] });

  const selected = await getPromotionForProduct({
    product: { id: 12, categoryId: 3 },
    billType: 'B2C',
    paidQuantity: 25,
    now: new Date('2026-01-10T12:00:00.000Z'),
  });

  assert.equal(selected.source, 'REGULAR');
  assert.equal(selected.freeQuantity, 2);
});

test('all configured quantity and gift offer types use their existing quantity fields', async () => {
  const cases = [
    { offerType: 'BUY_X_GET_Y_FREE', buyQuantity: 3, freeQuantity: 1, paidQuantity: 6, expected: 2 },
    { offerType: 'BUY_X_GET_Y_FREE_FIXED', buyQuantity: 3, freeQuantity: 1, paidQuantity: 6, expected: 1 },
    { offerType: 'BUY_N_GET_M_FREE', buyQuantity: 3, freeQuantity: 2, paidQuantity: 6, expected: 4 },
    { offerType: 'FREE_GIFT', buyQuantity: 3, giftQuantity: 2, paidQuantity: 6, expected: 4 },
  ];

  for (const [index, offer] of cases.entries()) {
    const regularOffer = record({
      id: index + 1,
      productId: 12,
      isActive: true,
      priority: 10,
      eligibleBillType: 'B2C',
      ...offer,
    });
    const { getPromotionForProduct } = loadPromotionEngine({ offers: [regularOffer] });
    const selected = await getPromotionForProduct({
      product: { id: 12, categoryId: 3 },
      billType: 'B2C',
      paidQuantity: offer.paidQuantity,
      now: new Date('2026-01-10T12:00:00.000Z'),
    });

    assert.equal(selected.offerType, offer.offerType);
    assert.equal(selected.freeQuantity, offer.expected);
  }
});

test('percentage, flat, and special price offers are selected using their configured value fields', async () => {
  const cases = [
    { offerType: 'PERCENTAGE_DISCOUNT', discountPercentage: 10 },
    { offerType: 'FLAT_DISCOUNT', discountAmount: 5 },
    { offerType: 'SPECIAL_PRICE', specialPrice: 75 },
  ];

  for (const [index, offer] of cases.entries()) {
    const regularOffer = record({
      id: index + 20,
      productId: 12,
      isActive: true,
      priority: 10,
      eligibleBillType: 'B2C',
      ...offer,
    });
    const { getPromotionForProduct } = loadPromotionEngine({ offers: [regularOffer] });
    const selected = await getPromotionForProduct({
      product: { id: 12, categoryId: 3 },
      billType: 'B2C',
      paidQuantity: 1,
      now: new Date('2026-01-10T12:00:00.000Z'),
    });

    assert.equal(selected.id, index + 20);
    assert.equal(selected.offerType, offer.offerType);
  }
});

test('highest-priority eligible offer wins without stacking and invalid periods/types are skipped', async () => {
  const offers = [
    record({
      id: 1,
      productId: 12,
      isActive: true,
      offerType: 'BUY_X_GET_Y_FREE',
      buyQuantity: 1,
      freeQuantity: 1,
      priority: 10,
      eligibleBillType: 'B2C',
    }),
    record({
      id: 2,
      productId: 12,
      isActive: true,
      offerType: 'BUY_N_GET_M_FREE',
      buyQuantity: 1,
      freeQuantity: 2,
      priority: 50,
      eligibleBillType: 'B2C',
    }),
    record({
      id: 3,
      productId: 12,
      isActive: true,
      offerType: 'BUY_X_GET_Y_FREE',
      buyQuantity: 1,
      freeQuantity: 9,
      priority: 100,
      eligibleBillType: 'B2C',
      startDate: '2026-01-11T00:00:00.000Z',
    }),
    record({
      id: 4,
      productId: 12,
      isActive: true,
      offerType: 'BUY_X_GET_Y_FREE',
      buyQuantity: 1,
      freeQuantity: 9,
      priority: 90,
      eligibleBillType: 'B2C',
      endDate: '2026-01-09T00:00:00.000Z',
    }),
    record({
      id: 5,
      productId: 12,
      isActive: true,
      offerType: 'NOT_A_PROMOTION',
      buyQuantity: 1,
      freeQuantity: 9,
      priority: 80,
      eligibleBillType: 'B2C',
    }),
    record({
      id: 6,
      productId: 12,
      isActive: true,
      offerType: 'BUY_X_GET_Y_FREE',
      buyQuantity: 1,
      freeQuantity: 9,
      priority: 70,
      eligibleBillType: 'B2B',
    }),
  ];
  const { getPromotionForProduct } = loadPromotionEngine({ offers });

  const selected = await getPromotionForProduct({
    product: { id: 12, categoryId: 3 },
    billType: 'B2C',
    paidQuantity: 1,
    now: new Date('2026-01-10T12:00:00.000Z'),
  });

  assert.equal(selected.id, 2);
  assert.equal(selected.freeQuantity, 2);
});

test('product and category eligibility remain enforced by the promotion lookup', async () => {
  const offers = [
    record({
      id: 13,
      productId: 999,
      categoryId: null,
      isActive: true,
      offerType: 'PERCENTAGE_DISCOUNT',
      discountPercentage: 30,
      priority: 100,
    }),
    record({
      id: 14,
      productId: null,
      categoryId: 3,
      isActive: true,
      offerType: 'FLAT_DISCOUNT',
      discountAmount: 5,
      priority: 20,
    }),
  ];
  const { getPromotionForProduct } = loadPromotionEngine({ offers });

  const selected = await getPromotionForProduct({
    product: { id: 12, categoryId: 3 },
    billType: 'B2C',
    paidQuantity: 1,
    now: new Date('2026-01-10T12:00:00.000Z'),
  });

  assert.equal(selected.id, 14);
  assert.equal(selected.offerType, 'FLAT_DISCOUNT');
});

test('discount offer types return capped discount pricing and special price does not stack discounts', () => {
  const { promotionPricing } = loadPromotionEngine();

  assert.deepEqual(
    promotionPricing({
      offerType: 'PERCENTAGE_DISCOUNT',
      discountPercentage: 125,
    }, 100, 2),
    { price: 100, discountPercentage: 100 }
  );
  assert.deepEqual(
    promotionPricing({
      offerType: 'FLAT_DISCOUNT',
      discountAmount: 500,
    }, 100, 2),
    { price: 100, discountAmount: 200 }
  );
  assert.deepEqual(
    promotionPricing({
      offerType: 'SPECIAL_PRICE',
      specialPrice: 75,
      discountPercentage: 20,
      discountAmount: 10,
    }, 100, 2),
    { price: 75, discountPercentage: 0, discountAmount: 0 }
  );
});

test('category campaign products apply to eligible products in the category', async () => {
  const categoryCampaignProduct = record({
    id: 32,
    productId: null,
    categoryId: 3,
    isActive: true,
    offerType: 'PERCENTAGE_DISCOUNT',
    discountPercentage: 15,
    eligibleBillType: 'B2C',
    campaign: {
      id: 9,
      name: 'Category sale',
      isActive: true,
      priority: 20,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-20T00:00:00.000Z',
    },
  });
  const { getPromotionForProduct } = loadPromotionEngine({
    campaigns: [categoryCampaignProduct],
  });

  const selected = await getPromotionForProduct({
    product: { id: 12, categoryId: 3 },
    billType: 'B2C',
    paidQuantity: 1,
    now: new Date('2026-01-10T12:00:00.000Z'),
  });

  assert.equal(selected.source, 'CAMPAIGN');
  assert.equal(selected.id, 32);
  assert.equal(selected.campaignId, 9);
  assert.equal(selected.name, 'Category sale');
});
