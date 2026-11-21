const sequelize = require('../config/sqldb');
const SalesItem = require('../mysql-models/Sales-Items');
const QuickSaleAlias = require('../mysql-models/QuickSaleAlias');
const QuickSaleSaleItem = require('../mysql-models/QuickSaleSaleItem');
const QuickSaleReturn = require('../mysql-models/QuickSaleReturn');
const Sale = require('../mysql-models/SalesBill');
const Product = require('../mysql-models/Product');
const Party = require('../mysql-models/Party');
const Company = require('../mysql-models/Company');
const CompanyFinancials = require('../mysql-models/Company_Financials');
const { Op, Sequelize } = require('sequelize');
const { randomUUID, createHash } = require('crypto');
const Customer = require('../mysql-models/Customer');
const User = require('../mysql-models/Users');
const POSShift = require('../mysql-models/POSShift');
const StockMovement = require('../mysql-models/StockMovement');
const ProductBatch = require('../mysql-models/ProductBatch');
const ProductVariant = require('../mysql-models/ProductVariant');
const { recordAutomatedJournalEntry } = require('./accountingController');
const InvoiceSettings = require('../mysql-models/Invoice_Settings');
const AppSettings = require('../mysql-models/AppSettings');
const { dateOnlyRange, indiaMonthRange } = require('../utils/inclusiveDateRange');
const LoyaltyTransaction = require('../mysql-models/LoyaltyTransaction');
const LoyaltyRedemption = require('../mysql-models/LoyaltyRedemption');
const PosSaleIdempotency = require('../mysql-models/PosSaleIdempotency');
const SalesReturn = require('../mysql-models/SalesReturn');
const SalesReturnCredit = require('../mysql-models/SalesReturnCredit');
const SalesReturnCreditRedemption = require('../mysql-models/SalesReturnCreditRedemption');
const PromotionApplication = require('../mysql-models/PromotionApplication');
const {
  normalizeProductQuantity,
  getRemainingReturnableQuantity,
  validateReturnQuantity,
} = require('../utils/productQuantity');
const {
  calculateInvoiceItem,
  calculateInvoiceTotals,
  calculatePrice,
  resolveSalePricing,
} = require('../utils/productMargin');
const {
  calculateQuickSalePricing,
  normalizeQuickSaleName,
  validateQuickSaleInput,
} = require('../utils/quickSale');
const { calculateLoyaltyPoints } = require('../utils/loyaltyEarning');
const {
  calculateLoyaltyRedemption,
  prorateLoyaltyPoints,
} = require('../utils/loyaltyRedemption');
const { allocateBatchStock, restoreBatchStock } = require('../utils/inventoryBatches');
const { adjustedUnbatchedAverageCost } = require('../utils/inventoryValuation');
const { getPromotionForProduct, promotionPricing } = require('../utils/promotionEngine');
const { hasRecordedPayment } = require('../utils/saleCancellation');
const { groupNormalizedSaleItems } = require('../utils/saleLineGroups');
const {
  calculateAppliedReturnCredit,
  calculateReturnCreditAmount,
} = require('../utils/salesReturnCredits');
const {
  captureGstPartySnapshot,
  splitStoredTax,
} = require('../utils/gstReportSnapshots');
const {
  buildStoredPaymentDetails,
  recalculatePosShiftTotals,
} = require('../utils/posShiftAggregation');
const {
  normalizeSalesReturnCondition,
  normalizeReturnCreditItems,
} = require('../utils/salesReturnCondition');

