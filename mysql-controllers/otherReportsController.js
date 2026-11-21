'use strict';

const ExcelJS = require('exceljs');
const sequelize = require('../config/sqldb');
const H = require('../utils/reportHelpers');
const { Params, ReportError } = H;
const whereSql = (conditions) => (conditions.length ? `WHERE ${conditions.join(' AND ')}` : '');
const stableSort = (sort) => ({
  ...sort,
  orderBy: `${sort.orderBy.replace(/,\s*1\s+ASC$/, '')}, id ASC`,
});

const REPORTS = ['sales-returns', 'purchase-returns', 'expiry-products', 'loyalty-redemptions'];
const SALES_RETURN_STATUS = ['RECORDED', 'ALL'];
const SALES_RETURN_CONDITIONS = ['GOOD', 'DAMAGED', 'EXPIRED'];
const PURCHASE_RETURN_STATUS = ['ACTIVE', 'CANCELLED', 'ALL'];
const REDEMPTION_STATUS = ['COMPLETED', 'REVERSED', 'ALL'];
const EXPIRY_STATUS = ['EXPIRED', 'TODAY', 'WITHIN_7_DAYS', 'WITHIN_30_DAYS', 'WITHIN_60_DAYS', 'SAFE'];
const BILL_TYPES = ['B2C', 'B2B'];

function companyIdFor(req) {
  const companyId = Number(req.user?.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new ReportError('A valid authenticated company is required', 403);
  }
  return companyId;
}

function addLike(params, value) {
  return params.add(`%${H.escapeLike(value)}%`);
}

function addRange(conditions, params, column, range) {
  if (range.from) conditions.push(`${column} >= ${params.add(range.from)}`);
  if (range.toExclusive) conditions.push(`${column} < ${params.add(range.toExclusive)}`);
}

function commonDateParams(query) {
  return H.parseDateRange(query);
}

