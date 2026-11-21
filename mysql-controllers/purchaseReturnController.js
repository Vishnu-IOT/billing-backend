'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../config/sqldb');
const Purchase = require('../mysql-models/PurchaseBill');
const PurchaseItem = require('../mysql-models/Purchase-Items');
const Product = require('../mysql-models/Product');
const ProductBatch = require('../mysql-models/ProductBatch');
const Party = require('../mysql-models/Party');
const PurchaseReturn = require('../mysql-models/PurchaseReturn');
const PurchaseReturnItem = require('../mysql-models/PurchaseReturnItem');
const PurchaseReturnCreditApplication = require('../mysql-models/PurchaseReturnCreditApplication');
const StockMovement = require('../mysql-models/StockMovement');
const { normalizeProductQuantity } = require('../utils/productQuantity');
const {
  calculatePurchaseReturnItem,
  calculateReturnTotals,
  round2,
} = require('../utils/purchaseReturns');

const returnDetailInclude = [
  { model: Party, attributes: ['id', 'name', 'GST', 'phone', 'email', 'address'] },
  { model: Purchase, attributes: ['id', 'invoiceNumber', 'purchaseDate', 'totalAmount', 'paymentStatus'] },
  { model: require('../mysql-models/Users'), as: 'createdByUser', attributes: ['id', 'name'] },
  { model: require('../mysql-models/Users'), as: 'cancelledByUser', attributes: ['id', 'name'] },
  {
    model: PurchaseReturnCreditApplication,
    as: 'creditApplications',
    where: { status: 'ACTIVE' },
    required: false,
    attributes: ['id', 'purchaseId', 'amount', 'createdAt'],
  },
  {
    model: PurchaseReturnItem,
    as: 'items',
    include: [
      { model: Product, attributes: ['id', 'name', 'sku', 'barcode'] },
      { model: ProductBatch, attributes: ['id', 'batchNumber'] },
    ],
  },
];

