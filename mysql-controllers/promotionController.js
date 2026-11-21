'use strict';

const PromotionalOffer = require('../mysql-models/PromotionalOffer');
const PromotionalCampaign = require('../mysql-models/PromotionalCampaign');
const CampaignProduct = require('../mysql-models/CampaignProduct');
const Product = require('../mysql-models/Product');
const Category = require('../mysql-models/Category');
const SalesItem = require('../mysql-models/Sales-Items');
const ProductBatch = require('../mysql-models/ProductBatch');
const { Op } = require('sequelize');
const { normalizeProductQuantity } = require('../utils/productQuantity');
const {
  calculateInvoiceItem,
  calculateInvoiceTotals,
  calculatePrice,
  resolveSalePricing,
} = require('../utils/productMargin');
const { getPromotionForProduct, promotionPricing } = require('../utils/promotionEngine');
const {
  getUnbatchedStockQuantity,
  getProductAvailableQuantity,
} = require('../utils/inventoryStock');

const OFFER_TYPES = new Set([
  'BUY_X_GET_Y_FREE',
  'BUY_X_GET_Y_FREE_FIXED',
  'BUY_N_GET_M_FREE',
  'PERCENTAGE_DISCOUNT',
  'FLAT_DISCOUNT',
  'SPECIAL_PRICE',
  'FREE_GIFT',
]);

const numberField = (value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return number;
};

const booleanField = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') {
    return true;
  }
  if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') {
    return false;
  }
  throw new Error('isActive must be a boolean');
};

const isValidDate = (value) => value && Number.isFinite(new Date(value).getTime());

const validatePromotion = async (input, { campaignProduct = false, current = {} } = {}) => {
  const data = { ...current, ...input };
  const name = campaignProduct ? current.name : data.name;
  const offerType = String(data.offerType || '').toUpperCase();
  if (!campaignProduct && (!name || !String(name).trim())) {
    throw new Error('name is required');
  }
  if (!OFFER_TYPES.has(offerType)) {
    throw new Error(`offerType must be one of ${[...OFFER_TYPES].join(', ')}`);
  }
  if (campaignProduct && !data.productId) {
    throw new Error('productId is required for a campaign product');
  }
  if (!campaignProduct && !data.productId && !data.categoryId) {
    throw new Error('At least one of productId or categoryId is required');
  }
  if (data.productId && !(await Product.findByPk(data.productId))) {
    throw new Error(`Product not found: ${data.productId}`);
  }
  if (data.categoryId && !(await Category.findByPk(data.categoryId))) {
    throw new Error(`Category not found: ${data.categoryId}`);
  }
  if (data.giftProductId && !(await Product.findByPk(data.giftProductId))) {
    throw new Error(`Gift product not found: ${data.giftProductId}`);
  }
  if (!['BOTH', 'B2B', 'B2C'].includes(String(data.eligibleBillType || 'BOTH').toUpperCase())) {
    throw new Error('eligibleBillType must be BOTH, B2B, or B2C');
  }
  if ((data.startDate && !isValidDate(data.startDate)) ||
      (data.endDate && !isValidDate(data.endDate))) {
    throw new Error('startDate and endDate must be valid dates');
  }
  if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
    throw new Error('startDate must be before or equal to endDate');
  }

  const buyQuantity = numberField(data.buyQuantity ?? 1, 'buyQuantity', { min: 0.001 });
  const freeQuantity = numberField(data.freeQuantity ?? 0, 'freeQuantity');
  const giftQuantity = numberField(
    data.giftQuantity ?? (freeQuantity > 0 ? freeQuantity : 1),
    'giftQuantity',
    { min: 0.001 }
  );
  const discountPercentage = numberField(
    Number(data.discountPercentage) > 0
      ? data.discountPercentage
      : (offerType === 'PERCENTAGE_DISCOUNT' ? data.discountValue : 0),
    'discountPercentage',
    { max: 100 }
  );
  const discountAmount = numberField(
    Number(data.discountAmount) > 0
      ? data.discountAmount
      : (offerType === 'FLAT_DISCOUNT' ? data.discountValue : 0),
    'discountAmount'
  );
  const specialPrice = data.specialPrice === null || data.specialPrice === undefined
    ? null
    : numberField(data.specialPrice, 'specialPrice');

  if (offerType.startsWith('BUY_') && freeQuantity <= 0) {
    throw new Error('freeQuantity must be greater than zero for a buy/get offer');
  }
  if (offerType === 'PERCENTAGE_DISCOUNT' && discountPercentage <= 0) {
    throw new Error('discountPercentage must be greater than zero');
  }
  if (offerType === 'FLAT_DISCOUNT' && discountAmount <= 0) {
    throw new Error('discountAmount must be greater than zero');
  }
  if (offerType === 'SPECIAL_PRICE' && specialPrice === null) {
    throw new Error('specialPrice is required for SPECIAL_PRICE');
  }
  if (offerType === 'FREE_GIFT' && (!data.giftProductId || giftQuantity <= 0)) {
    throw new Error('FREE_GIFT requires giftProductId and a positive giftQuantity');
  }

  return {
    name: campaignProduct ? undefined : String(name).trim(),
    offerType,
    productId: data.productId || null,
    categoryId: campaignProduct ? null : (data.categoryId || null),
    buyQuantity,
    freeQuantity,
    giftQuantity,
    discountValue: offerType === 'PERCENTAGE_DISCOUNT'
      ? discountPercentage
      : offerType === 'FLAT_DISCOUNT'
        ? discountAmount
        : 0,
    discountPercentage,
    discountAmount,
    specialPrice,
    giftProductId: data.giftProductId || null,
    eligibleBillType: String(data.eligibleBillType || 'BOTH').toUpperCase(),
    ...(campaignProduct ? { isActive: booleanField(data.isActive, true) } : {
      priority: numberField(data.priority ?? 0, 'priority'),
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      isActive: booleanField(data.isActive, true),
    }),
  };
};