function buildSalesReturns(query, companyId) {
  const params = new Params();
  params.values.companyId = companyId;
  const range = commonDateParams(query);
  const conditions = [
    's.companyId = :companyId',
    "s.paymentStatus <> 'Cancelled'",
  ];
  addRange(conditions, params, 'sr.createdAt', range);

  const invoiceNumber = H.str(query.invoiceNumber);
  const returnNumber = H.str(query.returnNumber);
  const customerName = H.str(query.customerName);
  const customerPhone = H.str(query.customerPhone);
  const productName = H.str(query.productName);
  const barcode = H.str(query.barcode);
  const reason = H.str(query.reason);
  const batchNumber = H.str(query.batchNumber);
  const billType = H.parseEnum('billType', query.billType, BILL_TYPES);
  const userId = H.parseId('userId', query.userId);
  const status = H.parseEnum('status', query.status, SALES_RETURN_STATUS);
  const conditionFilter = H.str(
    query.returnCondition !== undefined ? query.returnCondition : query.condition
  );
  const returnCondition = H.parseEnum('returnCondition', conditionFilter, SALES_RETURN_CONDITIONS);
  const productId = H.parseId('productId', query.productId);
  const categoryId = H.parseId('categoryId', query.categoryId);
  const brandId = H.parseId('brandId', query.brandId);
  const customerId = H.parseId('customerId', query.customerId);
  const createdBy = H.parseId('createdBy', query.createdBy);
  const search = H.str(query.search);

  if (invoiceNumber) conditions.push(`s.invoiceNumber LIKE ${addLike(params, invoiceNumber)}`);
  if (returnNumber) {
    conditions.push(`COALESCE(src.code, CONCAT('SR-', LPAD(sr.id, 8, '0'))) LIKE ${addLike(params, returnNumber)}`);
  }
  if (customerName) {
    const match = addLike(params, customerName);
    conditions.push(`(c.name LIKE ${match} OR s.partyNameSnapshot LIKE ${match} OR pt.name LIKE ${match})`);
  }
  if (customerPhone) conditions.push(`c.phone LIKE ${addLike(params, customerPhone)}`);
  if (productName) {
    const match = addLike(params, productName);
    conditions.push(`(si.productName LIKE ${match} OR pr.name LIKE ${match})`);
  }
  if (barcode) conditions.push(`pr.barcode LIKE ${addLike(params, barcode)}`);
  if (reason) conditions.push(`sr.reason LIKE ${addLike(params, reason)}`);
  if (billType) conditions.push(`s.bill_type = ${params.add(billType)}`);
  if (userId) conditions.push(`sm.performedBy = ${params.add(userId)}`);
  if (returnCondition) conditions.push(`sr.returnCondition = ${params.add(returnCondition)}`);
  if (productId) conditions.push(`sr.productId = ${params.add(productId)}`);
  if (categoryId) conditions.push(`pr.categoryId = ${params.add(categoryId)}`);
  if (brandId) conditions.push(`pr.brandId = ${params.add(brandId)}`);
  if (customerId) conditions.push(`s.customerId = ${params.add(customerId)}`);
  if (createdBy) conditions.push(`sm.performedBy = ${params.add(createdBy)}`);
  if (batchNumber) conditions.push(`COALESCE(pb.batchNumber, si.batchNo) LIKE ${addLike(params, batchNumber)}`);
  if (status && status !== 'ALL' && status !== 'RECORDED') {
    conditions.push('1 = 0');
  }
  if (search) {
    const match = addLike(params, search);
    conditions.push(`(
      s.invoiceNumber LIKE ${match} OR
      COALESCE(src.code, CONCAT('SR-', LPAD(sr.id, 8, '0'))) LIKE ${match} OR
      COALESCE(c.name, s.partyNameSnapshot, pt.name, '') LIKE ${match} OR
      COALESCE(c.phone, '') LIKE ${match} OR
      si.productName LIKE ${match} OR
      COALESCE(si.sku, '') LIKE ${match} OR
      COALESCE(pr.barcode, '') LIKE ${match} OR
      COALESCE(pb.batchNumber, si.batchNo, '') LIKE ${match}
    )`);
  }

  const baseSql = `SELECT
      sr.id AS id,
      COALESCE(src.code, CONCAT('SR-', LPAD(sr.id, 8, '0'))) AS returnNumber,
      sr.saleId,
      sr.saleItemId,
      sr.productId,
      s.invoiceNumber,
      s.saleDate AS invoiceDate,
      sr.createdAt AS returnDate,
      sr.returnCondition,
      COALESCE(c.name, s.partyNameSnapshot, pt.name, 'Walk-in customer') AS customerName,
      c.phone AS customerPhone,
      si.productName,
      si.sku,
      pr.barcode,
      COALESCE(pb.batchNumber, si.batchNo) AS batchNumber,
      si.quantity AS originalSoldQuantity,
      COALESCE((
        SELECT SUM(_prev.quantity)
        FROM sales_returns _prev
        WHERE _prev.saleItemId = sr.saleItemId
          AND _prev.id < sr.id
      ), 0) AS previousReturnedQuantity,
      si.price AS originalSellingRate,
      si.taxPercentage AS gstRate,
      si.taxAmount AS saleItemTaxAmount,
      cat.category AS categoryName,
      br.name AS brandName,
      sr.quantity AS returnedQuantity,
      sr.quantityUnit,
      CASE sr.returnCondition
        WHEN 'GOOD' THEN 'Saleable stock restored'
        WHEN 'DAMAGED' THEN 'Damaged return excluded from saleable stock'
        WHEN 'EXPIRED' THEN 'Expired return excluded from saleable stock'
      END AS inventoryDisposition,
      sr.reason,
      sr.returnedAmount AS returnAmount,
      CASE WHEN sr.returnCreditId IS NULL THEN 0 ELSE sr.returnedAmount END AS creditAmount,
      sr.returnCreditId,
      CASE WHEN sr.returnCreditId IS NULL THEN 'DIRECT REFUND' ELSE 'RETURN CREDIT' END AS refundStatus,
      u.name AS processedBy,
      'RECORDED' AS returnStatus,
      s.bill_type AS billType,
      sm.id AS stockMovementId,
      sm.movementType AS stockMovementType,
      sm.quantity AS stockMovementQuantity,
      sm.quantityUnit AS stockMovementUnit,
      sm.createdAt AS stockMovementDate
    FROM sales_returns sr
    INNER JOIN sales s ON s.id = sr.saleId
    LEFT JOIN sales_items si ON si.id = sr.saleItemId
    LEFT JOIN products pr ON pr.id = sr.productId
    LEFT JOIN product_batches pb ON pb.id = sr.productBatchId
    LEFT JOIN customers c ON c.id = s.customerId
    LEFT JOIN parties pt ON pt.id = s.partyId
    LEFT JOIN sales_return_credits src ON src.id = sr.returnCreditId
    LEFT JOIN categories cat ON cat.id = pr.categoryId
    LEFT JOIN brands br ON br.id = pr.brandId
    LEFT JOIN (
      SELECT referenceId, MAX(id) AS movementId
      FROM stock_movements
      WHERE referenceType = 'SalesReturn'
      GROUP BY referenceId
    ) sm_latest ON BINARY sm_latest.referenceId = BINARY CAST(sr.id AS CHAR)
    LEFT JOIN stock_movements sm ON sm.id = sm_latest.movementId
    LEFT JOIN users u ON u.id = sm.performedBy AND u.companyId = s.companyId
    ${whereSql(conditions)}`;

  const summarySql = `SELECT
      COUNT(DISTINCT CASE
        WHEN returnCreditId IS NULL THEN CONCAT('R-', id)
        ELSE CONCAT('C-', returnCreditId)
      END) AS totalReturns,
      COALESCE(SUM(returnedQuantity), 0) AS totalReturnedQuantity,
      COALESCE(SUM(returnAmount), 0) AS totalReturnValue,
      COALESCE(SUM(creditAmount), 0) AS totalReturnCreditAmount,
      COALESCE(SUM(CASE WHEN returnCondition = 'GOOD' THEN returnedQuantity ELSE 0 END), 0) AS resalableQuantity,
      COALESCE(SUM(CASE WHEN returnCondition = 'DAMAGED' THEN returnedQuantity ELSE 0 END), 0) AS damagedQuantity,
      COALESCE(SUM(CASE WHEN returnCondition = 'EXPIRED' THEN returnedQuantity ELSE 0 END), 0) AS expiredQuantity,
      COALESCE(SUM(CASE WHEN returnCondition = 'GOOD' THEN returnAmount ELSE 0 END), 0) AS resalableReturnAmount,
      COALESCE(SUM(CASE WHEN returnCondition = 'DAMAGED' THEN returnAmount ELSE 0 END), 0) AS damagedReturnAmount,
      COALESCE(SUM(CASE WHEN returnCondition = 'EXPIRED' THEN returnAmount ELSE 0 END), 0) AS expiredReturnAmount,
      0 AS unclassifiedQuantity
    FROM (${baseSql}) report_rows`;
  const conditionSql = `SELECT returnCondition,
      COALESCE(SUM(returnedQuantity), 0) AS returnedQuantity,
      COALESCE(SUM(returnAmount), 0) AS returnAmount
    FROM (${baseSql}) report_rows
    GROUP BY returnCondition`;
  const sort = stableSort(H.parseSort(query, {
    returnDate: 'returnDate',
    returnNumber: 'returnNumber',
    invoiceNumber: 'invoiceNumber',
    customerName: 'customerName',
    productName: 'productName',
    returnedQuantity: 'returnedQuantity',
    returnAmount: 'returnAmount',
  }, 'returnDate'));
  return {
    baseSql,
    params,
    summarySql,
    conditionSql,
    sort,
    numeric: [
      'originalSoldQuantity', 'previousReturnedQuantity', 'originalSellingRate', 'gstRate',
      'returnedQuantity', 'returnAmount', 'creditAmount', 'stockMovementQuantity',
    ],
  };
}

