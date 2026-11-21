'use strict';

const { Op, QueryTypes, Sequelize } = require('sequelize');
const sequelize = require('../config/sqldb');
const QuickSaleAlias = require('../mysql-models/QuickSaleAlias');
const QuickSaleSaleItem = require('../mysql-models/QuickSaleSaleItem');
const QuickSaleAuditEvent = require('../mysql-models/QuickSaleAuditEvent');
const Product = require('../mysql-models/Product');
const ProductBatch = require('../mysql-models/ProductBatch');
const ProductVariant = require('../mysql-models/ProductVariant');
const StockMovement = require('../mysql-models/StockMovement');
const {
  getQuickSaleIdentityKey,
  normalizeQuickSaleName,
} = require('../utils/quickSale');
const {
  getProductAvailableQuantity,
  getUnbatchedStockQuantity,
} = require('../utils/inventoryStock');
const { initializeQuickSaleOpeningStock } = require('../utils/quickSaleOpeningStock');

const GST_RATES = new Set([0, 0.1, 0.25, 1.5, 3, 5, 6, 12, 18, 28, 40]);

function companyForRequest(req) {
  const requestedCompanyId = Number(req.query.companyId || req.body.companyId || req.user?.companyId);
  if (!Number.isInteger(requestedCompanyId) || requestedCompanyId <= 0) {
    throw Object.assign(new Error('A valid company is required'), { status: 400 });
  }
  if (
    !req.isSystemAdministrator &&
    Number(req.user?.companyId) !== requestedCompanyId
  ) {
    throw Object.assign(new Error('Quick Sale data can only be accessed for the authenticated company'), {
      status: 403,
    });
  }
  return requestedCompanyId;
}

function dateFilters(query) {
  const filters = [];
  const replacements = {};
  for (const field of ['fromDate', 'toDate']) {
    const value = query[field];
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      throw Object.assign(new Error(`${field} must use YYYY-MM-DD format`), { status: 400 });
    }
    if (value) replacements[field] = value;
  }
  if (replacements.fromDate) filters.push('s.saleDate >= :fromDate');
  if (replacements.toDate) filters.push('s.saleDate < DATE_ADD(:toDate, INTERVAL 1 DAY)');

  const cashierId = query.cashierId ? Number(query.cashierId) : null;
  if (query.cashierId && (!Number.isInteger(cashierId) || cashierId <= 0)) {
    throw Object.assign(new Error('cashierId must be a positive integer'), { status: 400 });
  }
  if (cashierId) {
    filters.push('s.userId = :cashierId');
    replacements.cashierId = cashierId;
  }

  const counterId = query.counterId ? Number(query.counterId) : null;
  if (query.counterId && (!Number.isInteger(counterId) || counterId <= 0)) {
    throw Object.assign(new Error('counterId must be a positive integer'), { status: 400 });
  }
  if (counterId) {
    filters.push('ps.counterId = :counterId');
    replacements.counterId = counterId;
  }
  return { filters, replacements, hasSaleFilters: filters.length > 0 };
}

function aliasStatusFilters(query, prefix = 'a') {
  const filters = [];
  const valid = {
    gstStatus: ['GST_PENDING', 'GST_VERIFIED'],
    mappingStatus: ['UNLINKED', 'LINKED'],
    reviewStatus: ['PENDING', 'REVIEWED'],
  };
  for (const [field, values] of Object.entries(valid)) {
    if (query[field] && values.includes(String(query[field]).toUpperCase())) {
      filters.push(`${prefix}.${field === 'gstStatus' ? 'gstVerificationStatus' : field} = :${field}`);
    } else if (query[field]) {
      throw Object.assign(new Error(`${field} is not valid`), { status: 400 });
    }
  }
  const replacements = {};
  if (query.gstStatus) replacements.gstStatus = String(query.gstStatus).toUpperCase();
  if (query.mappingStatus) replacements.mappingStatus = String(query.mappingStatus).toUpperCase();
  if (query.reviewStatus) replacements.reviewStatus = String(query.reviewStatus).toUpperCase();
  return { filters, replacements };
}