const restoreUnbatchedProductStock = async ({
  product,
  quantity,
  unitCost,
  transaction,
}) => {
  const currentStock = Number(product.stockQuantity || 0);
  const nextStock = currentStock + Number(quantity);
  const batchQuantity = Number(await ProductBatch.sum('availableQuantity', {
    where: { productId: product.id },
    transaction,
  })) || 0;
  const unbatchedAverageCost = adjustedUnbatchedAverageCost({
    currentStock,
    nextStock,
    batchQuantity,
    averageCost: product.unbatchedAverageCost,
    incomingQuantity: quantity,
    incomingUnitCost: unitCost,
  });
  await product.update({
    stockQuantity: nextStock,
    unbatchedAverageCost,
  }, { transaction });
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Public
const getInvoices = async (req, res) => {
  try {
    const invoices = await Sale.findAll({
      where: { companyId: req.user.companyId },
      attributes: [
        'saleDate',
        'id',
        'partyId',
        'invoiceNumber',
        'totalAmount',
        'roundOff',
        'amountPaid',
        'paymentStatus',
        'bill_type',
        'taxDocumentType',
        'po_number',
        'eway_bill',
        'global_discount_percentage',
        'global_discount_amount',
        [sequelize.literal(`'Sale'`), 'type'],
      ],
      include: [
        {
          model: Party,
          where: { companyId: req.user.companyId },
          required: false,
          // attributes: ['name'],
        },
        {
          model: Customer,
          where: { companyId: req.user.companyId },
          required: false,
          // attributes: ['name'],
        },
        {
          model: User,
          attributes: ['id', 'name'],
        },
        {
          model: SalesItem,
          include: [
            {
              model: ProductBatch,
              attributes: [
                'id',
                'batchNumber',
                'availableQuantity',
                'mrp',
                'salePrice',
                'gstPercentage',
                'expiryDate',
              ],
            },
            {
              model: Product,
              attributes: [
                'name',
                'HSNCode',
                'unitType',
                'baseUnit',
                'sellingPriceType',
              ],
            },
          ],
        },
        { model: QuickSaleSaleItem, as: 'QuickSaleItems' },
      ],
      order: [["saleDate", "DESC"], ["id", "DESC"]],
    });

    return res.status(200).json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Public
const getInvoicesByDate = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;

    const whereClause = { companyId: req.user.companyId };
    const now = new Date();

    if (startDate || endDate) {
      const range = dateOnlyRange(startDate, endDate);
      whereClause.saleDate = {};
      if (range.start) whereClause.saleDate[Op.gte] = range.start;
      if (range.endExclusive) whereClause.saleDate[Op.lt] = range.endExclusive;
      if (range.endInclusive) whereClause.saleDate[Op.lte] = range.endInclusive;
    } else if (filter === 'thisMonth') {
      const { start, endExclusive } = indiaMonthRange(now);

      whereClause.saleDate = {
        [Op.gte]: start,
        [Op.lt]: endExclusive,
      };
    } else if (filter === 'thisYear') {
      whereClause.saleDate = {
        [Op.gte]: `${now.getFullYear()}-01-01 00:00:00`,
      };
    } else if (filter === 'lastYear') {
      whereClause.saleDate = {
        [Op.gte]: `${now.getFullYear() - 1}-01-01 00:00:00`,
        [Op.lt]: `${now.getFullYear()}-01-01 00:00:00`,
      };
    } else {
      const { start, endExclusive } = indiaMonthRange(now);

      whereClause.saleDate = {
        [Op.gte]: start,
        [Op.lt]: endExclusive,
      };
    }

    const invoices = await Sale.findAll({
      where: whereClause, // ✅ ADD THIS
      attributes: [
        'saleDate',
        'id',
        'partyId',
        'tax',
        'baseRate',
        'invoiceNumber',
        'totalAmount',
        'roundOff',
        'amountPaid',
        'paymentStatus',
        'bill_type',
        'taxDocumentType',
        'po_number',
        'eway_bill',
        'global_discount_percentage',
        'global_discount_amount',
        [sequelize.literal(`'Sale'`), 'type'],
      ],
      include: [
        {
          model: Party,
          where: { companyId: req.user.companyId },
          required: false,
          // attributes: ['name'],
        },
        {
          model: Customer,
          where: { companyId: req.user.companyId },
          required: false,
          // attributes: ['name'],
        },
        {
          model: User,
          attributes: ['id', 'name'],
        },
        {
          model: SalesItem,
          include: [
            {
              model: ProductBatch,
              attributes: [
                'id',
                'batchNumber',
                'availableQuantity',
                'mrp',
                'salePrice',
                'gstPercentage',
                'expiryDate',
              ],
            },
            {
              model: Product,
              attributes: [
                'name',
                'HSNCode',
                'unitType',
                'baseUnit',
                'sellingPriceType',
              ],
            },
          ],
        },
        { model: QuickSaleSaleItem, as: 'QuickSaleItems' },
      ],
      order: [["saleDate", "DESC"], ["id", "DESC"]],
    });

    return res.status(200).json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get single invoice
// @route   GET /api/sales/:id
// @access  Public
const getInvoiceById = async (req, res) => {
  try {
    const where = {
      id: req.params.id,
      companyId: req.user.companyId,
    };
    if (req.authRole?.systemKey === 'STAFF') {
      where.userId = req.user.id;
      where.bill_type = 'B2C';
    }
    const invoice = await Sale.findOne({
      where,
      include: [
        { model: Party,
          where: { companyId: req.user.companyId },
          required: false,
          //  attributes: ['name', 'email', 'phone', 'address', 'gstin'] 
          },
        {
          model: Customer,
          where: { companyId: req.user.companyId },
          required: false,
          // attributes: ['name', 'phone', 'email']
        },
        { model: User, attributes: ['id', 'name'] },
        {
          model: SalesItem,
          include: [
            {
              model: Product,
              attributes: [
                'name',
                'HSNCode',
                'unit',
                'MRP',
                'unitType',
                'baseUnit',
                'sellingPriceType',
              ],
            },
            {
              model: ProductBatch,
              attributes: [
                'id',
                'batchNumber',
                'availableQuantity',
                'mrp',
                'salePrice',
                'gstPercentage',
                'expiryDate',
              ],
            },
          ],
        },
        { model: QuickSaleSaleItem, as: 'QuickSaleItems' },
        { model: PromotionApplication, as: 'promotionApplications' },
      ],
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    return res.status(200).json(invoice);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Create new Customer and loyalty points
const handleB2CCustomer = async ({
  phone,
  name,
  companyId,
  totalAmount,
  saleId,
  performedBy,
  loyaltySettings,
  redeemLoyaltyPoints = false,
  loyaltyPointsToRedeem = 0,
  returnCreditAmount = 0,
  transaction,
}) => {
  if (!phone) {
    if (Number(loyaltyPointsToRedeem) > 0 || redeemLoyaltyPoints) {
      throw Object.assign(new Error('A customer is required to redeem loyalty points'), {
        status: 400,
      });
    }
    return null;
  }

  if (typeof redeemLoyaltyPoints !== 'boolean') {
    throw Object.assign(new Error('redeemLoyaltyPoints must be a boolean'), {
      status: 400,
    });
  }
  const requestedPoints = Number(loyaltyPointsToRedeem);
  if (!redeemLoyaltyPoints && requestedPoints !== 0) {
    throw Object.assign(new Error('Loyalty redemption requires explicit cashier opt-in'), {
      status: 400,
    });
  }
  if (!redeemLoyaltyPoints && loyaltyPointsToRedeem == null) {
    throw Object.assign(new Error('Loyalty points to redeem are invalid'), {
      status: 400,
    });
  }

  const customer = await Customer.findOne({
    where: {
      phone,
      companyId,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!customer && requestedPoints > 0) {
    throw Object.assign(new Error('Customer does not have a loyalty balance to redeem'), {
      status: 409,
    });
  }

  const currentBalance = Number(customer?.loyalty_points || 0);
  const redemption = calculateLoyaltyRedemption({
    requestedPoints: redeemLoyaltyPoints ? loyaltyPointsToRedeem : 0,
    balance: currentBalance,
    totalAmount,
    returnCreditAmount,
    settings: loyaltySettings,
  });
  const eligibleAmount = Math.max(0, Number(totalAmount) - redemption.amount);
  const loyaltyPoints = calculateLoyaltyPoints(eligibleAmount, loyaltySettings);
  if (!Number.isSafeInteger(loyaltyPoints) || loyaltyPoints < 0 || loyaltyPoints > 2147483647) {
    throw new Error('Calculated loyalty points exceed the supported balance range');
  }
  const balanceAfterRedemption = currentBalance - redemption.pointsRedeemed;
  const updatedBalance = balanceAfterRedemption + loyaltyPoints;
  if (updatedBalance > 2147483647) {
    throw new Error('Calculated loyalty points exceed the supported balance range');
  }

  let savedCustomer = customer;
  if (!savedCustomer) {
    savedCustomer = await Customer.create(
      {
        companyId,
        name: name || 'Walk-in Customer',
        phone,
        loyalty_points: updatedBalance,
      },
      { transaction }
    );
  } else {
    await savedCustomer.update({ loyalty_points: updatedBalance }, { transaction });
  }

  if (redemption.pointsRedeemed > 0) {
    const redemptionRow = await LoyaltyRedemption.create({
      customerId: savedCustomer.id,
      saleId,
      pointsRedeemed: redemption.pointsRedeemed,
      pointsReversed: 0,
      redemptionMethod: 'MANUAL',
      rewardType: 'CASH_DISCOUNT',
      rewardDescription: `POS sale ${saleId}`,
      rewardValue: redemption.amount,
      performedBy,
      idempotencyKey: `pos-sale-${saleId}`,
    }, { transaction });
    await LoyaltyTransaction.create({
      customerId: savedCustomer.id,
      transactionType: 'REDEEM',
      pointsDelta: -redemption.pointsRedeemed,
      previousBalance: currentBalance,
      balanceAfter: balanceAfterRedemption,
      monetaryValue: redemption.amount,
      description: `Points redeemed on POS sale ${saleId}`,
      rewardType: 'CASH_DISCOUNT',
      redemptionId: redemptionRow.id,
      saleId,
      performedBy,
      idempotencyKey: `pos-redemption-${saleId}`,
    }, { transaction });
  }
  if (loyaltyPoints > 0) {
    await LoyaltyTransaction.create(
      {
        customerId: savedCustomer.id,
        transactionType: 'EARN',
        pointsDelta: loyaltyPoints,
        previousBalance: balanceAfterRedemption,
        balanceAfter: updatedBalance,
        monetaryValue: eligibleAmount,
        description: `Points earned from sale ${saleId}`,
        saleId,
        performedBy,
      },
      { transaction }
    );
  }

  return {
    ...savedCustomer.toJSON(),
    loyalty_points: updatedBalance,
    loyaltyPointsEarned: loyaltyPoints,
    loyaltyPointsRedeemed: redemption.pointsRedeemed,
    loyaltyRedemptionAmount: redemption.amount,
  };
};

const reverseLoyaltyForSaleReturn = async ({
  sale,
  returnRecord,
  transaction,
  performedBy,
}) => {
  if (!sale.customerId) return;
  const customer = await Customer.findOne({
    where: { id: sale.customerId, companyId: sale.companyId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const returnRows = await SalesReturn.findAll({
    where: { saleId: sale.id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const quickSaleReturnRows = await QuickSaleReturn.findAll({
    where: { saleId: sale.id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const redemptions = await LoyaltyRedemption.findAll({
    where: { saleId: sale.id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const earnedRows = await LoyaltyTransaction.findAll({
    where: { saleId: sale.id, transactionType: 'EARN' },
    transaction,
  });
  const reversalRows = await LoyaltyTransaction.findAll({
    where: {
      saleId: sale.id,
      transactionType: 'REVERSAL',
      redemptionId: null,
    },
    transaction,
  });
  const saleItems = await SalesItem.findAll({
    where: { saleId: sale.id },
    attributes: ['netRate'],
    transaction,
  });
  const quickSaleItems = await QuickSaleSaleItem.findAll({
    where: { saleId: sale.id },
    attributes: ['netAmount'],
    transaction,
  });
  if (!customer) throw new Error(`Customer not found: ${sale.customerId}`);

  const saleReturnBasis = saleItems.reduce(
    (total, item) => total + Math.max(0, Number(item.netRate || 0)),
    quickSaleItems.reduce(
      (total, item) => total + Math.max(0, Number(item.netAmount || 0)),
      0,
    )
  );
  const returnedAmount = returnRows.reduce(
    (total, row) => total + Number(row.returnedAmount || 0),
    quickSaleReturnRows.reduce(
      (total, row) => total + Number(row.returnedAmount || 0),
      0,
    ),
  );
  const pointsEarned = earnedRows.reduce(
    (total, row) => total + Math.max(0, Number(row.pointsDelta || 0)),
    0
  );
  const earnedValue = earnedRows.reduce(
    (total, row) => total + Math.max(0, Number(row.monetaryValue || 0)),
    0
  );
  const pointsEarnedAlreadyReversed = reversalRows.reduce(
    (total, row) => total + Math.max(0, -Number(row.pointsDelta || 0)),
    0
  );
  const earnedValueAlreadyReversed = reversalRows.reduce(
    (total, row) => total + Math.max(0, Number(row.monetaryValue || 0)),
    0
  );
  const targetEarnedReversal = prorateLoyaltyPoints(
    pointsEarned,
    returnedAmount,
    saleReturnBasis
  );
  const earnedPointsToReverse = Math.max(
    0,
    targetEarnedReversal - pointsEarnedAlreadyReversed
  );
  let balanceAfter = Number(customer.loyalty_points || 0);
  if (balanceAfter < earnedPointsToReverse) {
    throw Object.assign(
      new Error('Sale-earned loyalty points have already been spent; adjust the customer balance before returning this sale'),
      { status: 409 }
    );
  }
  const targetEarnedValueReversal = saleReturnBasis > 0
    ? Math.min(earnedValue, (earnedValue * Math.min(returnedAmount, saleReturnBasis)) / saleReturnBasis)
    : 0;
  const earnedValueToReverse = Math.max(
    0,
    Number((targetEarnedValueReversal - earnedValueAlreadyReversed).toFixed(2))
  );
  balanceAfter -= earnedPointsToReverse;
  if (earnedPointsToReverse > 0) {
    await LoyaltyTransaction.create({
      customerId: customer.id,
      transactionType: 'REVERSAL',
      pointsDelta: -earnedPointsToReverse,
      previousBalance: balanceAfter + earnedPointsToReverse,
      balanceAfter,
      monetaryValue: earnedValueToReverse,
      description: `Loyalty points reversed for returned sale ${sale.invoiceNumber}`,
      saleId: sale.id,
      performedBy: performedBy || null,
      idempotencyKey: `return-sale-${returnRecord.id}-earned`,
    }, { transaction });
  }

  for (const redemption of redemptions) {
    const targetReversal = prorateLoyaltyPoints(
      redemption.pointsRedeemed,
      returnedAmount,
      saleReturnBasis
    );
    const pointsToRestore = Math.max(
      0,
      targetReversal - Number(redemption.pointsReversed || 0)
    );
    if (pointsToRestore <= 0) continue;
    balanceAfter += pointsToRestore;
    const pointsReversed =
      Number(redemption.pointsReversed || 0) + pointsToRestore;
    await redemption.update({
      pointsReversed,
      status:
        pointsReversed >= Number(redemption.pointsRedeemed)
          ? 'REVERSED'
          : 'COMPLETED',
    }, { transaction });
    await LoyaltyTransaction.create({
      customerId: customer.id,
      transactionType: 'REVERSAL',
      pointsDelta: pointsToRestore,
      previousBalance: balanceAfter - pointsToRestore,
      balanceAfter,
      monetaryValue: Number((
        Number(redemption.rewardValue || 0) *
        pointsToRestore /
        Number(redemption.pointsRedeemed)
      ).toFixed(2)),
      description: `Loyalty points restored for returned sale ${sale.invoiceNumber}`,
      redemptionId: redemption.id,
      saleId: sale.id,
      performedBy: performedBy || null,
      idempotencyKey: `return-sale-${returnRecord.id}-redemption-${redemption.id}`,
    }, { transaction });
  }
  await customer.update({ loyalty_points: balanceAfter }, { transaction });
};

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public

// @desc    Format the financial year string based on app_settings.invoiceYearFormat
//          Supports patterns like 'YYYY-YYYY', 'YYYY-YY', 'YY-YY', 'YYYY'
const formatFinancialYear = (format, startYear, endYear) => {
  const pattern = format || 'YY-YY';

  let tokenIndex = 0;

  return pattern.replace(/Y+/g, (match) => {
    const year = tokenIndex === 0 ? startYear : endYear;
    tokenIndex += 1;

    // 4+ Y's -> full year (2026), otherwise -> last 2 digits (26)
    return match.length >= 4 ? String(year) : String(year).slice(-2);
  });
};

// @desc    Peek at what the next invoice number would look like — read only,
//          never touches next_sequence_no. Used by the Settings "Live Preview".
// @route   GET /api/invoices/preview-next-number?companyId=1
const previewNextInvoiceNumber = async (req, res) => {
  try {
    const companyId = Number(req.user.companyId);
    if (
      !Number.isInteger(companyId) ||
      companyId <= 0 ||
      (req.query.companyId != null && Number(req.query.companyId) !== companyId)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Cannot preview invoice numbers for another company',
      });
    }

    const appSettings = await AppSettings.findOne({ where: { companyId } });
    const invoiceSettings = await InvoiceSettings.findOne({ where: { companyId } });

    const sequenceNumber = Number(
      invoiceSettings?.next_sequence_no ?? appSettings?.invoiceStartingNumber ?? 1
    );

    const prefix =
      appSettings?.invoicePrefix || invoiceSettings?.invoice_prefix || 'INV';

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const financialYear =
      currentMonth >= 4
        ? formatFinancialYear(appSettings?.invoiceYearFormat, currentYear, currentYear + 1)
        : formatFinancialYear(appSettings?.invoiceYearFormat, currentYear - 1, currentYear);

    const nextInvoiceNumber = `${prefix}/${financialYear}/${String(sequenceNumber).padStart(4, '0')}`;

    return res.status(200).json({ success: true, data: { nextInvoiceNumber, sequenceNumber, prefix, financialYear } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();
  let posIdempotencyKey = '';
  let posRequestHash = null;

  try {
    const {
      name,
      phone,
      userId,
      partyId,
      po_number,
      eway_bill,
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate = 0,
      tax = 0,
      totalAmount = 0,
      paymentStatus = 'Unpaid',
      paymentMethod,
      paymentDetails,
      saleDate,
      bill_type = 'B2C',
      shiftId,
      reverseCharge,
      placeOfSupplyStateCode,
      warehouseId = 1,
      items = [],
      quickSaleItems = [],
      companyId,
      returnCreditCode,
      returnCreditAmount: expectedReturnCreditAmount,
      redeemLoyaltyPoints = false,
      loyaltyPointsToRedeem = 0,
      useProductStockOnly: useProductStockOnlyRequested = false,
    } = req.body;
    posIdempotencyKey = String(
      req.get('Idempotency-Key') || req.body.posIdempotencyKey || ''
    ).trim();
    if (posIdempotencyKey.length > 100) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Idempotency-Key must be at most 100 characters',
      });
    }
    if (posIdempotencyKey) {
      posRequestHash = createHash('sha256')
        .update(JSON.stringify(req.body))
        .digest('hex');
    }
    const requireBatchPricing = String(bill_type).toUpperCase() === 'B2C';
    if (!Array.isArray(quickSaleItems)) {
      throw Object.assign(new Error('quickSaleItems must be an array'), { status: 400 });
    }
    if (
      req.authRole?.systemKey === 'STAFF' &&
      (
        String(bill_type).toUpperCase() !== 'B2C' ||
        Number(companyId) !== Number(req.user.companyId) ||
        Number(userId) !== Number(req.user.id)
      )
    ) {
      throw Object.assign(
        new Error('Staff can create only their own B2C POS invoices in their company'),
        { status: 403 }
      );
    }
    let validatedQuickSaleInputs;
    try {
      validatedQuickSaleInputs = quickSaleItems.map(validateQuickSaleInput);
    } catch (validationError) {
      throw Object.assign(validationError, { status: 400 });
    }
    if (quickSaleItems.length > 0 && bill_type !== 'B2C') {
      throw Object.assign(new Error('Quick Sale items are only supported on B2C invoices'), {
        status: 400,
      });
    }
    if (
      quickSaleItems.length > 0 &&
      !req.isSystemAdministrator &&
      !req.permissions?.has('quick-sales.creation.create')
    ) {
      throw Object.assign(new Error('Permission required: quick-sales.creation.create'), {
        status: 403,
      });
    }
    const useProductStockOnly =
      requireBatchPricing &&
      useProductStockOnlyRequested === true;
    if (requireBatchPricing && useProductStockOnly) {
      throw Object.assign(
        new Error('POS sales cannot use product-stock-only allocation'),
        { code: 'INVALID_BATCH_ALLOCATION' },
      );
    }

    // -----------------------------------------
    // 1. Basic validation
    // -----------------------------------------

    if (!userId) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    if (!Array.isArray(items) || (items.length === 0 && quickSaleItems.length === 0)) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: 'At least one invoice item is required',
      });
    }

    let customerId = null;
    let loyaltyPointsEarned = 0;
    let loyaltyPointsBalance = null;
    let loyaltyPointsRedeemed = 0;
    let loyaltyRedemptionAmount = 0;

    if (!companyId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Company ID is required',
      });
    }
    if (
      bill_type !== 'B2C' &&
      (redeemLoyaltyPoints !== false || Number(loyaltyPointsToRedeem) !== 0)
    ) {
      throw Object.assign(new Error('Loyalty points can only be redeemed on POS B2C sales'), {
        status: 400,
      });
    }

    const company = await Company.findByPk(companyId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!company) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Company not found: ${companyId}`,
      });
    }
    if (
      validatedQuickSaleInputs.length > 0 &&
      !req.isSystemAdministrator &&
      Number(req.user?.companyId) !== Number(companyId)
    ) {
      throw Object.assign(
        new Error('Quick Sale items can only be created for the authenticated company'),
        { status: 403 },
      );
    }
    if (validatedQuickSaleInputs.length > 0) {
      const selectedUser = await User.findOne({
        where: { id: userId, companyId },
        transaction,
      });
      if (!selectedUser) {
        throw Object.assign(
          new Error('The selected cashier does not belong to this company'),
          { status: 403 },
        );
      }
    }
    if (
      req.loyaltyUser &&
      Number(req.loyaltyUser.companyId) !== Number(companyId)
    ) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Sales invoices can only be created for the authenticated company',
      });
    }
    if (req.loyaltyUser) {
      const selectedUser = await User.findOne({
        where: { id: userId, companyId: req.loyaltyUser.companyId },
        transaction,
      });
      if (!selectedUser) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: 'The selected sales user does not belong to the authenticated company',
        });
      }
    }
    if (posIdempotencyKey && bill_type === 'B2C') {
      const priorSale = await PosSaleIdempotency.findOne({
        where: { idempotencyKey: posIdempotencyKey },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (priorSale) {
        if (
          Number(priorSale.companyId) !== Number(companyId) ||
          Number(priorSale.userId) !== Number(userId) ||
          priorSale.requestHash !== posRequestHash ||
          !priorSale.response
        ) {
          await transaction.rollback();
          return res.status(409).json({
            success: false,
            message: 'Idempotency-Key was already used for a different or incomplete sale',
          });
        }
        const replayResponse = JSON.parse(priorSale.response);
        await transaction.commit();
        return res.status(200).json(replayResponse);
      }
    }

    if (bill_type === 'B2C' && shiftId != null) {
      const parsedShiftId = Number(shiftId);
      if (!Number.isInteger(parsedShiftId) || parsedShiftId <= 0) {
        throw Object.assign(new Error('A valid POS shift is required for this sale'), {
          status: 400,
        });
      }
      const shift = await POSShift.findOne({
        where: {
          id: parsedShiftId,
          companyId,
          status: 'OPEN',
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!shift) {
        throw Object.assign(new Error('The POS shift is no longer active. Refresh the shift before billing.'), {
          status: 409,
        });
      }
      if (
        Number(shift.userId) !== Number(userId) ||
        (req.loyaltyUser &&
          Number(shift.userId) !== Number(req.loyaltyUser.id))
      ) {
        throw Object.assign(new Error('The selected POS shift does not belong to the authenticated cashier.'), {
          status: 403,
        });
      }
    }

    const gstParty = partyId
      ? await Party.findOne({
          where: { id: partyId, companyId },
          transaction,
        })
      : null;
    const companyFinancials = await CompanyFinancials.findOne({
      where: { companyId },
      transaction,
    });
    const gstSnapshot = captureGstPartySnapshot({
      companyId,
      companyStateCode: company.state_code,
      companyGstin: companyFinancials?.gstin,
      party: gstParty,
      partyName: name,
      placeOfSupplyStateCode,
      billType: bill_type,
    });

    if (shiftId) {
      const authenticatedUser = req.loyaltyUser;
      if (
        !authenticatedUser ||
        Number(userId) !== Number(authenticatedUser.id) ||
        Number(companyId) !== Number(authenticatedUser.companyId)
      ) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: 'A POS shift can only be used by its authenticated user and company',
        });
      }

      const activeShift = await POSShift.findOne({
        where: {
          id: shiftId,
          userId: authenticatedUser.id,
          companyId: authenticatedUser.companyId,
          status: 'OPEN',
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!activeShift) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'The selected POS shift is not open for the authenticated user',
        });
      }
    }

    // -----------------------------------------
    // 2. Get app settings (this is where the prefix comes from)
    // -----------------------------------------

    const [appSettings] = await AppSettings.findOrCreate({
      where: { companyId },
      defaults: { userId },
      transaction,
    });

    // -----------------------------------------
    // 3. Get (or create) invoice settings row - this only tracks the running sequence
    // -----------------------------------------

    let invoiceSettings = await InvoiceSettings.findOne({
      where: { companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!invoiceSettings) {
      invoiceSettings = await InvoiceSettings.create(
        {
          companyId,
          invoice_prefix: appSettings?.invoicePrefix || 'INV',
          next_sequence_no: Number(appSettings?.invoiceStartingNumber || 1),
        },
        { transaction }
      );
    }

    // -----------------------------------------
    // 4. Get current sequence (last sequence, from invoice_settings)
    // -----------------------------------------

    const sequenceNumber = Number(invoiceSettings.next_sequence_no || 1);

    // -----------------------------------------
    // 5. Get prefix (from app_settings, falling back to invoice_settings)
    // -----------------------------------------

    const prefix =
      appSettings?.invoicePrefix ||
      invoiceSettings.invoice_prefix ||
      'INV';

    // -----------------------------------------
    // 5. Get financial year (format driven by app_settings.invoiceYearFormat)
    // -----------------------------------------

    const now = new Date();

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let financialYear;

    if (currentMonth >= 4) {
      financialYear = formatFinancialYear(
        appSettings?.invoiceYearFormat,
        currentYear,
        currentYear + 1
      );
    } else {
      financialYear = formatFinancialYear(
        appSettings?.invoiceYearFormat,
        currentYear - 1,
        currentYear
      );
    }

    // -----------------------------------------
    // 6. Generate invoice number
    // -----------------------------------------

    const invoiceNumber =
      `${prefix}/${financialYear}/${String(sequenceNumber).padStart(4, '0')}`;

    // Example:
    // INV/2026-27/000001
    // INV/2026-27/000002
    // INV/2026-27/000003

    // -----------------------------------------
    // 7. Increment sequence
    // -----------------------------------------

    await invoiceSettings.update(
      {
        next_sequence_no: sequenceNumber + 1,
      },
      {
        transaction,
      }
    );
    // -----------------------------------------
    // 8. Create Sale
    // -----------------------------------------

    const invoice = await Sale.create(
      {
        invoiceNumber,

        partyId: partyId || null,
        ...gstSnapshot,
        reverseCharge:
          reverseCharge === true ||
          reverseCharge === 1 ||
          reverseCharge === '1' ||
          reverseCharge === 'true',
        customerId: customerId || null,
        userId,
        po_number: po_number || null,
        eway_bill: eway_bill || null,

        global_discount_percentage:
          Number(global_discount_percentage || 0),

        global_discount_amount:
          Number(global_discount_amount || 0),

        baseRate: Number(baseRate || 0),
        tax: Number(tax || 0),
        totalAmount: Number(totalAmount || 0),

        paymentStatus,
        bill_type,
        taxDocumentType: bill_type === 'B2B' ? 'GST_TAX_INVOICE' : 'RETAIL_INVOICE',

        shiftId: shiftId || null,

        paymentDetails: paymentDetails
          ? JSON.stringify(paymentDetails)
          : null,

        saleDate: saleDate || new Date(),

        warehouseId:
          warehouseId || 1,

      },
      {
        transaction,
      }
    );
    if (posIdempotencyKey && bill_type === 'B2C') {
      await PosSaleIdempotency.create({
        idempotencyKey: posIdempotencyKey,
        requestHash: posRequestHash,
        saleId: invoice.id,
        companyId,
        userId,
      }, { transaction });
    }

    // -----------------------------------------
    // 9. Create invoice items
    // -----------------------------------------

    const lineItems = [];
    const promotionApplications = [];
    const normalizedSaleEntries = [];
    for (const item of items) {
      if (
        requireBatchPricing &&
        (!item.priceGroup ||
          !item.priceGroupKey ||
          !Array.isArray(item.batchAllocations) ||
          item.batchAllocations.length === 0)
      ) {
        throw Object.assign(
          new Error(
            'POS sale items must include a selected batch price group and explicit batch allocations',
          ),
          { code: 'INVALID_BATCH_ALLOCATION' },
        );
      }
      const product = await Product.findByPk(item.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
        ...(requireBatchPricing && {
          attributes: { exclude: ['salesPrice', 'discount'] },
        }),
      });
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      const normalizedQuantity = normalizeProductQuantity(item, product);
      let manualAllocations = null;
      if (
        !useProductStockOnly &&
        Array.isArray(item.batchAllocations) &&
        item.batchAllocations.length > 0
      ) {
        manualAllocations = item.batchAllocations.map((allocation) => ({
          batchId: Number(allocation.batchId),
          quantity: normalizeProductQuantity({
            quantity: allocation.quantity,
            quantityUnit:
              allocation.quantityUnit ||
              item.quantityUnit ||
              normalizedQuantity.quantityUnit,
          }, product).quantity,
        }));
        const allocatedPaidQuantity = manualAllocations.reduce(
          (total, allocation) => total + allocation.quantity,
          0
        );
        if (Math.abs(allocatedPaidQuantity - normalizedQuantity.quantity) > 0.001) {
          throw Object.assign(
            new Error('Manual batch allocations must equal the item paid quantity'),
            { code: 'INVALID_BATCH_ALLOCATION' },
          );
        }
      } else if (!useProductStockOnly && (item.batchId ?? item.productBatchId)) {
        manualAllocations = [{
          batchId: Number(item.batchId ?? item.productBatchId),
          quantity: normalizedQuantity.quantity,
        }];
      }
      normalizedSaleEntries.push({
        item,
        product,
        normalizedQuantity,
        manualAllocations,
      });
    }

    const productGroups = groupNormalizedSaleItems(normalizedSaleEntries);
    for (const group of productGroups) {
      const { item, product, manualAllocations, priceGroup, priceGroupKey } = group;
      const expectedPriceGroup = priceGroupKey
        ? { ...priceGroup, key: priceGroupKey }
        : null;
      if (expectedPriceGroup && !manualAllocations) {
        throw Object.assign(
          new Error('MRP price-group sales require explicit batch allocations'),
          { code: 'INVALID_BATCH_ALLOCATION' },
        );
      }
      if (
        expectedPriceGroup &&
        expectedPriceGroup.priceType !== product.sellingPriceType
      ) {
        throw Object.assign(
          new Error('Selected price type no longer matches the product'),
          { code: 'INVALID_BATCH_ALLOCATION' },
        );
      }
      if (expectedPriceGroup && useProductStockOnly) {
        throw Object.assign(
          new Error('MRP price-group sales cannot use product-stock-only allocation'),
          { code: 'INVALID_BATCH_ALLOCATION' },
        );
      }
      const normalizedQuantity = {
        quantity: group.paidQuantity,
        quantityUnit: group.quantityUnit,
      };
      const promotion = await getPromotionForProduct({
        product,
        billType: bill_type,
        paidQuantity: group.paidQuantity,
        companyId,
        transaction,
      });
      const freeQuantity = Number(promotion?.freeQuantity || 0);
      const differentProductGift = Boolean(
        promotion?.giftProductId &&
        Number(promotion.giftProductId) !== Number(product.id)
      );
      const sameProductFreeQuantity = differentProductGift ? 0 : freeQuantity;
      const totalQuantity = Number(normalizedQuantity.quantity) + sameProductFreeQuantity;
      const applicationId = promotion ? randomUUID() : null;

      const allocations = await allocateBatchStock({
        productId: product.id,
        totalQuantity,
        paidQuantity: normalizedQuantity.quantity,
        manualAllocations,
        allowUnbatchedStock: !requireBatchPricing,
        useProductStockOnly,
        unbatchedStockQuantity: Number(product.stockQuantity || 0),
        expectedPriceGroup,
        requireBatchStock: requireBatchPricing,
        requirePriceGroupAllocation: requireBatchPricing,
        companyId,
        transaction,
      });

      const storedPromotionDiscount = Number(promotion?.discountAmount || 0);
      const configuredPromotionDiscount = storedPromotionDiscount > 0
        ? storedPromotionDiscount
        : Number(promotion?.discountValue || 0);
      const promotionDiscountBaseTotal = allocations.reduce((sum, allocation) => {
        const salePricing = resolveSalePricing(product, allocation.batch, {
          useProductSalesPrice: requireBatchPricing,
          preferBatch: Boolean(manualAllocations),
          requireBatch: requireBatchPricing,
        });
        const allocationProduct = allocation.batch
          ? {
              ...product.get({ plain: true }),
              taxRate: Number(allocation.batch.gstPercentage),
              sellingPriceType: expectedPriceGroup?.priceType || product.sellingPriceType,
            }
          : product;
        const basePrice = calculatePrice(
          salePricing.price,
          allocationProduct.sellingPriceType,
          allocationProduct.taxRate
        ).basePrice;
        return sum + basePrice * Number(allocation.paidQuantity || 0);
      }, 0);
      const promotionDiscountTotal = Math.min(configuredPromotionDiscount, promotionDiscountBaseTotal);
      let promotionDiscountAllocated = 0;
      let firstQualifyingItem = null;
      let promotionDiscountApplied = 0;
      for (const allocation of allocations) {
        const salePricing = resolveSalePricing(product, allocation.batch, {
          useProductSalesPrice: requireBatchPricing,
          preferBatch: Boolean(manualAllocations),
          requireBatch: requireBatchPricing,
        });
        const allocationProduct = allocation.batch
          ? {
              ...product.get({ plain: true }),
              taxRate: Number(allocation.batch.gstPercentage),
              sellingPriceType: expectedPriceGroup?.priceType || product.sellingPriceType,
            }
          : product;
        const saleEntryPrice = salePricing.price;
        const pricingRule = promotionPricing(
          promotion,
          saleEntryPrice,
          allocation.paidQuantity
        );
        const standardDiscountPercentage = Number(item.discountPercentage) > 0
            ? Number(item.discountPercentage)
            : salePricing.discountPercentage;
        if (salePricing.mrp > 0 && Number(pricingRule.price) > salePricing.mrp) {
          throw new Error(`Selling price for ${product.name} exceeds MRP`);
        }
        if (promotion?.offerType === 'FLAT_DISCOUNT' && promotionDiscountTotal > 0) {
          const allocationDiscount = allocation === allocations[allocations.length - 1]
            ? promotionDiscountTotal - promotionDiscountAllocated
            : promotionDiscountBaseTotal === 0
              ? 0
              : promotionDiscountTotal *
              (calculatePrice(
                saleEntryPrice,
                allocationProduct.sellingPriceType,
                allocationProduct.taxRate
              ).basePrice * Number(allocation.paidQuantity || 0)) /
              promotionDiscountBaseTotal;
          pricingRule.discountAmount = Math.max(0, allocationDiscount);
          promotionDiscountAllocated += allocationDiscount;
        }
        const entryPricing = calculateInvoiceItem(
          {
            ...item,
            quantity: allocation.quantity,
            paidQuantity: allocation.paidQuantity,
            freeQuantity: allocation.freeQuantity,
            totalQuantity: allocation.quantity,
            price: pricingRule.price,
            discountPercentage: promotion
              ? (pricingRule.discountPercentage || 0)
              : standardDiscountPercentage,
            discountAmount: promotion
              ? (pricingRule.discountAmount || 0)
              : item.discountAmount,
          },
          allocationProduct,
          'sale'
        );

        const createdItem = await SalesItem.create(
          {
            saleId: invoice.id,
            productId: item.productId,
            productName: item.productName || product.name,
            quantity: Number(allocation.quantity),
            paidQuantity: Number(allocation.paidQuantity),
            freeQuantity: Number(allocation.freeQuantity),
            totalQuantity: Number(allocation.quantity),
            quantityUnit: normalizedQuantity.quantityUnit,
            offerId: promotion?.source === 'REGULAR' ? promotion.id : null,
            offerName: promotion?.name || promotion?.campaignName || null,
            productBatchId: allocation.batch?.id || null,
            batchNo: allocation.batch?.batchNumber || item.batchNumber || null,
            expiryDate: allocation.batch?.expiryDate || item.expiryDate || product.expiryDate || null,
            mrp: allocation.batch?.mrp ?? product.MRP ?? null,
            priceType: allocationProduct.sellingPriceType || null,
            sku: item.sku || product.sku || null,
            hsncode: item.hsnCode || product.HSNCode || null,
            price: entryPricing.price,
            discountPercentage: entryPricing.discountPercentage,
            discountAmount: entryPricing.discountAmount,
            baseRate: entryPricing.baseRate,
            taxPercentage: entryPricing.taxPercentage,
            taxAmount: entryPricing.taxAmount,
            ...splitStoredTax(
              entryPricing.taxAmount,
              entryPricing.taxPercentage,
              gstSnapshot.taxTypeSnapshot
            ),
            netRate: entryPricing.netRate,
            purchaseCost: Number(
              allocation.batch?.inventoryUnitCost ??
              product.unbatchedAverageCost ??
              allocation.batch?.purchasePrice ??
              product.purchasePrice ??
              0
            ),
            promotionSource: promotion?.source || null,
            promotionId: promotion
              ? (promotion.source === 'CAMPAIGN' ? promotion.campaignId : promotion.id)
              : null,
            promoApplicationId: applicationId,
            itemRole: 'QUALIFYING',
          },
          { transaction }
        );
        if (!firstQualifyingItem) firstQualifyingItem = createdItem;
        promotionDiscountApplied += Number(entryPricing.discountAmount || 0);
        lineItems.push({
          pricing: entryPricing,
          createdItem,
          promotionApplicationId: applicationId,
          role: 'QUALIFYING',
        });
        await StockMovement.create(
          {
            warehouseId: warehouseId || 1,
            productId: product.id,
            batchId: allocation.batch?.id || null,
            movementType: 'SALE',
            quantity: -Number(allocation.quantity),
            quantityUnit: normalizedQuantity.quantityUnit,
            referenceType: 'SalesBill',
            referenceId: invoice.invoiceNumber,
            notes: `Sales Bill #${invoice.invoiceNumber}`,
            performedBy: userId,
          },
          { transaction }
        );
      }

      await product.decrement('stockQuantity', {
        by: totalQuantity,
        transaction,
      });

      let firstGiftItem = null;
      if (differentProductGift && freeQuantity > 0) {
        const giftProduct = await Product.findByPk(promotion.giftProductId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
          ...(requireBatchPricing && {
            attributes: { exclude: ['salesPrice', 'discount'] },
          }),
        });
        if (!giftProduct) throw new Error(`Gift product not found: ${promotion.giftProductId}`);
        const normalizedGiftQuantity = normalizeProductQuantity({
          quantity: freeQuantity,
        }, giftProduct);
        const giftAllocations = await allocateBatchStock({
          productId: giftProduct.id,
          totalQuantity: normalizedGiftQuantity.quantity,
          paidQuantity: 0,
          allowUnbatchedStock: !requireBatchPricing,
          useProductStockOnly,
          unbatchedStockQuantity: Number(giftProduct.stockQuantity || 0),
          requireBatchStock: requireBatchPricing,
          companyId,
          transaction,
        });

        for (const allocation of giftAllocations) {
          const giftSalePricing = resolveSalePricing(
            giftProduct,
            allocation.batch,
            {
              useProductSalesPrice: requireBatchPricing,
              requireBatch: requireBatchPricing,
            },
          );
          const allocationGiftProduct = allocation.batch
            ? {
                ...giftProduct.get({ plain: true }),
                taxRate: Number(allocation.batch.gstPercentage),
              }
            : giftProduct;
          const giftPricing = calculateInvoiceItem({
            quantity: 0,
            paidQuantity: 0,
            freeQuantity: allocation.quantity,
            totalQuantity: allocation.quantity,
            price: giftSalePricing.price,
            discountPercentage: 0,
            discountAmount: 0,
          }, allocationGiftProduct, 'sale');
          const createdGiftItem = await SalesItem.create({
            saleId: invoice.id,
            productId: giftProduct.id,
            productName: giftProduct.name,
            quantity: Number(allocation.quantity),
            paidQuantity: 0,
            freeQuantity: Number(allocation.quantity),
            totalQuantity: Number(allocation.quantity),
            quantityUnit: normalizedGiftQuantity.quantityUnit,
            offerId: promotion.source === 'REGULAR' ? promotion.id : null,
            offerName: promotion.name || promotion.campaignName || null,
            productBatchId: allocation.batch?.id || null,
            batchNo: allocation.batch?.batchNumber || null,
            expiryDate: allocation.batch?.expiryDate || giftProduct.expiryDate || null,
            mrp: allocation.batch?.mrp ?? null,
            priceType: allocationGiftProduct.sellingPriceType || null,
            sku: giftProduct.sku || null,
            hsncode: giftProduct.HSNCode || null,
            price: giftPricing.price,
            discountPercentage: 0,
            discountAmount: 0,
            baseRate: 0,
            taxPercentage: giftPricing.taxPercentage,
            taxAmount: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            cessAmount: 0,
            netRate: 0,
            purchaseCost: Number(
              allocation.batch?.inventoryUnitCost ??
              giftProduct.unbatchedAverageCost ??
              allocation.batch?.purchasePrice ??
              giftProduct.purchasePrice ??
              0
            ),
            promotionSource: promotion.source,
            promotionId: promotion.source === 'CAMPAIGN' ? promotion.campaignId : promotion.id,
            promoApplicationId: applicationId,
            itemRole: 'GIFT',
          }, { transaction });
          if (!firstGiftItem) firstGiftItem = createdGiftItem;
          lineItems.push({
            pricing: giftPricing,
            createdItem: createdGiftItem,
            promotionApplicationId: applicationId,
            role: 'GIFT',
          });
          await StockMovement.create({
            warehouseId: warehouseId || 1,
            productId: giftProduct.id,
            batchId: allocation.batch?.id || null,
            movementType: 'SALE',
            quantity: -Number(allocation.quantity),
            quantityUnit: normalizedGiftQuantity.quantityUnit,
            referenceType: 'SalesBill',
            referenceId: invoice.invoiceNumber,
            notes: `Promotional gift for Sales Bill #${invoice.invoiceNumber}`,
            performedBy: userId,
          }, { transaction });
        }
        await giftProduct.decrement('stockQuantity', {
          by: normalizedGiftQuantity.quantity,
          transaction,
        });
      }

      if (promotion) {
        promotionApplications.push({
          id: applicationId,
          promotion,
          product,
          paidQuantity: Number(group.paidQuantity),
          freeQuantity,
          discountAmount: promotionDiscountApplied,
          qualifyingItem: firstQualifyingItem,
          giftItem: firstGiftItem,
        });
      }
    }

    const quickSaleEntries = [];
    for (const quickSaleInput of validatedQuickSaleInputs) {
      const registeredName = await Product.findOne({
        where: Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('name'))),
          normalizeQuickSaleName(quickSaleInput.name),
        ),
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (registeredName) {
        throw Object.assign(
          new Error(
            `${quickSaleInput.name} matches registered product ${registeredName.id}. Add it through the regular product search.`,
          ),
          { status: 409 },
        );
      }

      if (quickSaleInput.barcode) {
        const code = quickSaleInput.barcode.toLowerCase();
        const productCodeWhere = {
          [Op.or]: [
            Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('barcode')), code),
            Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('sku')), code),
          ],
        };
        const registeredProduct = await Product.findOne({
          where: productCodeWhere,
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const registeredVariant = registeredProduct
          ? null
          : await ProductVariant.findOne({
              where: productCodeWhere,
              transaction,
              lock: transaction.LOCK.UPDATE,
            });
        if (registeredProduct || registeredVariant) {
          const productId = registeredProduct?.id || registeredVariant?.productId;
          throw Object.assign(
            new Error(
              `Barcode ${quickSaleInput.barcode} belongs to a registered product${productId ? ` (ID ${productId})` : ''}. Refresh the product list and add it as a regular sale item.`,
            ),
            { status: 409 },
          );
        }
      }

      let alias = await QuickSaleAlias.findOne({
        where: {
          companyId,
          identityKey: quickSaleInput.identityKey,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!alias) {
        alias = await QuickSaleAlias.create({
          companyId,
          name: quickSaleInput.name,
          identityKey: quickSaleInput.identityKey,
          barcode: quickSaleInput.barcode,
        }, { transaction });
      }
      if (alias.mappingStatus === 'LINKED' && alias.linkedProductId) {
        throw Object.assign(
          new Error(
            `${alias.name} is mapped to registered product ${alias.linkedProductId}. Add that product through the regular product search.`,
          ),
          { status: 409 },
        );
      }

      const quickSalePricing = calculateQuickSalePricing(quickSaleInput, alias);
      const quickSaleTaxSplit = quickSalePricing.taxVerificationStatus === 'GST_VERIFIED'
        ? splitStoredTax(
            quickSalePricing.taxAmount,
            quickSalePricing.taxPercentage,
            gstSnapshot.taxTypeSnapshot,
          )
        : {
            cgstAmount: null,
            sgstAmount: null,
            igstAmount: null,
            cessAmount: null,
          };
      const createdItem = await QuickSaleSaleItem.create({
        saleId: invoice.id,
        quickSaleAliasId: alias.id,
        productNameSnapshot: quickSaleInput.name,
        barcodeSnapshot: quickSaleInput.barcode,
        mrp: quickSaleInput.mrp,
        sellingPrice: quickSaleInput.sellingPrice,
        quantity: quickSaleInput.quantity,
        lineAmount: quickSalePricing.lineAmount,
        discountAmount: 0,
        netAmount: quickSalePricing.lineAmount,
        gstVerificationStatus: quickSalePricing.taxVerificationStatus,
        taxableAmount: quickSalePricing.taxableAmount,
        taxPercentage: quickSalePricing.taxPercentage,
        taxAmount: quickSalePricing.taxAmount,
        ...quickSaleTaxSplit,
        hsnCodeSnapshot: quickSalePricing.taxVerificationStatus === 'GST_VERIFIED'
          ? alias.verifiedHsnCode
          : null,
        priceTypeSnapshot: quickSalePricing.priceType,
      }, { transaction });
      const entry = {
        pricing: quickSalePricing.pricing,
        createdItem,
        quickSaleAlias: alias,
        role: 'QUICK_SALE',
      };
      quickSaleEntries.push(entry);
      lineItems.push(entry);
    }

    const totals = calculateInvoiceTotals(
      lineItems.map(({ pricing }) => pricing),
      global_discount_percentage,
      global_discount_amount,
      { roundToWholeRupee: !requireBatchPricing || appSettings.roundOffInvoices !== false }
    );
    let returnCreditAmount = 0;
    let appliedReturnCredit = null;
    const creditCode = String(returnCreditCode || '')
      .trim()
      .replace(/^RETURN-CREDIT:/i, '');
    if (creditCode) {
      if (bill_type !== 'B2C') {
        throw Object.assign(new Error('Return credits can only be used on B2C invoices'), {
          status: 400,
        });
      }

      appliedReturnCredit = await SalesReturnCredit.findOne({
        where: { code: creditCode },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!appliedReturnCredit) {
        throw Object.assign(new Error('Return credit barcode is invalid'), {
          status: 400,
        });
      }

      const currentBalance = Number(appliedReturnCredit.remainingAmount);
      if (!Number.isFinite(currentBalance) || currentBalance <= 0) {
        throw Object.assign(new Error('Return credit has already been fully used'), {
          status: 400,
        });
      }

      returnCreditAmount = calculateAppliedReturnCredit(
        totals.totalAmount,
        currentBalance
      );
      if (
        expectedReturnCreditAmount !== undefined &&
        expectedReturnCreditAmount !== null &&
        Math.abs(
          Number(expectedReturnCreditAmount) - returnCreditAmount
        ) > 0.001
      ) {
        throw Object.assign(
          new Error('Return credit balance changed. Scan the return credit again before checkout.'),
          { status: 409 }
        );
      }
      if (returnCreditAmount > 0) {
        const remainingBalance = Math.round(
          (currentBalance - returnCreditAmount + Number.EPSILON) * 100
        ) / 100;
        await appliedReturnCredit.update(
          { remainingAmount: remainingBalance },
          { transaction }
        );
        await SalesReturnCreditRedemption.create(
          {
            creditId: appliedReturnCredit.id,
            saleId: invoice.id,
            amount: returnCreditAmount,
          },
          { transaction }
        );
      }
    }

    if (bill_type === 'B2C') {
      const customer = await handleB2CCustomer({
        name,
        phone,
        companyId,
        totalAmount: totals.totalAmount,
        saleId: invoice.id,
        performedBy: userId,
        loyaltySettings: appSettings,
        redeemLoyaltyPoints,
        loyaltyPointsToRedeem,
        returnCreditAmount,
        transaction,
      });
      customerId = customer?.id || null;
      loyaltyPointsBalance = customer?.loyalty_points == null
        ? null
        : Number(customer.loyalty_points);
      loyaltyPointsRedeemed = Number(customer?.loyaltyPointsRedeemed || 0);
      loyaltyRedemptionAmount = Number(customer?.loyaltyRedemptionAmount || 0);
      loyaltyPointsEarned = Number(await LoyaltyTransaction.sum('pointsDelta', {
        where: {
          saleId: invoice.id,
          transactionType: 'EARN',
        },
        transaction,
      }) || 0);
    }

    for (let index = 0; index < lineItems.length; index += 1) {
      const entry = lineItems[index];
      const pricedItem = totals.items[index];
      if (entry.role === 'QUICK_SALE') {
        const isGstVerified = entry.createdItem.gstVerificationStatus === 'GST_VERIFIED';
        await entry.createdItem.update({
          discountAmount: Math.max(
            0,
            Number((Number(entry.createdItem.lineAmount) - Number(pricedItem.netRate)).toFixed(2)),
          ),
          taxableAmount: isGstVerified ? Number(pricedItem.baseRate || 0) : null,
          taxPercentage: isGstVerified ? Number(pricedItem.taxPercentage) : null,
          taxAmount: isGstVerified ? Number(pricedItem.taxAmount || 0) : null,
          ...(isGstVerified
            ? splitStoredTax(
                pricedItem.taxAmount,
                pricedItem.taxPercentage,
                gstSnapshot.taxTypeSnapshot,
              )
            : {
                cgstAmount: null,
                sgstAmount: null,
                igstAmount: null,
                cessAmount: null,
              }),
          netAmount: Number(pricedItem.netRate || 0),
        }, { transaction });
      } else {
        await entry.createdItem.update(pricedItem, { transaction });
      }
    }
    const hasPendingQuickSaleItems = quickSaleEntries.some(
      ({ createdItem }) => createdItem.gstVerificationStatus === 'GST_PENDING',
    );
    await invoice.update(
      {
        customerId,
        baseRate: totals.baseRate,
        tax: totals.tax,
        totalAmount: totals.totalAmount,
        roundOff: totals.roundOff,
        amountPaid:
          bill_type === 'B2C' && paymentStatus === 'Paid'
            ? totals.totalAmount
            : Number(invoice.amountPaid || 0),
        returnCreditAmount,
        global_discount_amount: totals.globalDiscountAmount,
        taxDocumentType: bill_type === 'B2B'
          ? 'GST_TAX_INVOICE'
          : hasPendingQuickSaleItems
            ? 'SALES_RECEIPT_GST_PENDING'
            : 'RETAIL_INVOICE',
        ...(bill_type === 'B2C' && shiftId
          ? {
              paymentDetails: JSON.stringify(buildStoredPaymentDetails({
                paymentDetails,
                paymentMethod,
                totalAmount: totals.totalAmount,
                returnCreditAmount,
                loyaltyRedemptionAmount,
                returnCredit: appliedReturnCredit && {
                  code: appliedReturnCredit.code,
                  amount: returnCreditAmount,
                  remainingAmount: Number(appliedReturnCredit.remainingAmount),
                },
              })),
            }
          : appliedReturnCredit && {
          paymentDetails: JSON.stringify({
            ...(paymentDetails && typeof paymentDetails === 'object'
              ? paymentDetails
              : {}),
            returnCredit: {
              code: appliedReturnCredit.code,
              amount: returnCreditAmount,
              remainingAmount: Number(appliedReturnCredit.remainingAmount),
            },
          }),
        }),
      },
      { transaction }
    );
    if (bill_type === 'B2C' && shiftId) {
      await recalculatePosShiftTotals(shiftId, transaction);
    }

    for (const application of promotionApplications) {
      const applicationItems = lineItems.filter(
        (entry) => entry.promotionApplicationId === application.id
      );
      await PromotionApplication.create({
        id: application.id,
        saleId: invoice.id,
        offerId: application.promotion.source === 'REGULAR'
          ? application.promotion.id
          : null,
        campaignId: application.promotion.source === 'CAMPAIGN'
          ? application.promotion.campaignId
          : null,
        campaignProductId: application.promotion.source === 'CAMPAIGN'
          ? application.promotion.id
          : null,
        promotionName: application.promotion.name ||
          application.promotion.campaignName ||
          'Promotion',
        promotionType: application.promotion.offerType,
        promotionSource: application.promotion.source,
        qualifyingProductId: application.product.id,
        giftProductId: application.promotion.giftProductId ||
          (application.freeQuantity > 0 ? application.product.id : null),
        paidQuantity: application.paidQuantity,
        freeQuantity: application.freeQuantity,
        discountAmount: application.discountAmount,
        appliedAmount: application.discountAmount,
        qualifyingSalesItemId: application.qualifyingItem?.id || null,
        giftSalesItemId: application.giftItem?.id ||
          (
            application.freeQuantity > 0 &&
            (!application.promotion.giftProductId ||
              Number(application.promotion.giftProductId) === Number(application.product.id))
              ? application.qualifyingItem?.id || null
              : null
          ),
        snapshot: {
          name: application.promotion.name || application.promotion.campaignName,
          source: application.promotion.source,
          type: application.promotion.offerType,
          priority: Number(application.promotion.priority || 0),
          startDate: application.promotion.startDate || null,
          endDate: application.promotion.endDate || null,
          buyQuantity: Number(application.promotion.buyQuantity || 0),
          freeQuantity: application.freeQuantity,
          discountPercentage: Number(
            (Number(application.promotion.discountPercentage) > 0
              ? application.promotion.discountPercentage
              : 0) ||
            (application.promotion.offerType === 'PERCENTAGE_DISCOUNT'
              ? application.promotion.discountValue
              : 0) || 0
          ),
          discountAmount: application.discountAmount,
          specialPrice: application.promotion.specialPrice,
          qualifyingProductId: application.product.id,
          giftProductId: application.promotion.giftProductId ||
            (application.freeQuantity > 0 ? application.product.id : null),
          salesItemIds: applicationItems.map((entry) => entry.createdItem.id),
        },
      }, { transaction });
    }

    const responseBody = {
      success: true,
      message: 'Invoice created successfully',
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        saleDate: invoice.saleDate,
        totalAmount: invoice.totalAmount,
        roundOff: invoice.roundOff,
        returnCredit: appliedReturnCredit
          ? {
              code: appliedReturnCredit.code,
              appliedAmount: returnCreditAmount,
              remainingAmount: Number(appliedReturnCredit.remainingAmount),
            }
          : null,
        paymentStatus: invoice.paymentStatus,
        bill_type: invoice.bill_type,
        taxDocumentType: invoice.taxDocumentType,
        gstClassificationPending: hasPendingQuickSaleItems,
        customerId,
        loyaltyPointsEarned,
        loyaltyPointsBalance,
        loyaltyPointsRedeemed,
        loyaltyRedemptionAmount,
        items: lineItems
          .filter(({ role }) => role !== 'QUICK_SALE')
          .map(({ createdItem }) => ({
          saleItemId: createdItem.id,
          productId: createdItem.productId,
          quantity: Number(createdItem.quantity),
          paidQuantity: Number(createdItem.paidQuantity || 0),
          freeQuantity: Number(createdItem.freeQuantity || 0),
          totalQuantity: Number(createdItem.totalQuantity || createdItem.quantity || 0),
          quantityUnit: createdItem.quantityUnit,
          itemRole: createdItem.itemRole,
          offerName: createdItem.offerName,
          promotionSource: createdItem.promotionSource,
          promotionId: createdItem.promotionId,
          promoApplicationId: createdItem.promoApplicationId,
          productBatchId: createdItem.productBatchId,
          price: createdItem.price,
        })),
        quickSaleItems: quickSaleEntries.map(({ createdItem }) => ({
          quickSaleItemId: createdItem.id,
          productName: createdItem.productNameSnapshot,
          barcode: createdItem.barcodeSnapshot,
          quantity: Number(createdItem.quantity),
          mrp: Number(createdItem.mrp),
          sellingPrice: Number(createdItem.sellingPrice),
          lineAmount: Number(createdItem.lineAmount),
          discountAmount: Number(createdItem.discountAmount),
          netAmount: Number(createdItem.netAmount),
          gstVerificationStatus: createdItem.gstVerificationStatus,
          taxableAmount: createdItem.taxableAmount == null
            ? null
            : Number(createdItem.taxableAmount),
          taxPercentage: createdItem.taxPercentage == null
            ? null
            : Number(createdItem.taxPercentage),
          taxAmount: createdItem.taxAmount == null
            ? null
            : Number(createdItem.taxAmount),
          hsnCode: createdItem.hsnCodeSnapshot,
          priceType: createdItem.priceTypeSnapshot,
        })),
      },
    };
    if (posIdempotencyKey && bill_type === 'B2C') {
      await PosSaleIdempotency.update(
        { response: JSON.stringify(responseBody) },
        {
          where: { idempotencyKey: posIdempotencyKey, saleId: invoice.id },
          transaction,
        }
      );
    }

    // -----------------------------------------
    // 10. Commit transaction
    // -----------------------------------------

    await transaction.commit();

    // -----------------------------------------
    // 11. Response
    // -----------------------------------------

    return res.status(201).json(responseBody);

  } catch (error) {
    // -----------------------------------------
    // Rollback on error
    // -----------------------------------------

    if (!transaction.finished) await transaction.rollback();

    if (posIdempotencyKey && error.name === 'SequelizeUniqueConstraintError') {
      try {
        const priorSale = await PosSaleIdempotency.findOne({
          where: { idempotencyKey: posIdempotencyKey },
        });
        if (priorSale) {
          if (
            Number(priorSale.companyId) !== Number(req.body.companyId) ||
            Number(priorSale.userId) !== Number(req.body.userId) ||
            priorSale.requestHash !== posRequestHash
          ) {
            return res.status(409).json({
              success: false,
              message: 'Idempotency-Key was already used for a different sale',
            });
          }
          if (priorSale.response) {
            return res.status(200).json(JSON.parse(priorSale.response));
          }
        }
      } catch (replayError) {
        console.error('Unable to replay POS sale:', replayError);
      }
    }

    console.error('Create Invoice Error:', error);

    return res.status(
      error.status ||
      (['INVALID_PRODUCT_QUANTITY', 'INVALID_BATCH_ALLOCATION'].includes(error.code) ? 400 : 500)
    ).json({
      success: false,
      message: error.message,
    });
  }
};
// @access  Public
// @desc    Update invoice
// @route   PUT /api/invoices/:id
const updateInvoiceById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    let {
      invoiceNumber,
      partyId,
      userId,
      customerId,
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate,
      tax = 0,
      totalAmount,
      paymentStatus,
      saleDate,
      po_number,
      eway_bill,
      bill_type,
      shiftId,
      companyId,
      reverseCharge,
      placeOfSupplyStateCode,
      paymentMethod,
      paymentDetails,
      returnCreditAmount,
      useProductStockOnly: useProductStockOnlyRequested = false,
      items,
    } = req.body;
    let requireBatchPricing = String(bill_type || '').toUpperCase() === 'B2C';
    let useProductStockOnly =
      requireBatchPricing &&
      useProductStockOnlyRequested === true;
    if (requireBatchPricing && useProductStockOnly) {
      throw Object.assign(
        new Error('POS sales cannot use product-stock-only allocation'),
        { code: 'INVALID_BATCH_ALLOCATION' },
      );
    }

    if (
      companyId != null &&
      Number(companyId) !== Number(req.user.companyId)
    ) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Cannot update an invoice for another company' });
    }
    const invoice = await Sale.findOne({
      where: { id, companyId: req.user.companyId },
      transaction,
    });

    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Invoice not found' });
    }
    if (await QuickSaleSaleItem.count({ where: { saleId: invoice.id }, transaction })) {
      throw Object.assign(
        new Error('Invoices containing Quick Sale items cannot be edited; use the return or cancellation workflow to preserve their tax and payment history'),
        { status: 409 },
      );
    }

    requireBatchPricing =
      String(bill_type || invoice.bill_type || '').toUpperCase() === 'B2C';
    bill_type = bill_type || invoice.bill_type;
    useProductStockOnly =
      requireBatchPricing && useProductStockOnlyRequested === true;
    if (requireBatchPricing && useProductStockOnly) {
      throw Object.assign(
        new Error('POS sales cannot use product-stock-only allocation'),
        { code: 'INVALID_BATCH_ALLOCATION' },
      );
    }

    const snapshotCompanyId =
      req.loyaltyUser?.companyId || companyId || invoice.companyId;
    const appSettings = snapshotCompanyId
      ? await AppSettings.findOne({
          where: { companyId: snapshotCompanyId },
          transaction,
        })
      : null;
    if (
      requireBatchPricing &&
      (!Number.isInteger(Number(snapshotCompanyId)) ||
        Number(snapshotCompanyId) <= 0 ||
        !Array.isArray(items) ||
        items.some((item) =>
          !item.priceGroup ||
          !item.priceGroupKey ||
          !Array.isArray(item.batchAllocations) ||
          item.batchAllocations.length === 0
        ))
    ) {
      throw Object.assign(
        new Error(
          'POS invoice updates require a company, selected batch price groups, and explicit batch allocations',
        ),
        { code: 'INVALID_BATCH_ALLOCATION' },
      );
    }
    if (
      req.loyaltyUser &&
      companyId !== undefined &&
      Number(companyId) !== Number(req.loyaltyUser.companyId)
    ) {
      await transaction.rollback();
      return res.status(403).json({
        message: 'Sales invoices can only be updated for the authenticated company',
      });
    }
    if (
      req.loyaltyUser &&
      Number(invoice.companyId) !== Number(req.loyaltyUser.companyId)
    ) {
      await transaction.rollback();
      return res.status(403).json({
        message: 'Sales invoice belongs to another company or has no company assignment',
      });
    }
    const snapshotCompany = snapshotCompanyId
      ? await Company.findByPk(snapshotCompanyId, { transaction })
      : null;
    const snapshotParty = partyId || invoice.partyId
      ? await Party.findOne({
          where: {
            id: partyId || invoice.partyId,
            companyId: snapshotCompanyId,
          },
          transaction,
        })
      : null;
    const snapshotFinancials = snapshotCompanyId
      ? await CompanyFinancials.findOne({
          where: { companyId: snapshotCompanyId },
          transaction,
        })
      : null;
    const gstSnapshot = captureGstPartySnapshot({
      companyId: snapshotCompanyId,
      companyStateCode: snapshotCompany?.state_code,
      companyGstin: snapshotFinancials?.gstin,
      party: snapshotParty,
      partyName: invoice.partyNameSnapshot,
      placeOfSupplyStateCode:
        placeOfSupplyStateCode || invoice.placeOfSupplyStateCodeSnapshot,
      billType: bill_type || invoice.bill_type,
      taxType: invoice.taxTypeSnapshot,
    });

    const previousShiftId = invoice.shiftId;
    const nextShiftId = Object.prototype.hasOwnProperty.call(req.body, 'shiftId')
      ? shiftId
      : invoice.shiftId;
    if (invoice.shiftId) {
      if (
        !req.loyaltyUser ||
        Number(invoice.userId) !== Number(req.loyaltyUser.id)
      ) {
        await transaction.rollback();
        return res.status(403).json({ message: 'You can only edit your own POS shift sale' });
      }

      const originalShift = await POSShift.findOne({
        where: {
          id: invoice.shiftId,
          userId: req.loyaltyUser.id,
          companyId: req.loyaltyUser.companyId,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!originalShift) {
        await transaction.rollback();
        return res.status(403).json({ message: 'POS shift sale belongs to another company' });
      }
    }

    if (shiftId) {
      const authenticatedUser = req.loyaltyUser;
      if (
        !authenticatedUser ||
        Number(userId) !== Number(authenticatedUser.id) ||
        Number(companyId) !== Number(authenticatedUser.companyId)
      ) {
        await transaction.rollback();
        return res.status(403).json({
          message: 'A POS shift can only be used by its authenticated user and company',
        });
      }

      const activeShift = await POSShift.findOne({
        where: {
          id: shiftId,
          userId: authenticatedUser.id,
          companyId: authenticatedUser.companyId,
          status: 'OPEN',
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!activeShift) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'The selected POS shift is not open for the authenticated user',
        });
      }
    }

    if (invoice.paymentStatus === 'Cancelled') {
      await transaction.rollback();
      return res.status(400).json({ message: 'A cancelled invoice cannot be edited' });
    }

    if (await PromotionApplication.count({ where: { saleId: id }, transaction })) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'An invoice with an applied promotion cannot be edited; cancel it and create a replacement',
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No invoice items' });
    }

    // 1️⃣ Get existing items
    const existingItems = await SalesItem.findAll({
      where: { saleId: id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    // 2️⃣ Restore stock from old items
    for (const item of existingItems) {
      const returnedQuantity = Number(await SalesReturn.sum('quantity', {
        where: { saleItemId: item.id },
        transaction,
      }) || 0);
      if (returnedQuantity > 0) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'An invoice with returned items cannot be edited',
        });
      }
      const product = await Product.findByPk(item.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
        ...(requireBatchPricing && {
          attributes: { exclude: ['salesPrice', 'discount'] },
        }),
      });

      if (product) {
        if (item.productBatchId) {
          await product.update(
            {
              stockQuantity: Number(product.stockQuantity || 0) + Number(item.quantity || 0),
            },
            { transaction }
          );
          await restoreBatchStock({
            batchId: item.productBatchId,
            quantity: Number(item.quantity || 0),
            transaction,
          });
        } else {
          await restoreUnbatchedProductStock({
            product,
            quantity: Number(item.quantity || 0),
            unitCost: Number(item.purchaseCost ?? product.purchasePrice ?? 0),
            transaction,
          });
        }
        await StockMovement.create(
          {
            warehouseId: invoice.warehouseId || 1,
            productId: product.id,
            batchId: item.productBatchId || null,
            movementType: 'RETURN',
            quantity: Number(item.quantity || 0),
            quantityUnit: item.quantityUnit || product.baseUnit || 'PCS',
            referenceType: 'SalesBill',
            referenceId: invoice.invoiceNumber,
            notes: `Sales Bill edit reversal #${invoice.invoiceNumber}`,
            performedBy: userId,
          },
          { transaction }
        );
      }
    }

    // 3️⃣ Delete old items
    await SalesItem.destroy({
      where: { saleId: id },
      transaction,
    });

    // 4️⃣ Insert updated items + reduce stock
    const lineItems = [];

    for (const item of items) {
      const product = await Product.findByPk(item.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const normalizedQuantity = normalizeProductQuantity(item, product);
      const expectedPriceGroup = requireBatchPricing
        ? { ...item.priceGroup, key: item.priceGroupKey }
        : null;
      if (
        expectedPriceGroup &&
        expectedPriceGroup.priceType !== product.sellingPriceType
      ) {
        throw Object.assign(
          new Error('Selected price type no longer matches the product'),
          { code: 'INVALID_BATCH_ALLOCATION' },
        );
      }
      const allocations = await allocateBatchStock({
        productId: product.id,
        totalQuantity: normalizedQuantity.quantity,
        paidQuantity: normalizedQuantity.quantity,
        manualBatchId: useProductStockOnly
          ? null
          : item.batchId ?? item.productBatchId,
        manualAllocations: useProductStockOnly ? null : item.batchAllocations,
        allowUnbatchedStock: !requireBatchPricing,
        useProductStockOnly,
        unbatchedStockQuantity: Number(product.stockQuantity || 0),
        expectedPriceGroup,
        requireBatchStock: requireBatchPricing,
        requirePriceGroupAllocation: requireBatchPricing,
        companyId: snapshotCompanyId,
        transaction,
      });
      const hasManualBatchSelection = !useProductStockOnly && (
        item.batchId != null ||
        item.productBatchId != null ||
        (Array.isArray(item.batchAllocations) && item.batchAllocations.length > 0)
      );
      await product.update(
        {
          stockQuantity: Number(product.stockQuantity || 0) - normalizedQuantity.quantity,
        },
        { transaction }
      );
      for (const allocation of allocations) {
        const salePricing = resolveSalePricing(product, allocation.batch, {
          useProductSalesPrice: requireBatchPricing,
          preferBatch: hasManualBatchSelection,
          requireBatch: requireBatchPricing,
        });
        const allocationProduct = allocation.batch
          ? {
              ...product.get({ plain: true }),
              taxRate: Number(allocation.batch.gstPercentage),
              sellingPriceType:
                expectedPriceGroup?.priceType ||
                item.priceType ||
                product.sellingPriceType,
            }
          : product;
        if (salePricing.mrp > 0 && salePricing.price > salePricing.mrp) {
          throw new Error(`Selling price for ${product.name} exceeds MRP`);
        }
        const pricing = calculateInvoiceItem(
          {
            ...item,
            quantity: allocation.quantity,
            paidQuantity: allocation.paidQuantity,
            freeQuantity: 0,
            totalQuantity: allocation.quantity,
            price: salePricing.price,
            discountPercentage: Number(item.discountPercentage) > 0
                ? Number(item.discountPercentage)
                : salePricing.discountPercentage,
          },
          allocationProduct,
          'sale'
        );
        lineItems.push({
          item,
          product,
          allocationProduct,
          pricing,
          normalizedQuantity,
          allocation,
        });
        await StockMovement.create(
          {
            warehouseId: invoice.warehouseId || 1,
            productId: product.id,
            batchId: allocation.batch?.id || null,
            movementType: 'SALE',
            quantity: -Number(allocation.quantity),
            quantityUnit: normalizedQuantity.quantityUnit,
            referenceType: 'SalesBill',
            referenceId: invoice.invoiceNumber,
            notes: `Sales Bill edit #${invoice.invoiceNumber}`,
            performedBy: userId,
          },
          { transaction }
        );
      }
    }

    const totals = calculateInvoiceTotals(
      lineItems.map(({ pricing }) => pricing),
      global_discount_percentage,
      global_discount_amount,
      { roundToWholeRupee: !requireBatchPricing || appSettings?.roundOffInvoices !== false }
    );
    const processedItems = lineItems.map(({ item, product, allocationProduct, normalizedQuantity, allocation }, index) => ({
      saleId: id,
      productId: product.id,
      productName: item.productName || product.name,
      quantity: allocation.quantity,
      paidQuantity: allocation.paidQuantity,
      freeQuantity: 0,
      totalQuantity: allocation.quantity,
      quantityUnit: normalizedQuantity.quantityUnit,
      ...totals.items[index],
      productBatchId: allocation.batch?.id || null,
      mrp: allocation.batch?.mrp ?? item.mrp ?? product.MRP ?? null,
      priceType: allocationProduct.sellingPriceType || null,
      purchaseCost: Number(
        allocation.batch?.inventoryUnitCost ??
        product.unbatchedAverageCost ??
        allocation.batch?.purchasePrice ??
        product.purchasePrice ??
        0
      ),
      batchNo: allocation.batch?.batchNumber || item.batchNumber || null,
      serialNo: item.serialNumber || null,
      expiryDate: item.expiryDate || null,
      sku: item.sku || null,
      hsncode: item.hsnCode || null,
      ...splitStoredTax(
        totals.items[index].taxAmount,
        totals.items[index].taxPercentage,
        gstSnapshot.taxTypeSnapshot
      ),
    }));

    await SalesItem.bulkCreate(processedItems, { transaction });

    // 5️⃣ Update invoice
    await invoice.update(
      {
        invoiceNumber,
        partyId,
        ...gstSnapshot,
        reverseCharge:
          reverseCharge === undefined
            ? invoice.reverseCharge
            : reverseCharge === true ||
              reverseCharge === 1 ||
              reverseCharge === '1' ||
              reverseCharge === 'true',
        userId,
        customerId,
        global_discount_percentage,
        global_discount_amount: totals.globalDiscountAmount,
        baseRate: totals.baseRate,
        tax: totals.tax,
        totalAmount: totals.totalAmount,
        roundOff: totals.roundOff,
        returnCreditAmount: returnCreditAmount ?? invoice.returnCreditAmount,
        paymentStatus,
        po_number,
        eway_bill,
        bill_type,
        shiftId: nextShiftId,
        ...(bill_type === 'B2C' && nextShiftId && {
          paymentDetails: JSON.stringify(buildStoredPaymentDetails({
            paymentDetails: Object.prototype.hasOwnProperty.call(req.body, 'paymentDetails')
              ? paymentDetails
              : invoice.paymentDetails,
            paymentMethod,
            totalAmount: totals.totalAmount,
            returnCreditAmount: returnCreditAmount ?? invoice.returnCreditAmount,
          })),
        }),
        saleDate,
      },
      { transaction }
    );
    if (previousShiftId) {
      await recalculatePosShiftTotals(previousShiftId, transaction);
    }
    if (
      bill_type === 'B2C' &&
      nextShiftId &&
      Number(nextShiftId) !== Number(previousShiftId)
    ) {
      await recalculatePosShiftTotals(nextShiftId, transaction);
    }

    await transaction.commit();

    return res.status(200).json({ message: 'Invoice updated successfully' });
  } catch (error) {
    await transaction.rollback();
    return res.status(
      error.status ||
      (['INVALID_PRODUCT_QUANTITY', 'INVALID_BATCH_ALLOCATION'].includes(error.code)
        ? 400
        : 500)
    ).json({ message: error.message });
  }
};

// @access  Public
// @desc    Update invoice
// @route   PUT /api/invoices/:id
// @desc    Record a payment against an invoice (supports partial payments)
// @route   PUT /api/invoices/:id/payment-status
// @access  Public
const updatePaymentStatusById = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { amount, paymentMode, referenceNo, notes } = req.body;

    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'A positive payment amount is required' });
    }

    const invoice = await Sale.findOne({
      where: { id, companyId: req.user.companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Invoice not found' });
    }
    if (invoice.paymentStatus === 'Cancelled') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Payments cannot be recorded on a cancelled invoice' });
    }

    const totalAmount = Number(invoice.totalAmount || 0);
    const alreadyPaid = Number(invoice.amountPaid || 0);
    const newAmountPaid = alreadyPaid + paymentAmount;

    if (newAmountPaid > totalAmount) {
      await transaction.rollback();
      return res.status(400).json({
        message: `Payment exceeds balance due. Balance due is ${(totalAmount - alreadyPaid).toFixed(2)}`,
      });
    }

    // status is always derived from actual payments — never trusted from the client
    let newStatus;
    if (newAmountPaid <= 0) {
      newStatus = 'Unpaid';
    } else if (newAmountPaid < totalAmount) {
      newStatus = 'Partial';
    } else {
      newStatus = 'Paid';
    }

    await invoice.update(
      { amountPaid: newAmountPaid, paymentStatus: newStatus },
      { transaction }
    );

    // Record PaymentIn history — this is the ledger; invoice fields are just a cached summary of it
    const PaymentIn = require('../mysql-models/PaymentIn');
    await PaymentIn.create(
      {
        saleId: invoice.id,
        partyId: invoice.partyId,
        paymentDate: new Date(),
        amount: paymentAmount,
        paymentMode: paymentMode || 'Cash',
        referenceNo: referenceNo || null,
        notes: notes || `Payment of ${paymentAmount} recorded (status: ${newStatus})`,
      },
      { transaction }
    );
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        paymentStatus: newStatus,
        amountPaid: newAmountPaid,
        balanceDue: totalAmount - newAmountPaid,
      },
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Full payment history for one invoice (running balance)
// @route   GET /api/invoices/:id/payments
const getPaymentHistoryBySale = async (req, res) => {
  try {
    const { id } = req.params;
    const PaymentIn = require('../mysql-models/PaymentIn');

    const invoice = await Sale.findOne({
      where: { id, companyId: req.user.companyId },
      attributes: ['id', 'totalAmount', 'amountPaid', 'paymentStatus'],
    });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const payments = await PaymentIn.findAll({
      where: { saleId: id },
      order: [['paymentDate', 'ASC']],
    });

    let running = 0;
    const history = payments.map((p) => {
      running += Number(p.amount);
      return { ...p.toJSON(), runningPaid: running };
    });

    return res.status(200).json({
      success: true,
      data: {
        totalAmount: Number(invoice.totalAmount),
        amountPaid: Number(invoice.amountPaid),
        balanceDue: Number(invoice.totalAmount) - Number(invoice.amountPaid),
        paymentStatus: invoice.paymentStatus,
        payments: history,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public
const deleteInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const id = req.params.id;

    const salesInvoice = await Sale.findOne({
      where: { id, companyId: req.user.companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!salesInvoice) {
      await transaction.rollback();
      return res.status(404).json({
        message: 'Sales invoice not found',
      });
    }

    if (salesInvoice.paymentStatus === 'Cancelled') {
      await transaction.commit();
      return res.status(200).json({
        message: 'Invoice was already cancelled',
        data: { id: salesInvoice.id, paymentStatus: salesInvoice.paymentStatus },
      });
    }

    const recordedPaymentCount = await require('../mysql-models/PaymentIn').count({
      where: { saleId: salesInvoice.id },
      transaction,
    });
    if (
      hasRecordedPayment(salesInvoice) ||
      recordedPaymentCount > 0
    ) {
      await transaction.rollback();
      return res.status(409).json({
        message: 'Cannot cancel a paid or partially paid invoice. Record the refund or payment reversal through your accounting process first.',
      });
    }

    const earnedTransactions = await LoyaltyTransaction.findAll({
      where: { saleId: salesInvoice.id, transactionType: 'EARN' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const pointsToReverse = earnedTransactions.reduce(
      (total, entry) => total + Math.max(0, Number(entry.pointsDelta || 0)),
      0
    );
    const saleRedemptions = await LoyaltyRedemption.findAll({
      where: { saleId: salesInvoice.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const pointsToRestore = saleRedemptions.reduce(
      (total, entry) =>
        total +
        Math.max(
          0,
          Number(entry.pointsRedeemed || 0) - Number(entry.pointsReversed || 0)
        ),
      0
    );
    if ((pointsToReverse > 0 || pointsToRestore > 0) && salesInvoice.customerId) {
      const customer = await Customer.findOne({
        where: {
          id: salesInvoice.customerId,
          companyId: salesInvoice.companyId,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!customer) throw new Error(`Customer not found: ${salesInvoice.customerId}`);
      const currentPoints = Number(customer.loyalty_points || 0);
      if (currentPoints < pointsToReverse) {
        await transaction.rollback();
        return res.status(409).json({
          message: 'Sale-earned loyalty points have already been spent; adjust the customer balance before cancellation',
        });
      }
      let balanceAfter = currentPoints - pointsToReverse;
      if (pointsToReverse > 0) {
        await LoyaltyTransaction.create({
          customerId: customer.id,
          transactionType: 'REVERSAL',
          pointsDelta: -pointsToReverse,
          previousBalance: currentPoints,
          balanceAfter,
          monetaryValue: Number(earnedTransactions.reduce(
            (total, entry) => total + Number(entry.monetaryValue || 0),
            0
          ).toFixed(2)),
          description: `Loyalty points reversed for cancelled sale ${salesInvoice.invoiceNumber}`,
          saleId: salesInvoice.id,
          performedBy: req.user?.id || null,
          idempotencyKey: `cancel-sale-${salesInvoice.id}`,
        }, { transaction });
      }
      for (const redemption of saleRedemptions) {
        const remainingPoints = Math.max(
          0,
          Number(redemption.pointsRedeemed || 0) -
            Number(redemption.pointsReversed || 0)
        );
        if (remainingPoints <= 0) continue;
        balanceAfter += remainingPoints;
        await redemption.update({
          pointsReversed:
            Number(redemption.pointsReversed || 0) + remainingPoints,
          status: 'REVERSED',
        }, { transaction });
        await LoyaltyTransaction.create({
          customerId: customer.id,
          transactionType: 'REVERSAL',
          pointsDelta: remainingPoints,
          previousBalance: balanceAfter - remainingPoints,
          balanceAfter,
          monetaryValue: Number(redemption.rewardValue || 0),
          description: `Loyalty points restored for cancelled sale ${salesInvoice.invoiceNumber}`,
          redemptionId: redemption.id,
          saleId: salesInvoice.id,
          performedBy: req.user?.id || null,
          idempotencyKey: `cancel-sale-${salesInvoice.id}-redemption-${redemption.id}`,
        }, { transaction });
      }
      await customer.update({ loyalty_points: balanceAfter }, { transaction });
    }

    // get all items of the invoice
    const salesItems = await SalesItem.findAll({
      where: { saleId: id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const quickSaleReturnCount = await QuickSaleReturn.count({
      where: { saleId: id },
      transaction,
    });
    if (quickSaleReturnCount > 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'An invoice with returned Quick Sale items cannot be cancelled',
      });
    }

    for (const item of salesItems) {
      const returnedQuantity = Number(await SalesReturn.sum('quantity', {
        where: { saleItemId: item.id },
        transaction,
      }) || 0);
      if (returnedQuantity > 0) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'An invoice with returned items cannot be deleted',
        });
      }

      const product = await Product.findByPk(item.productId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const quantityToRestore = Number(item.quantity || 0);
      if (item.productBatchId) {
        await product.update({
          stockQuantity: Number(product.stockQuantity || 0) + quantityToRestore,
        }, { transaction });
        await restoreBatchStock({
          batchId: item.productBatchId,
          quantity: quantityToRestore,
          transaction,
        });
      } else {
        await restoreUnbatchedProductStock({
          product,
          quantity: quantityToRestore,
          unitCost: Number(item.purchaseCost ?? product.purchasePrice ?? 0),
          transaction,
        });
      }

      if (quantityToRestore > 0) {
        await StockMovement.create(
          {
            warehouseId: salesInvoice.warehouseId || 1,
            productId: product.id,
            batchId: item.productBatchId || null,
            movementType: 'RETURN',
            quantity: quantityToRestore,
            quantityUnit: item.quantityUnit || 'KG',
            referenceType: 'SalesBill',
            referenceId: salesInvoice.invoiceNumber,
            notes: `Sales Bill cancellation reversal #${salesInvoice.invoiceNumber}`,
          },
          { transaction }
        );
      }
    }

    await salesInvoice.update({ paymentStatus: 'Cancelled' }, { transaction });
    if (salesInvoice.bill_type === 'B2C' && salesInvoice.shiftId) {
      await recalculatePosShiftTotals(salesInvoice.shiftId, transaction);
    }

    await transaction.commit();

    return res.status(200).json({
      message: 'Invoice cancelled and stock restored; invoice history was preserved',
      data: { id: salesInvoice.id, paymentStatus: salesInvoice.paymentStatus },
    });
  } catch (error) {
    await transaction.rollback();

    return res.status(error.status || 500).json({
      message: error.message,
    });
  }
};

const getReturnableSaleByInvoiceNumber = async (req, res) => {
  try {
    const invoiceNumber = String(req.params.invoiceNumber || '').trim();
    if (!invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: 'Invoice number is required',
      });
    }

    const sale = await Sale.findOne({
      where: { invoiceNumber, bill_type: 'B2C', companyId: req.user.companyId },
      include: [
        {
          model: Customer,
          where: { companyId: req.user.companyId },
          required: false,
          attributes: ['id', 'name', 'phone'],
        },
        {
          model: SalesItem,
          include: [{
            model: Product,
            attributes: ['name', 'barcode', 'unitType', 'baseUnit'],
          }],
        },
        { model: QuickSaleSaleItem, as: 'QuickSaleItems' },
      ],
    });
    if (!sale || sale.paymentStatus === 'Cancelled') {
      return res.status(404).json({
        success: false,
        message: 'Active B2C invoice not found',
      });
    }

    const returnRows = await SalesReturn.findAll({
      where: { saleId: sale.id },
      attributes: ['saleItemId', 'quantity'],
    });
    const quickSaleReturnRows = await QuickSaleReturn.findAll({
      where: { saleId: sale.id },
      attributes: ['quickSaleSaleItemId', 'quantity'],
    });
    const returnedByItem = new Map();
    for (const row of returnRows) {
      const itemId = Number(row.saleItemId);
      returnedByItem.set(
        itemId,
        Number(returnedByItem.get(itemId) || 0) + Number(row.quantity || 0)
      );
    }
    const returnedByQuickSaleItem = new Map();
    for (const row of quickSaleReturnRows) {
      const itemId = Number(row.quickSaleSaleItemId);
      returnedByQuickSaleItem.set(
        itemId,
        Number(returnedByQuickSaleItem.get(itemId) || 0) + Number(row.quantity || 0),
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        saleDate: sale.saleDate,
        totalAmount: Number(sale.totalAmount || 0),
        billType: sale.bill_type,
        customer: sale.Customer
          ? {
              name: sale.Customer.name,
              phone: sale.Customer.phone,
            }
          : null,
        items: [
          ...(sale.SalesItems || []).map((item) => ({
          ...item.toJSON(),
          itemType: 'PRODUCT',
          returnedQuantity: Number(returnedByItem.get(Number(item.id)) || 0),
          remainingReturnableQuantity: getRemainingReturnableQuantity(
            item.quantity,
            returnedByItem.get(Number(item.id)) || 0
          ),
          })),
          ...(sale.QuickSaleItems || []).map((item) => ({
            ...item.toJSON(),
            id: item.id,
            itemType: 'QUICK_SALE',
            quickSaleItemId: item.id,
            productId: null,
            productName: item.productNameSnapshot,
            quantityUnit: 'PCS',
            returnedQuantity: Number(returnedByQuickSaleItem.get(Number(item.id)) || 0),
            remainingReturnableQuantity: getRemainingReturnableQuantity(
              item.quantity,
              returnedByQuickSaleItem.get(Number(item.id)) || 0,
            ),
          })),
        ],
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSalesReturnCredit = async (req, res) => {
  try {
    const code = String(req.params.code || '')
      .trim()
      .replace(/^RETURN-CREDIT:/i, '');
    const credit = await SalesReturnCredit.findOne({ where: { code } });
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Return credit barcode not found',
      });
    }

    const sale = await Sale.findOne({
      where: { id: credit.saleId, companyId: req.user.companyId },
      attributes: ['id', 'invoiceNumber'],
    });
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Return credit not found',
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        id: credit.id,
        code: credit.code,
        invoiceNumber: sale.invoiceNumber,
        totalAmount: Number(credit.totalAmount),
        remainingAmount: Number(credit.remainingAmount),
        createdAt: credit.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSalesReturnCreditReceipt = async (credit, transaction) => {
  const [sale, returnRows, quickSaleReturnRows] = await Promise.all([
    Sale.findByPk(credit.saleId, { transaction }),
    SalesReturn.findAll({
      where: { returnCreditId: credit.id },
      transaction,
    }),
    QuickSaleReturn.findAll({
      where: { returnCreditId: credit.id },
      transaction,
    }),
  ]);
  const saleItems = await SalesItem.findAll({
    where: { id: returnRows.map((row) => row.saleItemId) },
    transaction,
  });
  const quickSaleItems = await QuickSaleSaleItem.findAll({
    where: { id: quickSaleReturnRows.map((row) => row.quickSaleSaleItemId) },
    transaction,
  });
  const saleItemsById = new Map(
    saleItems.map((item) => [Number(item.id), item])
  );
  const quickSaleItemsById = new Map(
    quickSaleItems.map((item) => [Number(item.id), item])
  );

  return {
    id: credit.id,
    code: credit.code,
    sourceInvoiceNumber: sale?.invoiceNumber || '',
    saleDate: sale?.saleDate || null,
    totalAmount: Number(credit.totalAmount),
    remainingAmount: Number(credit.remainingAmount),
    reason: credit.reason || '',
    createdAt: credit.createdAt,
    items: [
      ...returnRows.map((row) => {
        const saleItem = saleItemsById.get(Number(row.saleItemId));
        return {
          itemType: 'PRODUCT',
          saleItemId: row.saleItemId,
          productId: row.productId,
          productName: saleItem?.productName || 'Product',
          batchNumber: saleItem?.batchNo || '',
          returnCondition: row.returnCondition,
          quantity: Number(row.quantity),
          quantityUnit: row.quantityUnit,
          returnedAmount: Number(row.returnedAmount || 0),
        };
      }),
      ...quickSaleReturnRows.map((row) => {
        const saleItem = quickSaleItemsById.get(Number(row.quickSaleSaleItemId));
        return {
          itemType: 'QUICK_SALE',
          quickSaleItemId: row.quickSaleSaleItemId,
          productId: null,
          productName: saleItem?.productNameSnapshot || 'Quick Sale item',
          barcode: saleItem?.barcodeSnapshot || null,
          gstVerificationStatus: saleItem?.gstVerificationStatus || null,
          quantity: Number(row.quantity),
          quantityUnit: 'PCS',
          returnedAmount: Number(row.returnedAmount || 0),
        };
      }),
    ],
  };
};

const createSalesReturnCredit = async (req, res) => {
  const transaction = await sequelize.transaction();
  const idempotencyKey = String(
    req.get('Idempotency-Key') || req.body.idempotencyKey || ''
  ).trim();

  try {
    if (!idempotencyKey || idempotencyKey.length > 100) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'A unique Idempotency-Key of at most 100 characters is required',
      });
    }

    const saleId = Number(req.params.saleId);
    const sale = await Sale.findOne({
      where: { id: saleId, companyId: req.user.companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sale || sale.bill_type !== 'B2C') {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'B2C invoice not found',
      });
    }
    if (sale.paymentStatus === 'Cancelled') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'A cancelled invoice cannot be returned',
      });
    }

    const inputItems = req.body.items;
    if (!Array.isArray(inputItems) || inputItems.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Select at least one item to return',
      });
    }

    const normalizedItems = normalizeReturnCreditItems(inputItems);
    if (
      normalizedItems.some((item) =>
        item.quickSaleItemId != null
          ? !Number.isInteger(item.quickSaleItemId) || item.quickSaleItemId <= 0
          : !Number.isInteger(item.saleItemId) || item.saleItemId <= 0
      )
    ) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Each returned item must have a valid sales item ID',
      });
    }
    const reason = String(req.body.reason || '').trim();
    if (reason.length > 255) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Return reason must be 255 characters or fewer',
      });
    }
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ saleId, items: normalizedItems, reason }))
      .digest('hex');

    const existingCredit = await SalesReturnCredit.findOne({
      where: { idempotencyKey },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (existingCredit) {
      if (
        Number(existingCredit.saleId) !== saleId ||
        existingCredit.requestHash !== requestHash
      ) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: 'Idempotency-Key was already used for a different return',
        });
      }
      const receipt = await getSalesReturnCreditReceipt(existingCredit, transaction);
      await transaction.commit();
      return res.status(200).json({ success: true, data: receipt, replayed: true });
    }

    const reasonText = reason || null;
    const returnLines = [];
    const pendingProductReturns = new Map();
    for (const requestItem of normalizedItems) {
      if (requestItem.quickSaleItemId != null) {
        const saleItem = await QuickSaleSaleItem.findOne({
          where: { id: requestItem.quickSaleItemId, saleId: sale.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!saleItem) {
          throw Object.assign(new Error('A selected Quick Sale item is not on this invoice'), {
            status: 400,
          });
        }
        const quantityText = String(requestItem.quantity ?? '').trim();
        const quantity = Number(quantityText);
        if (
          !/^\d+(?:\.\d{1,3})?$/.test(quantityText) ||
          !Number.isFinite(quantity) ||
          quantity <= 0
        ) {
          throw Object.assign(new Error('Quick Sale return quantity must be positive with at most three decimal places'), {
            status: 400,
          });
        }
        const previousReturns = await QuickSaleReturn.findAll({
          where: { quickSaleSaleItemId: saleItem.id },
          attributes: ['quantity', 'returnedAmount'],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const previouslyReturned = previousReturns.reduce(
          (total, returnedItem) => total + Number(returnedItem.quantity || 0),
          0,
        );
        const remainingReturnable = getRemainingReturnableQuantity(
          saleItem.quantity,
          previouslyReturned,
        );
        const remainingAfterReturn = validateReturnQuantity(
          Number(saleItem.quantity),
          previouslyReturned,
          quantity,
        );
        const previouslyCredited = previousReturns.reduce(
          (total, returnedItem) => total + Number(returnedItem.returnedAmount || 0),
          0,
        );
        const returnedAmount = calculateReturnCreditAmount(
          {
            quantity: Number(saleItem.quantity),
            netRate: Number(saleItem.netAmount),
          },
          quantity,
          previouslyCredited,
        );
        returnLines.push({
          itemType: 'QUICK_SALE',
          saleItem,
          normalizedQuantity: { quantity, quantityUnit: 'PCS' },
          remainingReturnable,
          remainingAfterReturn,
          returnedAmount,
        });
        continue;
      }

      const saleItem = await SalesItem.findOne({
        where: { id: requestItem.saleItemId, saleId: sale.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!saleItem) {
        throw Object.assign(new Error('A selected item is not on this invoice'), {
          status: 400,
        });
      }
      if (saleItem.promoApplicationId || saleItem.itemRole === 'GIFT') {
        throw Object.assign(
          new Error('Returns for promotion-linked items are disabled by the configured gift return policy'),
          { status: 400 }
        );
      }

      const product = await Product.findByPk(saleItem.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) {
        throw Object.assign(new Error(`Product not found: ${saleItem.productId}`), {
          status: 400,
        });
      }
      if (saleItem.productBatchId) {
        const originalBatch = await ProductBatch.findByPk(saleItem.productBatchId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (
          !originalBatch ||
          Number(originalBatch.productId) !== Number(product.id) ||
          (originalBatch.companyId && sale.companyId &&
            Number(originalBatch.companyId) !== Number(sale.companyId))
        ) {
          throw Object.assign(
            new Error('The original sales batch does not belong to this product and company'),
            { status: 400 }
          );
        }
      }
      const normalizedQuantity = normalizeProductQuantity(
        {
          quantity: requestItem.quantity,
          quantityUnit: requestItem.quantityUnit,
        },
        product
      );
      const previousReturns = await SalesReturn.findAll({
        where: { saleItemId: saleItem.id },
        attributes: ['quantity', 'returnedAmount'],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const previouslyReturned = previousReturns.reduce(
        (total, returnedItem) => total + Number(returnedItem.quantity || 0),
        0
      );
      const previouslyCredited = previousReturns.reduce(
        (total, returnedItem) => total + Number(returnedItem.returnedAmount || 0),
        0
      );
      const pending = pendingProductReturns.get(Number(saleItem.id)) || {
        quantity: 0,
        amount: 0,
      };
      const priorQuantity = previouslyReturned + pending.quantity;
      const priorAmount = previouslyCredited + pending.amount;
      const remainingReturnable = getRemainingReturnableQuantity(
        saleItem.quantity,
        priorQuantity
      );
      const remainingAfterReturn = validateReturnQuantity(
        Number(saleItem.quantity),
        priorQuantity,
        normalizedQuantity.quantity
      );
      const returnedAmount = calculateReturnCreditAmount(
        saleItem,
        normalizedQuantity.quantity,
        priorAmount
      );
      pendingProductReturns.set(Number(saleItem.id), {
        quantity: pending.quantity + normalizedQuantity.quantity,
        amount: pending.amount + returnedAmount,
      });
      returnLines.push({
        itemType: 'PRODUCT',
        saleItem,
        product,
        normalizedQuantity,
        returnCondition: requestItem.returnCondition || 'GOOD',
        remainingReturnable,
        remainingAfterReturn,
        returnedAmount,
      });
    }

    const totalAmount = Math.round(
      (returnLines.reduce((total, line) => total + line.returnedAmount, 0) +
        Number.EPSILON) * 100
    ) / 100;
    if (totalAmount <= 0) {
      throw Object.assign(new Error('Selected items do not have a refundable amount'), {
        status: 400,
      });
    }

    const credit = await SalesReturnCredit.create(
      {
        saleId: sale.id,
        code: randomUUID(),
        totalAmount,
        remainingAmount: totalAmount,
        idempotencyKey,
        requestHash,
        reason: reasonText,
      },
      { transaction }
    );

    for (const [index, line] of returnLines.entries()) {
      if (line.itemType === 'QUICK_SALE') {
        const returnRecord = await QuickSaleReturn.create(
          {
            saleId: sale.id,
            quickSaleSaleItemId: line.saleItem.id,
            returnCreditId: credit.id,
            quantity: line.normalizedQuantity.quantity,
            returnedAmount: line.returnedAmount,
            idempotencyKey: `return-credit-${credit.id}-quick-sale-${index}`,
            reason: reasonText,
          },
          { transaction },
        );
        await reverseLoyaltyForSaleReturn({
          sale,
          returnRecord,
          transaction,
          performedBy: req.user?.id,
        });
        continue;
      }

      const { saleItem, product, normalizedQuantity, returnCondition } = line;
      const returnRecord = await SalesReturn.create(
        {
          saleId: sale.id,
          saleItemId: saleItem.id,
          productId: product.id,
          productBatchId: saleItem.productBatchId || null,
          returnCreditId: credit.id,
          quantity: normalizedQuantity.quantity,
          quantityUnit: normalizedQuantity.quantityUnit,
          returnCondition,
          returnedAmount: line.returnedAmount,
          idempotencyKey: `return-credit-${credit.id}-${index}`,
          reason: reasonText,
        },
        { transaction }
      );
      if (returnCondition === 'GOOD') {
        const stockProduct = await Product.findByPk(product.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!stockProduct) {
          throw Object.assign(new Error(`Product not found: ${product.id}`), {
            status: 400,
          });
        }
        const updatedStock =
          Number(stockProduct.stockQuantity || 0) + normalizedQuantity.quantity;
        if (saleItem.productBatchId) {
          await stockProduct.update({ stockQuantity: updatedStock }, { transaction });
          await restoreBatchStock({
            batchId: saleItem.productBatchId,
            quantity: normalizedQuantity.quantity,
            transaction,
          });
        } else {
          await restoreUnbatchedProductStock({
            product: stockProduct,
            quantity: normalizedQuantity.quantity,
            unitCost: Number(saleItem.purchaseCost ?? stockProduct.purchasePrice ?? 0),
            transaction,
          });
        }
      }
      await StockMovement.create(
        {
          warehouseId: sale.warehouseId || 1,
          productId: product.id,
          batchId: saleItem.productBatchId || null,
          movementType: 'RETURN',
          quantity: normalizedQuantity.quantity,
          quantityUnit: normalizedQuantity.quantityUnit,
          referenceType: 'SalesReturn',
          referenceId: String(returnRecord.id),
          notes: `${returnCondition} return: ${String(
            reasonText || `Return credit ${credit.code} for invoice ${sale.invoiceNumber}`
          ).slice(0, 220)}`,
          performedBy: req.user?.id || null,
        },
        { transaction }
      );
      await reverseLoyaltyForSaleReturn({
        sale,
        returnRecord,
        transaction,
        performedBy: req.user?.id,
      });
    }

    if (sale.bill_type === 'B2C' && sale.shiftId) {
      await recalculatePosShiftTotals(sale.shiftId, transaction);
    }

    const receipt = await getSalesReturnCreditReceipt(credit, transaction);
    await transaction.commit();
    return res.status(201).json({ success: true, data: receipt, replayed: false });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      const existingCredit = await SalesReturnCredit.findOne({
        where: { idempotencyKey },
      });
      if (existingCredit) {
        const saleId = Number(req.params.saleId);
        const normalizedItems = Array.isArray(req.body.items)
          ? normalizeReturnCreditItems(req.body.items)
          : [];
        const reason = String(req.body.reason || '').trim();
        const requestHash = createHash('sha256')
          .update(JSON.stringify({ saleId, items: normalizedItems, reason }))
          .digest('hex');
        if (
          Number(existingCredit.saleId) === saleId &&
          existingCredit.requestHash === requestHash
        ) {
          const receipt = await getSalesReturnCreditReceipt(existingCredit);
          return res.status(200).json({
            success: true,
            data: receipt,
            replayed: true,
          });
        }
      }
      return res.status(409).json({
        success: false,
        message: 'Idempotency-Key was already used for a different return',
      });
    }

    return res.status(error.status || 500).json({
      success: false,
      message: error.message,
    });
  }
};

const createSalesReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  const idempotencyKey = String(
    req.get('Idempotency-Key') || req.body.idempotencyKey || ''
  ).trim();

  try {
    if (!idempotencyKey || idempotencyKey.length > 100) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'A unique Idempotency-Key of at most 100 characters is required',
      });
    }

    const sale = await Sale.findOne({
      where: { id: req.params.saleId, companyId: req.user.companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (sale.paymentStatus === 'Cancelled') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'A cancelled invoice cannot be returned' });
    }

    const saleItem = await SalesItem.findByPk(req.body.saleItemId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!saleItem || Number(saleItem.saleId) !== Number(sale.id)) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Sales item not found on this invoice' });
    }
    const returnCondition = normalizeSalesReturnCondition(
      req.body.returnCondition ?? req.body.condition
    );

    const existingReturn = await SalesReturn.findOne({
      where: { idempotencyKey },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (existingReturn) {
      if (
        Number(existingReturn.saleId) !== Number(sale.id) ||
        Number(existingReturn.saleItemId) !== Number(saleItem.id) ||
        normalizeSalesReturnCondition(existingReturn.returnCondition) !== returnCondition
      ) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: 'Idempotency-Key was already used for a different return',
        });
      }
      await transaction.commit();
      return res.status(200).json({
        success: true,
        data: { ...existingReturn.toJSON(), replayed: true },
      });
    }

    if (saleItem.promoApplicationId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Returns for promotion-linked items are disabled by the configured gift return policy',
      });
    }

    const product = await Product.findByPk(saleItem.productId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!product) {
      throw new Error(`Product not found: ${saleItem.productId}`);
    }
    const normalizedQuantity = normalizeProductQuantity(
      {
        quantity: req.body.quantity,
        quantityUnit: req.body.quantityUnit,
      },
      product
    );
    if (saleItem.productBatchId) {
      const originalBatch = await ProductBatch.findByPk(saleItem.productBatchId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        !originalBatch ||
        Number(originalBatch.productId) !== Number(product.id) ||
        (originalBatch.companyId && sale.companyId &&
          Number(originalBatch.companyId) !== Number(sale.companyId))
      ) {
        throw new Error('The original sales batch does not belong to this product and company');
      }
    }
    const previousReturns = await SalesReturn.findAll({
      where: { saleItemId: saleItem.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const previouslyReturned = previousReturns.reduce(
      (total, existing) => total + Number(existing.quantity),
      0
    );
    const previouslyCredited = previousReturns.reduce(
      (total, existing) => total + Number(existing.returnedAmount || 0),
      0
    );
    const soldQuantity = Number(saleItem.quantity);
    const remainingReturnable = getRemainingReturnableQuantity(
      soldQuantity,
      previouslyReturned
    );
    let remainingAfterReturn;
    try {
      remainingAfterReturn = validateReturnQuantity(
        soldQuantity,
        previouslyReturned,
        normalizedQuantity.quantity
      );
    } catch (validationError) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: validationError.message,
        remainingReturnableQuantity: remainingReturnable,
        quantityUnit: normalizedQuantity.quantityUnit,
      });
    }

    const returnRecord = await SalesReturn.create(
      {
        saleId: sale.id,
        saleItemId: saleItem.id,
        productId: product.id,
        productBatchId: saleItem.productBatchId || null,
        quantity: normalizedQuantity.quantity,
        quantityUnit: normalizedQuantity.quantityUnit,
        returnCondition,
        returnedAmount: calculateReturnCreditAmount(
          saleItem,
          normalizedQuantity.quantity,
          previouslyCredited
        ),
        idempotencyKey,
        reason: req.body.reason || null,
      },
      { transaction }
    );
    let updatedStock = Number(product.stockQuantity || 0);
    if (returnCondition === 'GOOD') {
      updatedStock += normalizedQuantity.quantity;
      if (saleItem.productBatchId) {
        await product.update({ stockQuantity: updatedStock }, { transaction });
        await restoreBatchStock({
          batchId: saleItem.productBatchId,
          quantity: normalizedQuantity.quantity,
          transaction,
        });
      } else {
        await restoreUnbatchedProductStock({
          product,
          quantity: normalizedQuantity.quantity,
          unitCost: Number(saleItem.purchaseCost ?? product.purchasePrice ?? 0),
          transaction,
        });
      }
    }
    await StockMovement.create(
      {
        warehouseId: sale.warehouseId || 1,
        productId: product.id,
        batchId: saleItem.productBatchId || null,
        movementType: 'RETURN',
        quantity: normalizedQuantity.quantity,
        quantityUnit: normalizedQuantity.quantityUnit,
        referenceType: 'SalesReturn',
        referenceId: String(returnRecord.id),
        notes: `${returnCondition} return: ${String(
          req.body.reason || `Return for invoice ${sale.invoiceNumber}`
        ).slice(0, 220)}`,
        performedBy: req.user?.id || null,
      },
      { transaction }
    );
    await reverseLoyaltyForSaleReturn({
      sale,
      returnRecord,
      transaction,
      performedBy: req.user?.id,
    });

    if (sale.bill_type === 'B2C' && sale.shiftId) {
      await recalculatePosShiftTotals(sale.shiftId, transaction);
    }

    await transaction.commit();
    return res.status(201).json({
      success: true,
      data: {
        ...returnRecord.toJSON(),
        remainingReturnableQuantity: remainingAfterReturn,
        stockQuantity: updatedStock,
        replayed: false,
      },
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      const existingReturn = await SalesReturn.findOne({ where: { idempotencyKey } });
      if (
        existingReturn &&
        Number(existingReturn.saleId) === Number(req.params.saleId) &&
        Number(existingReturn.saleItemId) === Number(req.body.saleItemId) &&
        normalizeSalesReturnCondition(existingReturn.returnCondition) ===
          normalizeSalesReturnCondition(req.body.returnCondition ?? req.body.condition)
      ) {
        return res.status(200).json({
          success: true,
          data: { ...existingReturn.toJSON(), replayed: true },
        });
      }
    }

    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  getInvoices,
  getInvoicesByDate,
  getInvoiceById,
  updatePaymentStatusById,
  getPaymentHistoryBySale,
  previewNextInvoiceNumber,
  getReturnableSaleByInvoiceNumber,
  getSalesReturnCredit,
  createSalesReturnCredit,
  createInvoice,
  deleteInvoice,
  updateInvoiceById,
  createSalesReturn,
};