function buildPurchaseReturns(query, companyId) {
  const params = new Params();
  params.values.companyId = companyId;
  const range = commonDateParams(query);
  const conditions = ['pr.companyId = :companyId'];
  addRange(conditions, params, 'pr.returnDate', range);

  const invoiceNumber = H.str(query.invoiceNumber);
  const returnNumber = H.str(query.returnNumber);
  const supplierName = H.str(query.supplierName);
  const supplierPhone = H.str(query.supplierPhone);
  const productName = H.str(query.productName);
  const barcode = H.str(query.barcode);
  const batchNumber = H.str(query.batchNumber);
  const reason = H.str(query.reason);
  const status = H.parseEnum('status', query.status, PURCHASE_RETURN_STATUS);
  const userId = H.parseId('userId', query.userId);
  const search = H.str(query.search);
  if (status && status !== 'ALL') conditions.push(`pr.status = ${params.add(status)}`);
  if (invoiceNumber) conditions.push(`pu.invoiceNumber LIKE ${addLike(params, invoiceNumber)}`);
  if (returnNumber) conditions.push(`pr.returnNumber LIKE ${addLike(params, returnNumber)}`);
  if (supplierName) conditions.push(`pt.name LIKE ${addLike(params, supplierName)}`);
  if (supplierPhone) conditions.push(`pt.phone LIKE ${addLike(params, supplierPhone)}`);
  if (productName) conditions.push(`pri.productName LIKE ${addLike(params, productName)}`);
  if (barcode) conditions.push(`pri.barcode LIKE ${addLike(params, barcode)}`);
  if (batchNumber) conditions.push(`pri.batchNumber LIKE ${addLike(params, batchNumber)}`);
  if (reason) conditions.push(`pr.reason LIKE ${addLike(params, reason)}`);
  if (userId) conditions.push(`pr.createdBy = ${params.add(userId)}`);
  if (search) {
    const match = addLike(params, search);
    conditions.push(`(
      pr.returnNumber LIKE ${match} OR pu.invoiceNumber LIKE ${match} OR
      pt.name LIKE ${match} OR pt.phone LIKE ${match} OR
      pri.productName LIKE ${match} OR pri.barcode LIKE ${match} OR pri.batchNumber LIKE ${match}
    )`);
  }

  const baseSql = `SELECT
      pri.id AS id,
      pr.id AS purchaseReturnId,
      pr.returnNumber,
      pr.purchaseId,
      pu.invoiceNumber,
      pu.purchaseDate AS invoiceDate,
      pr.returnDate,
      pr.supplierId,
      pt.name AS supplierName,
      pt.phone AS supplierPhone,
      pri.productId,
      pri.productName,
      pri.barcode,
      pri.productBatchId,
      pri.batchNumber,
      pri.quantity AS returnedQuantity,
      pri.quantityUnit,
      pri.purchaseRate AS purchasePrice,
      pri.totalAmount AS returnValue,
      pr.appliedToPayable,
      pr.supplierCreditAmount,
      CASE
        WHEN pr.appliedToPayable > 0 AND pr.supplierCreditAmount > 0 THEN 'APPLIED + SUPPLIER CREDIT'
        WHEN pr.appliedToPayable > 0 THEN 'APPLIED TO PAYABLE'
        WHEN pr.supplierCreditAmount > 0 THEN 'SUPPLIER CREDIT'
        ELSE 'NO CREDIT RECORDED'
      END AS refundCreditStatus,
      pr.reason,
      pr.status AS returnStatus,
      pr.createdBy AS processedById,
      u.name AS processedBy,
      sm.id AS stockMovementId,
      sm.movementType AS stockMovementType,
      sm.quantity AS stockMovementQuantity,
      sm.quantityUnit AS stockMovementUnit,
      sm.createdAt AS stockMovementDate
    FROM purchase_return_items pri
    INNER JOIN purchase_returns pr ON pr.id = pri.purchaseReturnId
    INNER JOIN purchases pu ON pu.id = pr.purchaseId AND pu.companyId = pr.companyId
    LEFT JOIN parties pt ON pt.id = pr.supplierId
    LEFT JOIN users u ON u.id = pr.createdBy AND u.companyId = pr.companyId
    LEFT JOIN (
      SELECT referenceId, productId, batchId, MAX(id) AS movementId
      FROM stock_movements
      WHERE referenceType = 'PurchaseReturn'
      GROUP BY referenceId, productId, batchId
    ) sm_latest
      ON BINARY sm_latest.referenceId = BINARY CAST(pr.id AS CHAR)
      AND sm_latest.productId = pri.productId
      AND sm_latest.batchId = pri.productBatchId
    LEFT JOIN stock_movements sm ON sm.id = sm_latest.movementId
    ${whereSql(conditions)}`;
  const summarySql = `SELECT
      COUNT(DISTINCT CASE WHEN returnStatus = 'ACTIVE' THEN purchaseReturnId END) AS totalReturns,
      COALESCE(SUM(CASE WHEN returnStatus = 'ACTIVE' THEN returnedQuantity ELSE 0 END), 0) AS totalReturnedQuantity,
      COALESCE(SUM(CASE WHEN returnStatus = 'ACTIVE' THEN returnValue ELSE 0 END), 0) AS totalReturnValue,
      COUNT(DISTINCT CASE WHEN returnStatus = 'ACTIVE' THEN supplierId END) AS totalSuppliers,
      COUNT(DISTINCT CASE WHEN returnStatus = 'ACTIVE' THEN purchaseReturnId END) AS completedReturns,
      COUNT(DISTINCT CASE WHEN returnStatus = 'CANCELLED' THEN purchaseReturnId END) AS cancelledReturns
    FROM (${baseSql}) report_rows`;
  const sort = stableSort(H.parseSort(query, {
    returnDate: 'returnDate',
    returnNumber: 'returnNumber',
    invoiceNumber: 'invoiceNumber',
    supplierName: 'supplierName',
    productName: 'productName',
    returnedQuantity: 'returnedQuantity',
    returnValue: 'returnValue',
    returnStatus: 'returnStatus',
  }, 'returnDate'));
  return { baseSql, params, summarySql, sort, numeric: ['returnedQuantity', 'purchasePrice', 'returnValue', 'appliedToPayable', 'supplierCreditAmount', 'stockMovementQuantity'] };
}

const expiryStatusSql = (date = 'DATE(pb.expiryDate)') => `CASE
  WHEN ${date} < CURRENT_DATE() THEN 'EXPIRED'
  WHEN ${date} = CURRENT_DATE() THEN 'TODAY'
  WHEN ${date} <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY) THEN 'WITHIN_7_DAYS'
  WHEN ${date} <= DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY) THEN 'WITHIN_30_DAYS'
  WHEN ${date} <= DATE_ADD(CURRENT_DATE(), INTERVAL 60 DAY) THEN 'WITHIN_60_DAYS'
  ELSE 'SAFE'
END`;

