'use strict';

const H = require('../utils/reportHelpers');
const {
  buildGstTemplateReport,
  REPORTS,
} = require('../utils/gstTemplateReports');

const TEMPLATE_LIMITATIONS = [
  'Legacy invoices without a saved GST snapshot retain their original financial amounts, but historical supplier/customer GSTIN, registration, place of supply, and GST split are not reconstructed from current party or company data.',
  'The database does not store cess, export shipping details, import documents, advances, purchase credit/debit notes, nil-rated versus exempt classification, or ITC reversals/reclaims. Corresponding template worksheets are kept and left blank where source data is unavailable.',
  'B2C place of supply is blank unless it was explicitly saved on the sale; the current sales workflow does not otherwise retain the customer state.',
];

function makePeriodLabel(query, period) {
  if (query.month && period.from && period.toExclusive) {
    return `${period.from.slice(0, 7)} GST reporting period`;
  }
  if (period.financialYear !== undefined) {
    return `FY ${period.financialYear}-${String((period.financialYear + 1) % 100).padStart(2, '0')}`;
  }
  if (query.fromDate || query.toDate) {
    return `${query.fromDate || 'Beginning'} to ${query.toDate || 'Current'}`;
  }
  return 'All available periods';
}

function dateConditions(period, dateColumn, params) {
  const conditions = [];
  if (period.empty) conditions.push('1 = 0');
  if (period.from) conditions.push(`${dateColumn} >= ${params.add(period.from)}`);
  if (period.toExclusive) conditions.push(`${dateColumn} < ${params.add(period.toExclusive)}`);
  return conditions;
}

async function loadSales(companyId, period) {
  const params = new H.Params();
  const conditions = [
    `s.companyId = ${params.add(companyId)}`,
    `s.bill_type = 'B2C'`,
    `s.paymentStatus <> 'Cancelled'`,
    ...dateConditions(period, 's.saleDate', params),
  ];
  const conditionSql = conditions.join(' AND ');
  const rows = await H.run(
    `SELECT *
     FROM (
       SELECT
       s.id AS documentId, s.invoiceNumber, s.saleDate AS invoiceDate,
       s.bill_type AS billType, s.totalAmount, s.partyNameSnapshot,
       s.partyGstinSnapshot, s.partyRegistrationTypeSnapshot,
       s.taxTypeSnapshot, s.placeOfSupplyStateCodeSnapshot,
       s.placeOfSupplyNameSnapshot, s.reverseCharge,
       si.id AS itemId, si.productName,
       COALESCE(NULLIF(TRIM(si.hsncode), ''), NULLIF(TRIM(pr.HSNCode), '')) AS hsncode,
       si.quantityUnit,
       COALESCE(si.paidQuantity, si.quantity) AS paidQuantity,
       COALESCE(si.totalQuantity, si.quantity + si.freeQuantity) AS totalQuantity,
       si.taxPercentage AS taxRate, si.baseRate AS taxableValue,
       si.taxAmount, si.cgstAmount, si.sgstAmount, si.igstAmount,
       si.cessAmount, si.netRate AS lineValue
     FROM sales s
     INNER JOIN sales_items si ON si.saleId = s.id
     LEFT JOIN products pr ON pr.id = si.productId
     WHERE ${conditionSql}
       UNION ALL
       SELECT
       s.id AS documentId, s.invoiceNumber, s.saleDate AS invoiceDate,
       s.bill_type AS billType, s.totalAmount, s.partyNameSnapshot,
       s.partyGstinSnapshot, s.partyRegistrationTypeSnapshot,
       s.taxTypeSnapshot, s.placeOfSupplyStateCodeSnapshot,
       s.placeOfSupplyNameSnapshot, s.reverseCharge,
       CONCAT('QS-', qsi.id) AS itemId, qsi.productNameSnapshot AS productName,
       qsi.hsnCodeSnapshot AS hsncode, 'PCS' AS quantityUnit,
       qsi.quantity AS paidQuantity, qsi.quantity AS totalQuantity,
       qsi.taxPercentage AS taxRate, qsi.taxableAmount AS taxableValue,
       qsi.taxAmount, qsi.cgstAmount, qsi.sgstAmount, qsi.igstAmount,
       qsi.cessAmount, qsi.netAmount AS lineValue
     FROM sales s
     INNER JOIN quick_sale_sale_items qsi ON qsi.saleId = s.id
     WHERE ${conditionSql}
       AND qsi.gstVerificationStatus = 'GST_VERIFIED'
       AND qsi.taxableAmount IS NOT NULL
       AND qsi.taxPercentage IS NOT NULL
       AND qsi.taxAmount IS NOT NULL
     ) gst_sales_lines
     ORDER BY invoiceDate, invoiceNumber, itemId`,
    params.values,
  );
  return rows;
}

