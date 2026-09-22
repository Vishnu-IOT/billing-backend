const Document = require('../mysql-models/Document');
const DocumentItem = require('../mysql-models/DocumentItem');
const Party = require('../mysql-models/Party');
const Product = require('../mysql-models/Product');
const Sale = require('../mysql-models/SalesBill');
const SalesItem = require('../mysql-models/Sales-Items');
const InvoiceSettings = require('../mysql-models/Invoice_Settings');
const AppSettings = require('../mysql-models/AppSettings');
const sequelize = require('../config/sqldb');
const { Op } = require('sequelize');

// Mirrors salesController.js's formatFinancialYear exactly — kept in sync so a
// converted invoice's number looks identical to a normally-created one.
const formatFinancialYear = (format, startYear, endYear) => {
  const pattern = format || 'YY-YY';
  let tokenIndex = 0;
  return pattern.replace(/Y+/g, (match) => {
    const year = tokenIndex === 0 ? startYear : endYear;
    tokenIndex += 1;
    return match.length >= 4 ? String(year) : String(year).slice(-2);
  });
};

// Mirrors calcItemRow() in the frontend's utils/invoice.js exactly. The
// client can (and does) recompute this too for live editing, but the
// server never trusts client-sent totals/tax amounts as authoritative —
// this is recomputed fresh from price/quantity/discount/tax on every
// create and update, so a client-side bug (or a stale/mismatched field
// name) can never silently save a wrong or zero total again.
function calcDocumentItemRow(item) {
  const price = Number(item.price) || 0;
  const qty = Number(item.quantity) || 1;
  const discountPct = Number(item.discountPercentage ?? item.discountPercent ?? 0);
  // Accept either the correct payload key (taxPercentage) or the older/
  // mismatched ones (tax, taxRate) so nothing silently defaults to 0.
  const taxPct = Number(item.taxPercentage ?? item.tax ?? item.taxRate ?? 0);

  const perUnitDiscount = (price * discountPct) / 100;
  const perUnitAfterDiscount = price - perUnitDiscount;
  const perUnitTax = (perUnitAfterDiscount * taxPct) / 100;

  const discountAmount = perUnitDiscount * qty;
  const afterDiscount = perUnitAfterDiscount * qty;
  const taxAmount = perUnitTax * qty;
  const total = afterDiscount + taxAmount;

  return { price, qty, discountPct, taxPct, discountAmount, afterDiscount, taxAmount, total };
}

// Per-type prefix for the document-number preview below. Not a legally
// enforced sequence like GST invoices — just a sane, non-colliding default.
const DOCUMENT_NUMBER_PREFIX = {
  QUOTATION: 'QT',
  PROFORMA: 'PF',
  DELIVERY_CHALLAN: 'DC',
  CREDIT_NOTE: 'CN',
  DEBIT_NOTE: 'DN',
};