function buildExpiryProducts(query, companyId) {
  const params = new Params();
  params.values.companyId = companyId;
  const conditions = [
    'pb.companyId = :companyId',
    'pb.availableQuantity > 0',
    'pb.expiryDate IS NOT NULL',
  ];
  const range = commonDateParams(query);
  addRange(conditions, params, 'DATE(pb.expiryDate)', range);

  const expiryStatus = H.parseEnum('expiryStatus', query.expiryStatus, EXPIRY_STATUS);
  const productName = H.str(query.productName);
  const barcode = H.str(query.barcode);
  const categoryId = H.parseId('categoryId', query.categoryId);
  const brandId = H.parseId('brandId', query.brandId);
  const batchNumber = H.str(query.batchNumber);
  const supplierName = H.str(query.supplierName);
  const search = H.str(query.search);
  if (expiryStatus) conditions.push(`${expiryStatusSql()} = ${params.add(expiryStatus)}`);
  if (productName) conditions.push(`p.name LIKE ${addLike(params, productName)}`);
  if (barcode) conditions.push(`p.barcode LIKE ${addLike(params, barcode)}`);
  if (categoryId) conditions.push(`p.categoryId = ${params.add(categoryId)}`);
  if (brandId) conditions.push(`p.brandId = ${params.add(brandId)}`);
  if (batchNumber) conditions.push(`pb.batchNumber LIKE ${addLike(params, batchNumber)}`);
  if (supplierName) conditions.push(`supplier.name LIKE ${addLike(params, supplierName)}`);
  if (search) {
    const match = addLike(params, search);
    conditions.push(`(
      p.name LIKE ${match} OR COALESCE(p.barcode, '') LIKE ${match} OR
      pb.batchNumber LIKE ${match} OR COALESCE(supplier.name, '') LIKE ${match}
    )`);
  }

  const baseSql = `SELECT
      pb.id AS id,
      pb.id AS batchId,
      pb.productId,
      p.name AS productName,
      p.barcode,
      cat.category AS categoryName,
      br.name AS brandName,
      pb.batchNumber,
      pb.mfgDate AS manufacturingDate,
      DATE(pb.expiryDate) AS expiryDate,
      DATEDIFF(DATE(pb.expiryDate), CURRENT_DATE()) AS daysRemaining,
      pb.mrp,
      COALESCE(pb.inventoryUnitCost, pb.purchasePrice) AS purchasePrice,
      pb.availableQuantity,
      (pb.availableQuantity * COALESCE(pb.inventoryUnitCost, pb.purchasePrice, 0)) AS stockValue,
      ${expiryStatusSql()} AS expiryStatus,
      supplier.name AS supplierName,
      supplier.phone AS supplierPhone,
      purchase.invoiceNumber AS purchaseInvoiceNumber,
      purchase.id AS purchaseId,
      COALESCE(pb.inventoryUnitCost, pb.purchasePrice) AS valuationUnitCost
    FROM product_batches pb
    INNER JOIN products p ON p.id = pb.productId
    LEFT JOIN categories cat ON cat.id = p.categoryId
    LEFT JOIN brands br ON br.id = p.brandId
    LEFT JOIN (
      SELECT pi.productBatchId, MAX(pi.purchaseId) AS purchaseId
      FROM purchase_items pi
      WHERE pi.productBatchId IS NOT NULL
      GROUP BY pi.productBatchId
    ) batch_purchase ON batch_purchase.productBatchId = pb.id
    LEFT JOIN purchases purchase
      ON purchase.id = batch_purchase.purchaseId AND purchase.companyId = pb.companyId
    LEFT JOIN parties supplier ON supplier.id = purchase.partyId
    ${whereSql(conditions)}`;
  const summarySql = `SELECT
      COUNT(CASE WHEN expiryStatus = 'EXPIRED' THEN 1 END) AS expiredBatches,
      COALESCE(SUM(CASE WHEN expiryStatus = 'EXPIRED' THEN availableQuantity ELSE 0 END), 0) AS expiredQuantity,
      COUNT(CASE WHEN expiryStatus = 'TODAY' THEN 1 END) AS expiringToday,
      COUNT(CASE WHEN expiryStatus = 'WITHIN_7_DAYS' THEN 1 END) AS expiringWithin7Days,
      COUNT(CASE WHEN expiryStatus = 'WITHIN_30_DAYS' THEN 1 END) AS expiringWithin30Days,
      COUNT(CASE WHEN expiryStatus = 'WITHIN_60_DAYS' THEN 1 END) AS expiringWithin60Days,
      COALESCE(SUM(CASE WHEN expiryStatus IN ('TODAY', 'WITHIN_7_DAYS', 'WITHIN_30_DAYS', 'WITHIN_60_DAYS')
        THEN stockValue ELSE 0 END), 0) AS expiringStockValue
    FROM (${baseSql}) report_rows`;
  const sort = stableSort(H.parseSort(query, {
    productName: 'productName',
    batchNumber: 'batchNumber',
    expiryDate: 'expiryDate',
    daysRemaining: 'daysRemaining',
    availableQuantity: 'availableQuantity',
    stockValue: 'stockValue',
  }, 'expiryDate', 'ASC'));
  return { baseSql, params, summarySql, sort, numeric: ['daysRemaining', 'mrp', 'purchasePrice', 'availableQuantity', 'stockValue', 'valuationUnitCost'] };
}

