const sequelize = require('../config/sqldb');
const PurchaseItem = require('../mysql-models/Purchase-Items');
const SalesItem = require('../mysql-models/Sales-Items');
const SalesReturn = require('../mysql-models/SalesReturn');
const Purchase = require('../mysql-models/PurchaseBill');
const Product = require('../mysql-models/Product');
const Party = require('../mysql-models/Party');
const Company = require('../mysql-models/Company');
const CompanyFinancials = require('../mysql-models/Company_Financials');
const StockMovement = require('../mysql-models/StockMovement');
const ProductBatch = require('../mysql-models/ProductBatch');
const { Op } = require('sequelize');
const { dateOnlyRange, indiaMonthRange } = require('../utils/inclusiveDateRange');
const {
  calculateInvoiceItem,
  calculateInvoiceTotals,
} = require('../utils/productMargin');
const { normalizeProductQuantity } = require('../utils/productQuantity');
const { receivePurchaseBatch } = require('../utils/inventoryBatches');
const { calculateBatchUnitCost } = require('../utils/inventoryValuation');
const {
  resolvePurchaseTaxType,
  splitTax,
  stateCodeFromGstin,
  validatePurchaseInvoiceType,
} = require('../utils/gstInvoiceTax');
const {
  STATE_NAMES,
  capturePurchaseGstSnapshot,
  stateCode,
} = require('../utils/gstReportSnapshots');