async function loadPurchases(companyId, period) {
  const params = new H.Params();
  const conditions = [
    `pu.companyId = ${params.add(companyId)}`,
    `pu.paymentStatus <> 'Cancelled'`,
    ...dateConditions(period, 'pu.purchaseDate', params),
  ];
  return H.run(
    `SELECT
       pu.id AS documentId, pu.invoiceNumber,
       pu.purchaseDate AS invoiceDate, pu.totalAmount,
       pu.partyNameSnapshot, pu.partyGstinSnapshot,
       pu.partyRegistrationTypeSnapshot, pu.invoiceType,
       pu.taxType, pu.placeOfSupplyStateCodeSnapshot,
       pu.placeOfSupplyNameSnapshot, pu.reverseCharge, pu.itcEligible,
       pi.id AS itemId, pi.productName,
       COALESCE(NULLIF(TRIM(pi.hsncode), ''), NULLIF(TRIM(pr.HSNCode), '')) AS hsncode,
       pi.quantityUnit,
       COALESCE(pi.paidQuantity, pi.quantity) AS paidQuantity,
       COALESCE(pi.totalQuantity, pi.quantity + pi.freeQuantity) AS totalQuantity,
       pi.taxPercentage AS taxRate, pi.baseRate AS taxableValue,
       pi.taxAmount, pi.cgstAmount, pi.sgstAmount, pi.igstAmount,
       pi.cessAmount, pi.netRate AS lineValue
     FROM purchases pu
     INNER JOIN purchase_items pi ON pi.purchaseId = pu.id
     LEFT JOIN products pr ON pr.id = pi.productId
     WHERE ${conditions.join(' AND ')}
     ORDER BY pu.purchaseDate, pu.invoiceNumber, pi.id`,
    params.values
  );
}

async function loadSalesReturns(companyId, period) {
  const params = new H.Params();
  const conditions = [
    `s.companyId = ${params.add(companyId)}`,
    ...dateConditions(period, 'sr.createdAt', params),
    `s.bill_type = 'B2C'`,
    `s.paymentStatus <> 'Cancelled'`,
  ];
  return H.run(
    `SELECT
       sr.id AS returnId, sr.returnCreditId, sr.quantity, sr.returnedAmount,
       sr.createdAt AS returnDate, src.code AS returnCreditCode,
       s.id AS documentId, s.bill_type AS billType,
       s.partyNameSnapshot, s.partyGstinSnapshot,
       s.partyRegistrationTypeSnapshot, s.taxTypeSnapshot,
       s.placeOfSupplyStateCodeSnapshot, s.placeOfSupplyNameSnapshot,
       s.reverseCharge, si.quantity AS saleItemQuantity,
       si.taxPercentage AS taxRate, si.taxAmount AS saleItemTaxAmount,
       si.cgstAmount AS saleItemCgstAmount,
       si.sgstAmount AS saleItemSgstAmount,
       si.igstAmount AS saleItemIgstAmount
     FROM sales_returns sr
     INNER JOIN sales s ON s.id = sr.saleId
     INNER JOIN sales_items si ON si.id = sr.saleItemId
     LEFT JOIN sales_return_credits src ON src.id = sr.returnCreditId
     WHERE ${conditions.join(' AND ')}
     ORDER BY sr.createdAt, sr.id`,
    params.values
  );
}

async function loadDocumentSummary(table, dateColumn, companyId, period, billType) {
  const params = new H.Params();
  const conditions = [
    `companyId = ${params.add(companyId)}`,
    ...dateConditions(period, dateColumn, params),
  ];
  if (billType) conditions.push(`bill_type = ${params.add(billType)}`);
  const rows = await H.run(
    `SELECT invoiceNumber, paymentStatus FROM \`${table}\`
     WHERE ${conditions.join(' AND ')}
     ORDER BY invoiceNumber`,
    params.values
  );
  if (!rows.length) return [];
  const numbers = rows.map((row) => String(row.invoiceNumber || '')).filter(Boolean).sort();
  return [{
    from: numbers[0] || '',
    to: numbers[numbers.length - 1] || '',
    total: rows.length,
    cancelled: rows.filter((row) => row.paymentStatus === 'Cancelled').length,
  }];
}

async function loadCompany(companyId) {
  const rows = await H.run(
    `SELECT c.id, c.legal_name AS legalName, c.display_name AS tradeName,
       c.state_code AS stateCode, cf.gstin
     FROM companies c
     LEFT JOIN company_financials cf ON cf.companyId = c.id
     WHERE c.id = :companyId
     LIMIT 1`,
    { companyId }
  );
  if (!rows.length) throw new H.ReportError('Company not found for the authenticated user');
  return rows[0];
}