function buildLoyaltyRedemptions(query, companyId) {
  const params = new Params();
  params.values.companyId = companyId;
  const conditions = ['u.companyId = :companyId'];
  const range = commonDateParams(query);
  addRange(conditions, params, 'r.createdAt', range);

  const customerName = H.str(query.customerName);
  const customerPhone = H.str(query.customerPhone);
  const invoiceNumber = H.str(query.invoiceNumber);
  const reference = H.str(query.referenceNumber);
  const status = H.parseEnum('status', query.status, REDEMPTION_STATUS);
  const userId = H.parseId('userId', query.userId);
  const billType = H.parseEnum('billType', query.billType, BILL_TYPES);
  const search = H.str(query.search);
  if (status && status !== 'ALL') conditions.push(`r.status = ${params.add(status)}`);
  if (customerName) conditions.push(`c.name LIKE ${addLike(params, customerName)}`);
  if (customerPhone) conditions.push(`c.phone LIKE ${addLike(params, customerPhone)}`);
  if (invoiceNumber) conditions.push(`s.invoiceNumber LIKE ${addLike(params, invoiceNumber)}`);
  if (reference) conditions.push(`CONCAT('LR-', r.id) LIKE ${addLike(params, reference)}`);
  if (userId) conditions.push(`r.performedBy = ${params.add(userId)}`);
  if (billType) conditions.push(`s.bill_type = ${params.add(billType)}`);
  if (search) {
    const match = addLike(params, search);
    conditions.push(`(
      c.name LIKE ${match} OR c.phone LIKE ${match} OR
      COALESCE(s.invoiceNumber, '') LIKE ${match} OR
      CONCAT('LR-', r.id) LIKE ${match} OR
      r.rewardDescription LIKE ${match}
    )`);
  }

  const baseSql = `SELECT
      r.id AS id,
      CONCAT('LR-', r.id) AS referenceNumber,
      r.customerId,
      r.saleId,
      r.createdAt AS redemptionDate,
      c.name AS customerName,
      c.phone AS customerPhone,
      s.invoiceNumber,
      s.bill_type AS billType,
      r.pointsRedeemed,
      CASE WHEN r.rewardType = 'CASH_DISCOUNT' THEN r.rewardValue ELSE NULL END AS redemptionValue,
      CASE WHEN r.rewardType = 'CASH_DISCOUNT' AND r.rewardValue IS NOT NULL
        THEN ROUND(r.rewardValue / NULLIF(r.pointsRedeemed, 0), 4) ELSE NULL END AS redemptionRate,
      r.redemptionMethod,
      r.rewardType,
      r.rewardDescription,
      r.reason,
      r.status AS redemptionStatus,
      r.pointsReversed,
      r.performedBy AS processedById,
      u.name AS processedBy,
      (SELECT lt.id FROM loyalty_transactions lt
        WHERE lt.redemptionId = r.id AND lt.transactionType = 'REDEEM'
        ORDER BY lt.id LIMIT 1) AS ledgerTransactionId,
      (SELECT lt.id FROM loyalty_transactions lt
        WHERE lt.redemptionId = r.id AND lt.transactionType = 'REVERSAL'
        ORDER BY lt.id DESC LIMIT 1) AS reversalTransactionId
    FROM loyalty_redemptions r
    INNER JOIN users u ON u.id = r.performedBy
    INNER JOIN customers c ON c.id = r.customerId
    LEFT JOIN sales s ON s.id = r.saleId AND s.companyId = u.companyId
    ${whereSql(conditions)}`;
  const summarySql = `SELECT
      COUNT(CASE WHEN redemptionStatus = 'COMPLETED' THEN 1 END) AS totalRedemptions,
      COALESCE(SUM(CASE WHEN redemptionStatus = 'COMPLETED' THEN pointsRedeemed ELSE 0 END), 0) AS totalPointsRedeemed,
      COALESCE(SUM(CASE WHEN redemptionStatus = 'COMPLETED' THEN redemptionValue ELSE 0 END), 0) AS totalRedemptionValue,
      COUNT(DISTINCT CASE WHEN redemptionStatus = 'COMPLETED' THEN customerId END) AS uniqueCustomers,
      COALESCE(AVG(CASE WHEN redemptionStatus = 'COMPLETED' THEN pointsRedeemed END), 0) AS averagePointsPerRedemption,
      COUNT(CASE WHEN redemptionStatus = 'REVERSED' THEN 1 END) AS reversedRedemptions
    FROM (${baseSql}) report_rows`;
  const sort = stableSort(H.parseSort(query, {
    redemptionDate: 'redemptionDate',
    referenceNumber: 'referenceNumber',
    customerName: 'customerName',
    pointsRedeemed: 'pointsRedeemed',
    redemptionValue: 'redemptionValue',
    redemptionStatus: 'redemptionStatus',
  }, 'redemptionDate'));
  return { baseSql, params, summarySql, sort, numeric: ['pointsRedeemed', 'redemptionValue', 'redemptionRate', 'pointsReversed'] };
}

const BUILDERS = {
  'sales-returns': buildSalesReturns,
  'purchase-returns': buildPurchaseReturns,
  'expiry-products': buildExpiryProducts,
  'loyalty-redemptions': buildLoyaltyRedemptions,
};

const REPORT_COLUMNS = {
  'sales-returns': [
    ['returnNumber', 'Return Reference'], ['invoiceNumber', 'Original Invoice'],
    ['returnDate', 'Return Date'], ['customerName', 'Customer'], ['customerPhone', 'Customer Mobile'],
    ['productName', 'Product'], ['sku', 'SKU'], ['barcode', 'Barcode'], ['batchNumber', 'Batch'],
    ['originalSoldQuantity', 'Original Sold Quantity'], ['previousReturnedQuantity', 'Previously Returned Quantity'],
    ['originalSellingRate', 'Original Selling Rate'], ['gstRate', 'GST Rate'],
    ['returnedQuantity', 'Returned Quantity'], ['quantityUnit', 'Unit'],
    ['returnCondition', 'Return Condition'], ['inventoryDisposition', 'Inventory Disposition'],
    ['reason', 'Reason'], ['returnAmount', 'Return Amount'],
    ['creditAmount', 'Credit Amount'], ['refundStatus', 'Refund/Credit'], ['processedBy', 'Processed By'],
    ['returnStatus', 'Status'], ['billType', 'Bill Type'],
  ],
  'purchase-returns': [
    ['returnNumber', 'Return Reference'], ['invoiceNumber', 'Original Purchase Invoice'],
    ['returnDate', 'Return Date'], ['supplierName', 'Supplier'], ['supplierPhone', 'Supplier Mobile'],
    ['productName', 'Product'], ['barcode', 'Barcode'], ['batchNumber', 'Batch'],
    ['returnedQuantity', 'Returned Quantity'], ['quantityUnit', 'Unit'],
    ['purchasePrice', 'Purchase Price'], ['returnValue', 'Return Value'],
    ['reason', 'Reason'], ['refundCreditStatus', 'Refund/Credit Status'],
    ['processedBy', 'Processed By'], ['returnStatus', 'Status'],
  ],
  'expiry-products': [
    ['productName', 'Product'], ['barcode', 'Barcode'], ['categoryName', 'Category'],
    ['brandName', 'Brand'], ['batchNumber', 'Batch'], ['manufacturingDate', 'Manufacturing Date'],
    ['expiryDate', 'Expiry Date'], ['daysRemaining', 'Days Remaining'], ['mrp', 'MRP'],
    ['purchasePrice', 'Purchase Price'], ['availableQuantity', 'Available Batch Quantity'],
    ['stockValue', 'Stock Value (Cost)'], ['expiryStatus', 'Expiry Status'],
    ['supplierName', 'Supplier'], ['purchaseInvoiceNumber', 'Purchase Invoice'],
  ],
  'loyalty-redemptions': [
    ['referenceNumber', 'Redemption Reference'], ['redemptionDate', 'Redemption Date'],
    ['customerName', 'Customer'], ['customerPhone', 'Customer Mobile'],
    ['invoiceNumber', 'Invoice'], ['pointsRedeemed', 'Points Redeemed'],
    ['redemptionRate', 'Recorded Value Per Point'], ['redemptionValue', 'Redemption Value'],
    ['processedBy', 'Processed By'], ['redemptionStatus', 'Status'],
    ['redemptionMethod', 'Method'], ['rewardType', 'Reward Type'],
  ],
};