function safeNumber(value) {
  return value == null ? null : Number(value);
}

async function findRegisteredProductForCode(code, transaction) {
  const normalizedCode = String(code || '').trim().toLowerCase();
  if (!normalizedCode) return null;
  const matchingCode = {
    [Op.or]: [
      Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('barcode')), normalizedCode),
      Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('sku')), normalizedCode),
    ],
  };
  const product = await Product.findOne({
    where: matchingCode,
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  if (product) return product;

  const variant = await ProductVariant.findOne({
    where: matchingCode,
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  return variant ? Product.findByPk(variant.productId, { transaction }) : null;
}

async function findRegisteredProductForName(name) {
  const normalizedName = normalizeQuickSaleName(name);
  if (!normalizedName) return null;
  return Product.findOne({
    where: Sequelize.where(
      Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('name'))),
      normalizedName,
    ),
  });
}

const resolveQuickSaleCode = async (req, res) => {
  try {
    const companyId = companyForRequest(req);
    const barcode = String(req.query.barcode || '').trim();
    const name = String(req.query.name || '').trim();
    if (!barcode && !name) {
      return res.status(400).json({ success: false, message: 'A barcode or product name is required' });
    }

    if (barcode) {
      const product = await findRegisteredProductForCode(barcode);
      if (product) {
        return res.json({
          success: true,
          type: 'REGISTERED',
          product: product.toJSON(),
        });
      }
    }
    if (name) {
      const product = await findRegisteredProductForName(name);
      if (product) {
        return res.json({
          success: true,
          type: 'REGISTERED',
          product: product.toJSON(),
        });
      }
    }

    const identityKey = getQuickSaleIdentityKey(name, barcode);
    const alias = await QuickSaleAlias.findOne({
      where: { companyId, identityKey },
      include: [{
        model: Product,
        as: 'linkedProduct',
        attributes: ['id', 'name', 'sku', 'barcode'],
        required: false,
      }],
    });
    if (!alias) {
      return res.json({
        success: true,
        type: 'NOT_FOUND',
        barcode: barcode || null,
        name: name || null,
      });
    }
    if (alias.linkedProductId && alias.linkedProduct) {
      return res.json({
        success: true,
        type: 'REGISTERED',
        product: alias.linkedProduct.toJSON(),
        aliasId: alias.id,
      });
    }
    if (alias.mappingStatus === 'LINKED') {
      return res.json({
        success: true,
        type: 'BLOCKED',
        message: 'This Quick Sale alias has an inactive product mapping. Ask an administrator to review it.',
      });
    }

    return res.json({
      success: true,
      type: 'QUICK_SALE_ALIAS',
      alias: {
        id: alias.id,
        name: alias.name,
        barcode: alias.barcode,
        gstVerificationStatus: alias.gstVerificationStatus,
        verifiedTaxRate: safeNumber(alias.verifiedTaxRate),
        verifiedPriceType: alias.verifiedPriceType,
      },
    });
  } catch (error) {
    console.error('Quick Sale resolve failed:', error);
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const listQuickSaleAliases = async (req, res) => {
  try {
    const companyId = companyForRequest(req);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
    const offset = (page - 1) * pageSize;
    const where = { companyId };
    const tab = String(req.query.tab || 'all').toLowerCase();
    if (tab === 'pending') where.reviewStatus = 'PENDING';
    else if (tab === 'linked') where.mappingStatus = 'LINKED';
    else if (tab === 'reviewed') where.reviewStatus = 'REVIEWED';
    else if (tab !== 'all') {
      throw Object.assign(new Error('tab must be pending, linked, reviewed, or all'), { status: 400 });
    }
    const status = aliasStatusFilters(req.query);
    status.filters.forEach((filter) => {
      const field = filter.split('.')[1].split(' ')[0];
      const key = field === 'gstVerificationStatus' ? 'gstVerificationStatus' : field;
      const valueKey = key === 'gstVerificationStatus' ? 'gstStatus' : key;
      where[key] = status.replacements[valueKey];
    });
    if (req.query.search) {
      const search = String(req.query.search).trim();
      if (search.length > 255) {
        throw Object.assign(new Error('search must be 255 characters or fewer'), { status: 400 });
      }
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { barcode: { [Op.like]: `%${search}%` } },
      ];
    }

    const saleFilter = dateFilters(req.query);
    let scopedAliasIds = null;
    if (saleFilter.hasSaleFilters) {
      const saleWhere = [
        's.companyId = :companyId',
        ...saleFilter.filters,
      ].join(' AND ');
      const idRows = await sequelize.query(
        `SELECT DISTINCT qsi.quickSaleAliasId
         FROM quick_sale_sale_items qsi
         JOIN sales s ON s.id = qsi.saleId
         LEFT JOIN pos_shifts ps ON ps.id = s.shiftId
         WHERE ${saleWhere}`,
        {
          type: QueryTypes.SELECT,
          replacements: { companyId, ...saleFilter.replacements },
        },
      );
      scopedAliasIds = idRows.map(({ quickSaleAliasId }) => Number(quickSaleAliasId));
      where.id = scopedAliasIds.length ? { [Op.in]: scopedAliasIds } : { [Op.in]: [-1] };
    }

    const result = await QuickSaleAlias.findAndCountAll({
      where,
      include: [{
        model: Product,
        as: 'linkedProduct',
        attributes: ['id', 'name', 'sku', 'barcode'],
        required: false,
      }],
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset,
      distinct: true,
    });
    const aliases = result.rows.map((row) => row.toJSON());
    const aliasIds = aliases.map(({ id }) => Number(id));
    let metrics = [];
    if (aliasIds.length) {
      const metricFilters = [
        's.companyId = :companyId',
        'qsi.quickSaleAliasId IN (:aliasIds)',
        ...saleFilter.filters,
      ].join(' AND ');
      metrics = await sequelize.query(
        `SELECT qsi.quickSaleAliasId,
            COUNT(DISTINCT qsi.saleId) AS invoiceCount,
            SUM(qsi.quantity) AS quantitySold,
            SUM(qsi.netAmount) AS grossSales,
            SUM(COALESCE(qr.returnedAmount, 0)) AS returnedAmount
         FROM quick_sale_sale_items qsi
         JOIN sales s ON s.id = qsi.saleId
         LEFT JOIN pos_shifts ps ON ps.id = s.shiftId
         LEFT JOIN (
           SELECT quickSaleSaleItemId, SUM(returnedAmount) AS returnedAmount
           FROM quick_sale_returns
           GROUP BY quickSaleSaleItemId
         ) qr ON qr.quickSaleSaleItemId = qsi.id
         WHERE ${metricFilters}
         GROUP BY qsi.quickSaleAliasId`,
        {
          type: QueryTypes.SELECT,
          replacements: {
            companyId,
            aliasIds,
            ...saleFilter.replacements,
          },
        },
      );
    }
    const historicalMetrics = aliasIds.length
      ? await sequelize.query(
        `SELECT qsi.quickSaleAliasId,
            COUNT(DISTINCT qsi.saleId) AS invoiceCount,
            SUM(qsi.quantity) AS quantitySold,
            SUM(qsi.netAmount) AS grossSales,
            SUM(COALESCE(qr.returnedAmount, 0)) AS returnedAmount,
            MIN(s.saleDate) AS firstSoldAt,
            MAX(s.saleDate) AS lastSoldAt
         FROM quick_sale_sale_items qsi
         JOIN sales s ON s.id = qsi.saleId
         LEFT JOIN (
           SELECT quickSaleSaleItemId, SUM(returnedAmount) AS returnedAmount
           FROM quick_sale_returns
           GROUP BY quickSaleSaleItemId
         ) qr ON qr.quickSaleSaleItemId = qsi.id
         WHERE s.companyId = :companyId
           AND qsi.quickSaleAliasId IN (:aliasIds)
         GROUP BY qsi.quickSaleAliasId`,
        {
          type: QueryTypes.SELECT,
          replacements: { companyId, aliasIds },
        },
      )
      : [];
    const metricById = new Map(metrics.map((row) => [
      Number(row.quickSaleAliasId),
      {
        invoiceCount: Number(row.invoiceCount || 0),
        quantitySold: Number(row.quantitySold || 0),
        grossSales: Number(row.grossSales || 0),
        returnedAmount: Number(row.returnedAmount || 0),
        netSales: Number(row.grossSales || 0) - Number(row.returnedAmount || 0),
      },
    ]));
    const historyById = new Map(historicalMetrics.map((row) => [
      Number(row.quickSaleAliasId),
      {
        invoiceCount: Number(row.invoiceCount || 0),
        quantitySold: Number(row.quantitySold || 0),
        grossSales: Number(row.grossSales || 0),
        returnedAmount: Number(row.returnedAmount || 0),
        firstSoldAt: row.firstSoldAt || null,
        lastSoldAt: row.lastSoldAt || null,
      },
    ]));
    return res.json({
      success: true,
      data: aliases.map((alias) => ({
        ...alias,
        verifiedTaxRate: safeNumber(alias.verifiedTaxRate),
        metrics: metricById.get(Number(alias.id)) || {
          invoiceCount: 0,
          quantitySold: 0,
          grossSales: 0,
          returnedAmount: 0,
          netSales: 0,
        },
        historicalMetrics: historyById.get(Number(alias.id)) || {
          invoiceCount: 0,
          quantitySold: 0,
          grossSales: 0,
          returnedAmount: 0,
          firstSoldAt: null,
          lastSoldAt: null,
        },
      })),
      pagination: {
        page,
        pageSize,
        total: result.count,
        totalPages: Math.ceil(result.count / pageSize),
      },
    });
  } catch (error) {
    console.error('Quick Sale alias list failed:', error);
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

const getQuickSaleAliasAudit = async (req, res) => {
  try {
    const companyId = companyForRequest(req);
    const aliasId = Number(req.params.id);
    const alias = await QuickSaleAlias.findOne({ where: { id: aliasId, companyId } });
    if (!alias) return res.status(404).json({ success: false, message: 'Quick Sale alias not found' });
    const events = await QuickSaleAuditEvent.findAll({
      where: { quickSaleAliasId: aliasId, companyId },
      include: [{
        model: require('../mysql-models/Users'),
        as: 'actor',
        attributes: ['id', 'name'],
      }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: 100,
    });
    return res.json({ success: true, data: events });
  } catch (error) {
    console.error('Quick Sale audit history failed:', error);
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

async function updateAlias(req, res, action, mutate) {
  const transaction = await sequelize.transaction();
  try {
    const companyId = companyForRequest(req);
    const alias = await QuickSaleAlias.findOne({
      where: { id: Number(req.params.id), companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!alias) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Quick Sale alias not found' });
    }

    const previousValues = {
      gstVerificationStatus: alias.gstVerificationStatus,
      verifiedTaxRate: safeNumber(alias.verifiedTaxRate),
      verifiedHsnCode: alias.verifiedHsnCode,
      verifiedPriceType: alias.verifiedPriceType,
      mappingStatus: alias.mappingStatus,
      linkedProductId: alias.linkedProductId,
      reviewStatus: alias.reviewStatus,
    };
    const { reason, ...updates } = await mutate(alias, transaction);
    await alias.update(updates, { transaction });
    const nextValues = {
      gstVerificationStatus: alias.gstVerificationStatus,
      verifiedTaxRate: safeNumber(alias.verifiedTaxRate),
      verifiedHsnCode: alias.verifiedHsnCode,
      verifiedPriceType: alias.verifiedPriceType,
      mappingStatus: alias.mappingStatus,
      linkedProductId: alias.linkedProductId,
      reviewStatus: alias.reviewStatus,
    };
    await QuickSaleAuditEvent.create({
      companyId,
      quickSaleAliasId: alias.id,
      actorUserId: req.user.id,
      action,
      reason: reason || null,
      previousValues,
      nextValues,
    }, { transaction });
    await transaction.commit();
    return res.json({
      success: true,
      data: {
        ...alias.toJSON(),
        verifiedTaxRate: safeNumber(alias.verifiedTaxRate),
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error(`Quick Sale ${action} failed:`, error);
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

const verifyQuickSaleGst = (req, res) => updateAlias(req, res, 'GST_VERIFIED', async (alias) => {
  const rate = Number(req.body.taxRate);
  const priceType = String(req.body.priceType || 'WITH_GST').toUpperCase();
  const hsnCode = String(req.body.hsnCode || '').trim();
  if (!Number.isFinite(rate) || !GST_RATES.has(rate)) {
    throw Object.assign(new Error('Select a supported GST rate'), { status: 400 });
  }
  if (priceType !== 'WITH_GST') {
    throw Object.assign(new Error('Quick Sale selling prices are GST-inclusive; priceType must be WITH_GST'), {
      status: 400,
    });
  }
  if (hsnCode.length > 15 || (hsnCode && !/^[A-Za-z0-9/-]+$/.test(hsnCode))) {
    throw Object.assign(new Error('HSN code must be 15 characters or fewer and contain only letters, digits, /, or -'), {
      status: 400,
    });
  }
  return {
    gstVerificationStatus: 'GST_VERIFIED',
    verifiedTaxRate: rate,
    verifiedHsnCode: hsnCode || null,
    verifiedPriceType: priceType,
    verifiedBy: req.user.id,
    verifiedAt: new Date(),
  };
});

const mapQuickSaleAlias = (req, res) => updateAlias(req, res, 'PRODUCT_MAPPED', async () => {
  const productId = Number(req.body.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    throw Object.assign(new Error('A valid productId is required'), { status: 400 });
  }
  const product = await Product.findByPk(productId);
  if (!product) {
    throw Object.assign(new Error('The selected registered product does not exist'), { status: 404 });
  }
  return {
    mappingStatus: 'LINKED',
    linkedProductId: product.id,
    mappedBy: req.user.id,
    mappedAt: new Date(),
  };
});

const markQuickSaleAliasReviewed = (req, res) =>
  updateAlias(req, res, 'REVIEWED', async () => ({
    reviewStatus: 'REVIEWED',
    reviewedBy: req.user.id,
    reviewedAt: new Date(),
  }));

const unlinkQuickSaleAlias = (req, res) => updateAlias(req, res, 'PRODUCT_UNLINKED', async () => {
  const reason = String(req.body.reason || '').trim();
  if (!reason || reason.length > 255) {
    throw Object.assign(new Error('A reason of 1 to 255 characters is required to unlink a product'), {
      status: 400,
    });
  }
  return {
    mappingStatus: 'UNLINKED',
    linkedProductId: null,
    mappedBy: null,
    mappedAt: null,
    reason,
  };
});

const quickSaleReport = async (req, res) => {
  try {
    const companyId = companyForRequest(req);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
    const offset = (page - 1) * pageSize;
    const saleFilter = dateFilters(req.query);
    const aliasFilter = aliasStatusFilters(req.query, 'a');
    const filters = [
      's.companyId = :companyId',
      ...saleFilter.filters,
      ...aliasFilter.filters,
    ];
    const replacements = {
      companyId,
      ...saleFilter.replacements,
      ...aliasFilter.replacements,
    };
    const from = `FROM quick_sale_sale_items qsi
      JOIN sales s ON s.id = qsi.saleId
      JOIN quick_sale_aliases a ON a.id = qsi.quickSaleAliasId
      LEFT JOIN users u ON u.id = s.userId
      LEFT JOIN pos_shifts ps ON ps.id = s.shiftId`;
    const filterSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const returnsJoin = `LEFT JOIN (
      SELECT quickSaleSaleItemId, SUM(quantity) AS returnedQuantity,
        SUM(returnedAmount) AS returnedAmount
      FROM quick_sale_returns
      GROUP BY quickSaleSaleItemId
    ) qr ON qr.quickSaleSaleItemId = qsi.id`;
    const countRows = await sequelize.query(
      `SELECT COUNT(*) AS total ${from} ${filterSql}`,
      { type: QueryTypes.SELECT, replacements },
    );
    const data = await sequelize.query(
      `SELECT qsi.id AS quickSaleItemId, qsi.saleId, s.invoiceNumber, s.saleDate,
          qsi.quickSaleAliasId, qsi.productNameSnapshot AS productName,
          qsi.barcodeSnapshot AS barcode, qsi.mrp, qsi.sellingPrice, qsi.quantity,
          qsi.lineAmount, qsi.discountAmount, qsi.netAmount,
          qsi.gstVerificationStatus, qsi.taxableAmount, qsi.taxPercentage,
          qsi.taxAmount, qsi.hsnCodeSnapshot AS hsnCode,
          qsi.priceTypeSnapshot AS priceType, a.mappingStatus,
          a.linkedProductId, a.reviewStatus, u.name AS cashierName,
          COALESCE(ps.counterNameSnapshot, pc.name) AS counterName,
          COALESCE(qr.returnedQuantity, 0) AS returnedQuantity,
          COALESCE(qr.returnedAmount, 0) AS returnedAmount,
          qsi.quantity - COALESCE(qr.returnedQuantity, 0) AS netQuantity,
          qsi.netAmount - COALESCE(qr.returnedAmount, 0) AS netSales
       ${from}
       LEFT JOIN pos_counters pc ON pc.id = ps.counterId
       ${returnsJoin}
       ${filterSql}
       ORDER BY s.saleDate DESC, qsi.id DESC
       LIMIT :pageSize OFFSET :offset`,
      {
        type: QueryTypes.SELECT,
        replacements: { ...replacements, pageSize, offset },
      },
    );
    const summaryRows = await sequelize.query(
      `SELECT COUNT(DISTINCT qsi.saleId) AS invoiceCount,
          SUM(qsi.quantity) AS quantitySold,
          SUM(COALESCE(qr.returnedQuantity, 0)) AS quantityReturned,
          SUM(qsi.netAmount) AS grossSales,
          SUM(COALESCE(qr.returnedAmount, 0)) AS returnedAmount,
          SUM(qsi.taxableAmount) AS taxableAmount,
          SUM(qsi.taxAmount) AS verifiedTaxAmount,
          SUM(CASE WHEN qsi.gstVerificationStatus = 'GST_PENDING' THEN qsi.netAmount ELSE 0 END) AS pendingGstAmount
       ${from}
       ${returnsJoin}
       ${filterSql}`,
      { type: QueryTypes.SELECT, replacements },
    );
    const summary = summaryRows[0] || {};
    const numericKeys = [
      'mrp', 'sellingPrice', 'quantity', 'lineAmount', 'discountAmount', 'netAmount',
      'taxableAmount', 'taxPercentage', 'taxAmount', 'returnedQuantity',
      'returnedAmount', 'netQuantity', 'netSales',
    ];
    return res.json({
      success: true,
      data: data.map((row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          numericKeys.includes(key) && value !== null ? Number(value) : value,
        ]),
      )),
      summary: Object.fromEntries(
        Object.entries(summary).map(([key, value]) => [
          key,
          value == null ? 0 : Number(value),
        ]),
      ),
      pagination: {
        page,
        pageSize,
        total: Number(countRows[0]?.total || 0),
        totalPages: Math.ceil(Number(countRows[0]?.total || 0) / pageSize),
      },
    });
  } catch (error) {
    console.error('Quick Sale report failed:', error);
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getQuickSaleAliasAudit,
  listQuickSaleAliases,
  mapQuickSaleAlias,
  markQuickSaleAliasReviewed,
  quickSaleReport,
  resolveQuickSaleCode,
  unlinkQuickSaleAlias,
  verifyQuickSaleGst,
};