const sendError = (res, error, status = 400) =>
  res.status(status).json({ success: false, message: error.message });

const listOffers = async (req, res) => {
  try {
    const data = await PromotionalOffer.findAll({
      include: [
        { model: Product, as: 'Product', attributes: ['id', 'name', 'barcode', 'unitType', 'baseUnit'] },
        { model: Category, attributes: ['id', ['category', 'name']] },
        { model: Product, as: 'giftProduct', attributes: ['id', 'name', 'barcode', 'unitType', 'baseUnit'] },
      ],
      order: [['priority', 'DESC'], ['id', 'ASC']],
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, 500);
  }
};

const getOffer = async (req, res) => {
  try {
    const data = await PromotionalOffer.findByPk(req.params.id, {
      include: [
        { model: Product, as: 'Product', attributes: ['id', 'name', 'barcode', 'unitType', 'baseUnit'] },
        { model: Category, attributes: ['id', ['category', 'name']] },
        { model: Product, as: 'giftProduct', attributes: ['id', 'name', 'barcode', 'unitType', 'baseUnit'] },
      ],
    });
    if (!data) return res.status(404).json({ success: false, message: 'Offer not found' });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, 500);
  }
};

const createOffer = async (req, res) => {
  try {
    const data = await validatePromotion(req.body);
    const offer = await PromotionalOffer.create(data);
    return res.status(201).json({ success: true, data: offer });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateOffer = async (req, res) => {
  try {
    const offer = await PromotionalOffer.findByPk(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    const data = await validatePromotion(req.body, { current: offer.toJSON() });
    await offer.update(data);
    return res.status(200).json({ success: true, data: offer });
  } catch (error) {
    return sendError(res, error);
  }
};

const archiveOffer = async (req, res) => {
  try {
    const offer = await PromotionalOffer.findByPk(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    await offer.update({ isActive: false });
    const historicalUseCount = await SalesItem.count({ where: { offerId: offer.id } });
    return res.status(200).json({
      success: true,
      message: 'Offer deactivated; historical sales remain unchanged',
      data: { id: offer.id, isActive: false, historicalUseCount },
    });
  } catch (error) {
    return sendError(res, error, 500);
  }
};

const listCampaigns = async (req, res) => {
  try {
    const data = await PromotionalCampaign.findAll({
      include: [{
        model: CampaignProduct,
        as: 'products',
        include: [
          { model: Product, as: 'product', attributes: ['id', 'name', 'barcode', 'unitType', 'baseUnit'] },
          { model: Category, as: 'category', attributes: ['id', ['category', 'name']] },
          { model: Product, as: 'giftProduct', attributes: ['id', 'name', 'barcode', 'unitType', 'baseUnit'] },
        ],
      }],
      order: [['priority', 'DESC'], ['startDate', 'DESC'], ['id', 'ASC']],
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, 500);
  }
};

const getCampaign = async (req, res) => {
  try {
    const data = await PromotionalCampaign.findByPk(req.params.id, {
      include: [{
        model: CampaignProduct,
        as: 'products',
        include: [
          { model: Product, as: 'product', attributes: ['id', 'name', 'barcode', 'unitType', 'baseUnit'] },
          { model: Category, as: 'category', attributes: ['id', ['category', 'name']] },
          { model: Product, as: 'giftProduct', attributes: ['id', 'name', 'barcode', 'unitType', 'baseUnit'] },
        ],
      }],
    });
    if (!data) return res.status(404).json({ success: false, message: 'Campaign not found' });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, 500);
  }
};

const createCampaign = async (req, res) => {
  try {
    const { name, description, campaignType = 'SEASONAL', startDate, endDate, priority = 0, isActive = false, companyId } = req.body;
    if (!String(name || '').trim() || !isValidDate(startDate) || !isValidDate(endDate) ||
        new Date(startDate) > new Date(endDate)) {
      throw new Error('name, valid startDate, and endDate are required');
    }
    if (!['FESTIVAL', 'SEASONAL', 'SPECIAL'].includes(String(campaignType).toUpperCase())) {
      throw new Error('campaignType must be FESTIVAL, SEASONAL, or SPECIAL');
    }
    const data = await PromotionalCampaign.create({
      name: String(name).trim(),
      description: description || null,
      campaignType: String(campaignType).toUpperCase(),
      startDate,
      endDate,
      priority: numberField(priority, 'priority'),
      isActive: booleanField(isActive, false),
      companyId: companyId || null,
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateCampaign = async (req, res) => {
  try {
    const campaign = await PromotionalCampaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    const values = { ...campaign.toJSON(), ...req.body };
    if (!String(values.name || '').trim() || !isValidDate(values.startDate) || !isValidDate(values.endDate) ||
        new Date(values.startDate) > new Date(values.endDate)) {
      throw new Error('name, valid startDate, and endDate are required');
    }
    if (values.campaignType &&
        !['FESTIVAL', 'SEASONAL', 'SPECIAL'].includes(String(values.campaignType).toUpperCase())) {
      throw new Error('campaignType must be FESTIVAL, SEASONAL, or SPECIAL');
    }
    await campaign.update({
      name: String(values.name).trim(),
      description: values.description || null,
      campaignType: String(values.campaignType || 'SEASONAL').toUpperCase(),
      startDate: values.startDate,
      endDate: values.endDate,
      priority: numberField(values.priority ?? 0, 'priority'),
      isActive: booleanField(values.isActive, false),
      companyId: values.companyId || null,
    });
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    return sendError(res, error);
  }
};

const archiveCampaign = async (req, res) => {
  try {
    const campaign = await PromotionalCampaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    await campaign.update({ isActive: false });
    return res.status(200).json({
      success: true,
      message: 'Campaign deactivated; historical sales remain unchanged',
      data: { id: campaign.id, isActive: false },
    });
  } catch (error) {
    return sendError(res, error, 500);
  }
};

const addCampaignProduct = async (req, res) => {
  try {
    const campaign = await PromotionalCampaign.findByPk(req.params.campaignId);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    const data = await validatePromotion(req.body, { campaignProduct: true });
    const duplicate = data.isActive
      ? await CampaignProduct.findOne({
          where: { campaignId: campaign.id, productId: data.productId, isActive: true },
        })
      : null;
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'This product already has an active promotion in this campaign',
      });
    }
    const row = await CampaignProduct.create({ ...data, campaignId: campaign.id });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateCampaignProduct = async (req, res) => {
  try {
    const row = await CampaignProduct.findOne({
      where: { productId: req.params.productId, campaignId: req.params.campaignId },
    });
    if (!row) return res.status(404).json({ success: false, message: 'Campaign product not found' });
    const data = await validatePromotion(req.body, {
      campaignProduct: true,
      current: row.toJSON(),
    });
    if (data.isActive) {
      const duplicate = await CampaignProduct.findOne({
        where: {
          campaignId: row.campaignId,
          productId: data.productId,
          isActive: true,
          id: { [Op.ne]: row.id },
        },
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: 'This product already has an active promotion in this campaign',
        });
      }
    }
    await row.update(data);
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    return sendError(res, error);
  }
};

const removeCampaignProduct = async (req, res) => {
  try {
    const row = await CampaignProduct.findOne({
      where: { productId: req.params.productId, campaignId: req.params.campaignId },
    });
    if (!row) return res.status(404).json({ success: false, message: 'Campaign product not found' });
    await row.update({ isActive: false });
    return res.status(200).json({
      success: true,
      message: 'Campaign product deactivated',
      data: row,
    });
  } catch (error) {
    return sendError(res, error, 500);
  }
};

const previewPromotion = async (req, res) => {
  try {
    const product = await Product.findByPk(req.query.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    const productSnapshot = typeof product.get === 'function'
      ? product.get({ plain: true })
      : product;
    const paidQuantity = normalizeProductQuantity({
      quantity: req.query.paidQuantity,
      quantityUnit: req.query.quantityUnit,
    }, product).quantity;
    if (paidQuantity <= 0) throw new Error('paidQuantity must be greater than zero');

    const billType = String(req.query.billType || 'B2C').toUpperCase();
    if (!['B2B', 'B2C'].includes(billType)) {
      throw new Error('billType must be B2B or B2C');
    }
    const useProductSalesPrice = billType === 'B2C';
    const companyId = useProductSalesPrice
      ? Number(req.loyaltyUser?.companyId)
      : req.query.companyId;
    if (
      useProductSalesPrice &&
      (!Number.isInteger(companyId) ||
        companyId <= 0 ||
        (req.query.companyId !== undefined &&
          Number(req.query.companyId) !== companyId))
    ) {
      return res.status(403).json({
        success: false,
        message: 'Promotion previews are limited to the authenticated company',
      });
    }

    const promotion = await getPromotionForProduct({
      product,
      billType,
      paidQuantity,
      companyId,
    });
    const sameProductGift = promotion &&
      (!promotion.giftProductId || Number(promotion.giftProductId) === Number(product.id));
    const totalStockQuantity = paidQuantity + (sameProductGift ? Number(promotion.freeQuantity || 0) : 0);
    const allBatches = await ProductBatch.findAll({
      where: {
        productId: product.id,
        availableQuantity: { [Op.gt]: 0 },
        ...(useProductSalesPrice ? { companyId } : {}),
      },
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      attributes: [
        'id',
        'batchNumber',
        'availableQuantity',
        'mrp',
        'salePrice',
        'purchasePrice',
        'discount',
        'gstPercentage',
        'expiryDate',
      ],
    });
    const today = new Date().toISOString().slice(0, 10);
    const batches = allBatches.filter((batch) => {
      const expiryDate = batch.expiryDate instanceof Date
        ? batch.expiryDate.toISOString().slice(0, 10)
        : String(batch.expiryDate || '').slice(0, 10);
      return !expiryDate || expiryDate >= today;
    });
    const centsMatch = (left, right) =>
      Math.round((Number(left) + Number.EPSILON) * 100) ===
      Math.round((Number(right) + Number.EPSILON) * 100);
    let selectedPriceGroup = null;
    if (req.query.priceGroup !== undefined) {
      try {
        selectedPriceGroup = JSON.parse(req.query.priceGroup);
      } catch {
        throw new Error('priceGroup must be valid JSON');
      }
      const cents = (value) => Math.round((Number(value) + Number.EPSILON) * 100);
      const expectedKey = [
        cents(selectedPriceGroup?.mrp),
        cents(selectedPriceGroup?.salePrice),
        cents(selectedPriceGroup?.taxRate),
        selectedPriceGroup?.priceType,
      ].join(':');
      if (
        !selectedPriceGroup ||
        !['WITH_GST', 'WITHOUT_GST'].includes(selectedPriceGroup.priceType) ||
        selectedPriceGroup.priceType !== product.sellingPriceType ||
        req.query.priceGroupKey !== expectedKey
      ) {
        throw new Error('Selected MRP price group is invalid');
      }
    }
    if (useProductSalesPrice && !selectedPriceGroup) {
      throw new Error('Select an available batch price group before previewing this POS sale');
    }
    const priceGroupBatches = selectedPriceGroup
      ? batches.filter((batch) =>
          centsMatch(batch.mrp, selectedPriceGroup.mrp) &&
          centsMatch(batch.salePrice, selectedPriceGroup.salePrice) &&
          centsMatch(batch.gstPercentage, selectedPriceGroup.taxRate)
        )
      : batches;
    if (selectedPriceGroup && priceGroupBatches.length === 0) {
      throw new Error('Selected MRP price group is no longer available');
    }
    const availableQuantity = priceGroupBatches.reduce(
      (total, batch) => total + Number(batch.availableQuantity || 0),
      0
    );
    const productStock = Number(product.stockQuantity || 0);
    let unbatchedRemaining = useProductSalesPrice || selectedPriceGroup
      ? 0
      : getUnbatchedStockQuantity(
          productStock,
          allBatches.reduce(
            (total, batch) => total + Number(batch.availableQuantity || 0),
            0
          )
        );
    let manualPaidByBatch = null;
    if (req.query.batchId !== undefined && req.query.batchAllocations !== undefined) {
      throw new Error('Provide either batchId or batchAllocations, not both');
    }
    if (req.query.batchId !== undefined || req.query.batchAllocations !== undefined) {
      let requestedAllocations;
      if (req.query.batchId !== undefined) {
        requestedAllocations = [{
          batchId: req.query.batchId,
          quantity: paidQuantity,
        }];
      } else {
        try {
          requestedAllocations = JSON.parse(req.query.batchAllocations);
        } catch {
          throw new Error('batchAllocations must be valid JSON');
        }
      }
      if (!Array.isArray(requestedAllocations) || requestedAllocations.length === 0) {
        throw new Error('batchAllocations must be a non-empty array');
      }

      const availableById = new Map(
        priceGroupBatches.map((batch) => [Number(batch.id), batch]),
      );
      manualPaidByBatch = new Map();
      let allocatedPaidQuantity = 0;
      for (const allocation of requestedAllocations) {
        const batchId = Number(allocation.batchId);
        const quantity = Number(allocation.quantity);
        const batch = availableById.get(batchId);
        if (!Number.isInteger(batchId) || !batch ||
            !Number.isFinite(quantity) || quantity <= 0) {
          throw new Error('A selected batch is invalid or has no available stock');
        }
        const nextQuantity = Number(manualPaidByBatch.get(batchId) || 0) + quantity;
        if (nextQuantity > Number(batch.availableQuantity || 0)) {
          throw new Error(`Insufficient stock in batch ${batch.batchNumber}`);
        }
        manualPaidByBatch.set(batchId, nextQuantity);
        allocatedPaidQuantity += quantity;
      }
      if (Math.abs(allocatedPaidQuantity - paidQuantity) > 0.001) {
        throw new Error('Batch allocations must equal the paid quantity');
      }
    }
    if (useProductSalesPrice && !manualPaidByBatch) {
      throw new Error('POS promotion previews require explicit batch allocations');
    }
    const stockAvailable = useProductSalesPrice
      ? availableQuantity
      : getProductAvailableQuantity(productStock, availableQuantity);
    if (stockAvailable < totalStockQuantity) {
      throw new Error('Insufficient available batch stock for this product and promotion');
    }

    let remainingFree = Number(sameProductGift ? promotion?.freeQuantity || 0 : 0);
    const fifoAllocations = [];
    const paidByBatch = manualPaidByBatch || new Map();
    if (!manualPaidByBatch) {
      let paidRemaining = paidQuantity;
      for (const batch of priceGroupBatches) {
        const quantity = Math.min(
          Number(batch.availableQuantity || 0),
          paidRemaining
        );
        if (quantity > 0) {
          paidByBatch.set(Number(batch.id), quantity);
          paidRemaining -= quantity;
        }
      }
    }
    let unbatchedPaid = paidQuantity - [...paidByBatch.values()]
      .reduce((total, quantity) => total + quantity, 0);
    if (unbatchedPaid > unbatchedRemaining + 0.001) {
      throw new Error('Insufficient available batch stock for this product and promotion');
    }
    unbatchedPaid = Math.max(0, unbatchedPaid);
    unbatchedRemaining -= unbatchedPaid;

    let unbatchedFree = 0;
    for (const batch of priceGroupBatches) {
      const batchId = Number(batch.id);
      const paid = Number(paidByBatch.get(batchId) || 0);
      const free = Math.min(
        Math.max(0, Number(batch.availableQuantity || 0) - paid),
        remainingFree
      );
      if (paid > 0 || free > 0) {
        fifoAllocations.push({ batch, quantity: paid + free, paid, free });
        remainingFree -= free;
      }
    }
    if (remainingFree > unbatchedRemaining + 0.001) {
      throw new Error('Insufficient available batch stock for this product and promotion');
    }
    unbatchedFree = remainingFree;
    if (unbatchedPaid + unbatchedFree > 0) {
      fifoAllocations.push({
        batch: null,
        quantity: unbatchedPaid + unbatchedFree,
        paid: unbatchedPaid,
        free: unbatchedFree,
      });
    }

    const allocationBaseTotal = fifoAllocations.reduce((total, allocation) => {
      const salePricing = resolveSalePricing(product, allocation.batch, {
        useProductSalesPrice,
        preferBatch: Boolean(manualPaidByBatch),
        requireBatch: useProductSalesPrice,
      });
      const allocationProduct = allocation.batch
        ? {
            ...productSnapshot,
            taxRate: Number(allocation.batch.gstPercentage),
            sellingPriceType: selectedPriceGroup?.priceType || product.sellingPriceType,
          }
        : product;
      const base = calculatePrice(
        salePricing.price,
        allocationProduct.sellingPriceType,
        allocationProduct.taxRate
      ).basePrice;
      return total + base * allocation.paid;
    }, 0);
    const storedFlatDiscount = Number(promotion?.discountAmount || 0);
    const configuredFlatDiscount = storedFlatDiscount > 0
      ? storedFlatDiscount
      : Number(promotion?.discountValue || 0);
    const flatDiscount = Math.min(configuredFlatDiscount, allocationBaseTotal);
    let allocatedFlatDiscount = 0;
    const linePricing = fifoAllocations.map((allocation, index) => {
      const salePricing = resolveSalePricing(product, allocation.batch, {
        useProductSalesPrice,
        preferBatch: Boolean(manualPaidByBatch),
        requireBatch: useProductSalesPrice,
      });
      const unitPrice = salePricing.price;
      const promotionPrice = promotionPricing(promotion, unitPrice, allocation.paid);
      if (salePricing.mrp > 0 && Number(promotionPrice.price) > salePricing.mrp) {
        throw new Error('Selling price cannot exceed MRP');
      }
      if (promotion?.offerType === 'FLAT_DISCOUNT') {
        const allocationProduct = allocation.batch
          ? {
              ...productSnapshot,
              taxRate: Number(allocation.batch.gstPercentage),
              sellingPriceType: selectedPriceGroup?.priceType || product.sellingPriceType,
            }
          : product;
        const batchBase = calculatePrice(
          unitPrice,
          allocationProduct.sellingPriceType,
          allocationProduct.taxRate
        ).basePrice * allocation.paid;
        const amount = index === fifoAllocations.length - 1
          ? flatDiscount - allocatedFlatDiscount
          : allocationBaseTotal === 0 ? 0 : flatDiscount * batchBase / allocationBaseTotal;
        promotionPrice.discountAmount = amount;
        allocatedFlatDiscount += amount;
      }
      const allocationProduct = allocation.batch
        ? {
            ...productSnapshot,
            taxRate: Number(allocation.batch.gstPercentage),
            sellingPriceType: selectedPriceGroup?.priceType || product.sellingPriceType,
          }
        : product;
      return calculateInvoiceItem({
        quantity: allocation.quantity,
        paidQuantity: allocation.paid,
        freeQuantity: allocation.free,
        totalQuantity: allocation.quantity,
        price: promotionPrice.price,
        discountPercentage: promotion
          ? promotionPrice.discountPercentage || 0
          : Number(req.query.discountPercentage) > 0
            ? Number(req.query.discountPercentage)
            : salePricing.discountPercentage,
        discountAmount: promotionPrice.discountAmount || 0,
      }, allocationProduct, 'sale');
    });
    const pricing = calculateInvoiceTotals(linePricing, 0, 0, {
      roundToWholeRupee: false,
    });
    const unitPrice = resolveSalePricing(product, fifoAllocations[0]?.batch, {
      useProductSalesPrice,
      preferBatch: Boolean(manualPaidByBatch),
      requireBatch: useProductSalesPrice,
    }).price;
    const promotionPrice = promotionPricing(promotion, unitPrice, paidQuantity);

    let giftProduct = null;
    let giftAvailableQuantity = null;
    if (promotion?.giftProductId && !sameProductGift) {
      giftProduct = await Product.findByPk(promotion.giftProductId, {
        attributes: ['id', 'name', 'barcode', 'unitType', 'baseUnit', 'stockQuantity'],
      });
      if (!giftProduct) throw new Error('Configured gift product no longer exists');
      if (useProductSalesPrice) {
        const giftBatches = await ProductBatch.findAll({
          where: {
            productId: giftProduct.id,
            companyId,
            availableQuantity: { [Op.gt]: 0 },
          },
          attributes: ['availableQuantity', 'expiryDate'],
        });
        giftAvailableQuantity = giftBatches.reduce((total, batch) => {
          const expiryDate = batch.expiryDate instanceof Date
            ? batch.expiryDate.toISOString().slice(0, 10)
            : String(batch.expiryDate || '').slice(0, 10);
          return !expiryDate || expiryDate >= today
            ? total + Number(batch.availableQuantity || 0)
            : total;
        }, 0);
      } else {
        const giftBatchQuantity = Number(await ProductBatch.sum('availableQuantity', {
          where: { productId: giftProduct.id },
        }) || 0);
        giftAvailableQuantity = getProductAvailableQuantity(
          giftProduct.stockQuantity,
          giftBatchQuantity
        );
      }
      if (giftAvailableQuantity < Number(promotion.freeQuantity || 0)) {
        throw new Error('Insufficient stock for the configured gift product');
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        product: {
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          paidQuantity,
          freeQuantity: sameProductGift
            ? Number(promotion?.freeQuantity || 0)
            : 0,
          totalStockQuantity,
        },
        availableBatches: batches,
        promotion: promotion ? {
          id: promotion.id,
          source: promotion.source,
          name: promotion.name || promotion.campaignName,
          type: promotion.offerType,
          campaignId: promotion.campaignId || null,
          campaignName: promotion.campaignName || null,
          priority: Number(promotion.priority || 0),
          reason: promotion.reason,
          giftProductId: promotion.giftProductId || (promotion.freeQuantity > 0 ? product.id : null),
          giftProduct,
          giftAvailableQuantity,
          freeQuantity: Number(promotion.freeQuantity || 0),
          discountPercentage: promotionPrice.discountPercentage || 0,
          discountAmount: promotionPrice.discountAmount || 0,
          specialPrice: promotion?.offerType === 'SPECIAL_PRICE' ? promotionPrice.price : null,
        } : null,
        pricing: {
          unitPrice: promotionPrice.price,
          paidQuantity,
          freeQuantity: Number(promotion?.freeQuantity || 0),
          totalStockQuantity,
          baseRate: pricing.baseRate,
          taxAmount: pricing.tax,
          discountAmount: pricing.items.reduce(
            (total, item) => total + Number(item.discountAmount || 0),
            0
          ),
          payableAmount: pricing.totalAmount,
        },
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  listOffers,
  getOffer,
  createOffer,
  updateOffer,
  archiveOffer,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  archiveCampaign,
  addCampaignProduct,
  updateCampaignProduct,
  removeCampaignProduct,
  previewPromotion,
};
