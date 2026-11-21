'use strict';

const { Op } = require('sequelize');
const PromotionalOffer = require('../mysql-models/PromotionalOffer');
const PromotionalCampaign = require('../mysql-models/PromotionalCampaign');
const CampaignProduct = require('../mysql-models/CampaignProduct');
const { calculatePromotionalFreeQuantity } = require('./promotionalOffers');

const OFFER_TYPES = new Set([
  'BUY_X_GET_Y_FREE',
  'BUY_X_GET_Y_FREE_FIXED',
  'BUY_N_GET_M_FREE',
  'PERCENTAGE_DISCOUNT',
  'FLAT_DISCOUNT',
  'SPECIAL_PRICE',
  'FREE_GIFT',
]);

const promotionEligibleForBill = (promotion, billType) =>
  !promotion.eligibleBillType ||
  promotion.eligibleBillType === 'BOTH' ||
  String(promotion.eligibleBillType).toUpperCase() === String(billType || 'B2C').toUpperCase();

const orderPromotions = (left, right) =>
  Number(right.priority || 0) - Number(left.priority || 0) ||
  new Date(right.startDate || 0) - new Date(left.startDate || 0) ||
  Number(left.id) - Number(right.id);

const positiveValueOrFallback = (primary, fallback) => {
  const primaryValue = Number(primary);
  return Number.isFinite(primaryValue) && primaryValue > 0
    ? primaryValue
    : Number(fallback || 0);
};

const hasValidPromotionTerms = (promotion, type) => {
  if (type === 'PERCENTAGE_DISCOUNT') {
    return positiveValueOrFallback(
      promotion.discountPercentage,
      promotion.discountValue
    ) > 0;
  }
  if (type === 'FLAT_DISCOUNT') {
    return positiveValueOrFallback(
      promotion.discountAmount,
      promotion.discountValue
    ) > 0;
  }
  if (type === 'SPECIAL_PRICE') {
    return promotion.specialPrice !== null &&
      promotion.specialPrice !== undefined &&
      Number.isFinite(Number(promotion.specialPrice)) &&
      Number(promotion.specialPrice) >= 0;
  }
  return true;
};

const getPromotionForProduct = async ({
  product,
  billType,
  paidQuantity,
  companyId,
  transaction,
  now = new Date(),
}) => {
  const startOfCurrentDay = new Date(now);
  startOfCurrentDay.setHours(0, 0, 0, 0);
  const [campaignProducts, offers] = await Promise.all([
    CampaignProduct.findAll({
      where: {
        [Op.or]: [
          { productId: product.id },
          ...(product.categoryId ? [{ categoryId: product.categoryId }] : []),
        ],
        isActive: true,
      },
      include: [{
        model: PromotionalCampaign,
        as: 'campaign',
        where: {
          isActive: true,
          startDate: { [Op.lte]: now },
          endDate: { [Op.gte]: startOfCurrentDay },
          ...(companyId
            ? { [Op.or]: [{ companyId: null }, { companyId }] }
            : { companyId: null }),
        },
      }],
      transaction,
    }),
    PromotionalOffer.findAll({
      where: {
        isActive: true,
        [Op.and]: [
          { [Op.or]: [{ startDate: null }, { startDate: { [Op.lte]: now } }] },
          { [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: startOfCurrentDay } }] },
          { [Op.or]: [{ productId: product.id }, ...(product.categoryId ? [{ categoryId: product.categoryId }] : [])] },
        ],
      },
      transaction,
    }),
  ]);

  const campaigns = campaignProducts
    .filter((entry) =>
      entry.isActive !== false &&
      promotionEligibleForBill(entry, billType) &&
      entry.campaign &&
      entry.campaign.isActive &&
      new Date(entry.campaign.startDate) <= now &&
      new Date(entry.campaign.endDate).setHours(23, 59, 59, 999) >= now
    )
    .map((entry) => ({
      ...entry.toJSON(),
      source: 'CAMPAIGN',
      campaignId: entry.campaign.id,
      campaignName: entry.campaign.name,
      name: entry.campaign.name,
      priority: entry.campaign.priority,
      startDate: entry.campaign.startDate,
    }))
    .sort(orderPromotions);
  const regularOffers = offers
    .filter((offer) =>
      offer.isActive &&
      promotionEligibleForBill(offer, billType) &&
      (!offer.startDate || new Date(offer.startDate) <= now) &&
      (!offer.endDate || new Date(offer.endDate).setHours(23, 59, 59, 999) >= now)
    )
    .map((offer) => ({ ...offer.toJSON(), source: 'REGULAR' }))
    .sort(orderPromotions);

  for (const promotion of [...campaigns, ...regularOffers]) {
    const type = String(promotion.offerType || '').toUpperCase();
    if (!OFFER_TYPES.has(type)) continue;
    const isGiftOffer = type === 'FREE_GIFT';
    const freeQuantity = type.startsWith('BUY_') || isGiftOffer
      ? calculatePromotionalFreeQuantity({
        paidQuantity,
        buyQuantity: promotion.buyQuantity,
        freeQuantity: promotion.freeQuantity,
        giftQuantity: promotion.giftQuantity,
        offerType: type,
      })
      : 0;
    if ((type.startsWith('BUY_') || isGiftOffer) && freeQuantity <= 0) continue;
    if (!hasValidPromotionTerms(promotion, type)) continue;
    return {
      ...promotion,
      offerType: type,
      freeQuantity,
      giftProductId: promotion.giftProductId || null,
      reason: promotion.source === 'CAMPAIGN'
        ? `Selected campaign by priority ${Number(promotion.priority || 0)}`
        : 'No eligible active campaign; selected regular offer',
    };
  }
  return null;
};

const promotionPricing = (promotion, basePrice, paidQuantity) => {
  if (!promotion) return { price: basePrice };

  switch (promotion.offerType) {
    case 'PERCENTAGE_DISCOUNT':
      return {
        price: basePrice,
        discountPercentage: Math.min(
          100,
          Math.max(0, positiveValueOrFallback(
            promotion.discountPercentage,
            promotion.discountValue
          ))
        ),
      };
    case 'FLAT_DISCOUNT':
      return {
        price: basePrice,
        discountAmount: Math.min(
          Math.max(0, positiveValueOrFallback(promotion.discountAmount, promotion.discountValue)),
          Math.max(0, Number(basePrice)) * Math.max(0, Number(paidQuantity))
        ),
      };
    case 'SPECIAL_PRICE':
      return {
        price: Number(promotion.specialPrice),
        discountPercentage: 0,
        discountAmount: 0,
      };
    default:
      return { price: basePrice };
  }
};

module.exports = {
  OFFER_TYPES,
  getPromotionForProduct,
  promotionPricing,
};