async function loadQualityWarnings(reportType, companyId, period) {
  const table = reportType === 'gstr1' ? 'sales' : 'purchases';
  const dateColumn = reportType === 'gstr1' ? 'saleDate' : 'purchaseDate';
  const params = new H.Params();
  const conditions = [
    `companyId = ${params.add(companyId)}`,
    ...dateConditions(period, dateColumn, params),
    `paymentStatus <> 'Cancelled'`,
  ];
  if (reportType === 'gstr1') conditions.push(`bill_type = 'B2C'`);
  const snapshotColumn = 'partyRegistrationTypeSnapshot';
  const counts = await H.run(
    `SELECT COUNT(DISTINCT id) AS invoiceCount,
       SUM(CASE WHEN ${snapshotColumn} IS NULL THEN 1 ELSE 0 END) AS missingPartySnapshot,
       SUM(CASE WHEN placeOfSupplyStateCodeSnapshot IS NULL THEN 1 ELSE 0 END) AS missingPlaceOfSupply
     FROM \`${table}\`
     WHERE ${conditions.join(' AND ')}`,
    params.values
  );
  const result = counts[0] || {};
  const warnings = [];
  if (reportType === 'gstr2' && Number(result.missingPartySnapshot || 0) > 0) {
    warnings.push(
      `${result.missingPartySnapshot} invoice(s) have no saved party GST snapshot; they are not classified into registered/unregistered detail sheets.`
    );
  }
  if (Number(result.missingPlaceOfSupply || 0) > 0) {
    warnings.push(
      `${result.missingPlaceOfSupply} invoice(s) have no saved place of supply; no place has been inferred from current party data.`
    );
  }
  return { warnings, invoiceCount: Number(result.invoiceCount || 0) };
}

async function hasUnassignedPurchases(period) {
  const params = new H.Params();
  const conditions = [
    'companyId IS NULL',
    `paymentStatus <> 'Cancelled'`,
    ...dateConditions(period, 'purchaseDate', params),
  ];
  const rows = await H.run(
    `SELECT 1 FROM purchases WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params.values
  );
  return rows.length > 0;
}

function selectedCompanyId(req) {
  const companyId = Number(req.loyaltyUser?.companyId);
  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new H.ReportError('Authenticated user has no valid company assignment');
  }
  return companyId;
}

function reportType(req) {
  const type = String(req.params.type || '').toLowerCase();
  if (!REPORTS[type]) throw new H.ReportError('Report type must be gstr1 or gstr2');
  return type;
}

async function generate(req) {
  const type = reportType(req);
  const companyId = selectedCompanyId(req);
  const period = H.parseGstPeriod(req.query);
  const company = await loadCompany(companyId);
  const quality = await loadQualityWarnings(type, companyId, period);
  if (type === 'gstr2' && await hasUnassignedPurchases(period)) {
    quality.warnings.push(
      'Some legacy purchases have no company assignment and are excluded; only unambiguous single-company records are backfilled automatically.'
    );
  }
  const sales = type === 'gstr1' ? await loadSales(companyId, period) : [];
  const purchases = type === 'gstr2' ? await loadPurchases(companyId, period) : [];
  const returns = type === 'gstr1'
    ? await loadSalesReturns(companyId, period)
    : [];
  const docs = type === 'gstr1'
    ? await loadDocumentSummary('sales', 'saleDate', companyId, period, 'B2C')
    : await loadDocumentSummary('purchases', 'purchaseDate', companyId, period);

  const generated = await buildGstTemplateReport({
    reportType: type,
    sales,
    purchases,
    returns,
    docs,
    company,
    periodLabel: makePeriodLabel(req.query, period),
  });
  if (!company.gstin) {
    quality.warnings.push('Company GSTIN is not configured; the report identification cell is blank.');
  }

  return {
    type,
    company,
    period: makePeriodLabel(req.query, period),
    summary: generated.summary,
    sheets: generated.sheets,
    warnings: quality.warnings,
    limitations: TEMPLATE_LIMITATIONS,
    buffer: generated.buffer,
  };
}

const previewGstTemplateReport = H.handler(async (req, res) => {
  const generated = await generate(req);
  return H.send(res, {
    type: generated.type,
    company: generated.company,
    period: generated.period,
    summary: generated.summary,
    sheets: generated.sheets,
    warnings: generated.warnings,
    limitations: generated.limitations,
  });
});

const exportGstTemplateReport = H.handler(async (req, res) => {
  const generated = await generate(req);
  const filename = `${generated.type}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-GST-Report-Warnings', String(generated.warnings.length));
  return res.status(200).send(generated.buffer);
});

module.exports = {
  exportGstTemplateReport,
  previewGstTemplateReport,
};