// @desc Peek at what the next document number would look like for a given
//       type — read-only, mirrors salesController's previewNextInvoiceNumber.
//       Quotation/Proforma/Delivery Challan/Credit Note/Debit Note all had
//       their number generated from a local, often-empty/stale frontend
//       list (same class of bug the invoice numbering had) — this gives
//       them a real backend-derived number instead.
// @route GET /get-Documents/next-number?type=QUOTATION
const previewNextDocumentNumber = async (req, res) => {
  try {
    const normalizedType = (req.query.type || '').toUpperCase();
    const count = await Document.count({ where: { documentType: normalizedType } });
    const prefix = DOCUMENT_NUMBER_PREFIX[normalizedType] || 'DOC';
    const year = new Date().getFullYear();
    const nextNumber = `${prefix}/${year}/${String(count + 1).padStart(4, '0')}`;
    return res.status(200).json({ success: true, data: { nextNumber } });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc Get documents (filterable like Sales/Purchase lists)
// @route GET /get-Documents?type=credit_note&partyId=12&status=confirmed&fromDate=2026-08-01&toDate=2026-09-07
const getDocuments = async (req, res) => {
  try {
    const { type, partyId, status, fromDate, toDate } = req.query;
    const whereClause = {};

    if (type) whereClause.documentType = type;
    if (partyId) whereClause.partyId = partyId;
    if (status) whereClause.status = status;
    if (fromDate && toDate) {
      whereClause.date = { [Op.between]: [fromDate, toDate] };
    }

    const documents = await Document.findAll({
      where: whereClause,
      include: [
        { model: Party, attributes: ['id', 'name', 'phone', 'email'] },
        { model: DocumentItem, as: 'items', include: [{ model: Product, attributes: ['id', 'name', 'sku'] }] },
      ],
      order: [['date', 'DESC']],
    });

    return res.status(200).json({ success: true, data: documents });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await Document.findByPk(id, {
      include: [
        { model: Party, attributes: ['id', 'name', 'phone', 'email', 'address', 'gstin'] },
        { model: DocumentItem, as: 'items', include: [{ model: Product, attributes: ['id', 'name', 'sku'] }] },
      ],
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    return res.status(200).json({ success: true, data: document });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc Credit/Debit note history for a specific product
// @route GET /get-Documents/by-product/:productId?type=credit_note
const getDocumentsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { type } = req.query;

    const docWhere = {};
    if (type) docWhere.documentType = type;

    const items = await DocumentItem.findAll({
      where: { productId },
      include: [
        {
          model: Document,
          where: docWhere,
          include: [{ model: Party, attributes: ['id', 'name', 'phone'] }],
        },
        { model: Product, attributes: ['id', 'name', 'sku'] },
      ],
      order: [[Document, 'date', 'DESC']],
    });

    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc Credit/Debit note history for a specific party (with running net total)
// @route GET /get-Documents/by-party/:partyId?type=debit_note
const getDocumentsByParty = async (req, res) => {
  try {
    const { partyId } = req.params;
    const { type, fromDate, toDate } = req.query;

    const whereClause = { partyId };
    if (type) whereClause.documentType = type;
    if (fromDate && toDate) {
      whereClause.date = { [Op.between]: [fromDate, toDate] };
    }

    const documents = await Document.findAll({
      where: whereClause,
      include: [
        { model: Party, attributes: ['id', 'name', 'phone', 'email'] },
        { model: DocumentItem, as: 'items', include: [{ model: Product, attributes: ['id', 'name', 'sku'] }] },
      ],
      order: [['date', 'DESC']],
    });

    let netAmount = 0;
    const history = documents.map((doc) => {
      const signedAmount = doc.documentType?.toUpperCase() === 'CREDIT_NOTE' ? Number(doc.totalAmount) : -Number(doc.totalAmount);
      netAmount += signedAmount;
      return { ...doc.toJSON(), signedAmount, runningTotal: netAmount };
    });

    return res.status(200).json({ success: true, data: history, netAmount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const addDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      documentType, documentNumber, date, validUntil, partyId,
      subTotal, taxAmount, discount, totalAmount, status,
      notes, terms, companyId, items,
    } = req.body;

    // Frontend sends 'CREDIT_NOTE'/'DEBIT_NOTE' (uppercase); normalize once for all comparisons
    const normalizedType = (documentType || '').toUpperCase();

    // Frontend's totals payload uses baseRate/tax/global_discount_amount — accept either naming
    const resolvedDiscount = discount ?? req.body.global_discount_amount ?? 0;

    // Server-side is the source of truth for totals — never trust whatever
    // the client computed and sent. Recompute every item's breakdown fresh
    // from price/quantity/discount/tax, then derive the document totals
    // from that, the same formula the frontend's calcBillTotals() uses
    // (sum of item totals, minus the flat global discount, rounded).
    const rows = (items || []).map((item) => ({ item, calc: calcDocumentItemRow(item) }));
    const sumAfterDiscount = rows.reduce((s, r) => s + r.calc.afterDiscount, 0);
    const sumTax = rows.reduce((s, r) => s + r.calc.taxAmount, 0);
    const rawTotal = sumAfterDiscount + sumTax;
    const globalDiscountAmt = Number(resolvedDiscount) || 0;

    const resolvedSubTotal = rows.length ? sumAfterDiscount : (subTotal ?? req.body.baseRate ?? 0);
    const resolvedTaxAmount = rows.length ? sumTax : (taxAmount ?? req.body.tax ?? 0);
    const resolvedTotalAmount = rows.length
      ? Math.round(rawTotal - globalDiscountAmt)
      : (totalAmount ?? 0);

    const doc = await Document.create(
      {
        documentType, documentNumber, date: date || new Date(),
        validUntil: validUntil || new Date(), partyId,
        subTotal: resolvedSubTotal, taxAmount: resolvedTaxAmount,
        discount: resolvedDiscount, totalAmount: resolvedTotalAmount,
        status: status || 'draft', notes, terms,
        companyId: companyId || 1,
      },
      { transaction }
    );

    if (rows.length > 0) {
      const docItems = rows.map(({ item, calc }) => ({
        documentId: doc.id,
        productId: item.productId || null,
        name: item.name || item.productName,
        quantity: calc.qty,
        unit: item.unit || 'pcs',
        price: calc.price,
        tax: calc.taxPct,
        discountPercentage: calc.discountPct,
        discountAmount: calc.discountAmount,
        hsnCode: item.hsnCode || item.hsncode || null,
        sku: item.sku || null,
        batchNumber: item.batchNumber || item.batchNo || null,
        serialNumber: item.serialNumber || item.serialNo || null,
        notes: item.notes || null,
        expiryDate: item.expiryDate || null,
        total: calc.total,
      }));
      await DocumentItem.bulkCreate(docItems, { transaction });

      // stock effect — credit note returns stock, debit note removes it
      for (const item of items) {
        if (!item.productId) continue;

        const product = await Product.findByPk(item.productId, { transaction });
        if (!product) continue;

        if (normalizedType === 'CREDIT_NOTE') {
          await product.increment('stockQuantity', { by: Number(item.quantity), transaction });
        } else if (normalizedType === 'DEBIT_NOTE') {
          if (Number(product.stockQuantity) < Number(item.quantity)) {
            throw new Error(`Insufficient stock for ${product.name} to raise a debit note`);
          }
          await product.decrement('stockQuantity', { by: Number(item.quantity), transaction });
        }
      }
    }

    if (normalizedType === 'CREDIT_NOTE' || normalizedType === 'DEBIT_NOTE') {
      await doc.update({ status: 'confirmed' }, { transaction });
    }

    await transaction.commit();
    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

const updateDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const {
      documentType, documentNumber, date, validUntil, partyId,
      subTotal, taxAmount, discount, totalAmount, status,
      notes, terms, items,
    } = req.body;

    const doc = await Document.findByPk(id, {
      include: [{ model: DocumentItem, as: 'items' }],
      transaction,
    });
    if (!doc) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Document not found' });
    }

    const resolvedDiscount = discount ?? req.body.global_discount_amount ?? doc.discount;

    // Same server-authoritative recompute as addDocument — see comment there.
    const rows = items ? items.map((item) => ({ item, calc: calcDocumentItemRow(item) })) : [];
    const sumAfterDiscount = rows.reduce((s, r) => s + r.calc.afterDiscount, 0);
    const sumTax = rows.reduce((s, r) => s + r.calc.taxAmount, 0);
    const rawTotal = sumAfterDiscount + sumTax;
    const globalDiscountAmt = Number(resolvedDiscount) || 0;

    const resolvedSubTotal = items ? sumAfterDiscount : (subTotal ?? req.body.baseRate ?? doc.subTotal);
    const resolvedTaxAmount = items ? sumTax : (taxAmount ?? req.body.tax ?? doc.taxAmount);
    const resolvedTotalAmount = items
      ? Math.round(rawTotal - globalDiscountAmt)
      : (totalAmount ?? doc.totalAmount);

    // Type at the time the OLD items were applied vs the type they'll be saved as now —
    // these can differ if the document type itself was changed on edit
    const oldNormalizedType = (doc.documentType || '').toUpperCase();
    const newNormalizedType = (documentType || doc.documentType || '').toUpperCase();
    const isStockDoc = (t) => t === 'CREDIT_NOTE' || t === 'DEBIT_NOTE';

    if (items) {
      // 1) Reverse whatever stock effect the OLD items caused, before they're replaced
      if (isStockDoc(oldNormalizedType)) {
        for (const oldItem of doc.items || []) {
          if (!oldItem.productId) continue;
          const product = await Product.findByPk(oldItem.productId, { transaction });
          if (!product) continue;

          if (oldNormalizedType === 'CREDIT_NOTE') {
            // originally added stock back → reverse by removing it again
            if (Number(product.stockQuantity) < Number(oldItem.quantity)) {
              throw new Error(
                `Cannot update: reversing the previous credit note would take ${product.name} below zero stock`
              );
            }
            await product.decrement('stockQuantity', { by: Number(oldItem.quantity), transaction });
          } else {
            // originally removed stock → reverse by adding it back
            await product.increment('stockQuantity', { by: Number(oldItem.quantity), transaction });
          }
        }
      }
    }

    await doc.update(
      {
        documentType, documentNumber, date, validUntil: validUntil || new Date(),
        partyId, subTotal: resolvedSubTotal, taxAmount: resolvedTaxAmount,
        discount: resolvedDiscount, totalAmount: resolvedTotalAmount, status, notes, terms,
      },
      { transaction }
    );

    if (items) {
      await DocumentItem.destroy({ where: { documentId: id }, transaction });

      const docItems = rows.map(({ item, calc }) => ({
        documentId: id,
        productId: item.productId || null,
        name: item.name || item.productName,
        quantity: calc.qty,
        unit: item.unit || 'pcs',
        price: calc.price,
        tax: calc.taxPct,
        discountPercentage: calc.discountPct,
        discountAmount: calc.discountAmount,
        hsnCode: item.hsnCode || item.hsncode || null,
        sku: item.sku || null,
        batchNumber: item.batchNumber || item.batchNo || null,
        serialNumber: item.serialNumber || item.serialNo || null,
        notes: item.notes || null,
        expiryDate: item.expiryDate || null,
        total: calc.total,
      }));
      await DocumentItem.bulkCreate(docItems, { transaction });

      // 2) Apply the NEW items' stock effect, using the (possibly changed) new type
      if (isStockDoc(newNormalizedType)) {
        for (const item of items) {
          if (!item.productId) continue;
          const product = await Product.findByPk(item.productId, { transaction });
          if (!product) continue;

          if (newNormalizedType === 'CREDIT_NOTE') {
            await product.increment('stockQuantity', { by: Number(item.quantity), transaction });
          } else {
            if (Number(product.stockQuantity) < Number(item.quantity)) {
              throw new Error(`Insufficient stock for ${product.name} to raise a debit note`);
            }
            await product.decrement('stockQuantity', { by: Number(item.quantity), transaction });
          }
        }
      }
    }

    await transaction.commit();
    return res.status(200).json({ success: true, message: 'Document updated successfully' });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

const deleteDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const doc = await Document.findByPk(id, {
      include: [{ model: DocumentItem, as: 'items' }],
      transaction,
    });

    if (!doc) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Document not found' });
    }

    const normalizedType = (doc.documentType || '').toUpperCase();
    if (normalizedType === 'CREDIT_NOTE' || normalizedType === 'DEBIT_NOTE') {
      for (const item of doc.items || []) {
        if (!item.productId) continue;
        const product = await Product.findByPk(item.productId, { transaction });
        if (!product) continue;

        if (normalizedType === 'CREDIT_NOTE') {
          // this note had added stock back → deleting it removes that stock again
          if (Number(product.stockQuantity) < Number(item.quantity)) {
            throw new Error(
              `Cannot delete: reversing this credit note would take ${product.name} below zero stock`
            );
          }
          await product.decrement('stockQuantity', { by: Number(item.quantity), transaction });
        } else {
          // this note had removed stock → deleting it restores that stock
          await product.increment('stockQuantity', { by: Number(item.quantity), transaction });
        }
      }
    }

    await DocumentItem.destroy({ where: { documentId: id }, transaction });
    await doc.destroy({ transaction });

    await transaction.commit();
    return res.status(200).json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

const convertDocumentToInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const doc = await Document.findByPk(id, {
      include: [{ model: DocumentItem, as: 'items' }],
      transaction,
    });

    if (!doc) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Document not found' });
    }

    const companyId = doc.companyId || 1;
    const appSettings = await AppSettings.findOne({ where: { companyId }, transaction });

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

    const sequenceNumber = Number(invoiceSettings.next_sequence_no || 1);
    const prefix = appSettings?.invoicePrefix || invoiceSettings.invoice_prefix || 'INV';

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const financialYear =
      currentMonth >= 4
        ? formatFinancialYear(appSettings?.invoiceYearFormat, currentYear, currentYear + 1)
        : formatFinancialYear(appSettings?.invoiceYearFormat, currentYear - 1, currentYear);

    const invoiceNumber = `${prefix}/${financialYear}/${String(sequenceNumber).padStart(4, '0')}`;

    const newSale = await Sale.create(
      {
        invoiceNumber, partyId: doc.partyId, baseRate: doc.subTotal,
        tax: doc.taxAmount, global_discount_amount: doc.discount,
        totalAmount: doc.totalAmount, paymentStatus: 'Unpaid',
        bill_type: 'B2B', saleDate: new Date(),
      },
      { transaction }
    );

    await invoiceSettings.update({ next_sequence_no: sequenceNumber + 1 }, { transaction });

    if (doc.items && doc.items.length > 0) {
      const saleItems = doc.items.map((item) => ({
        saleId: newSale.id, productId: item.productId, productName: item.name,
        quantity: item.quantity, price: item.price,
        taxAmount: (item.price * item.quantity * (item.tax || 0)) / 100,
        netRate: item.total,
      }));
      await SalesItem.bulkCreate(saleItems, { transaction });
    }

    await doc.update({ status: 'converted', convertedInvoiceId: newSale.id }, { transaction });

    await transaction.commit();
    return res.status(200).json({ message: 'Document converted to Invoice successfully', invoice: newSale });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDocuments,
  getDocumentById,
  getDocumentsByProduct,
  getDocumentsByParty,
  previewNextDocumentNumber,
  addDocument,
  updateDocument,
  deleteDocument,
  convertDocumentToInvoice,
};