function makeReportQuery(type, query, companyId) {
  if (!BUILDERS[type]) throw new ReportError('Unknown Other Reports report type', 404);
  return BUILDERS[type](query, companyId);
}

async function getSalesReturnConditionBreakdown(query, summary) {
  const rows = await H.run(query.conditionSql, query.params.values);
  const normalizedRows = H.normalize(rows, ['returnedQuantity', 'returnAmount'], {
    returnedQuantity: 3,
  });
  const rowsByCondition = new Map(normalizedRows.map((row) => [row.returnCondition, row]));
  return [
    ...SALES_RETURN_CONDITIONS.map((returnCondition) => ({
      returnCondition,
      returnedQuantity: rowsByCondition.get(returnCondition)?.returnedQuantity || 0,
      returnAmount: rowsByCondition.get(returnCondition)?.returnAmount || 0,
    })),
    {
      returnCondition: 'TOTAL',
      returnedQuantity: summary.totalReturnedQuantity,
      returnAmount: summary.totalReturnValue,
    },
  ];
}

const listOtherReport = H.handler(async (req, res) => {
  const type = String(req.params.type || '').toLowerCase();
  const companyId = companyIdFor(req);
  const query = makeReportQuery(type, req.query, companyId);
  const page = H.parsePagination(req.query);
  const result = await H.runPaged({
    baseSql: query.baseSql,
    params: query.params,
    orderBy: query.sort.orderBy,
    pg: page,
    numeric: query.numeric,
    numericPrecision: { originalSoldQuantity: 3, previousReturnedQuantity: 3, returnedQuantity: 3, stockMovementQuantity: 3 },
    summarySql: query.summarySql,
    summaryNumeric: [
      'totalReturns', 'totalReturnedQuantity', 'totalReturnValue',
      'totalReturnCreditAmount', 'resalableQuantity', 'damagedQuantity', 'expiredQuantity',
      'resalableReturnAmount', 'damagedReturnAmount', 'expiredReturnAmount',
      'unclassifiedQuantity', 'totalSuppliers',
      'completedReturns', 'cancelledReturns', 'expiredBatches',
      'expiredQuantity', 'expiringToday', 'expiringWithin7Days',
      'expiringWithin30Days', 'expiringWithin60Days', 'expiringStockValue',
      'totalRedemptions', 'totalPointsRedeemed', 'totalRedemptionValue',
      'uniqueCustomers', 'averagePointsPerRedemption', 'reversedRedemptions',
    ],
    summaryNumericPrecision: {
      totalReturnedQuantity: 3,
      resalableQuantity: 3,
      damagedQuantity: 3,
      expiredQuantity: 3,
      unclassifiedQuantity: 3,
    },
  });
  if (query.conditionSql) {
    result.summary.conditionBreakdown = await getSalesReturnConditionBreakdown(query, result.summary);
  }
  return H.send(res, {
    ...result,
    filters: {
      applied: Object.fromEntries(
        Object.entries(req.query).filter(([key, value]) =>
          key !== 'page' && key !== 'limit' && key !== 'sortBy' && key !== 'sortOrder' &&
          value !== undefined && value !== '',
        ),
      ),
    },
  });
});