const companyIdFor = (req) => Number(req.user?.companyId);
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const getActiveReturnedQuantities = async (purchaseItemIds, transaction) => {
  const rows = await PurchaseReturnItem.findAll({
    where: { purchaseItemId: { [Op.in]: purchaseItemIds } },
    include: [{
      model: PurchaseReturn,
      as: 'purchaseReturn',
      attributes: [],
      where: { status: 'ACTIVE' },
      required: true,
    }],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  const totals = new Map();
  for (const row of rows) {
    const current = totals.get(Number(row.purchaseItemId)) || {
      quantity: 0,
      paidQuantity: 0,
      taxableAmount: 0,
      discountAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalTax: 0,
      totalAmount: 0,
    };
    current.quantity += Number(row.quantity || 0);
    current.paidQuantity += Number(row.paidQuantity || 0);
    for (const field of [
      'taxableAmount',
      'discountAmount',
      'cgstAmount',
      'sgstAmount',
      'igstAmount',
      'totalTax',
      'totalAmount',
    ]) {
      current[field] = round2(current[field] + Number(row[field] || 0));
    }
    totals.set(Number(row.purchaseItemId), current);
  }
  return totals;
};

const getCreditApplicationReplay = async (
  operationKey,
  purchaseId,
  requestedAmount,
  transaction
) => {
  const rows = await PurchaseReturnCreditApplication.findAll({
    where: { operationKey },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!rows.length) return null;

  const replayAmount = round2(rows.reduce((sum, row) => sum + Number(row.amount), 0));
  if (
    rows.some((row) => Number(row.purchaseId) !== purchaseId) ||
    (requestedAmount !== undefined && requestedAmount !== '' &&
      round2(Number(requestedAmount)) !== replayAmount)
  ) {
    throw failure('Idempotency-Key was already used for a different credit application', 409);
  }
  return { rows, replayAmount };
};

const getEligiblePurchaseInvoices = async (req, res) => {
  try {
    const companyId = companyIdFor(req);
    const supplierId = Number(req.query.supplierId);
    if (!Number.isInteger(companyId) || !Number.isInteger(supplierId)) {
      throw failure('A valid supplier is required');
    }

    const invoices = await Purchase.findAll({
      where: { companyId, partyId: supplierId, paymentStatus: { [Op.ne]: 'Cancelled' } },
      include: [{ model: Party, attributes: ['id', 'name'] }],
      order: [['purchaseDate', 'DESC'], ['id', 'DESC']],
    });
    const purchaseIds = invoices.map((invoice) => invoice.id);
    if (!purchaseIds.length) return res.status(200).json({ success: true, data: [] });

    const items = await PurchaseItem.findAll({
      where: { purchaseId: { [Op.in]: purchaseIds } },
      attributes: ['id', 'purchaseId', 'quantity', 'paidQuantity', 'freeQuantity', 'totalQuantity'],
    });
    const returned = await PurchaseReturnItem.findAll({
      where: { purchaseId: { [Op.in]: purchaseIds } },
      attributes: ['purchaseId', 'quantity'],
      include: [{
        model: PurchaseReturn,
        as: 'purchaseReturn',
        attributes: [],
        where: { status: 'ACTIVE' },
        required: true,
      }],
    });

    const purchasedByInvoice = new Map();
    for (const item of items) {
      const current = purchasedByInvoice.get(Number(item.purchaseId)) || 0;
      purchasedByInvoice.set(
        Number(item.purchaseId),
        current + Number(item.totalQuantity ?? item.quantity ?? 0)
      );
    }
    const returnedByInvoice = new Map();
    for (const item of returned) {
      const current = returnedByInvoice.get(Number(item.purchaseId)) || 0;
      returnedByInvoice.set(Number(item.purchaseId), current + Number(item.quantity || 0));
    }

    const eligible = invoices
      .map((invoice) => {
        const purchased = purchasedByInvoice.get(invoice.id) || 0;
        const alreadyReturned = returnedByInvoice.get(invoice.id) || 0;
        return {
          ...invoice.toJSON(),
          purchasedQuantity: purchased,
          returnedQuantity: alreadyReturned,
          remainingReturnableQuantity: Math.max(0, purchased - alreadyReturned),
        };
      })
      .filter((invoice) => invoice.remainingReturnableQuantity > 0);
    return res.status(200).json({ success: true, data: eligible });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const getPurchaseReturnSuppliers = async (req, res) => {
  try {
    const companyId = companyIdFor(req);
    const invoices = await Purchase.findAll({
      where: { companyId },
      attributes: ['partyId'],
      include: [{
        model: Party,
        attributes: ['id', 'name', 'GST', 'phone'],
        required: true,
      }],
      group: ['Purchase.partyId', 'Party.id', 'Party.name', 'Party.GST', 'Party.phone'],
      order: [[Party, 'name', 'ASC']],
    });
    const seen = new Set();
    const suppliers = invoices
      .map((invoice) => invoice.Party)
      .filter((party) => {
        if (!party || seen.has(Number(party.id))) return false;
        seen.add(Number(party.id));
        return true;
      });
    return res.status(200).json({ success: true, data: suppliers });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSupplierCredits = async (req, res) => {
  try {
    const companyId = companyIdFor(req);
    const supplierId = Number(req.query.supplierId);
    if (!Number.isInteger(supplierId)) throw failure('A valid supplier is required');
    const credits = await PurchaseReturn.findAll({
      where: {
        companyId,
        supplierId,
        status: 'ACTIVE',
        supplierCreditAmount: { [Op.gt]: 0 },
      },
      include: [{ model: Purchase, attributes: ['id', 'invoiceNumber', 'purchaseDate'] }],
      order: [['returnDate', 'ASC'], ['id', 'ASC']],
    });
    const creditIds = credits.map((credit) => credit.id);
    const applications = creditIds.length
      ? await PurchaseReturnCreditApplication.findAll({
        where: { purchaseReturnId: { [Op.in]: creditIds }, status: 'ACTIVE' },
        attributes: ['purchaseReturnId', 'amount'],
      })
      : [];
    const usedByCredit = new Map();
    for (const application of applications) {
      const current = usedByCredit.get(Number(application.purchaseReturnId)) || 0;
      usedByCredit.set(
        Number(application.purchaseReturnId),
        round2(current + Number(application.amount || 0))
      );
    }
    const data = credits.map((credit) => ({
      ...credit.toJSON(),
      usedAmount: usedByCredit.get(Number(credit.id)) || 0,
      remainingAmount: Math.max(
        0,
        round2(Number(credit.supplierCreditAmount) - (usedByCredit.get(Number(credit.id)) || 0))
      ),
    })).filter((credit) => credit.remainingAmount > 0);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const getSupplierCreditInvoices = async (req, res) => {
  try {
    const companyId = companyIdFor(req);
    const supplierId = Number(req.query.supplierId);
    if (!Number.isInteger(supplierId)) throw failure('A valid supplier is required');
    const purchases = await Purchase.findAll({
      where: { companyId, partyId: supplierId, paymentStatus: { [Op.ne]: 'Cancelled' } },
      include: [{ model: Party, attributes: ['id', 'name'] }],
      order: [['purchaseDate', 'DESC'], ['id', 'DESC']],
    });
    const purchaseIds = purchases.map((purchase) => purchase.id);
    if (!purchaseIds.length) return res.status(200).json({ success: true, data: [] });
    const returns = await PurchaseReturn.findAll({
      where: { purchaseId: { [Op.in]: purchaseIds }, status: 'ACTIVE' },
      attributes: ['purchaseId', 'appliedToPayable'],
    });
    const applications = await PurchaseReturnCreditApplication.findAll({
      where: { purchaseId: { [Op.in]: purchaseIds }, status: 'ACTIVE' },
      attributes: ['purchaseId', 'amount'],
      include: [{
        model: PurchaseReturn,
        as: 'purchaseReturn',
        attributes: [],
        where: { status: 'ACTIVE' },
        required: true,
      }],
    });
    const appliedReturnsByPurchase = new Map();
    for (const item of returns) {
      const id = Number(item.purchaseId);
      appliedReturnsByPurchase.set(
        id,
        round2((appliedReturnsByPurchase.get(id) || 0) + Number(item.appliedToPayable || 0))
      );
    }
    const appliedCreditsByPurchase = new Map();
    for (const item of applications) {
      const id = Number(item.purchaseId);
      appliedCreditsByPurchase.set(
        id,
        round2((appliedCreditsByPurchase.get(id) || 0) + Number(item.amount || 0))
      );
    }
    const data = purchases.map((purchase) => {
      const total = Number(purchase.totalAmount || 0);
      const paid = purchase.paymentStatus === 'Paid' && Number(purchase.amountPaid || 0) === 0
        ? total
        : Number(purchase.amountPaid || 0);
      const balanceDue = Math.max(
        0,
        round2(
          total - paid -
          (appliedReturnsByPurchase.get(Number(purchase.id)) || 0) -
          (appliedCreditsByPurchase.get(Number(purchase.id)) || 0)
        )
      );
      return { ...purchase.toJSON(), balanceDue };
    }).filter((purchase) => purchase.balanceDue > 0);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const applySupplierCredit = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const companyId = companyIdFor(req);
    const purchaseId = Number(req.body.purchaseId);
    const operationKey = String(
      req.get('Idempotency-Key') || req.body.idempotencyKey || ''
    ).trim();
    if (!Number.isInteger(purchaseId) || !operationKey || operationKey.length > 90) {
      throw failure('A purchase invoice and unique idempotency key are required');
    }
    const replay = await getCreditApplicationReplay(
      operationKey,
      purchaseId,
      req.body.amount,
      transaction
    );
    if (replay) {
      await transaction.commit();
      return res.status(200).json({
        success: true,
        replayed: true,
        appliedAmount: replay.replayAmount,
        data: replay.rows,
      });
    }

    const initialPurchase = await Purchase.findOne({
      where: { id: purchaseId, companyId },
      attributes: ['id', 'partyId'],
    });
    if (!initialPurchase) throw failure('Purchase invoice not found', 404);
    const supplier = await Party.findOne({
      where: { id: initialPurchase.partyId, companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!supplier) throw failure('Supplier not found', 404);
    const serializedReplay = await getCreditApplicationReplay(
      operationKey,
      purchaseId,
      req.body.amount,
      transaction
    );
    if (serializedReplay) {
      await transaction.commit();
      return res.status(200).json({
        success: true,
        replayed: true,
        appliedAmount: serializedReplay.replayAmount,
        data: serializedReplay.rows,
      });
    }
    const purchase = await Purchase.findOne({
      where: { id: purchaseId, companyId, partyId: supplier.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!purchase || purchase.paymentStatus === 'Cancelled') {
      throw failure('Purchase invoice is not eligible for supplier credit', 409);
    }
    const appliedReturns = Number(await PurchaseReturn.sum('appliedToPayable', {
      where: { purchaseId, status: 'ACTIVE' },
      transaction,
    }) || 0);
    const appliedCredits = Number(await PurchaseReturnCreditApplication.sum('amount', {
      where: { purchaseId, status: 'ACTIVE' },
      include: [{
        model: PurchaseReturn,
        as: 'purchaseReturn',
        attributes: [],
        where: { status: 'ACTIVE' },
        required: true,
      }],
      transaction,
    }) || 0);
    const total = Number(purchase.totalAmount || 0);
    const paid = purchase.paymentStatus === 'Paid' && Number(purchase.amountPaid || 0) === 0
      ? total
      : Number(purchase.amountPaid || 0);
    const balanceDue = Math.max(0, round2(total - paid - appliedReturns - appliedCredits));
    if (!balanceDue) throw failure('This purchase invoice has no remaining payable balance', 409);

    const credits = await PurchaseReturn.findAll({
      where: {
        companyId,
        supplierId: supplier.id,
        status: 'ACTIVE',
        supplierCreditAmount: { [Op.gt]: 0 },
      },
      order: [['returnDate', 'ASC'], ['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const creditIds = credits.map((credit) => credit.id);
    const usedRows = creditIds.length
      ? await PurchaseReturnCreditApplication.findAll({
        where: { purchaseReturnId: { [Op.in]: creditIds }, status: 'ACTIVE' },
        transaction,
      })
      : [];
    const usedByCredit = new Map();
    for (const row of usedRows) {
      const id = Number(row.purchaseReturnId);
      usedByCredit.set(id, round2((usedByCredit.get(id) || 0) + Number(row.amount || 0)));
    }
    const availableByCredit = credits.map((credit) => ({
      credit,
      amount: Math.max(
        0,
        round2(Number(credit.supplierCreditAmount) - (usedByCredit.get(Number(credit.id)) || 0))
      ),
    })).filter(({ amount: available }) => available > 0);
    const availableCredit = round2(
      availableByCredit.reduce((sum, item) => sum + item.amount, 0)
    );
    const requestedAmount = req.body.amount === undefined || req.body.amount === ''
      ? Math.min(balanceDue, availableCredit)
      : Number(req.body.amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      throw failure('Enter a positive supplier credit amount');
    }
    if (requestedAmount > balanceDue || requestedAmount > availableCredit) {
      throw failure(
        `Credit application exceeds available credit or invoice payable. Available credit: ${availableCredit.toFixed(2)}, payable: ${balanceDue.toFixed(2)}`
      );
    }

    let remaining = round2(requestedAmount);
    const created = [];
    for (const [index, entry] of availableByCredit.entries()) {
      if (remaining <= 0) break;
      const appliedAmount = Math.min(remaining, entry.amount);
      const application = await PurchaseReturnCreditApplication.create({
        purchaseReturnId: entry.credit.id,
        purchaseId: purchase.id,
        companyId,
        supplierId: supplier.id,
        amount: round2(appliedAmount),
        status: 'ACTIVE',
        operationKey,
        idempotencyKey: `${operationKey}#${index + 1}`,
        createdBy: req.user.id,
      }, { transaction });
      created.push(application);
      remaining = round2(remaining - appliedAmount);
    }
    if (remaining > 0) throw failure('Supplier credit changed while applying it; please retry', 409);
    const totalSettled = paid + appliedReturns + appliedCredits + requestedAmount;
    const paymentStatus = totalSettled >= total ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid';
    await purchase.update({ paymentStatus }, { transaction });
    await transaction.commit();
    return res.status(201).json({
      success: true,
      appliedAmount: round2(requestedAmount),
      balanceDue: Math.max(0, round2(balanceDue - requestedAmount)),
      data: created,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const getPurchaseReturnItems = async (req, res) => {
  try {
    const companyId = companyIdFor(req);
    const purchase = await Purchase.findOne({
      where: { id: req.params.purchaseId, companyId },
      include: [{ model: Party, attributes: ['id', 'name', 'GST', 'phone', 'address'] }],
    });
    if (!purchase || purchase.paymentStatus === 'Cancelled') {
      throw failure('Eligible purchase invoice not found', 404);
    }

    const items = await PurchaseItem.findAll({
      where: { purchaseId: purchase.id },
      include: [
        {
          model: Product,
          attributes: [
            'id', 'name', 'sku', 'barcode', 'unitType', 'baseUnit',
            'allowDecimalQuantity', 'taxRate',
          ],
        },
        {
          model: ProductBatch,
          attributes: [
            'id', 'batchNumber', 'mrp', 'purchasePrice', 'salePrice',
            'gstPercentage', 'mfgDate', 'expiryDate', 'availableQuantity',
            'companyId', 'productId',
          ],
        },
      ],
      order: [['id', 'ASC']],
    });
    const returned = items.length
      ? await getActiveReturnedQuantities(items.map((item) => item.id))
      : new Map();
    const data = items.map((item) => {
      const previous = returned.get(Number(item.id)) || { quantity: 0, paidQuantity: 0 };
      const totalPurchased = Number(item.totalQuantity ?? item.quantity ?? 0);
      return {
        ...item.toJSON(),
        previouslyReturnedQuantity:
          Math.round((previous.quantity + Number.EPSILON) * 1000) / 1000,
        previouslyReturnedPaidQuantity: previous.paidQuantity,
        previouslyReturnedTaxableAmount: previous.taxableAmount,
        previouslyReturnedDiscountAmount: previous.discountAmount,
        previouslyReturnedCgstAmount: previous.cgstAmount,
        previouslyReturnedSgstAmount: previous.sgstAmount,
        previouslyReturnedIgstAmount: previous.igstAmount,
        previouslyReturnedTaxAmount: previous.totalTax,
        previouslyReturnedNetAmount: previous.totalAmount,
        remainingReturnableQuantity: Math.max(
          0,
          Math.round((totalPurchased - previous.quantity + Number.EPSILON) * 1000) / 1000
        ),
        currentBatchAvailableQuantity: Number(item.ProductBatch?.availableQuantity || 0),
        batchReferenceValid: Boolean(
          item.productBatchId &&
          item.ProductBatch &&
          Number(item.ProductBatch.productId) === Number(item.productId) &&
          Number(item.ProductBatch.companyId) === companyId
        ),
      };
    });
    return res.status(200).json({
      success: true,
      data: {
        purchase: purchase.toJSON(),
        items: data,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const listPurchaseReturns = async (req, res) => {
  try {
    const companyId = companyIdFor(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const where = { companyId };
    if (req.query.status && ['ACTIVE', 'CANCELLED'].includes(req.query.status)) {
      where.status = req.query.status;
    }
    if (req.query.supplierId) where.supplierId = Number(req.query.supplierId);
    if (req.query.startDate || req.query.endDate) {
      where.returnDate = {};
      if (req.query.startDate) where.returnDate[Op.gte] = req.query.startDate;
      if (req.query.endDate) where.returnDate[Op.lte] = req.query.endDate;
    }
    if (req.query.search) {
      const query = `%${String(req.query.search).trim()}%`;
      where[Op.or] = [
        { returnNumber: { [Op.like]: query } },
        { reason: { [Op.like]: query } },
      ];
    }
    const result = await PurchaseReturn.findAndCountAll({
      where,
      include: [
        { model: Party, attributes: ['id', 'name'] },
        { model: Purchase, attributes: ['id', 'invoiceNumber', 'purchaseDate'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true,
    });
    return res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        pageSize,
        total: result.count,
        totalPages: Math.ceil(result.count / pageSize),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getPurchaseReturn = async (req, res) => {
  try {
    const record = await PurchaseReturn.findOne({
      where: { id: req.params.id, companyId: companyIdFor(req) },
      include: returnDetailInclude,
    });
    if (!record) throw failure('Purchase return not found', 404);
    return res.status(200).json({ success: true, data: record });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const createPurchaseReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const companyId = companyIdFor(req);
    const idempotencyKey = String(
      req.get('Idempotency-Key') || req.body.idempotencyKey || ''
    ).trim();
    const purchaseId = Number(req.body.purchaseId);
    const submittedItems = req.body.items;
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw failure('Authenticated company is required', 403);
    }
    if (!idempotencyKey || idempotencyKey.length > 100) {
      throw failure('A unique Idempotency-Key of at most 100 characters is required');
    }
    if (!Number.isInteger(purchaseId) || !Array.isArray(submittedItems) || !submittedItems.length) {
      throw failure('Select an original purchase invoice and at least one product to return');
    }
    if (
      req.body.returnDate !== undefined &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.returnDate))
    ) {
      throw failure('Return date must be a valid calendar date in YYYY-MM-DD format');
    }
    if (req.body.returnDate) {
      const parsedReturnDate = new Date(`${req.body.returnDate}T00:00:00.000Z`);
      if (
        Number.isNaN(parsedReturnDate.getTime()) ||
        parsedReturnDate.toISOString().slice(0, 10) !== req.body.returnDate
      ) {
        throw failure('Return date is not a valid calendar date');
      }
    }

    if (submittedItems.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw failure('Every return line must contain a purchase item, batch, and quantity');
    }

    const normalizedItems = submittedItems.map((item) => ({
      purchaseItemId: Number(item.purchaseItemId),
      productBatchId: Number(item.productBatchId),
      quantity: item.quantity,
      quantityUnit: item.quantityUnit,
    }));
    if (normalizedItems.some((item) =>
      !Number.isInteger(item.purchaseItemId) || !Number.isInteger(item.productBatchId)
    )) {
      throw failure('Every return line must reference an original purchase item and batch');
    }
    if (new Set(normalizedItems.map((item) => item.purchaseItemId)).size !== normalizedItems.length) {
      throw failure('Each original purchase item can appear only once in a return');
    }
    const requestHash = crypto.createHash('sha256')
      .update(JSON.stringify({
        purchaseId,
        normalizedItems,
        returnDate: req.body.returnDate,
        reason: req.body.reason || '',
        notes: req.body.notes || '',
      }))
      .digest('hex');
    const replay = await PurchaseReturn.findOne({
      where: { idempotencyKey },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (replay) {
      if (Number(replay.companyId) !== companyId || replay.requestHash !== requestHash) {
        throw failure('Idempotency-Key was already used for a different return', 409);
      }
      await transaction.commit();
      const replayed = await PurchaseReturn.findByPk(replay.id, { include: returnDetailInclude });
      return res.status(200).json({
        success: true,
        data: { ...replayed.toJSON(), replayed: true },
      });
    }

    const purchase = await Purchase.findOne({
      where: { id: purchaseId, companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!purchase || purchase.paymentStatus === 'Cancelled') {
      throw failure('Eligible purchase invoice not found', 404);
    }
    const purchaseItems = await PurchaseItem.findAll({
      where: {
        id: { [Op.in]: normalizedItems.map((item) => item.purchaseItemId) },
        purchaseId: purchase.id,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (purchaseItems.length !== normalizedItems.length) {
      throw failure('A selected purchase item does not belong to this invoice', 400);
    }
    const supplier = await Party.findOne({
      where: { id: purchase.partyId, companyId },
      transaction,
    });
    if (!supplier) throw failure('Supplier not found for the original purchase', 409);
    const purchaseItemById = new Map(purchaseItems.map((item) => [Number(item.id), item]));
    const previous = await getActiveReturnedQuantities(
      normalizedItems.map((item) => item.purchaseItemId),
      transaction
    );
    const itemSnapshots = [];

    for (const submitted of normalizedItems) {
      const purchaseItem = purchaseItemById.get(submitted.purchaseItemId);
      if (!purchaseItem.productBatchId) {
        throw failure(
          `Cannot return ${purchaseItem.productName}: its original purchase batch is not recorded`,
          409
        );
      }
      if (Number(purchaseItem.productBatchId) !== submitted.productBatchId) {
        throw failure('A purchase return must use the exact batch linked to the original purchase item', 400);
      }
      const product = await Product.findByPk(purchaseItem.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const batch = await ProductBatch.findOne({
        where: {
          id: submitted.productBatchId,
          productId: purchaseItem.productId,
          companyId,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product || !batch) {
        throw failure('The original product batch is unavailable or belongs to another company', 409);
      }
      const quantity = normalizeProductQuantity(
        { quantity: submitted.quantity, quantityUnit: submitted.quantityUnit },
        product
      );
      const alreadyReturned = previous.get(Number(purchaseItem.id)) || {
        quantity: 0,
        paidQuantity: 0,
        taxableAmount: 0,
        discountAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalTax: 0,
        totalAmount: 0,
      };
      const purchasedQuantity = Number(
        purchaseItem.totalQuantity ??
        (Number(purchaseItem.quantity || 0) + Number(purchaseItem.freeQuantity || 0))
      );
      const remainingReturnable =
        Math.round((purchasedQuantity - alreadyReturned.quantity + Number.EPSILON) * 1000) / 1000;
      if (quantity.quantity > remainingReturnable) {
        throw failure(
          `${product.name}: return quantity exceeds remaining purchased quantity (${remainingReturnable} ${quantity.quantityUnit})`,
          400
        );
      }
      const availableQuantity = Number(batch.availableQuantity || 0);
      if (quantity.quantity > availableQuantity) {
        throw failure(
          `${product.name}, batch ${batch.batchNumber}: return quantity exceeds current available stock (${availableQuantity} ${quantity.quantityUnit})`,
          409
        );
      }
      if (Number(product.stockQuantity || 0) < quantity.quantity) {
        throw failure(`${product.name}: aggregate stock is lower than the selected batch stock`, 409);
      }

      const paidPurchased = Number(purchaseItem.paidQuantity ?? purchaseItem.quantity ?? 0);
      const remainingPaid = Math.max(0, paidPurchased - alreadyReturned.paidQuantity);
      const paidQuantity = Math.min(quantity.quantity, remainingPaid);
      const freeQuantity =
        Math.round((quantity.quantity - paidQuantity + Number.EPSILON) * 1000) / 1000;
      const amount = calculatePurchaseReturnItem(
        purchaseItem,
        purchase,
        paidQuantity,
        alreadyReturned
      );
      itemSnapshots.push({
        purchaseReturnId: null,
        purchaseId: purchase.id,
        purchaseItemId: purchaseItem.id,
        productId: product.id,
        productBatchId: batch.id,
        productName: purchaseItem.productName || product.name,
        sku: purchaseItem.sku || product.sku || null,
        barcode: product.barcode || null,
        batchNumber: batch.batchNumber,
        mrp: batch.mrp,
        quantity: quantity.quantity,
        paidQuantity,
        freeQuantity,
        quantityUnit: quantity.quantityUnit,
        ...amount,
        mfgDate: batch.mfgDate,
        expiryDate: batch.expiryDate,
        product,
        batch,
      });
    }

    const totals = calculateReturnTotals(itemSnapshots);
    const previousReturns = await PurchaseReturn.findAll({
      where: { purchaseId: purchase.id, status: 'ACTIVE' },
      attributes: ['appliedToPayable'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const previouslyApplied = previousReturns.reduce(
      (sum, item) => round2(sum + Number(item.appliedToPayable || 0)),
      0
    );
    const activeCreditApplied = Number(
      await PurchaseReturnCreditApplication.sum('amount', {
        where: { purchaseId: purchase.id, status: 'ACTIVE' },
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
    const effectivePaid = purchase.paymentStatus === 'Paid' &&
      Number(purchase.amountPaid || 0) === 0
      ? Number(purchase.totalAmount || 0)
      : Number(purchase.amountPaid || 0);
    const balanceDue = Math.max(
      0,
      round2(
        Number(purchase.totalAmount || 0) -
        effectivePaid -
        previouslyApplied -
        activeCreditApplied
      )
    );
    const appliedToPayable = Math.min(totals.grandTotal, balanceDue);
    const supplierCreditAmount = round2(totals.grandTotal - appliedToPayable);
    const settledAmount = round2(
      effectivePaid + previouslyApplied + activeCreditApplied + appliedToPayable
    );
    const paymentStatus = settledAmount >= Number(purchase.totalAmount || 0)
      ? 'Paid'
      : effectivePaid > 0 || previouslyApplied > 0 || activeCreditApplied > 0
        ? 'Partial'
        : 'Unpaid';
    await purchase.update({ paymentStatus }, { transaction });
    const returnDate = req.body.returnDate || new Date().toISOString().slice(0, 10);
    const record = await PurchaseReturn.create({
      companyId,
      supplierId: purchase.partyId,
      purchaseId: purchase.id,
      returnDate,
      ...totals,
      appliedToPayable: round2(appliedToPayable),
      supplierCreditAmount,
      reason: req.body.reason ? String(req.body.reason).trim().slice(0, 255) : null,
      notes: req.body.notes ? String(req.body.notes).trim() : null,
      status: 'ACTIVE',
      idempotencyKey,
      requestHash,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    }, { transaction });
    await record.update(
      { returnNumber: `PR-${String(record.id).padStart(8, '0')}` },
      { transaction }
    );
    const savedItems = itemSnapshots.map(({ product, batch, ...item }) => ({
      ...item,
      purchaseReturnId: record.id,
    }));
    await PurchaseReturnItem.bulkCreate(savedItems, { transaction });

    for (const item of itemSnapshots) {
      const availableQuantity = Number(item.batch.availableQuantity || 0) - item.quantity;
      await item.batch.update(
        {
          availableQuantity,
          quantity: availableQuantity,
        },
        { transaction }
      );
      await item.product.update(
        { stockQuantity: Number(item.product.stockQuantity || 0) - item.quantity },
        { transaction }
      );
      await StockMovement.create({
        warehouseId: purchase.warehouseId || 1,
        productId: item.productId,
        batchId: item.productBatchId,
        movementType: 'PURCHASE_RETURN',
        quantity: -item.quantity,
        quantityUnit: item.quantityUnit,
        referenceType: 'PurchaseReturn',
        referenceId: String(record.id),
        notes: `Purchase return ${record.returnNumber} for ${purchase.invoiceNumber}`,
        performedBy: req.user.id,
      }, { transaction });
    }

    await transaction.commit();
    const response = await PurchaseReturn.findByPk(record.id, { include: returnDetailInclude });
    return res.status(201).json({ success: true, data: response });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return res.status(error.status || (error.code === 'INVALID_PRODUCT_QUANTITY' ? 400 : 500)).json({
      success: false,
      message: error.message,
    });
  }
};

const cancelPurchaseReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const companyId = companyIdFor(req);
    const initialRecord = await PurchaseReturn.findOne({
      where: { id: req.params.id, companyId: companyIdFor(req) },
      transaction,
    });
    if (!initialRecord) throw failure('Purchase return not found', 404);
    const supplier = await Party.findOne({
      where: {
        id: initialRecord.supplierId,
        companyId: initialRecord.companyId,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!supplier) throw failure('Supplier not found for the purchase return', 409);

    const initialApplications = await PurchaseReturnCreditApplication.findAll({
      where: { purchaseReturnId: initialRecord.id, status: 'ACTIVE' },
      attributes: ['purchaseId'],
      transaction,
    });
    const affectedPurchaseIds = [...new Set([
      Number(initialRecord.purchaseId),
      ...initialApplications.map((application) => Number(application.purchaseId)),
    ])].sort((a, b) => a - b);
    const lockedPurchases = new Map();
    for (const purchaseId of affectedPurchaseIds) {
      const affectedPurchase = await Purchase.findOne({
        where: { id: purchaseId, companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (affectedPurchase) lockedPurchases.set(purchaseId, affectedPurchase);
    }

    const record = await PurchaseReturn.findOne({
      where: { id: initialRecord.id, companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!record) throw failure('Purchase return not found', 404);
    if (record.status === 'CANCELLED') {
      throw failure('Purchase return has already been cancelled', 409);
    }

    const purchase = lockedPurchases.get(Number(record.purchaseId));
    if (!purchase) throw failure('Original purchase invoice not found', 409);
    const applications = await PurchaseReturnCreditApplication.findAll({
      where: { purchaseReturnId: record.id, status: 'ACTIVE' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const items = await PurchaseReturnItem.findAll({
      where: { purchaseReturnId: record.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    for (const item of items) {
      const product = await Product.findByPk(item.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const batch = await ProductBatch.findOne({
        where: {
          id: item.productBatchId,
          productId: item.productId,
          companyId: record.companyId,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product || !batch) {
        throw failure(`Cannot restore original batch ${item.batchNumber}; inventory record is missing`, 409);
      }
      const nextAvailable = Number(batch.availableQuantity || 0) + Number(item.quantity);
      await batch.update({ availableQuantity: nextAvailable, quantity: nextAvailable }, { transaction });
      await product.update(
        { stockQuantity: Number(product.stockQuantity || 0) + Number(item.quantity) },
        { transaction }
      );
      await StockMovement.create({
        warehouseId: purchase.warehouseId || 1,
        productId: item.productId,
        batchId: item.productBatchId,
        movementType: 'PURCHASE_RETURN',
        quantity: Number(item.quantity),
        quantityUnit: item.quantityUnit,
        referenceType: 'PurchaseReturnCancellation',
        referenceId: String(record.id),
        notes: `Stock restored for cancelled purchase return ${record.returnNumber}`,
        performedBy: req.user.id,
      }, { transaction });
    }
    await record.update({
      status: 'CANCELLED',
      cancelledBy: req.user.id,
      cancelledAt: new Date(),
      updatedBy: req.user.id,
    }, { transaction });
    for (const application of applications) {
      await application.update({
        status: 'REVERSED',
        reversedBy: req.user.id,
        reversedAt: new Date(),
      }, { transaction });
    }
    for (const affectedPurchase of lockedPurchases.values()) {
      const purchaseId = Number(affectedPurchase.id);
      const [remainingApplied, remainingCreditApplied, activeReturns, removedCreditApplications] = await Promise.all([
        PurchaseReturn.sum('appliedToPayable', {
          where: { purchaseId, status: 'ACTIVE' },
          transaction,
        }),
        PurchaseReturnCreditApplication.sum('amount', {
          where: { purchaseId, status: 'ACTIVE' },
          include: [{
            model: PurchaseReturn,
            as: 'purchaseReturn',
            attributes: [],
            where: { status: 'ACTIVE' },
            required: true,
          }],
          transaction,
        }),
        PurchaseReturn.count({
          where: { purchaseId, status: 'ACTIVE' },
          transaction,
        }),
        initialApplications.filter(
          (application) => Number(application.purchaseId) === purchaseId
        ).length,
      ]);
      const cashPaid = Number(affectedPurchase.amountPaid || 0);
      const removedSettlement =
        (purchaseId === Number(record.purchaseId) && Number(record.appliedToPayable || 0) > 0) ||
        Number(activeReturns || 0) > 0 ||
        removedCreditApplications > 0;
      if (
        affectedPurchase.paymentStatus === 'Paid' &&
        cashPaid === 0 &&
        !removedSettlement
      ) {
        continue;
      }
      const settled = cashPaid + Number(remainingApplied || 0) + Number(remainingCreditApplied || 0);
      const total = Number(affectedPurchase.totalAmount || 0);
      const paymentStatus = settled >= total
        ? 'Paid'
        : cashPaid > 0 ? 'Partial' : 'Unpaid';
      await affectedPurchase.update({ paymentStatus }, { transaction });
    }
    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: 'Purchase return cancelled and original batch stock restored',
      data: record,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPurchaseReturnSuppliers,
  getEligiblePurchaseInvoices,
  getSupplierCredits,
  getSupplierCreditInvoices,
  applySupplierCredit,
  getPurchaseReturnItems,
  listPurchaseReturns,
  getPurchaseReturn,
  createPurchaseReturn,
  cancelPurchaseReturn,
};