const resolvePurchaseTaxContext = async ({
  partyId,
  companyId,
  invoiceType,
  taxTypeOverride,
  previousTaxType,
  placeOfSupplyStateCode,
  partySnapshot,
  transaction,
}) => {
  const currentParty = await Party.findOne({
    where: { id: partyId, companyId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!currentParty) throw Object.assign(new Error('Selected party not found'), { status: 400 });
  const party = partySnapshot || currentParty;
  validatePurchaseInvoiceType(party, invoiceType);

  if (invoiceType !== 'GST_INVOICE') {
    return { taxType: null, party };
  }

  const company = await Company.findByPk(companyId, { transaction });
  if (!company) throw Object.assign(new Error('Company not found'), { status: 400 });
  const companyFinancials = await CompanyFinancials.findOne({
    where: { companyId },
    transaction,
  });
  const taxType = resolvePurchaseTaxType({
    partyGstin: party.GST,
    companyGstin: companyFinancials?.gstin,
    companyStateCode: company.state_code,
    override: taxTypeOverride || previousTaxType,
    placeOfSupplyStateCode,
  });
  return { taxType, party };
};

const purchaseItemPricing = (item, product, invoiceType) =>
  calculateInvoiceItem(
    item,
    product,
    'purchase',
    { disableTax: invoiceType !== 'GST_INVOICE' }
  );

const resolvePlaceOfSupplyStateCode = ({
  submittedState,
  companyStateCode,
  supplierStateCode,
  existingStateCode,
  allowSupplierDefault = false,
  isSystemAdministrator = false,
}) => {
  const rawState =
    submittedState ??
    existingStateCode ??
    supplierStateCode ??
    companyStateCode;
  const code = stateCode(rawState);
  if (rawState && !code) {
    throw Object.assign(new Error('Select a valid Place of Supply state'), { status: 400 });
  }
  const savedCode = stateCode(existingStateCode);
  const defaultCode =
    (allowSupplierDefault && stateCode(supplierStateCode)) ||
    savedCode ||
    stateCode(supplierStateCode) ||
    stateCode(companyStateCode);
  if (
    submittedState !== undefined &&
    code &&
    code !== defaultCode &&
    !isSystemAdministrator
  ) {
    throw Object.assign(
      new Error('Only an owner or admin can override Place of Supply'),
      { status: 403 }
    );
  }
  if (code && !STATE_NAMES[code]) {
    throw Object.assign(new Error('Select a supported Place of Supply state'), { status: 400 });
  }
  return code;
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Public
const getPurchase = async (req, res) => {
  try {
    const invoices = await Purchase.findAll({
      where: { companyId: req.user.companyId },
      include: [
        {
          model: Party,
          where: { companyId: req.user.companyId },
          required: false,
          attributes: ['name', 'email', 'phone'],
        },
        {
          model: PurchaseItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'HSNCode', 'unitType', 'baseUnit'],
            },
            { model: ProductBatch, attributes: ['id', 'salePrice'] },
          ],
        },
      ],
      order: [["purchaseDate", "DESC"], ["id", "DESC"]],
    });

    return res.status(200).json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Public
const getPurchaseInvoicesByDate = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;

    const whereClause = { companyId: req.user.companyId };
    const now = new Date();

    if (startDate || endDate) {
      const range = dateOnlyRange(startDate, endDate);
      whereClause.purchaseDate = {};
      if (range.start) whereClause.purchaseDate[Op.gte] = range.start;
      if (range.endExclusive) whereClause.purchaseDate[Op.lt] = range.endExclusive;
      if (range.endInclusive) whereClause.purchaseDate[Op.lte] = range.endInclusive;
    } else if (filter === 'thisMonth') {
      const { start, endExclusive } = indiaMonthRange(now);

      whereClause.purchaseDate = {
        [Op.gte]: start,
        [Op.lt]: endExclusive,
      };
    } else if (filter === 'thisYear') {
      whereClause.purchaseDate = {
        [Op.gte]: `${now.getFullYear()}-01-01 00:00:00`,
      };
    } else if (filter === 'lastYear') {
      whereClause.purchaseDate = {
        [Op.gte]: `${now.getFullYear() - 1}-01-01 00:00:00`,
        [Op.lt]: `${now.getFullYear()}-01-01 00:00:00`,
      };
    } else {
      const { start, endExclusive } = indiaMonthRange(now);

      whereClause.purchaseDate = {
        [Op.gte]: start,
        [Op.lt]: endExclusive,
      };
    }

    const invoices = await Purchase.findAll({
      where: whereClause, // ✅ ADD THIS
      attributes: [
        'purchaseDate',
        'id',
        'partyId',
        'global_discount_percentage',
        'global_discount_amount',
        'tax',
        'baseRate',
        'invoiceNumber',
        'totalAmount',
        'amountPaid',
        'paymentStatus',
        [sequelize.literal(`'Purchase'`), 'type'],
      ],
      include: [
        {
          model: Party,
          where: { companyId: req.user.companyId },
          required: false,
          attributes: ['id', 'name', 'email', 'phone', 'address', 'GST', 'gstRegistrationType'],
        },
        {
          model: PurchaseItem,
          include: [
            {
              model: Product,
              attributes: [
                'id',
                'name',
                'HSNCode',
                'unitType',
                'baseUnit',
                'purchasePriceType',
                'taxRate',
              ],
            },
            {
              model: ProductBatch,
              attributes: [
                'id',
                'batchNumber',
                'mfgDate',
                'expiryDate',
                'purchasePrice',
                'mrp',
                'salePrice',
                'discount',
                'gstPercentage',
              ],
            },
          ],
        },
      ],
      order: [["purchaseDate", "DESC"], ["id", "DESC"]],
    });

    return res.status(200).json(invoices);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Get single Purchase
// @route   GET /api/purchase/:id
// @access  Public
const getPurchaseById = async (req, res) => {
  try {
    const invoice = await Purchase.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: [
        {
          model: Party,
          where: { companyId: req.user.companyId },
          required: false,
          attributes: [
            'id',
            'name',
            'email',
            'phone',
            'address',
            'GST',
            'gstRegistrationType',
          ],
        },
        {
          model: PurchaseItem,
          include: [
            {
              model: Product,
              attributes: [
                'id',
                'name',
                'HSNCode',
                'unit',
                'unitType',
                'baseUnit',
                'purchasePriceType',
                'taxRate',
              ],
            },
            {
              model: ProductBatch,
              attributes: [
                'id',
                'batchNumber',
                'mfgDate',
                'expiryDate',
                'purchasePrice',
                'mrp',
                'salePrice',
                'discount',
                'gstPercentage',
                'totalReceivedQuantity',
                'freeQuantity',
                'availableQuantity',
              ],
            },
          ],
        },
      ],
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Purchase not found' });
    }
    return res.status(200).json(invoice);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @access  Public
// @desc    Update invoice
// @route   PUT /api/invoices/:id
// @desc    Record a payment against a purchase bill (supports partial payments)
// @route   PUT /api/purchases/:id/payment-status
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

    const invoice = await Purchase.findOne({
      where: { id, companyId: req.user.companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase bill not found' });
    }

    const totalAmount = Number(invoice.totalAmount || 0);
    const alreadyPaid = Number(invoice.amountPaid || 0);
    const PurchaseReturn = require('../mysql-models/PurchaseReturn');
    const appliedToPayable = Number(await PurchaseReturn.sum('appliedToPayable', {
      where: { purchaseId: invoice.id, status: 'ACTIVE' },
      transaction,
    }) || 0);
    const appliedSupplierCredits = Number(
      await require('../mysql-models/PurchaseReturnCreditApplication').sum('amount', {
        where: { purchaseId: invoice.id, status: 'ACTIVE' },
        include: [{
          model: PurchaseReturn,
          as: 'purchaseReturn',
          attributes: [],
          where: { status: 'ACTIVE' },
          required: true,
        }],
        transaction,
      }) || 0
    );
    const newAmountPaid = alreadyPaid + paymentAmount;

    const effectivePaid = invoice.paymentStatus === 'Paid' && alreadyPaid === 0
      ? totalAmount
      : alreadyPaid;
    if (effectivePaid + paymentAmount + appliedToPayable + appliedSupplierCredits > totalAmount) {
      await transaction.rollback();
      return res.status(400).json({
        message: `Payment exceeds balance due. Balance due is ${Math.max(0, totalAmount - effectivePaid - appliedToPayable - appliedSupplierCredits).toFixed(2)}`,
      });
    }

    // status is always derived from actual payments — never trusted from the client
    let newStatus;
    if (newAmountPaid <= 0 && appliedToPayable + appliedSupplierCredits <= 0) {
      newStatus = 'Unpaid';
    } else if (newAmountPaid + appliedToPayable + appliedSupplierCredits < totalAmount) {
      newStatus = 'Partial';
    } else {
      newStatus = 'Paid';
    }

    await invoice.update(
      { amountPaid: newAmountPaid, paymentStatus: newStatus },
      { transaction }
    );

    // Record PaymentOut history — this is the ledger; invoice fields are just a cached summary of it
    const PaymentOut = require('../mysql-models/PaymentOut');
    await PaymentOut.create(
      {
        purchaseId: invoice.id,
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
        balanceDue: Math.max(
          0,
          totalAmount - newAmountPaid - appliedToPayable - appliedSupplierCredits
        ),
      },
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Full payment history for one purchase bill (running balance)
// @route   GET /api/purchases/:id/payments
const getPaymentHistoryByPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const PaymentOut = require('../mysql-models/PaymentOut');

    const invoice = await Purchase.findOne({
      where: { id, companyId: req.user.companyId },
      attributes: ['id', 'totalAmount', 'amountPaid', 'paymentStatus'],
    });
    if (!invoice) {
      return res.status(404).json({ message: 'Purchase bill not found' });
    }

    const payments = await PaymentOut.findAll({
      where: { purchaseId: id },
      order: [['paymentDate', 'ASC']],
    });
    const PurchaseReturn = require('../mysql-models/PurchaseReturn');
    const appliedToPayable = Number(await PurchaseReturn.sum('appliedToPayable', {
      where: { purchaseId: id, status: 'ACTIVE' },
    }) || 0);
    const appliedSupplierCredits = Number(
      await require('../mysql-models/PurchaseReturnCreditApplication').sum('amount', {
        where: { purchaseId: id, status: 'ACTIVE' },
        include: [{
          model: PurchaseReturn,
          as: 'purchaseReturn',
          attributes: [],
          where: { status: 'ACTIVE' },
          required: true,
        }],
      }) || 0
    );

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
        balanceDue: Math.max(
          0,
          Number(invoice.totalAmount) -
            (invoice.paymentStatus === 'Paid' && Number(invoice.amountPaid || 0) === 0
              ? Number(invoice.totalAmount)
              : Number(invoice.amountPaid)) -
            appliedToPayable -
            appliedSupplierCredits
        ),
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
const createPurchase = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      invoiceNumber,
      partyId,
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate,
      tax = 0,
      totalAmount,
      paymentStatus,
      purchaseDate,
      po_number,
      eway_bill,
      items,
      companyId: requestedCompanyId,
      invoiceType,
      taxTypeOverride,
      placeOfSupplyStateCode,
      reverseCharge = false,
      reverseChargeAmount = 0,
      itcEligible = false,
    } = req.body;

    if (!items || items.length === 0) {
      throw new Error('No purchase items');
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one purchase item is required' });
    }
    const companyId = req.loyaltyUser?.companyId || requestedCompanyId;
    if (
      req.loyaltyUser &&
      requestedCompanyId !== undefined &&
      Number(requestedCompanyId) !== Number(req.loyaltyUser.companyId)
    ) {
      throw Object.assign(
        new Error('Purchase bills can only be created for the authenticated company'),
        { status: 403 }
      );
    }

    const reverseChargeEnabled =
      reverseCharge === true || reverseCharge === 1 ||
      reverseCharge === '1' || reverseCharge === 'true';
    const eligibleForItc =
      itcEligible === true || itcEligible === 1 ||
      itcEligible === '1' || itcEligible === 'true';
    const rcmAmount = Number(reverseChargeAmount || 0);
    if (!Number.isFinite(rcmAmount) || rcmAmount < 0) {
      throw Object.assign(new Error('Reverse-charge amount must be a non-negative number'), { status: 400 });
    }
    if (!reverseChargeEnabled && rcmAmount > 0) {
      throw Object.assign(new Error('Enable reverse charge before entering its amount'), { status: 400 });
    }
    if (eligibleForItc && invoiceType !== 'GST_INVOICE') {
      throw Object.assign(new Error('ITC can only be marked eligible for a GST invoice'), { status: 400 });
    }
    const company = await Company.findByPk(companyId, { transaction });
    if (!company) {
      throw Object.assign(new Error('Company not found'), { status: 400 });
    }
    const selectedParty = await Party.findOne({
      where: { id: partyId, companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const placeOfSupplyCode = resolvePlaceOfSupplyStateCode({
      submittedState: placeOfSupplyStateCode,
      companyStateCode: company.state_code,
      supplierStateCode: stateCodeFromGstin(selectedParty?.GST),
      isSystemAdministrator: req.isSystemAdministrator,
    });
    const { taxType, party } = await resolvePurchaseTaxContext({
      partyId,
      companyId,
      invoiceType,
      taxTypeOverride,
      placeOfSupplyStateCode: placeOfSupplyCode,
      transaction,
    });
    const gstSnapshot = capturePurchaseGstSnapshot({
      companyId,
      companyStateCode: company.state_code,
      party,
      placeOfSupplyStateCode: placeOfSupplyCode,
    });

    const invoice = await Purchase.create(
      {
        invoiceNumber,
        partyId,
        companyId,
      ...gstSnapshot,
        invoiceType,
        taxType,
        reverseCharge: reverseChargeEnabled,
        reverseChargeAmount: reverseChargeEnabled ? rcmAmount : 0,
        itcEligible: eligibleForItc,
        global_discount_percentage,
        global_discount_amount,
        baseRate,
        tax,
        totalAmount,
        paymentStatus,
        purchaseDate,
        po_number,
        eway_bill,
        warehouseId: req.body.warehouseId || 1,
      },
      { transaction }
    );

    const lineItems = [];
    for (const [index, item] of items.entries()) {
      const product = await Product.findByPk(item.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      const paidQuantity = normalizeProductQuantity({
        ...item,
        quantity: item.paidQuantity ?? item.quantity,
      }, product);
      const freeQuantity = Number(item.freeQuantity || 0) > 0
        ? normalizeProductQuantity({
          ...item,
          quantity: item.freeQuantity,
        }, product).quantity
        : 0;
      const totalQuantity = paidQuantity.quantity + freeQuantity;
      const normalizedQuantity = {
        quantity: paidQuantity.quantity,
        quantityUnit: paidQuantity.quantityUnit,
      };
      const pricing = purchaseItemPricing(
        {
          ...item,
          quantity: paidQuantity.quantity,
          paidQuantity: paidQuantity.quantity,
          freeQuantity,
          totalQuantity,
        },
        product,
        invoiceType
      );
      const batch = await receivePurchaseBatch({
        product,
        batchNumber: item.batchNumber || `PUR-${invoice.id}-${index + 1}`,
        mfgDate: item.mfgDate,
        expiryDate: item.expiryDate,
        paidQuantity: paidQuantity.quantity,
        freeQuantity,
        purchasePrice: pricing.price,
        mrp: item.mrp ?? item.MRP ?? product.MRP,
        salePrice: item.salePrice ?? item.salesPrice ?? product.salesPrice,
        gstPercentage: product.taxRate,
        companyId,
        transaction,
      });
      await product.increment('stockQuantity', { by: totalQuantity, transaction });
      await StockMovement.create(
        {
          warehouseId: req.body.warehouseId || 1,
          productId: product.id,
          batchId: batch.id,
          movementType: 'PURCHASE',
          quantity: totalQuantity,
          quantityUnit: normalizedQuantity.quantityUnit,
          referenceType: 'PurchaseBill',
          referenceId: String(invoice.id),
          notes: `Purchase Bill #${invoiceNumber}`,
        },
        { transaction }
      );
      lineItems.push({ item, product, pricing, paidQuantity, freeQuantity, totalQuantity, batch });
    }

    const totals = calculateInvoiceTotals(
      lineItems.map(({ pricing }) => pricing),
      global_discount_percentage,
      global_discount_amount,
      { discountPercentageOnBase: true }
    );
    const processedItems = lineItems.map(({ item, product, pricing, paidQuantity, freeQuantity, totalQuantity, batch }, index) => {
      const calculated = totals.items[index];
      return {
        purchaseId: invoice.id,
        productId: product.id,
        productName: item.productName || product.name,
        quantity: paidQuantity.quantity,
        paidQuantity: paidQuantity.quantity,
        freeQuantity,
        totalQuantity,
        quantityUnit: paidQuantity.quantityUnit,
        productBatchId: batch.id,
        priceType: invoiceType === 'GST_INVOICE'
          ? item.priceType || product.purchasePriceType || 'WITHOUT_GST'
          : 'WITHOUT_GST',
        ...calculated,
        productGstRate: Number(product.taxRate) || 0,
        ...splitTax(calculated.taxAmount, calculated.taxPercentage, taxType || 'CGST_SGST'),
        cessAmount: null,
        discountPercentage: pricing.discountPercentage,
        discountAmount: pricing.discountAmount,
        batchNo: batch.batchNumber,
        serialNo: item.serialNumber || null,
        expiryDate: item.expiryDate || null,
        sku: item.sku || null,
        hsncode: item.hsnCode || null,
      };
    });

    // Insert all items at once
    await PurchaseItem.bulkCreate(processedItems, { transaction });
    for (const [index, { batch }] of lineItems.entries()) {
      const inventoryUnitCost = calculateBatchUnitCost([{
        ...processedItems[index],
        Purchase: { itcEligible: eligibleForItc },
      }]);
      if (inventoryUnitCost !== null) {
        await batch.update({ inventoryUnitCost }, { transaction });
      }
    }
    await invoice.update(
      {
        baseRate: totals.baseRate,
        tax: totals.tax,
        totalAmount: totals.totalAmount,
        global_discount_amount: totals.globalDiscountAmount,
        itcEligibleAmount: eligibleForItc ? totals.tax : 0,
        itcIneligibleAmount: eligibleForItc ? 0 : totals.tax,
      },
      { transaction }
    );
    await transaction.commit();

    // const calculatedTotalAmount = subtotal + tax - discount;

    return res.status(201).json({
      ...invoice.toJSON(),
      items: processedItems,
    });
  } catch (error) {
    await transaction.rollback();

    return res.status(
      error.status || (error.code === 'INVALID_PRODUCT_QUANTITY' ? 400 : 500)
    ).json({ message: error.message });
  }
};

// @access  Public
// @desc    Update Purchase
// @route   PUT /api/purchase/:id
const updatePurchaseById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const {
      invoiceNumber,
      partyId,
      global_discount_percentage = 0,
      global_discount_amount = 0,
      baseRate,
      tax = 0,
      totalAmount,
      paymentStatus,
      purchaseDate,
      po_number,
      eway_bill,
      items,
      invoiceType: requestedInvoiceType,
      taxTypeOverride,
      placeOfSupplyStateCode,
      reverseCharge,
      reverseChargeAmount,
      itcEligible,
    } = req.body;

    const invoice = await Purchase.findOne({
      where: { id, companyId: req.user.companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase not found' });
    }
    const PurchaseReturn = require('../mysql-models/PurchaseReturn');
    if (await PurchaseReturn.count({ where: { purchaseId: invoice.id }, transaction })) {
      throw Object.assign(
        new Error('A purchase invoice with linked debit notes cannot be edited'),
        { status: 409 }
      );
    }
    const companyId =
      req.loyaltyUser?.companyId || req.body.companyId || invoice.companyId;
    if (
      req.loyaltyUser &&
      req.body.companyId !== undefined &&
      Number(req.body.companyId) !== Number(req.loyaltyUser.companyId)
    ) {
      throw Object.assign(
        new Error('Purchase bills can only be updated for the authenticated company'),
        { status: 403 }
      );
    }
    if (
      req.loyaltyUser &&
      Number(invoice.companyId) !== Number(req.loyaltyUser.companyId)
    ) {
      throw Object.assign(
        new Error('Purchase bill belongs to another company or has no company assignment'),
        { status: 403 }
      );
    }

    if (!items || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'No Purchase items' });
    }

    const invoiceType = requestedInvoiceType || invoice.invoiceType;
    if (!invoiceType) {
      throw Object.assign(new Error('Select a purchase invoice type before saving this bill'), { status: 400 });
    }
    const reverseChargeEnabled =
      reverseCharge === undefined
        ? Boolean(invoice.reverseCharge)
        : reverseCharge === true || reverseCharge === 1 ||
          reverseCharge === '1' || reverseCharge === 'true';
    const rcmAmount = Number(
      reverseChargeAmount === undefined
        ? invoice.reverseChargeAmount || 0
        : reverseChargeAmount || 0
    );
    const eligibleForItc =
      itcEligible === undefined
        ? Boolean(invoice.itcEligible)
        : itcEligible === true || itcEligible === 1 ||
          itcEligible === '1' || itcEligible === 'true';
    if (!Number.isFinite(rcmAmount) || rcmAmount < 0) {
      throw Object.assign(new Error('Reverse-charge amount must be a non-negative number'), { status: 400 });
    }
    if (!reverseChargeEnabled && rcmAmount > 0) {
      throw Object.assign(new Error('Enable reverse charge before entering its amount'), { status: 400 });
    }
    if (eligibleForItc && invoiceType !== 'GST_INVOICE') {
      throw Object.assign(new Error('ITC can only be marked eligible for a GST invoice'), { status: 400 });
    }
    const company = await Company.findByPk(companyId, { transaction });
    if (!company) {
      throw Object.assign(new Error('Company not found'), { status: 400 });
    }
    const effectivePartyId = partyId || invoice.partyId;
    const historicalPartySnapshot =
      Number(effectivePartyId) === Number(invoice.partyId) &&
      invoice.partyRegistrationTypeSnapshot
        ? {
            name: invoice.partyNameSnapshot,
            GST: invoice.partyGstinSnapshot,
            gstRegistrationType: invoice.partyRegistrationTypeSnapshot,
          }
        : null;
    const placeOfSupplyParty =
      historicalPartySnapshot ||
      await Party.findOne({
          where: { id: effectivePartyId, companyId },
          transaction,
          lock: transaction.LOCK.UPDATE,
      });
    const placeOfSupplyCode = resolvePlaceOfSupplyStateCode({
      submittedState: placeOfSupplyStateCode,
      companyStateCode: company.state_code,
      supplierStateCode: stateCodeFromGstin(placeOfSupplyParty?.GST),
      existingStateCode: invoice.placeOfSupplyStateCodeSnapshot,
      allowSupplierDefault:
        Number(effectivePartyId) !== Number(invoice.partyId),
      isSystemAdministrator: req.isSystemAdministrator,
    });
    const { taxType, party } = await resolvePurchaseTaxContext({
      partyId: effectivePartyId,
      companyId,
      invoiceType,
      taxTypeOverride,
      previousTaxType: invoice.taxType,
      placeOfSupplyStateCode: placeOfSupplyCode,
      partySnapshot: historicalPartySnapshot,
      transaction,
    });
    const gstSnapshot = capturePurchaseGstSnapshot({
      companyId,
      companyStateCode: company.state_code,
      party,
      partySnapshot: historicalPartySnapshot,
      placeOfSupplyStateCode: placeOfSupplyCode,
    });

    // 1️⃣ Get existing items
    const existingItems = await PurchaseItem.findAll({
      where: { purchaseId: id },
      transaction,
    });
    const previousBatchQuantities = new Map();
    const nextBatchQuantities = new Map();
    const batchesById = new Map();
    const createdBatchIds = new Set();
    const originalPurchaseBatchIds = new Set(
      existingItems.map((item) => Number(item.productBatchId)).filter(Boolean)
    );

    // 2️⃣ Restore stock from old items
    for (const item of existingItems) {
      const product = await Product.findByPk(item.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (product) {
        const receivedQuantity = Number(
          item.totalQuantity ??
          (Number(item.quantity || 0) + Number(item.freeQuantity || 0))
        );
        if (item.productBatchId) {
          const batchId = Number(item.productBatchId);
          const previous = previousBatchQuantities.get(batchId) || {
            quantity: 0,
            freeQuantity: 0,
          };
          previous.quantity += receivedQuantity;
          previous.freeQuantity += Number(item.freeQuantity || 0);
          previousBatchQuantities.set(batchId, previous);
        }
        const stock = Number(product.stockQuantity || 0) - receivedQuantity;
        await product.update(
          {
            stockQuantity: stock,
          },
          { transaction }
        );
        if (item.quantityUnit === 'KG' || product.unitType === 'WEIGHT') {
          await StockMovement.create(
            {
              warehouseId: invoice.warehouseId || 1,
              productId: product.id,
              movementType: 'ADJUSTMENT',
              quantity: -Number(item.quantity || 0),
              quantityUnit: item.quantityUnit || 'KG',
              referenceType: 'PurchaseBill',
              referenceId: invoice.invoiceNumber,
              notes: `Purchase Bill edit reversal #${invoice.invoiceNumber}`,
            },
            { transaction }
          );
        }
      }
    }

    // 3️⃣ Delete old items
    await PurchaseItem.destroy({
      where: { purchaseId: id },
      transaction,
    });

    // 4️⃣ Insert updated items + reduce stock
    const lineItems = [];

    for (const [index, item] of items.entries()) {
      const product = await Product.findByPk(item.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const paidQuantity = normalizeProductQuantity({
        ...item,
        quantity: item.paidQuantity ?? item.quantity,
      }, product);
      const freeQuantity = Number(item.freeQuantity || 0) > 0
        ? normalizeProductQuantity({
          ...item,
          quantity: item.freeQuantity,
        }, product).quantity
        : 0;
      const totalQuantity = paidQuantity.quantity + freeQuantity;
      const pricing = purchaseItemPricing(
        {
          ...item,
          quantity: paidQuantity.quantity,
          paidQuantity: paidQuantity.quantity,
          freeQuantity,
          totalQuantity,
        },
        product,
        invoiceType
      );
      let batch;
      if (item.productBatchId) {
        if (!originalPurchaseBatchIds.has(Number(item.productBatchId))) {
          throw Object.assign(
            new Error('A purchase line can only update its originally linked batch'),
            { status: 400 }
          );
        }
        batch = await ProductBatch.findOne({
          where: { id: item.productBatchId, productId: product.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!batch) {
          throw new Error(`Purchase batch not found: ${item.productBatchId}`);
        }
      } else {
        batch = await receivePurchaseBatch({
          product,
          batchNumber: item.batchNumber || `PUR-${invoice.id}-${index + 1}`,
          mfgDate: item.mfgDate,
          expiryDate: item.expiryDate,
          paidQuantity: paidQuantity.quantity,
          freeQuantity,
          purchasePrice: pricing.price,
          mrp: item.mrp ?? item.MRP ?? product.MRP,
          salePrice: item.salePrice ?? item.salesPrice ?? product.salesPrice,
          gstPercentage: product.taxRate,
          companyId,
          transaction,
        });
        createdBatchIds.add(Number(batch.id));
      }

      const batchId = Number(batch.id);
      batchesById.set(batchId, batch);
      const next = nextBatchQuantities.get(batchId) || {
        quantity: 0,
        freeQuantity: 0,
      };
      next.quantity += totalQuantity;
      next.freeQuantity += freeQuantity;
      nextBatchQuantities.set(batchId, next);

      const batchUpdates = {
        mrp: Number(item.mrp ?? item.MRP ?? batch.mrp ?? product.MRP) || 0,
        gstPercentage: Number(product.taxRate) || 0,
      };
      if (item.salePrice !== undefined || item.salesPrice !== undefined) {
        const salePrice = Number(item.salePrice ?? item.salesPrice);
        if (!Number.isFinite(salePrice) || salePrice < 0) {
          throw new Error('Sales price must be a finite non-negative number');
        }
        batchUpdates.salePrice = salePrice;
      }
      const purchasePriceValue = item.price ?? item.purchasePrice;
      if (purchasePriceValue !== undefined) {
        const purchasePrice = Number(purchasePriceValue);
        if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
          throw new Error('Purchase price must be a finite non-negative number');
        }
        batchUpdates.purchasePrice = purchasePrice;
      }
      if (item.batchNumber) batchUpdates.batchNumber = item.batchNumber;
      if (item.mfgDate !== undefined) batchUpdates.mfgDate = item.mfgDate || null;
      if (item.expiryDate !== undefined) batchUpdates.expiryDate = item.expiryDate || null;
      await batch.update(batchUpdates, { transaction });

      lineItems.push({
        item,
        product,
        pricing,
        paidQuantity,
        freeQuantity,
        totalQuantity,
        batch,
      });

      // if (product.stockQuantity > item.quantity) {
      //   throw new Error(`Insufficient stock for ${product.name}`);
      // }
      const stock = Number(product.stockQuantity || 0) + totalQuantity;
      // reduce stock again
      await product.update(
        {
          stockQuantity: stock,
        },
        { transaction }
      );
      if (product.unitType === 'WEIGHT') {
        await StockMovement.create(
          {
            warehouseId: invoice.warehouseId || 1,
            productId: product.id,
            movementType: 'PURCHASE',
            quantity: totalQuantity,
            quantityUnit: paidQuantity.quantityUnit,
            referenceType: 'PurchaseBill',
            referenceId: invoice.invoiceNumber,
            notes: `Purchase Bill #${invoice.invoiceNumber}`,
          },
          { transaction }
        );
      }

    }

    for (const batchId of new Set([
      ...previousBatchQuantities.keys(),
      ...nextBatchQuantities.keys(),
    ])) {
      if (createdBatchIds.has(batchId)) continue;
      const batch = batchesById.get(batchId) || await ProductBatch.findByPk(batchId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!batch) {
        throw new Error(`Purchase batch not found: ${batchId}`);
      }
      const previous = previousBatchQuantities.get(batchId) || {
        quantity: 0,
        freeQuantity: 0,
      };
      const next = nextBatchQuantities.get(batchId) || {
        quantity: 0,
        freeQuantity: 0,
      };
      const quantityDelta = next.quantity - previous.quantity;
      const availableQuantity = Number(batch.availableQuantity || 0) + quantityDelta;
      const totalReceivedQuantity =
        Number(batch.totalReceivedQuantity ?? batch.quantity ?? 0) + quantityDelta;
      const freeQuantity =
        Number(batch.freeQuantity || 0) +
        next.freeQuantity -
        previous.freeQuantity;
      if (availableQuantity < -0.001 || totalReceivedQuantity < -0.001 || freeQuantity < -0.001) {
        throw new Error(
          `Cannot reduce purchase quantity in batch ${batch.batchNumber}; some stock is no longer available`,
        );
      }
      await batch.update(
        {
          availableQuantity: Math.max(0, availableQuantity),
          quantity: Math.max(0, availableQuantity),
          totalReceivedQuantity: Math.max(0, totalReceivedQuantity),
          freeQuantity: Math.max(0, freeQuantity),
        },
        { transaction },
      );
    }

    const totals = calculateInvoiceTotals(
      lineItems.map(({ pricing }) => pricing),
      global_discount_percentage,
      global_discount_amount,
      { discountPercentageOnBase: true }
    );
    const paidAmount = Number(invoice.amountPaid || 0);
    const resolvedPaymentStatus =
      invoice.paymentStatus === 'Cancelled'
        ? 'Cancelled'
        : paidAmount >= totals.totalAmount && paidAmount > 0
          ? 'Paid'
          : paidAmount > 0
            ? 'Partial'
            : paymentStatus || invoice.paymentStatus || 'Unpaid';
    const processedItems = lineItems.map(({
      item,
      product,
      pricing,
      paidQuantity,
      freeQuantity,
      totalQuantity,
      batch,
    }, index) => {
      const calculated = totals.items[index];
      return {
        purchaseId: id,
        productId: product.id,
        productName: item.productName || product.name,
        quantity: paidQuantity.quantity,
        paidQuantity: paidQuantity.quantity,
        freeQuantity,
        totalQuantity,
        quantityUnit: paidQuantity.quantityUnit,
        priceType: invoiceType === 'GST_INVOICE'
          ? item.priceType || product.purchasePriceType || 'WITHOUT_GST'
          : 'WITHOUT_GST',
        ...calculated,
        productGstRate: Number(product.taxRate) || 0,
        ...splitTax(calculated.taxAmount, calculated.taxPercentage, taxType || 'CGST_SGST'),
        cessAmount: null,
        discountPercentage: pricing.discountPercentage,
        discountAmount: pricing.discountAmount,
        batchNo: batch.batchNumber,
        productBatchId: batch.id,
        serialNo: item.serialNumber || null,
        expiryDate: item.expiryDate || null,
        sku: item.sku || null,
        hsncode: item.hsnCode || null,
      };
    });

    await PurchaseItem.bulkCreate(processedItems, { transaction });
    for (const [index, { batch }] of lineItems.entries()) {
      const inventoryUnitCost = calculateBatchUnitCost([{
        ...processedItems[index],
        Purchase: { itcEligible: eligibleForItc },
      }]);
      if (inventoryUnitCost !== null) {
        await batch.update({ inventoryUnitCost }, { transaction });
      }
    }

    // 5️⃣ Update invoice
    await invoice.update(
      {
        invoiceNumber,
        partyId: effectivePartyId,
        ...gstSnapshot,
        global_discount_percentage,
        baseRate: totals.baseRate,
        tax: totals.tax,
        totalAmount: totals.totalAmount,
        global_discount_amount: totals.globalDiscountAmount,
        paymentStatus: resolvedPaymentStatus,
        purchaseDate,
        po_number,
        eway_bill,
        invoiceType,
        taxType,
        reverseCharge: reverseChargeEnabled,
        reverseChargeAmount: reverseChargeEnabled ? rcmAmount : 0,
        itcEligible: eligibleForItc,
        itcEligibleAmount: eligibleForItc ? totals.tax : 0,
        itcIneligibleAmount: eligibleForItc ? 0 : totals.tax,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({ message: 'Purchase updated successfully' });
  } catch (error) {
    await transaction.rollback();
    return res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Create new invoice
// @route   POST /api/invoices
// @access  Public
const deletePurchase = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const purchaseInvoice = await Purchase.findOne({
      where: { id, companyId: req.user.companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!purchaseInvoice) {
      throw Object.assign(new Error('Purchase invoice not found'), { status: 404 });
    }
    const PurchaseReturn = require('../mysql-models/PurchaseReturn');
    if (await PurchaseReturn.count({ where: { purchaseId: purchaseInvoice.id }, transaction })) {
      throw Object.assign(
        new Error('A purchase invoice with linked debit notes cannot be deleted'),
        { status: 409 }
      );
    }

    const purchaseItems = await PurchaseItem.findAll({
      where: { purchaseId: id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const productDeltas = new Map();
    const batchDeltas = new Map();
    for (const item of purchaseItems) {
      const quantity = Number(
        item.totalQuantity ??
        (Number(item.quantity || 0) + Number(item.freeQuantity || 0))
      );
      if (!Number.isFinite(quantity) || quantity < 0) {
        throw Object.assign(new Error(`Invalid received quantity for product ${item.productId}`), { status: 409 });
      }
      const productId = Number(item.productId);
      productDeltas.set(productId, (productDeltas.get(productId) || 0) + quantity);
      if (item.productBatchId) {
        const batchId = Number(item.productBatchId);
        const delta = batchDeltas.get(batchId) || {
          productId,
          quantity: 0,
          freeQuantity: 0,
          quantityUnit: item.quantityUnit || 'PCS',
        };
        delta.quantity += quantity;
        delta.freeQuantity += Number(item.freeQuantity || 0);
        batchDeltas.set(batchId, delta);
      } else {
        const product = await Product.findByPk(productId, { transaction });
        if (!product) {
          throw Object.assign(new Error(`Product not found: ${productId}`), { status: 404 });
        }
        await StockMovement.create(
          {
            warehouseId: purchaseInvoice.warehouseId || 1,
            productId,
            movementType: 'ADJUSTMENT',
            quantity: -quantity,
            quantityUnit: item.quantityUnit || 'PCS',
            referenceType: 'PurchaseBillDeletion',
            referenceId: String(id),
            notes: `Purchase bill deletion reversal #${purchaseInvoice.invoiceNumber}`,
          },
          { transaction }
        );
      }
    }

    for (const [productId, quantity] of productDeltas) {
      const product = await Product.findByPk(productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) {
        throw Object.assign(new Error(`Product not found: ${productId}`), { status: 404 });
      }
      const remainingStock = Number(product.stockQuantity || 0) - quantity;
      if (remainingStock < -0.001) {
        throw Object.assign(
          new Error(`Cannot delete this purchase: product ${product.name} no longer has the received stock available`),
          { status: 409 }
        );
      }
      await product.update(
        { stockQuantity: Math.max(0, remainingStock) },
        { transaction }
      );
    }

    await PurchaseItem.destroy({
      where: { purchaseId: id },
      transaction,
    });

    for (const [batchId, delta] of batchDeltas) {
      const batch = await ProductBatch.findByPk(batchId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!batch || Number(batch.productId) !== delta.productId) {
        throw Object.assign(new Error(`Purchase batch not found: ${batchId}`), { status: 409 });
      }

      const [salesCount, returnsCount, otherPurchaseCount] = await Promise.all([
        SalesItem.count({ where: { productBatchId: batchId }, transaction }),
        SalesReturn.count({ where: { productBatchId: batchId }, transaction }),
        PurchaseItem.count({
          where: { productBatchId: batchId, purchaseId: { [Op.ne]: id } },
          transaction,
        }),
      ]);
      if (salesCount > 0 || returnsCount > 0) {
        throw Object.assign(
          new Error(
            `Cannot delete this purchase: batch ${batch.batchNumber} is referenced by sales or returns. Cancel or reverse the dependent transactions first.`
          ),
          { status: 409 }
        );
      }

      const availableQuantity = Number(batch.availableQuantity ?? batch.quantity ?? 0);
      const totalReceivedQuantity = Number(
        batch.totalReceivedQuantity ?? batch.quantity ?? 0
      );
      const freeQuantity = Number(batch.freeQuantity || 0);
      if (
        availableQuantity + 0.001 < delta.quantity ||
        totalReceivedQuantity + 0.001 < delta.quantity ||
        freeQuantity + 0.001 < delta.freeQuantity
      ) {
        throw Object.assign(
          new Error(
            `Cannot delete this purchase: batch ${batch.batchNumber} no longer has the full received quantity available.`
          ),
          { status: 409 }
        );
      }

      const remainingAvailable = Math.max(0, availableQuantity - delta.quantity);
      const remainingReceived = Math.max(0, totalReceivedQuantity - delta.quantity);
      const remainingFree = Math.max(0, freeQuantity - delta.freeQuantity);
      await StockMovement.destroy({
        where: {
          batchId,
          referenceType: 'PurchaseBill',
          referenceId: String(id),
        },
        transaction,
      });

      if (otherPurchaseCount === 0 && remainingAvailable <= 0.001) {
        const movementCount = await StockMovement.count({
          where: { batchId },
          transaction,
        });
        if (movementCount === 0) {
          await batch.destroy({ transaction });
          continue;
        }
      }

      await batch.update(
        {
          availableQuantity: remainingAvailable,
          quantity: remainingAvailable,
          totalReceivedQuantity: remainingReceived,
          freeQuantity: remainingFree,
        },
        { transaction }
      );
      await StockMovement.create(
        {
          warehouseId: purchaseInvoice.warehouseId || 1,
          productId: delta.productId,
          batchId,
          movementType: 'ADJUSTMENT',
          quantity: -delta.quantity,
          quantityUnit: delta.quantityUnit,
          referenceType: 'PurchaseBillDeletion',
          referenceId: String(id),
          notes: `Purchase bill deletion reversal #${purchaseInvoice.invoiceNumber}`,
        },
        { transaction }
      );
    }

    await purchaseInvoice.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      message: 'Purchase invoice deleted and stock reversed',
    });
  } catch (error) {
    await transaction.rollback();

    return res.status(error.status || 500).json({
      message: error.message,
    });
  }
};

// @desc    Update invoice status
// @route   PUT /api/invoices/:id/status
// @access  Public
const updatePurchaseStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['Paid', 'Unpaid', 'Overdue', 'Cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const invoice = await Purchase.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    invoice.status = status;
    const updatedInvoice = await invoice.save();

    return res.status(200).json(updatedInvoice);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getPurchase,
  getPurchaseInvoicesByDate,
  getPurchaseById,
  updatePaymentStatusById,
  getPaymentHistoryByPurchase,
  createPurchase,
  updatePurchaseById,
  updatePurchaseStatus,
  deletePurchase,
};