function detailQuery(type, id, companyId) {
  if (type === 'sales-returns') {
    return {
      sql: `SELECT sr.id, COALESCE(src.code, CONCAT('SR-', LPAD(sr.id, 8, '0'))) AS returnNumber,
          s.id AS saleId, s.invoiceNumber, s.saleDate AS invoiceDate, s.bill_type AS billType,
          s.paymentStatus AS invoiceStatus, sr.createdAt AS returnDate,
          COALESCE(c.name, s.partyNameSnapshot, pt.name, 'Walk-in customer') AS customerName,
          c.phone AS customerPhone, si.productName, si.sku, pr.barcode,
          COALESCE(pb.batchNumber, si.batchNo) AS batchNumber,
          si.quantity AS originalSoldQuantity,
          COALESCE((
            SELECT SUM(_prev.quantity)
            FROM sales_returns _prev
            WHERE _prev.saleItemId = sr.saleItemId AND _prev.id < sr.id
          ), 0) AS previousReturnedQuantity,
          si.price AS originalSellingRate, si.taxPercentage AS gstRate,
          si.taxAmount AS saleItemTaxAmount, cat.category AS categoryName,
          br.name AS brandName,
          sr.quantity AS returnedQuantity, sr.quantityUnit, sr.returnCondition,
          CASE sr.returnCondition
            WHEN 'GOOD' THEN 'Saleable stock restored'
            WHEN 'DAMAGED' THEN 'Damaged return excluded from saleable stock'
            WHEN 'EXPIRED' THEN 'Expired return excluded from saleable stock'
          END AS inventoryDisposition,
          sr.reason, sr.returnedAmount, sr.returnCreditId,
          CASE WHEN sr.returnCreditId IS NULL THEN NULL ELSE src.code END AS returnCreditReference,
          CASE WHEN sr.returnCreditId IS NULL THEN 0 ELSE sr.returnedAmount END AS creditAmount,
          u.name AS processedBy, sm.id AS stockMovementId, sm.movementType,
          sm.quantity AS movementQuantity, sm.quantityUnit AS movementUnit,
          sm.referenceType AS movementReferenceType, sm.referenceId AS movementReferenceId,
          sm.notes AS movementNotes, sm.createdAt AS movementDate
        FROM sales_returns sr
        INNER JOIN sales s ON s.id = sr.saleId AND s.companyId = :companyId
        LEFT JOIN sales_items si ON si.id = sr.saleItemId
        LEFT JOIN products pr ON pr.id = sr.productId
        LEFT JOIN product_batches pb ON pb.id = sr.productBatchId
        LEFT JOIN customers c ON c.id = s.customerId
        LEFT JOIN parties pt ON pt.id = s.partyId
        LEFT JOIN categories cat ON cat.id = pr.categoryId
        LEFT JOIN brands br ON br.id = pr.brandId
        LEFT JOIN sales_return_credits src ON src.id = sr.returnCreditId
        LEFT JOIN (
          SELECT referenceId, MAX(id) AS movementId
          FROM stock_movements
          WHERE referenceType = 'SalesReturn'
          GROUP BY referenceId
        ) sm_latest ON BINARY sm_latest.referenceId = BINARY CAST(sr.id AS CHAR)
        LEFT JOIN stock_movements sm ON sm.id = sm_latest.movementId
        LEFT JOIN users u ON u.id = sm.performedBy AND u.companyId = s.companyId
        WHERE sr.id = :id AND s.paymentStatus <> 'Cancelled'`,
      replacements: { companyId, id },
    };
  }
  if (type === 'purchase-returns') {
    return {
      sql: `SELECT pr.id AS purchaseReturnId, pr.returnNumber, pr.returnDate,
          pr.reason, pr.notes, pr.status AS returnStatus, pr.subtotal, pr.discountAmount,
          pr.totalTax, pr.grandTotal, pr.appliedToPayable, pr.supplierCreditAmount,
          pr.cancelledAt, pr.cancelledBy, pu.id AS purchaseId, pu.invoiceNumber,
          pu.purchaseDate AS invoiceDate, pt.name AS supplierName, pt.phone AS supplierPhone,
          u.name AS processedBy, JSON_ARRAYAGG(JSON_OBJECT(
            'productName', pri.productName, 'barcode', pri.barcode,
            'batchNumber', pri.batchNumber, 'quantity', pri.quantity,
            'quantityUnit', pri.quantityUnit, 'purchasePrice', pri.purchaseRate,
            'returnValue', pri.totalAmount, 'batchId', pri.productBatchId
          )) AS items
        FROM purchase_returns pr
        INNER JOIN purchases pu ON pu.id = pr.purchaseId AND pu.companyId = pr.companyId
        INNER JOIN parties pt ON pt.id = pr.supplierId
        LEFT JOIN users u ON u.id = pr.createdBy AND u.companyId = pr.companyId
        LEFT JOIN purchase_return_items pri ON pri.purchaseReturnId = pr.id
        WHERE pr.id = :id AND pr.companyId = :companyId
        GROUP BY pr.id`,
      replacements: { companyId, id },
    };
  }
  if (type === 'expiry-products') {
    return {
      sql: `SELECT pb.id AS batchId, p.id AS productId, p.name AS productName,
          p.barcode, cat.category AS categoryName, br.name AS brandName,
          pb.batchNumber, pb.mfgDate AS manufacturingDate, DATE(pb.expiryDate) AS expiryDate,
          DATEDIFF(DATE(pb.expiryDate), CURRENT_DATE()) AS daysRemaining,
          pb.mrp, COALESCE(pb.inventoryUnitCost, pb.purchasePrice) AS purchasePrice,
          pb.availableQuantity, (pb.availableQuantity * COALESCE(pb.inventoryUnitCost, pb.purchasePrice, 0)) AS stockValue,
          supplier.name AS supplierName, supplier.phone AS supplierPhone,
          purchase.invoiceNumber AS purchaseInvoiceNumber, purchase.id AS purchaseId
        FROM product_batches pb
        INNER JOIN products p ON p.id = pb.productId
        LEFT JOIN categories cat ON cat.id = p.categoryId
        LEFT JOIN brands br ON br.id = p.brandId
        LEFT JOIN (
          SELECT pi.productBatchId, MAX(pi.purchaseId) AS purchaseId
          FROM purchase_items pi WHERE pi.productBatchId IS NOT NULL GROUP BY pi.productBatchId
        ) batch_purchase ON batch_purchase.productBatchId = pb.id
        LEFT JOIN purchases purchase ON purchase.id = batch_purchase.purchaseId AND purchase.companyId = pb.companyId
        LEFT JOIN parties supplier ON supplier.id = purchase.partyId
        WHERE pb.id = :id AND pb.companyId = :companyId`,
      replacements: { companyId, id },
    };
  }
  if (type === 'loyalty-redemptions') {
    return {
      sql: `SELECT r.id, CONCAT('LR-', r.id) AS referenceNumber, r.customerId, r.saleId,
          r.createdAt AS redemptionDate, c.name AS customerName, c.phone AS customerPhone,
          s.invoiceNumber, s.bill_type AS billType, r.pointsRedeemed, r.pointsReversed,
          CASE WHEN r.rewardType = 'CASH_DISCOUNT' THEN r.rewardValue ELSE NULL END AS redemptionValue,
          CASE WHEN r.rewardType = 'CASH_DISCOUNT' AND r.rewardValue IS NOT NULL
            THEN ROUND(r.rewardValue / NULLIF(r.pointsRedeemed, 0), 4) ELSE NULL END AS redemptionRate,
          r.redemptionMethod, r.rewardType, r.rewardDescription, r.reason,
          r.status AS redemptionStatus, u.name AS processedBy,
          (SELECT lt.id FROM loyalty_transactions lt
            WHERE lt.redemptionId = r.id AND lt.transactionType = 'REDEEM'
            ORDER BY lt.id LIMIT 1) AS ledgerTransactionId,
          (SELECT lt.pointsDelta FROM loyalty_transactions lt
            WHERE lt.redemptionId = r.id AND lt.transactionType = 'REDEEM'
            ORDER BY lt.id LIMIT 1) AS ledgerPointsDelta,
          (SELECT lt.balanceAfter FROM loyalty_transactions lt
            WHERE lt.redemptionId = r.id AND lt.transactionType = 'REDEEM'
            ORDER BY lt.id LIMIT 1) AS ledgerBalanceAfter,
          (SELECT lt.createdAt FROM loyalty_transactions lt
            WHERE lt.redemptionId = r.id AND lt.transactionType = 'REDEEM'
            ORDER BY lt.id LIMIT 1) AS ledgerDate,
          (SELECT lt.id FROM loyalty_transactions lt
            WHERE lt.redemptionId = r.id AND lt.transactionType = 'REVERSAL'
            ORDER BY lt.id DESC LIMIT 1) AS reversalTransactionId,
          (SELECT lt.createdAt FROM loyalty_transactions lt
            WHERE lt.redemptionId = r.id AND lt.transactionType = 'REVERSAL'
            ORDER BY lt.id DESC LIMIT 1) AS reversalDate
        FROM loyalty_redemptions r
        INNER JOIN users u ON u.id = r.performedBy AND u.companyId = :companyId
        INNER JOIN customers c ON c.id = r.customerId
        LEFT JOIN sales s ON s.id = r.saleId AND s.companyId = :companyId
        WHERE r.id = :id`,
      replacements: { companyId, id },
    };
  }
  throw new ReportError('Unknown Other Reports report type', 404);
}

const getOtherReportDetails = H.handler(async (req, res) => {
  const type = String(req.params.type || '').toLowerCase();
  const id = H.parseId('id', req.params.id);
  const companyId = companyIdFor(req);
  if (!REPORTS.includes(type)) throw new ReportError('Unknown Other Reports report type', 404);
  const query = detailQuery(type, id, companyId);
  const rows = await H.run(query.sql, query.replacements);
  if (!rows.length) throw new ReportError('Report record not found', 404);
  return H.send(res, { data: rows[0] });
});

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const exportOtherReport = async (req, res) => {
  try {
  const type = String(req.params.type || '').toLowerCase();
  const format = String(req.query.format || '').toLowerCase();
  if (!REPORTS.includes(type)) throw new ReportError('Unknown Other Reports report type', 404);
  if (!['csv', 'xlsx'].includes(format)) throw new ReportError('format must be csv or xlsx');
  const companyId = companyIdFor(req);
  const query = makeReportQuery(type, req.query, companyId);
  const totalRows = await H.run(`SELECT COUNT(*) AS total FROM (${query.baseSql}) report_rows`, query.params.values);
  const total = Number(totalRows[0]?.total || 0);
  const summaryRows = await H.run(query.summarySql, query.params.values);
  const summary = summaryRows[0] || {};
  const conditionBreakdown = query.conditionSql
    ? await getSalesReturnConditionBreakdown(
        query,
        H.normalize([summary], ['totalReturnedQuantity', 'totalReturnValue'], { totalReturnedQuantity: 3 })[0],
      )
    : null;
  const fileName = `${type}-${new Date().toISOString().slice(0, 10)}`;
  const columns = REPORT_COLUMNS[type];

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
    res.write(`Report,${csvCell(type)}\r\n`);
    Object.entries(summary).forEach(([key, value]) => {
      res.write(`${csvCell(key)},${csvCell(value)}\r\n`);
    });
    if (conditionBreakdown) {
      res.write('\r\nCondition Breakdown\r\n');
      res.write(`${csvCell('Return Condition')},${csvCell('Returned Quantity')},${csvCell('Return Value')}\r\n`);
      conditionBreakdown.forEach((row) => {
        res.write(`${csvCell(row.returnCondition)},${csvCell(row.returnedQuantity)},${csvCell(row.returnAmount)}\r\n`);
      });
    }
    res.write('\r\n');
    res.write(`${columns.map(([, label]) => csvCell(label)).join(',')}\r\n`);
    for (let offset = 0; offset < total; offset += 500) {
      const pageRows = await H.run(
        `SELECT * FROM (${query.baseSql}) report_rows ORDER BY ${query.sort.orderBy} LIMIT 500 OFFSET ${offset}`,
        query.params.values,
      );
      pageRows.forEach((row) => {
        res.write(`${columns.map(([key]) => csvCell(row[key])).join(',')}\r\n`);
      });
    }
    return res.end();
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.addRow(['Report', type]).commit();
  summarySheet.addRow(['Filtered records', total]).commit();
  Object.entries(summary).forEach(([key, value]) => summarySheet.addRow([key, Number(value)]).commit());
  if (conditionBreakdown) {
    summarySheet.addRow([]).commit();
    summarySheet.addRow(['Return Condition', 'Returned Quantity', 'Return Value']).commit();
    conditionBreakdown.forEach((row) => {
      summarySheet.addRow([row.returnCondition, row.returnedQuantity, row.returnAmount]).commit();
    });
  }
  const dataSheet = workbook.addWorksheet('Report');
  dataSheet.columns = columns.map(([key, header]) => ({ key, header, width: Math.max(header.length + 2, 15) }));
  for (let offset = 0; offset < total; offset += 500) {
    const pageRows = await H.run(
      `SELECT * FROM (${query.baseSql}) report_rows ORDER BY ${query.sort.orderBy} LIMIT 500 OFFSET ${offset}`,
      query.params.values,
    );
    pageRows.forEach((row) => dataSheet.addRow(row).commit());
  }
  dataSheet.commit();
  summarySheet.commit();
  await workbook.commit();
  } catch (error) {
    if (res.headersSent) {
      console.error('Other report export error:', error);
      res.destroy();
      return;
    }
    if (error instanceof ReportError) {
      res.status(error.status).json({ success: false, message: error.message });
      return;
    }
    console.error('Other report export error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listOtherReport,
  getOtherReportDetails,
  exportOtherReport,
  buildSalesReturns,
  buildPurchaseReturns,
  buildExpiryProducts,
  buildLoyaltyRedemptions,
  expiryStatusSql,
};
