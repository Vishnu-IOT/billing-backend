const H = require('../utils/reportHelpers');
const { Params, ReportError } = H;

// ════════════════════════════════════════════════════════════════════════════
// Reports module — 19 reports, raw SQL (reports need multi-table aggregation
// that is easier to verify in SQL than through Sequelize include/group).
//
// Conventions shared by every report
//   * Query params are validated; bad values -> 400 { success:false, message }.
//   * Dates: fromDate/toDate are inclusive 'YYYY-MM-DD' (start of fromDate to
//     end of toDate). asOfDate is inclusive too.
//   * Response: { success, data, pagination:{total,page,limit,totalPages},
//     summary:{...whole filtered set...}, filters:{applied}, + legacy keys }.
//   * Endpoints that existed before stay UNPAGINATED unless page/limit is sent.
//   * Cancelled invoices are excluded unless status=Cancelled or status=All.
//   * Header totals (totalAmount, tax…) are only ever summed from the header
//     table; item-level figures only from the items table — never both through
//     the same JOIN — so nothing is double counted.
// ════════════════════════════════════════════════════════════════════════════

const DOC = {
  sales: {
    h: 's', i: 'si', table: 'sales', itemTable: 'sales_items', fk: 'saleId',
    dateCol: 'saleDate', payTable: 'payments_in', payFk: 'saleId',
  },
  purchase: {
    h: 'pu', i: 'pi', table: 'purchases', itemTable: 'purchase_items', fk: 'purchaseId',
    dateCol: 'purchaseDate', payTable: 'payments_out', payFk: 'purchaseId',
  },
};

const STATUSES = ['All', 'Paid', 'Unpaid', 'Partial', 'Overdue', 'Cancelled'];
const TX_TYPES = ['Sales', 'Purchase', 'Both'];

// ─── Filter parsing (validated once, reused for SQL + echoed in response) ───
function parseDocFilters(q, kind) {
  const f = {
    range: H.parseDateRange(q),
    partyId: H.parseId('partyId', q.partyId),
    paymentMode: H.str(q.paymentMode),
    status: H.parseEnum('status', q.status, STATUSES),
    productId: H.parseId('productId', q.productId),
    categoryId: H.parseId('categoryId', q.categoryId),
    brandId: H.parseId('brandId', q.brandId),
    search: H.str(q.search),
  };
  if (kind === 'sales') {
    f.invoiceNumber = H.str(q.invoiceNumber);
    f.billType = H.parseEnum('billType', q.billType, ['B2B', 'B2C']);
    f.userId = H.parseId('userId', q.userId);
  } else {
    f.invoiceNumber = H.str(q.purchaseNumber !== undefined ? q.purchaseNumber : q.invoiceNumber);
  }
  return f;
}

function appliedFilters(f) {
  const out = {};
  Object.entries(f).forEach(([k, v]) => {
    if (v === undefined || v === null || k === 'asOfExclusive') return;
    if (k === 'range') {
      if (v.fromDate) out.fromDate = v.fromDate;
      if (v.toDate) out.toDate = v.toDate;
      return;
    }
    if (typeof v === 'object') {
      Object.entries(v).forEach(([kk, vv]) => { if (vv !== undefined) out[kk] = vv; });
      return;
    }
    out[k] = v;
  });
  return out;
}

// WHERE conditions for a sales/purchase header (alias s / pu).
//   itemsDirect=true  -> the query already joins items (si/pi) + products (pr):
//                        product/category/brand filter the LINES themselves.
//   itemsDirect=false -> header-level query: product/category/brand become an
//                        EXISTS (invoice contains a matching line). No JOIN,
//                        so header totals can't be multiplied by line count.
function docConds(kind, f, p, { itemsDirect = false, searchCols = [] } = {}) {
  const c = DOC[kind];
  const a = c.h;
  const conds = [];

  if (f.range.from) conds.push(`${a}.${c.dateCol} >= ${p.add(f.range.from)}`);
  if (f.range.toExclusive) conds.push(`${a}.${c.dateCol} < ${p.add(f.range.toExclusive)}`);
  if (f.invoiceNumber) conds.push(`${a}.invoiceNumber LIKE ${p.add(`%${H.escapeLike(f.invoiceNumber)}%`)}`);
  if (f.partyId) conds.push(`${a}.partyId = ${p.add(f.partyId)}`);
  if (f.billType) conds.push(`${a}.bill_type = ${p.add(f.billType)}`);
  if (f.userId) conds.push(`${a}.userId = ${p.add(f.userId)}`);

  if (f.paymentMode) {
    conds.push(
      `EXISTS (SELECT 1 FROM ${c.payTable} _pm WHERE _pm.${c.payFk} = ${a}.id AND LOWER(_pm.paymentMode) = LOWER(${p.add(f.paymentMode)}))`
    );
  }

  if (!f.status) conds.push(`${a}.paymentStatus <> 'Cancelled'`);
  else if (f.status !== 'All') conds.push(`${a}.paymentStatus = ${p.add(f.status)}`);

  if (f.productId || f.categoryId || f.brandId) {
    if (itemsDirect) {
      if (f.productId) conds.push(`${c.i}.productId = ${p.add(f.productId)}`);
      if (f.categoryId) conds.push(`pr.categoryId = ${p.add(f.categoryId)}`);
      if (f.brandId) conds.push(`pr.brandId = ${p.add(f.brandId)}`);
    } else {
      const inner = [];
      if (f.productId) inner.push(`_i.productId = ${p.add(f.productId)}`);
      if (f.categoryId) inner.push(`_pr.categoryId = ${p.add(f.categoryId)}`);
      if (f.brandId) inner.push(`_pr.brandId = ${p.add(f.brandId)}`);
      conds.push(
        `EXISTS (SELECT 1 FROM ${c.itemTable} _i JOIN products _pr ON _pr.id = _i.productId WHERE _i.${c.fk} = ${a}.id AND ${inner.join(' AND ')})`
      );
    }
  }

  if (f.search && searchCols.length) {
    const ph = p.add(`%${H.escapeLike(f.search)}%`);
    conds.push(`(${searchCols.map((col) => `${col} LIKE ${ph}`).join(' OR ')})`);
  }
  return conds;
}

const where = (conds) => (conds.length ? `WHERE ${conds.join(' AND ')}` : '');

// FROM for line-level (item) reports
function lineFrom(kind, { user = false, party = 'left' } = {}) {
  const c = DOC[kind];
  return `FROM ${c.itemTable} ${c.i}
    JOIN ${c.table} ${c.h} ON ${c.h}.id = ${c.i}.${c.fk}
    LEFT JOIN products pr ON pr.id = ${c.i}.productId
    LEFT JOIN categories cat ON cat.id = pr.categoryId
    LEFT JOIN brands br ON br.id = pr.brandId
    ${user ? `LEFT JOIN users u ON u.id = ${c.h}.userId` : ''}
    ${party === 'inner' ? `JOIN parties pt ON pt.id = ${c.h}.partyId` : party === 'left' ? `LEFT JOIN parties pt ON pt.id = ${c.h}.partyId` : ''}`;
}

// ════════════════════════════════════════════════════════════════════════════
// SALES
// ════════════════════════════════════════════════════════════════════════════

// 1. @route GET /api/reports/sales-report   (invoice-level register)
const SALES_REPORT_SORT = {
  saleDate: 'saleDate', invoiceNumber: 'invoiceNumber', partyName: 'partyName', userName: 'userName',
  totalAmount: 'totalAmount', amountPaid: 'amountPaid', balanceDue: 'balanceDue', paymentStatus: 'paymentStatus',
};
const salesReport = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'sales');
  const pg = H.parsePagination(req.query);
  const sort = H.parseSort(req.query, SALES_REPORT_SORT, 'saleDate', 'DESC');
  const p = new Params();
  const conds = docConds('sales', f, p, {
    searchCols: ['s.invoiceNumber', 'pt.name', 'c.name', 'u.name', 's.po_number'],
  });

  const from = `FROM sales s
    LEFT JOIN parties pt ON pt.id = s.partyId
    LEFT JOIN customers c ON c.id = s.customerId
    LEFT JOIN users u ON u.id = s.userId
    LEFT JOIN (SELECT saleId, SUM(quantity) AS qty, COUNT(*) AS lineCount FROM sales_items GROUP BY saleId) iq ON iq.saleId = s.id
    ${where(conds)}`;

  const baseSql = `SELECT s.id, s.invoiceNumber, s.saleDate, s.partyId, pt.name AS partyName, pt.GST AS partyGST,
      c.name AS customerName, s.userId, u.name AS userName, s.bill_type AS billType, s.paymentStatus,
      s.baseRate, s.tax, s.global_discount_amount AS globalDiscount, s.totalAmount,
      ${H.effPaid('s')} AS amountPaid, ${H.balanceDue('s')} AS balanceDue,
      COALESCE(iq.qty, 0) AS totalQuantity, COALESCE(iq.lineCount, 0) AS itemCount,
      (SELECT GROUP_CONCAT(DISTINCT _pi.paymentMode ORDER BY _pi.paymentMode SEPARATOR ', ')
         FROM payments_in _pi WHERE _pi.saleId = s.id) AS paymentModes
    ${from}`;

  const summarySql = `SELECT COUNT(*) AS invoiceCount, SUM(s.totalAmount) AS totalAmount, SUM(s.tax) AS totalTax,
      SUM(s.global_discount_amount) AS totalGlobalDiscount, SUM(${H.effPaid('s')}) AS totalPaid,
      SUM(${H.balanceDue('s')}) AS totalBalanceDue, SUM(COALESCE(iq.qty, 0)) AS totalQuantity ${from}`;

  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg,
    numeric: ['baseRate', 'tax', 'globalDiscount', 'totalAmount', 'amountPaid', 'balanceDue', 'totalQuantity', 'itemCount'],
    summarySql,
    summaryNumeric: ['invoiceCount', 'totalAmount', 'totalTax', 'totalGlobalDiscount', 'totalPaid', 'totalBalanceDue', 'totalQuantity'],
  });
  return H.send(res, { ...out, filters: appliedFilters(f), sort: { sortBy: sort.sortKey, sortOrder: sort.order } });
});

// 2. @route GET /api/reports/user-report   (per sales-rep performance)
const USER_REPORT_SORT = {
  userName: 'userName', invoiceCount: 'invoiceCount', totalSales: 'totalSales', avgInvoiceValue: 'avgInvoiceValue',
  itemsSold: 'itemsSold', outstanding: 'outstanding', lastSaleDate: 'lastSaleDate',
};
const userReport = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'sales');
  const pg = H.parsePagination(req.query);
  const sort = H.parseSort(req.query, USER_REPORT_SORT, 'totalSales', 'DESC');
  const p = new Params();
  const conds = docConds('sales', f, p, { searchCols: ['u.name', 'u.email'] });

  const from = `FROM sales s
    LEFT JOIN users u ON u.id = s.userId
    LEFT JOIN (SELECT saleId, SUM(quantity) AS qty FROM sales_items GROUP BY saleId) iq ON iq.saleId = s.id
    ${where(conds)}`;

  const baseSql = `SELECT s.userId, COALESCE(u.name, 'Unassigned') AS userName, u.email, u.role,
      COUNT(*) AS invoiceCount, SUM(s.totalAmount) AS totalSales, SUM(s.tax) AS totalTax,
      SUM(s.global_discount_amount) AS totalDiscount, AVG(s.totalAmount) AS avgInvoiceValue,
      SUM(${H.effPaid('s')}) AS totalPaid, SUM(${H.balanceDue('s')}) AS outstanding,
      SUM(COALESCE(iq.qty, 0)) AS itemsSold,
      SUM(s.bill_type = 'B2B') AS b2bInvoiceCount, SUM(s.bill_type = 'B2C') AS b2cInvoiceCount,
      COUNT(DISTINCT s.partyId) AS partyCount, MIN(s.saleDate) AS firstSaleDate, MAX(s.saleDate) AS lastSaleDate
    ${from}
    GROUP BY s.userId, u.name, u.email, u.role`;

  const summarySql = `SELECT COUNT(DISTINCT s.userId) AS repCount, COUNT(*) AS invoiceCount, SUM(s.totalAmount) AS totalSales,
      SUM(s.tax) AS totalTax, SUM(s.global_discount_amount) AS totalDiscount, SUM(${H.effPaid('s')}) AS totalPaid,
      SUM(${H.balanceDue('s')}) AS outstanding, SUM(COALESCE(iq.qty, 0)) AS itemsSold ${from}`;

  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg,
    numeric: ['invoiceCount', 'totalSales', 'totalTax', 'totalDiscount', 'avgInvoiceValue', 'totalPaid', 'outstanding',
      'itemsSold', 'b2bInvoiceCount', 'b2cInvoiceCount', 'partyCount'],
    summarySql,
    summaryNumeric: ['repCount', 'invoiceCount', 'totalSales', 'totalTax', 'totalDiscount', 'totalPaid', 'outstanding', 'itemsSold'],
  });
  return H.send(res, { ...out, filters: appliedFilters(f), sort: { sortBy: sort.sortKey, sortOrder: sort.order } });
});

// 3. @route GET /api/reports/sales-by-party
const salesByParty = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'sales');
  const pg = H.parsePagination(req.query, { legacy: true });
  const sort = H.parseSort(req.query, {
    partyName: 'partyName', invoiceCount: 'invoiceCount', totalSales: 'totalSales', totalPaid: 'totalPaid', outstanding: 'outstanding',
  }, 'totalSales', 'DESC');
  const p = new Params();
  const conds = docConds('sales', f, p, { searchCols: ['pt.name', 'pt.GST', 'pt.phone', 'pt.email'] });
  const from = `FROM sales s JOIN parties pt ON pt.id = s.partyId ${where(conds)}`;

  const baseSql = `SELECT pt.id AS partyId, pt.name AS partyName, pt.GST AS partyGST,
      COUNT(DISTINCT s.id) AS invoiceCount, SUM(s.totalAmount) AS totalSales,
      SUM(${H.effPaid('s')}) AS totalPaid, SUM(${H.balanceDue('s')}) AS outstanding
    ${from} GROUP BY pt.id, pt.name, pt.GST`;
  const summarySql = `SELECT COUNT(DISTINCT pt.id) AS partyCount, COUNT(*) AS invoiceCount, SUM(s.totalAmount) AS totalSales,
      SUM(${H.effPaid('s')}) AS totalPaid, SUM(${H.balanceDue('s')}) AS outstanding ${from}`;

  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg,
    numeric: ['invoiceCount', 'totalSales', 'totalPaid', 'outstanding'], summarySql,
    summaryNumeric: ['partyCount', 'invoiceCount', 'totalSales', 'totalPaid', 'outstanding'],
  });
  return H.send(res, { ...out, filters: appliedFilters(f) });
});

// 4. @route GET /api/reports/sales-by-user
const salesByUser = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'sales');
  const pg = H.parsePagination(req.query, { legacy: true });
  const sort = H.parseSort(req.query, { userName: 'userName', invoiceCount: 'invoiceCount', totalSales: 'totalSales' }, 'totalSales', 'DESC');
  const p = new Params();
  const conds = docConds('sales', f, p, { searchCols: ['u.name', 'u.email'] });
  const from = `FROM sales s LEFT JOIN users u ON u.id = s.userId ${where(conds)}`;

  const baseSql = `SELECT s.userId, COALESCE(u.name, 'Unassigned') AS userName,
      COUNT(DISTINCT s.id) AS invoiceCount, SUM(s.totalAmount) AS totalSales
    ${from} GROUP BY s.userId, u.name`;
  const summarySql = `SELECT COUNT(DISTINCT s.userId) AS userCount, COUNT(*) AS invoiceCount, SUM(s.totalAmount) AS totalSales ${from}`;

  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg, numeric: ['invoiceCount', 'totalSales'], summarySql,
    summaryNumeric: ['userCount', 'invoiceCount', 'totalSales'],
  });
  return H.send(res, { ...out, filters: appliedFilters(f) });
});

// Shared by the three item-level sales reports + their purchase twins.
const LINE_SUM = (i) => `SUM(${i}.quantity) AS totalQuantity,
      SUM(${i}.netRate) AS %TOTAL%,
      SUM(${i}.netRate - ${i}.taxAmount) AS taxableValue,
      SUM(${i}.taxAmount) AS taxAmount,
      SUM(${i}.discountAmount) AS discountAmount`;
const LINE_NUMERIC = ['totalQuantity', 'totalSales', 'totalPurchases', 'taxableValue', 'taxAmount', 'discountAmount', 'invoiceCount', 'billCount'];

// 5. @route GET /api/reports/sales-by-item
const salesByItem = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'sales');
  const pg = H.parsePagination(req.query, { legacy: true });
  const sort = H.parseSort(req.query, {
    productName: 'productName', totalQuantity: 'totalQuantity', totalSales: 'totalSales', invoiceCount: 'invoiceCount',
    categoryName: 'categoryName', brandName: 'brandName',
  }, 'totalSales', 'DESC');
  const p = new Params();
  const conds = docConds('sales', f, p, { itemsDirect: true, searchCols: ['si.productName', 'pr.sku', 'pr.barcode'] });
  const from = `${lineFrom('sales', { party: 'none' })} ${where(conds)}`;

  const baseSql = `SELECT si.productId, si.productName, pr.sku, cat.category AS categoryName, br.name AS brandName,
      ${LINE_SUM('si').replace('%TOTAL%', 'totalSales')}, COUNT(DISTINCT si.saleId) AS invoiceCount
    ${from} GROUP BY si.productId, si.productName, pr.sku, cat.category, br.name`;
  const summarySql = `SELECT COUNT(DISTINCT si.productId) AS productCount, SUM(si.quantity) AS totalQuantity, SUM(si.netRate) AS totalSales,
      SUM(si.netRate - si.taxAmount) AS taxableValue, SUM(si.taxAmount) AS taxAmount, SUM(si.discountAmount) AS discountAmount,
      COUNT(DISTINCT s.id) AS invoiceCount ${from}`;

  const out = await H.runPaged({ baseSql, params: p, orderBy: sort.orderBy, pg, numeric: LINE_NUMERIC, summarySql, summaryNumeric: ['productCount', ...LINE_NUMERIC] });
  return H.send(res, { ...out, filters: appliedFilters(f) });
});

// 6. @route GET /api/reports/item-sales-by-user
const itemSalesByUser = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'sales');
  const pg = H.parsePagination(req.query, { legacy: true });
  const sort = H.parseSort(req.query, {
    userName: 'userName', productName: 'productName', totalQuantity: 'totalQuantity', totalSales: 'totalSales',
  }, 'userName', 'ASC');
  const p = new Params();
  const conds = docConds('sales', f, p, { itemsDirect: true, searchCols: ['u.name', 'si.productName', 'pr.sku'] });
  const from = `${lineFrom('sales', { user: true, party: 'none' })} ${where(conds)}`;

  const baseSql = `SELECT s.userId, COALESCE(u.name, 'Unassigned') AS userName, si.productId, si.productName,
      ${LINE_SUM('si').replace('%TOTAL%', 'totalSales')}
    ${from} GROUP BY s.userId, u.name, si.productId, si.productName`;
  const summarySql = `SELECT COUNT(DISTINCT s.userId) AS userCount, COUNT(DISTINCT si.productId) AS productCount,
      SUM(si.quantity) AS totalQuantity, SUM(si.netRate) AS totalSales, SUM(si.netRate - si.taxAmount) AS taxableValue,
      SUM(si.taxAmount) AS taxAmount, SUM(si.discountAmount) AS discountAmount ${from}`;

  const out = await H.runPaged({ baseSql, params: p, orderBy: `${sort.orderBy}${sort.sortKey === 'userName' ? ', totalSales DESC' : ''}`, pg, numeric: LINE_NUMERIC, summarySql, summaryNumeric: ['userCount', 'productCount', ...LINE_NUMERIC] });
  return H.send(res, { ...out, filters: appliedFilters(f) });
});

// 7. @route GET /api/reports/item-sales-by-party
const itemSalesByParty = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'sales');
  const pg = H.parsePagination(req.query, { legacy: true });
  const sort = H.parseSort(req.query, {
    partyName: 'partyName', productName: 'productName', totalQuantity: 'totalQuantity', totalSales: 'totalSales',
  }, 'partyName', 'ASC');
  const p = new Params();
  const conds = docConds('sales', f, p, { itemsDirect: true, searchCols: ['pt.name', 'si.productName', 'pr.sku'] });
  const from = `${lineFrom('sales', { party: 'inner' })} ${where(conds)}`;

  const baseSql = `SELECT pt.id AS partyId, pt.name AS partyName, si.productId, si.productName,
      ${LINE_SUM('si').replace('%TOTAL%', 'totalSales')}
    ${from} GROUP BY pt.id, pt.name, si.productId, si.productName`;
  const summarySql = `SELECT COUNT(DISTINCT pt.id) AS partyCount, COUNT(DISTINCT si.productId) AS productCount,
      SUM(si.quantity) AS totalQuantity, SUM(si.netRate) AS totalSales, SUM(si.netRate - si.taxAmount) AS taxableValue,
      SUM(si.taxAmount) AS taxAmount, SUM(si.discountAmount) AS discountAmount ${from}`;

  const out = await H.runPaged({ baseSql, params: p, orderBy: `${sort.orderBy}${sort.sortKey === 'partyName' ? ', totalSales DESC' : ''}`, pg, numeric: LINE_NUMERIC, summarySql, summaryNumeric: ['partyCount', 'productCount', ...LINE_NUMERIC] });
  return H.send(res, { ...out, filters: appliedFilters(f) });
});

// ════════════════════════════════════════════════════════════════════════════
// PURCHASE
// ════════════════════════════════════════════════════════════════════════════

// 8. @route GET /api/reports/purchase-report
const purchaseReport = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'purchase');
  const pg = H.parsePagination(req.query);
  const sort = H.parseSort(req.query, {
    purchaseDate: 'purchaseDate', invoiceNumber: 'invoiceNumber', partyName: 'partyName', totalAmount: 'totalAmount',
    amountPaid: 'amountPaid', balanceDue: 'balanceDue', paymentStatus: 'paymentStatus',
  }, 'purchaseDate', 'DESC');
  const p = new Params();
  const conds = docConds('purchase', f, p, { searchCols: ['pu.invoiceNumber', 'pt.name', 'pu.po_number'] });

  const from = `FROM purchases pu
    JOIN parties pt ON pt.id = pu.partyId
    LEFT JOIN (SELECT purchaseId, SUM(quantity) AS qty, COUNT(*) AS lineCount FROM purchase_items GROUP BY purchaseId) iq ON iq.purchaseId = pu.id
    ${where(conds)}`;

  const baseSql = `SELECT pu.id, pu.invoiceNumber, pu.purchaseDate, pu.po_number AS poNumber, pu.partyId, pt.name AS partyName, pt.GST AS partyGST,
      pu.paymentStatus, pu.baseRate, pu.tax, pu.global_discount_amount AS globalDiscount, pu.totalAmount,
      ${H.effPaid('pu')} AS amountPaid, ${H.balanceDue('pu')} AS balanceDue,
      COALESCE(iq.qty, 0) AS totalQuantity, COALESCE(iq.lineCount, 0) AS itemCount,
      (SELECT GROUP_CONCAT(DISTINCT _po.paymentMode ORDER BY _po.paymentMode SEPARATOR ', ')
         FROM payments_out _po WHERE _po.purchaseId = pu.id) AS paymentModes
    ${from}`;
  const summarySql = `SELECT COUNT(*) AS billCount, SUM(pu.totalAmount) AS totalAmount, SUM(pu.tax) AS totalTax,
      SUM(pu.global_discount_amount) AS totalGlobalDiscount, SUM(${H.effPaid('pu')}) AS totalPaid,
      SUM(${H.balanceDue('pu')}) AS totalBalanceDue, SUM(COALESCE(iq.qty, 0)) AS totalQuantity ${from}`;

  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg,
    numeric: ['baseRate', 'tax', 'globalDiscount', 'totalAmount', 'amountPaid', 'balanceDue', 'totalQuantity', 'itemCount'],
    summarySql, summaryNumeric: ['billCount', 'totalAmount', 'totalTax', 'totalGlobalDiscount', 'totalPaid', 'totalBalanceDue', 'totalQuantity'],
  });
  return H.send(res, { ...out, filters: appliedFilters(f), sort: { sortBy: sort.sortKey, sortOrder: sort.order } });
});

// 9. @route GET /api/reports/purchase-by-party
const purchaseByParty = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'purchase');
  const pg = H.parsePagination(req.query, { legacy: true });
  const sort = H.parseSort(req.query, {
    partyName: 'partyName', billCount: 'billCount', totalPurchases: 'totalPurchases', totalPaid: 'totalPaid', outstanding: 'outstanding',
  }, 'totalPurchases', 'DESC');
  const p = new Params();
  const conds = docConds('purchase', f, p, { searchCols: ['pt.name', 'pt.GST', 'pt.phone', 'pt.email'] });
  const from = `FROM purchases pu JOIN parties pt ON pt.id = pu.partyId ${where(conds)}`;

  const baseSql = `SELECT pt.id AS partyId, pt.name AS partyName, pt.GST AS partyGST,
      COUNT(DISTINCT pu.id) AS billCount, SUM(pu.totalAmount) AS totalPurchases,
      SUM(${H.effPaid('pu')}) AS totalPaid, SUM(${H.balanceDue('pu')}) AS outstanding
    ${from} GROUP BY pt.id, pt.name, pt.GST`;
  const summarySql = `SELECT COUNT(DISTINCT pt.id) AS partyCount, COUNT(*) AS billCount, SUM(pu.totalAmount) AS totalPurchases,
      SUM(${H.effPaid('pu')}) AS totalPaid, SUM(${H.balanceDue('pu')}) AS outstanding ${from}`;

  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg, numeric: ['billCount', 'totalPurchases', 'totalPaid', 'outstanding'], summarySql,
    summaryNumeric: ['partyCount', 'billCount', 'totalPurchases', 'totalPaid', 'outstanding'],
  });
  return H.send(res, { ...out, filters: appliedFilters(f) });
});

// 10. @route GET /api/reports/purchase-by-item
const purchaseByItem = H.handler(async (req, res) => {
  const f = parseDocFilters(req.query, 'purchase');
  const pg = H.parsePagination(req.query, { legacy: true });
  const sort = H.parseSort(req.query, {
    productName: 'productName', totalQuantity: 'totalQuantity', totalPurchases: 'totalPurchases', billCount: 'billCount',
    categoryName: 'categoryName', brandName: 'brandName',
  }, 'totalPurchases', 'DESC');
  const p = new Params();
  const conds = docConds('purchase', f, p, { itemsDirect: true, searchCols: ['pi.productName', 'pr.sku', 'pr.barcode'] });
  const from = `${lineFrom('purchase', { party: 'none' })} ${where(conds)}`;

  const baseSql = `SELECT pi.productId, pi.productName, pr.sku, cat.category AS categoryName, br.name AS brandName,
      ${LINE_SUM('pi').replace('%TOTAL%', 'totalPurchases')}, COUNT(DISTINCT pi.purchaseId) AS billCount
    ${from} GROUP BY pi.productId, pi.productName, pr.sku, cat.category, br.name`;
  const summarySql = `SELECT COUNT(DISTINCT pi.productId) AS productCount, SUM(pi.quantity) AS totalQuantity, SUM(pi.netRate) AS totalPurchases,
      SUM(pi.netRate - pi.taxAmount) AS taxableValue, SUM(pi.taxAmount) AS taxAmount, SUM(pi.discountAmount) AS discountAmount,
      COUNT(DISTINCT pu.id) AS billCount ${from}`;

  const out = await H.runPaged({ baseSql, params: p, orderBy: sort.orderBy, pg, numeric: LINE_NUMERIC, summarySql, summaryNumeric: ['productCount', ...LINE_NUMERIC] });
  return H.send(res, { ...out, filters: appliedFilters(f) });
});

// ════════════════════════════════════════════════════════════════════════════
// INVENTORY
// ════════════════════════════════════════════════════════════════════════════
const STOCK_STATUSES = ['All', 'In Stock', 'Low Stock', 'Out of Stock', 'Negative Stock'];

function parseStockFilters(q) {
  return {
    categoryId: H.parseId('categoryId', q.categoryId),
    brandId: H.parseId('brandId', q.brandId),
    productId: H.parseId('productId', q.productId),
    stockStatus: H.parseEnum('stockStatus', q.stockStatus, STOCK_STATUSES),
    search: H.str(q.search),
    ...H.parseAsOf(q),
  };
}

// One row per product. stockQuantity is "as of" asOfDate when given:
//   current stock + sold after that day − purchased after that day.
// (Only sales and purchases are rewound — stock adjustments/transfers carry no
//  reliable signed quantity, so they are not reversed.)
function stockBase(f, p, { detailed = false } = {}) {
  const conds = [];
  if (f.categoryId) conds.push(`pr.categoryId = ${p.add(f.categoryId)}`);
  if (f.brandId) conds.push(`pr.brandId = ${p.add(f.brandId)}`);
  if (f.productId) conds.push(`pr.id = ${p.add(f.productId)}`);
  if (f.search) {
    const ph = p.add(`%${H.escapeLike(f.search)}%`);
    conds.push(`(pr.name LIKE ${ph} OR pr.sku LIKE ${ph} OR pr.barcode LIKE ${ph} OR pr.HSNCode LIKE ${ph})`);
  }

  let qty = 'pr.stockQuantity';
  let soldFilter = '';
  let boughtFilter = '';
  if (f.asOfExclusive) {
    const ph = p.add(f.asOfExclusive);
    qty = `(pr.stockQuantity
      + COALESCE((SELECT SUM(_si.quantity) FROM sales_items _si JOIN sales _s ON _s.id = _si.saleId WHERE _si.productId = pr.id AND _s.saleDate >= ${ph}), 0)
      - COALESCE((SELECT SUM(_pi.quantity) FROM purchase_items _pi JOIN purchases _p ON _p.id = _pi.purchaseId WHERE _pi.productId = pr.id AND _p.purchaseDate >= ${ph}), 0))`;
    soldFilter = `AND _s.saleDate < ${ph}`;
    boughtFilter = `AND _p.purchaseDate < ${ph}`;
  }

  const extra = detailed
    ? `, pr.MRP, pr.barcode, pr.HSNCode AS hsnCode, pr.reorderLevel, pr.expiryDate,
      COALESCE((SELECT SUM(_si.quantity) FROM sales_items _si JOIN sales _s ON _s.id = _si.saleId WHERE _si.productId = pr.id ${soldFilter}), 0) AS totalSoldQty,
      COALESCE((SELECT SUM(_pi.quantity) FROM purchase_items _pi JOIN purchases _p ON _p.id = _pi.purchaseId WHERE _pi.productId = pr.id ${boughtFilter}), 0) AS totalPurchasedQty,
      (SELECT MAX(_s.saleDate) FROM sales_items _si JOIN sales _s ON _s.id = _si.saleId WHERE _si.productId = pr.id ${soldFilter}) AS lastSaleDate,
      (SELECT MAX(_p.purchaseDate) FROM purchase_items _pi JOIN purchases _p ON _p.id = _pi.purchaseId WHERE _pi.productId = pr.id ${boughtFilter}) AS lastPurchaseDate`
    : '';

  const core = `SELECT pr.id, pr.name, pr.sku, pr.unit, pr.categoryId, cat.category AS categoryName,
      pr.brandId, br.name AS brandName, ${qty} AS stockQuantity, pr.purchasePrice, pr.salesPrice,
      pr.minStockLevel ${extra}
    FROM products pr
    LEFT JOIN categories cat ON cat.id = pr.categoryId
    LEFT JOIN brands br ON br.id = pr.brandId
    ${where(conds)}`;

  const withStatus = `SELECT c.*, (c.stockQuantity * c.purchasePrice) AS stockValueAtCost,
      (c.stockQuantity * c.salesPrice) AS stockValueAtSale,
      (CASE WHEN c.stockQuantity < 0 THEN 'Negative Stock'
            WHEN c.stockQuantity = 0 THEN 'Out of Stock'
            WHEN c.stockQuantity < COALESCE(c.minStockLevel, 5) THEN 'Low Stock'
            ELSE 'In Stock' END) AS stockStatus
    FROM (${core}) c`;

  return f.stockStatus && f.stockStatus !== 'All'
    ? `SELECT * FROM (${withStatus}) z WHERE z.stockStatus = ${p.add(f.stockStatus)}`
    : withStatus;
}

const STOCK_NUMERIC = ['stockQuantity', 'purchasePrice', 'salesPrice', 'minStockLevel', 'stockValueAtCost', 'stockValueAtSale',
  'MRP', 'reorderLevel', 'totalSoldQty', 'totalPurchasedQty'];
const STOCK_SUMMARY_SQL = (base) => `SELECT COUNT(*) AS totalProducts, SUM(stockQuantity) AS totalQuantity,
    SUM(stockValueAtCost) AS totalStockValueAtCost, SUM(stockValueAtSale) AS totalStockValueAtSale,
    SUM(stockStatus = 'In Stock') AS inStockCount, SUM(stockStatus = 'Low Stock') AS lowStockCount,
    SUM(stockStatus = 'Out of Stock') AS outOfStockCount, SUM(stockStatus = 'Negative Stock') AS negativeStockCount
  FROM (${base}) t`;
const STOCK_SUMMARY_NUMERIC = ['totalProducts', 'totalQuantity', 'totalStockValueAtCost', 'totalStockValueAtSale',
  'inStockCount', 'lowStockCount', 'outOfStockCount', 'negativeStockCount'];

// 11. @route GET /api/reports/stock-report   (detailed per-product stock position)
const stockReport = H.handler(async (req, res) => {
  const f = parseStockFilters(req.query);
  const pg = H.parsePagination(req.query);
  const sort = H.parseSort(req.query, {
    name: 'name', sku: 'sku', categoryName: 'categoryName', brandName: 'brandName', stockQuantity: 'stockQuantity',
    stockValueAtCost: 'stockValueAtCost', stockValueAtSale: 'stockValueAtSale', stockStatus: 'stockStatus',
    totalSoldQty: 'totalSoldQty', totalPurchasedQty: 'totalPurchasedQty', lastSaleDate: 'lastSaleDate',
  }, 'name', 'ASC');
  const p = new Params();
  const baseSql = stockBase(f, p, { detailed: true });
  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg, numeric: STOCK_NUMERIC,
    summarySql: STOCK_SUMMARY_SQL(baseSql), summaryNumeric: STOCK_SUMMARY_NUMERIC,
  });
  return H.send(res, { ...out, filters: appliedFilters(f), sort: { sortBy: sort.sortKey, sortOrder: sort.order } });
});

// 12. @route GET /api/reports/stock-summary   (valuation; groupBy=product|category|brand)
const stockSummary = H.handler(async (req, res) => {
  const f = parseStockFilters(req.query);
  const groupBy = H.parseEnum('groupBy', req.query.groupBy, ['product', 'category', 'brand']) || 'product';
  const pg = H.parsePagination(req.query, { legacy: true });
  const p = new Params();
  const productBase = stockBase(f, p);

  let baseSql = productBase;
  let sortMap = {
    name: 'name', sku: 'sku', categoryName: 'categoryName', brandName: 'brandName', stockQuantity: 'stockQuantity',
    stockValueAtCost: 'stockValueAtCost', stockValueAtSale: 'stockValueAtSale', stockStatus: 'stockStatus',
  };
  let defaultSort = 'name';
  let defaultOrder = 'ASC';
  let numeric = STOCK_NUMERIC;

  if (groupBy !== 'product') {
    const idCol = groupBy === 'category' ? 'categoryId' : 'brandId';
    const nameCol = groupBy === 'category' ? 'categoryName' : 'brandName';
    baseSql = `SELECT t.${idCol} AS ${idCol}, COALESCE(t.${nameCol}, 'Unbranded') AS ${nameCol}, COUNT(*) AS productCount,
        SUM(t.stockQuantity) AS stockQuantity, SUM(t.stockValueAtCost) AS stockValueAtCost, SUM(t.stockValueAtSale) AS stockValueAtSale,
        SUM(t.stockStatus = 'In Stock') AS inStockCount, SUM(t.stockStatus = 'Low Stock') AS lowStockCount,
        SUM(t.stockStatus = 'Out of Stock') AS outOfStockCount, SUM(t.stockStatus = 'Negative Stock') AS negativeStockCount
      FROM (${productBase}) t GROUP BY t.${idCol}, t.${nameCol}`;
    sortMap = {
      [nameCol]: nameCol, productCount: 'productCount', stockQuantity: 'stockQuantity',
      stockValueAtCost: 'stockValueAtCost', stockValueAtSale: 'stockValueAtSale',
    };
    defaultSort = nameCol;
    numeric = ['productCount', 'stockQuantity', 'stockValueAtCost', 'stockValueAtSale', 'inStockCount', 'lowStockCount', 'outOfStockCount', 'negativeStockCount'];
  }
  const sort = H.parseSort(req.query, sortMap, defaultSort, defaultOrder);

  // summary always over the product-level set so group view and product view agree
  const summaryRow = (await H.run(STOCK_SUMMARY_SQL(productBase), p.values))[0];
  const summary = H.normalizeObject(summaryRow, STOCK_SUMMARY_NUMERIC);

  const out = await H.runPaged({ baseSql, params: p, orderBy: sort.orderBy, pg, numeric });
  return H.send(res, {
    ...out,
    summary,
    totals: { // legacy shape
      totalStockValueAtCost: summary.totalStockValueAtCost,
      totalStockValueAtSale: summary.totalStockValueAtSale,
    },
    filters: { ...appliedFilters(f), groupBy },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GST   (Indian FY Apr–Mar; filters: financialYear, month, fromDate, toDate, …)
// Taxable value = line netRate − line taxAmount (netRate is the line total
// incl. tax). Header-level global discount is not apportioned to lines.
// Cancelled invoices are always excluded. The schema holds no state/place of
// supply, so tax is reported in total — no CGST/SGST/IGST split.
// ════════════════════════════════════════════════════════════════════════════
function gstDateConds(period, col, p) {
  const conds = [];
  if (period.empty) conds.push('1 = 0');
  if (period.from) conds.push(`${col} >= ${p.add(period.from)}`);
  if (period.toExclusive) conds.push(`${col} < ${p.add(period.toExclusive)}`);
  return conds;
}

function parseGstCommon(q) {
  const period = H.parseGstPeriod(q);
  const taxRate = q.taxRate === undefined || H.isBlank(q.taxRate) ? undefined : Number(Array.isArray(q.taxRate) ? q.taxRate[0] : q.taxRate);
  if (taxRate !== undefined && (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)) {
    throw new ReportError('taxRate must be a number between 0 and 100');
  }
  const gstin = H.str(q.gstin);
  return { period, taxRate, gstin, partyId: H.parseId('partyId', q.partyId) };
}
const gstApplied = (g, extra = {}) => ({
  ...(g.period.financialYear !== undefined ? { financialYear: `${g.period.financialYear}-${String((g.period.financialYear + 1) % 100).padStart(2, '0')}` } : {}),
  ...(H.str(extra.month) ? { month: H.str(extra.month) } : {}),
  ...(extra.fromDate ? { fromDate: extra.fromDate } : {}),
  ...(extra.toDate ? { toDate: extra.toDate } : {}),
  ...(g.gstin ? { gstin: g.gstin } : {}),
  ...(g.partyId ? { partyId: g.partyId } : {}),
  ...(g.taxRate !== undefined ? { taxRate: g.taxRate } : {}),
  ...(extra.invoiceType ? { invoiceType: extra.invoiceType } : {}),
});
const dateEcho = (q) => ({ month: q.month, fromDate: H.parseDateOnly('fromDate', q.fromDate), toDate: H.parseDateOnly('toDate', q.toDate) });

// 13. @route GET /api/reports/gstr1   (outward supplies, invoice × tax-rate rows)
const gstr1Report = H.handler(async (req, res) => {
  const g = parseGstCommon(req.query);
  const invoiceType = H.parseEnum('invoiceType', req.query.invoiceType, ['B2B', 'B2C']);
  const pg = H.parsePagination(req.query);
  const sort = H.parseSort(req.query, {
    invoiceDate: 'invoiceDate', invoiceNumber: 'invoiceNumber', partyName: 'partyName', taxRate: 'taxRate',
    taxableValue: 'taxableValue', taxAmount: 'taxAmount', invoiceValue: 'invoiceValue',
  }, 'invoiceDate', 'ASC');
  const p = new Params();
  const conds = [`s.paymentStatus <> 'Cancelled'`, ...gstDateConds(g.period, 's.saleDate', p)];
  if (invoiceType) conds.push(`s.bill_type = ${p.add(invoiceType)}`);
  if (g.partyId) conds.push(`s.partyId = ${p.add(g.partyId)}`);
  if (g.taxRate !== undefined) conds.push(`si.taxPercentage = ${p.add(g.taxRate)}`);
  if (g.gstin) conds.push(`UPPER(pt.GST) LIKE ${p.add(`%${H.escapeLike(g.gstin.toUpperCase())}%`)}`);
  const search = H.str(req.query.search);
  if (search) {
    const ph = p.add(`%${H.escapeLike(search)}%`);
    conds.push(`(s.invoiceNumber LIKE ${ph} OR pt.name LIKE ${ph} OR pt.GST LIKE ${ph})`);
  }

  const from = `FROM sales_items si JOIN sales s ON s.id = si.saleId LEFT JOIN parties pt ON pt.id = s.partyId ${where(conds)}`;
  const baseSql = `SELECT s.id AS saleId, s.invoiceNumber, s.saleDate AS invoiceDate, s.partyId, pt.name AS partyName, pt.GST AS gstin,
      s.bill_type AS invoiceType, si.taxPercentage AS taxRate, SUM(si.quantity) AS quantity,
      SUM(si.netRate - si.taxAmount) AS taxableValue, SUM(si.taxAmount) AS taxAmount, SUM(si.netRate) AS invoiceValue
    ${from} GROUP BY s.id, s.invoiceNumber, s.saleDate, s.partyId, pt.name, pt.GST, s.bill_type, si.taxPercentage`;
  const summarySql = `SELECT COUNT(DISTINCT s.id) AS invoiceCount, SUM(si.netRate - si.taxAmount) AS taxableValue,
      SUM(si.taxAmount) AS taxAmount, SUM(si.netRate) AS invoiceValue ${from}`;

  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg, numeric: ['taxRate', 'quantity', 'taxableValue', 'taxAmount', 'invoiceValue'],
    summarySql, summaryNumeric: ['invoiceCount', 'taxableValue', 'taxAmount', 'invoiceValue'],
  });
  const byType = await H.run(`SELECT s.bill_type AS invoiceType, COUNT(DISTINCT s.id) AS invoiceCount, SUM(si.netRate - si.taxAmount) AS taxableValue,
      SUM(si.taxAmount) AS taxAmount, SUM(si.netRate) AS invoiceValue ${from} GROUP BY s.bill_type ORDER BY s.bill_type`, p.values);
  const byRate = await H.run(`SELECT si.taxPercentage AS taxRate, COUNT(DISTINCT s.id) AS invoiceCount, SUM(si.netRate - si.taxAmount) AS taxableValue,
      SUM(si.taxAmount) AS taxAmount, SUM(si.netRate) AS invoiceValue ${from} GROUP BY si.taxPercentage ORDER BY si.taxPercentage`, p.values);
  const nums = ['invoiceCount', 'taxableValue', 'taxAmount', 'invoiceValue'];
  out.summary.byInvoiceType = H.normalize(byType, nums);
  out.summary.byTaxRate = H.normalize(byRate, ['taxRate', ...nums]);

  return H.send(res, { ...out, filters: gstApplied(g, { ...dateEcho(req.query), invoiceType }), sort: { sortBy: sort.sortKey, sortOrder: sort.order } });
});

// 14. @route GET /api/reports/gstr3b   (3.1 outward supplies vs 4 eligible ITC, by month × rate)
const gstr3bReport = H.handler(async (req, res) => {
  const g = parseGstCommon(req.query);
  const pg = H.parsePagination(req.query);
  const sort = H.parseSort(req.query, {
    period: 'period', section: 'section', taxRate: 'taxRate', taxableValue: 'taxableValue', taxAmount: 'taxAmount',
  }, 'period', 'ASC');
  const p = new Params();

  const outC = [`s.paymentStatus <> 'Cancelled'`, ...gstDateConds(g.period, 's.saleDate', p)];
  const inC = [`pu.paymentStatus <> 'Cancelled'`, ...gstDateConds(g.period, 'pu.purchaseDate', p)];
  if (g.taxRate !== undefined) {
    outC.push(`si.taxPercentage = ${p.add(g.taxRate)}`);
    inC.push(`pi.taxPercentage = ${p.add(g.taxRate)}`);
  }

  const baseSql = `
    SELECT '3.1 Outward supplies' AS section, DATE_FORMAT(s.saleDate, '%Y-%m') AS period, si.taxPercentage AS taxRate,
        SUM(si.netRate - si.taxAmount) AS taxableValue, SUM(si.taxAmount) AS taxAmount, COUNT(DISTINCT s.id) AS documentCount
      FROM sales_items si JOIN sales s ON s.id = si.saleId ${where(outC)}
      GROUP BY DATE_FORMAT(s.saleDate, '%Y-%m'), si.taxPercentage
    UNION ALL
    SELECT '4 Eligible ITC (purchases)', DATE_FORMAT(pu.purchaseDate, '%Y-%m'), pi.taxPercentage,
        SUM(pi.netRate - pi.taxAmount), SUM(pi.taxAmount), COUNT(DISTINCT pu.id)
      FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchaseId ${where(inC)}
      GROUP BY DATE_FORMAT(pu.purchaseDate, '%Y-%m'), pi.taxPercentage`;

  const summarySql = `SELECT
      SUM(CASE WHEN section LIKE '3.1%' THEN taxableValue ELSE 0 END) AS outwardTaxableValue,
      SUM(CASE WHEN section LIKE '3.1%' THEN taxAmount ELSE 0 END) AS outwardTax,
      SUM(CASE WHEN section LIKE '4%' THEN taxableValue ELSE 0 END) AS itcTaxableValue,
      SUM(CASE WHEN section LIKE '4%' THEN taxAmount ELSE 0 END) AS itcTax,
      SUM(CASE WHEN section LIKE '3.1%' THEN taxAmount ELSE -taxAmount END) AS netTaxPayable
    FROM (${baseSql}) t`;
  const out = await H.runPaged({
    baseSql, params: p, orderBy: `${sort.orderBy}, section ASC, taxRate ASC`, pg,
    numeric: ['taxRate', 'taxableValue', 'taxAmount', 'documentCount'], summarySql,
    summaryNumeric: ['outwardTaxableValue', 'outwardTax', 'itcTaxableValue', 'itcTax', 'netTaxPayable'],
  });
  return H.send(res, { ...out, filters: gstApplied({ ...g, gstin: undefined, partyId: undefined }, dateEcho(req.query)) });
});

// 15. @route GET /api/reports/gst2   (purchase tax summary by rate; ITC)
const gst2Report = H.handler(async (req, res) => {
  const g = parseGstCommon(req.query);
  const pg = H.parsePagination(req.query, { legacy: true });
  const sort = H.parseSort(req.query, {
    taxRate: 'taxRate', taxableValue: 'taxableValue', taxAmount: 'taxAmount', totalValue: 'totalValue', billCount: 'billCount',
  }, 'taxRate', 'ASC');
  const p = new Params();
  const conds = [`pu.paymentStatus <> 'Cancelled'`, ...gstDateConds(g.period, 'pu.purchaseDate', p)];
  if (g.partyId) conds.push(`pu.partyId = ${p.add(g.partyId)}`);
  if (g.taxRate !== undefined) conds.push(`pi.taxPercentage = ${p.add(g.taxRate)}`);
  if (g.gstin) conds.push(`UPPER(pt.GST) LIKE ${p.add(`%${H.escapeLike(g.gstin.toUpperCase())}%`)}`);
  const from = `FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchaseId JOIN parties pt ON pt.id = pu.partyId ${where(conds)}`;

  const baseSql = `SELECT pi.taxPercentage AS taxRate, SUM(pi.netRate - pi.taxAmount) AS taxableValue, SUM(pi.taxAmount) AS taxAmount,
      SUM(pi.netRate) AS totalValue, COUNT(DISTINCT pi.purchaseId) AS billCount ${from} GROUP BY pi.taxPercentage`;
  const summarySql = `SELECT SUM(pi.netRate - pi.taxAmount) AS totalTaxableValue, SUM(pi.taxAmount) AS totalTaxAmount,
      SUM(pi.netRate) AS totalValue, COUNT(DISTINCT pu.id) AS billCount ${from}`;
  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg, numeric: ['taxRate', 'taxableValue', 'taxAmount', 'totalValue', 'billCount'],
    summarySql, summaryNumeric: ['totalTaxableValue', 'totalTaxAmount', 'totalValue', 'billCount'],
  });
  return H.send(res, {
    ...out,
    totals: { totalTaxableValue: out.summary.totalTaxableValue, totalTaxAmount: out.summary.totalTaxAmount }, // legacy shape
    filters: gstApplied(g, dateEcho(req.query)),
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PARTY   (one `parties` table; "party type" is derived — see reportHelpers)
// ════════════════════════════════════════════════════════════════════════════
const OUTSTANDING_STATUSES = ['All', 'Outstanding', 'Partially Paid', 'Fully Paid', 'Overdue'];

function parsePartyFilters(q) {
  return {
    partyId: H.parseId('partyId', q.partyId),
    partyType: H.parseEnum('partyType', q.partyType, ['All', 'Customer', 'Supplier', 'Both']),
    range: H.parseDateRange(q),
    transactionType: H.parseEnum('transactionType', q.transactionType, TX_TYPES),
    outstandingStatus: H.parseEnum('outstandingStatus', q.outstandingStatus, OUTSTANDING_STATUSES),
    search: H.str(q.search),
    ...H.parseAsOf(q),
  };
}

// 16. @route GET /api/reports/party-outstanding
//   transactionType: Sales (receivables, default) | Purchase (payables) | Both (net)
//   outstandingStatus default 'Outstanding' (balance > 0) — the original behaviour.
const partyOutstanding = H.handler(async (req, res) => {
  const f = parsePartyFilters(req.query);
  const overdueDays = req.query.overdueDays === undefined || H.isBlank(req.query.overdueDays) ? undefined : Number(req.query.overdueDays);
  if (overdueDays !== undefined && (!Number.isInteger(overdueDays) || overdueDays < 0)) {
    throw new ReportError('overdueDays must be a non-negative integer');
  }
  const txType = f.transactionType || 'Sales';
  const status = f.outstandingStatus || 'Outstanding';
  const pg = H.parsePagination(req.query, { legacy: true });
  const sort = H.parseSort(req.query, {
    partyName: 'partyName', outstanding: 'outstanding', totalInvoiced: 'totalInvoiced', totalPaid: 'totalPaid',
    unpaidInvoiceCount: 'unpaidInvoiceCount', receivable: 'receivable', payable: 'payable',
  }, 'outstanding', 'DESC');
  const p = new Params();

  const branch = (kind, label) => {
    const c = DOC[kind];
    const a = c.h;
    const conds = [`${a}.partyId IS NOT NULL`, `${a}.paymentStatus <> 'Cancelled'`];
    if (f.partyId) conds.push(`${a}.partyId = ${p.add(f.partyId)}`);
    if (f.range.from) conds.push(`${a}.${c.dateCol} >= ${p.add(f.range.from)}`);
    const upper = f.range.toExclusive && f.asOfExclusive ? (f.range.toExclusive < f.asOfExclusive ? f.range.toExclusive : f.asOfExclusive) : (f.range.toExclusive || f.asOfExclusive);
    if (upper) conds.push(`${a}.${c.dateCol} < ${p.add(upper)}`);

    let paid = H.effPaid(a);
    if (f.asOfExclusive) {
      const ph = p.add(f.asOfExclusive);
      paid = `(CASE WHEN EXISTS (SELECT 1 FROM ${c.payTable} _l WHERE _l.${c.payFk} = ${a}.id)
          THEN COALESCE((SELECT SUM(_l.amount) FROM ${c.payTable} _l WHERE _l.${c.payFk} = ${a}.id AND _l.paymentDate < ${ph}), 0)
          ELSE ${H.effPaid(a)} END)`;
    }
    return `SELECT '${label}' AS txnType, ${a}.id AS docId, ${a}.partyId, ${a}.${c.dateCol} AS txnDate, ${a}.totalAmount AS amount,
        ${paid} AS paid, GREATEST(${a}.totalAmount - ${paid}, 0) AS balance, ${a}.paymentStatus AS storedStatus
      FROM ${c.table} ${a} WHERE ${conds.join(' AND ')}`;
  };
  const branches = [];
  if (txType !== 'Purchase') branches.push(branch('sales', 'Sales'));
  if (txType !== 'Sales') branches.push(branch('purchase', 'Purchase'));

  const outerConds = [];
  if (f.partyType && f.partyType !== 'All') outerConds.push(H.partyTypeCondition('pt', f.partyType));
  if (f.search) {
    const ph = p.add(`%${H.escapeLike(f.search)}%`);
    outerConds.push(`(pt.name LIKE ${ph} OR pt.phone LIKE ${ph} OR pt.email LIKE ${ph} OR pt.GST LIKE ${ph})`);
  }
  const ageCond = overdueDays !== undefined ? `DATEDIFF(${f.asOfExclusive ? `DATE_SUB(${p.add(f.asOfExclusive)}, INTERVAL 1 DAY)` : 'CURDATE()'}, i.txnDate) > ${p.add(overdueDays)}` : null;
  const overdueCond = `(i.balance > 0 AND (i.storedStatus = 'Overdue'${ageCond ? ` OR ${ageCond}` : ''}))`;
  if (status === 'Outstanding') outerConds.push('i.balance > 0');
  else if (status === 'Partially Paid') outerConds.push('(i.paid > 0 AND i.balance > 0)');
  else if (status === 'Fully Paid') outerConds.push('i.balance = 0');
  else if (status === 'Overdue') outerConds.push(overdueCond);

  const from = `FROM parties pt JOIN (${branches.join(' UNION ALL ')}) i ON i.partyId = pt.id ${where(outerConds)}`;
  const baseSql = `SELECT pt.id AS partyId, pt.name AS partyName, pt.phone, pt.email, pt.GST AS partyGST, ${H.partyTypeExpr('pt')} AS partyType,
      SUM(i.balance > 0) AS unpaidInvoiceCount,
      SUM(i.amount) AS totalInvoiced, SUM(i.paid) AS totalPaid,
      SUM(CASE WHEN i.txnType = 'Sales' THEN i.balance ELSE 0 END) AS receivable,
      SUM(CASE WHEN i.txnType = 'Purchase' THEN i.balance ELSE 0 END) AS payable,
      SUM(CASE WHEN i.txnType = 'Sales' THEN i.balance ELSE -i.balance END) AS outstanding,
      MIN(CASE WHEN i.balance > 0 THEN i.txnDate END) AS oldestUnpaidDate
    ${from} GROUP BY pt.id, pt.name, pt.phone, pt.email, pt.GST`;
  const summarySql = `SELECT COUNT(*) AS partyCount, SUM(unpaidInvoiceCount) AS unpaidInvoiceCount, SUM(totalInvoiced) AS totalInvoiced,
      SUM(totalPaid) AS totalPaid, SUM(receivable) AS totalReceivable, SUM(payable) AS totalPayable, SUM(outstanding) AS netOutstanding
    FROM (${baseSql}) t`;

  const out = await H.runPaged({
    baseSql, params: p, orderBy: sort.orderBy, pg,
    numeric: ['unpaidInvoiceCount', 'totalInvoiced', 'totalPaid', 'receivable', 'payable', 'outstanding'], summarySql,
    summaryNumeric: ['partyCount', 'unpaidInvoiceCount', 'totalInvoiced', 'totalPaid', 'totalReceivable', 'totalPayable', 'netOutstanding'],
  });
  return H.send(res, {
    ...out,
    totalOutstanding: out.summary.netOutstanding, // legacy key
    filters: { ...appliedFilters(f), transactionType: txType, outstandingStatus: status, ...(overdueDays !== undefined ? { overdueDays } : {}) },
  });
});

// 17. @route GET /api/reports/customer-statement?partyId=12
//   Ledger for ONE party (customer, supplier or both — same table).
//   Sign convention: debit increases what the party owes us (sales, payments we
//   make out); credit decreases it (payments received, purchases from them).
//   runningBalance > 0 → party owes us; < 0 → we owe the party.
//   transactionType: Sales (default) | Purchase | Both.
const customerStatement = H.handler(async (req, res) => {
  const partyId = H.parseId('partyId', req.query.partyId);
  if (!partyId) throw new ReportError('partyId is required');
  const range = H.parseDateRange(req.query);
  const asOf = H.parseAsOf(req.query);
  const txType = H.parseEnum('transactionType', req.query.transactionType, TX_TYPES) || 'Sales';
  const search = H.str(req.query.search);
  const sortOrder = H.str(req.query.sortOrder);
  if (sortOrder && !['asc', 'desc'].includes(sortOrder.toLowerCase())) throw new ReportError('sortOrder must be asc or desc');
  if (H.str(req.query.sortBy) && H.str(req.query.sortBy).toLowerCase() !== 'date') throw new ReportError('sortBy must be one of: date');
  const pg = H.parsePagination(req.query, { legacy: true });

  const [party] = await H.run(
    `SELECT pt.id, pt.name, pt.GST, pt.phone, pt.email, pt.address, ${H.partyTypeExpr('pt')} AS partyType FROM parties pt WHERE pt.id = :id`,
    { id: partyId }
  );
  if (!party) throw new ReportError('Party not found', 404);

  const rows = [];
  if (txType !== 'Purchase') {
    const sales = await H.run(
      `SELECT s.id, s.invoiceNumber AS reference, s.saleDate AS date, s.totalAmount AS debit, 0 AS credit, s.paymentStatus,
          NULL AS paymentMode, 'Sale' AS type,
          (SELECT COALESCE(SUM(_l.amount), 0) FROM payments_in _l WHERE _l.saleId = s.id) AS ledgerPaid
         FROM sales s WHERE s.partyId = :id AND s.paymentStatus <> 'Cancelled'`, { id: partyId });
    const pays = await H.run(
      `SELECT id, referenceNo AS reference, paymentDate AS date, 0 AS debit, amount AS credit, NULL AS paymentStatus,
          paymentMode, 'Payment In' AS type FROM payments_in WHERE partyId = :id`, { id: partyId });
    sales.forEach((s) => {
      rows.push({ ...s, ledgerPaid: undefined });
      // Invoices saved as "Paid" at billing never wrote a payments_in row; settle them here
      // so the statement doesn't show them as still owed.
      if (s.paymentStatus === 'Paid') {
        const gap = Number(s.debit) - Number(s.ledgerPaid);
        if (gap > 0.005) {
          rows.push({ id: s.id, reference: s.reference, date: s.date, debit: 0, credit: H.round2(gap), paymentStatus: 'Paid',
            paymentMode: null, type: 'Payment (settled at billing)' });
        }
      }
    });
    rows.push(...pays);
  }
  if (txType !== 'Sales') {
    const purchases = await H.run(
      `SELECT pu.id, pu.invoiceNumber AS reference, pu.purchaseDate AS date, 0 AS debit, pu.totalAmount AS credit, pu.paymentStatus,
          NULL AS paymentMode, 'Purchase' AS type,
          (SELECT COALESCE(SUM(_l.amount), 0) FROM payments_out _l WHERE _l.purchaseId = pu.id) AS ledgerPaid
         FROM purchases pu WHERE pu.partyId = :id AND pu.paymentStatus <> 'Cancelled'`, { id: partyId });
    const outs = await H.run(
      `SELECT id, referenceNo AS reference, paymentDate AS date, amount AS debit, 0 AS credit, NULL AS paymentStatus,
          paymentMode, 'Payment Out' AS type FROM payments_out WHERE partyId = :id`, { id: partyId });
    purchases.forEach((x) => {
      rows.push({ ...x, ledgerPaid: undefined });
      if (x.paymentStatus === 'Paid') {
        const gap = Number(x.credit) - Number(x.ledgerPaid);
        if (gap > 0.005) {
          rows.push({ id: x.id, reference: x.reference, date: x.date, debit: H.round2(gap), credit: 0, paymentStatus: 'Paid',
            paymentMode: null, type: 'Payment (settled at billing)' });
        }
      }
    });
    rows.push(...outs);
  }

  const ts = (d) => new Date(d).getTime();
  const typeRank = { Sale: 1, Purchase: 1, 'Payment (settled at billing)': 2, 'Payment In': 3, 'Payment Out': 3 };
  rows.sort((a, b) => ts(a.date) - ts(b.date) || (typeRank[a.type] || 9) - (typeRank[b.type] || 9) || a.id - b.id);

  // window: [fromDate, min(toDate, asOfDate)]   — opening balance = everything before it
  const fromMs = range.from ? ts(range.from.replace(' ', 'T')) : null;
  const upperStr = range.toExclusive && asOf.asOfExclusive ? (range.toExclusive < asOf.asOfExclusive ? range.toExclusive : asOf.asOfExclusive) : (range.toExclusive || asOf.asOfExclusive);
  const toMs = upperStr ? ts(upperStr.replace(' ', 'T')) : null;

  let running = 0;
  let opening = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const ledger = [];
  rows.forEach((r) => {
    const t = ts(r.date);
    const debit = Number(r.debit) || 0;
    const credit = Number(r.credit) || 0;
    if (fromMs !== null && t < fromMs) { opening += debit - credit; running = opening; return; }
    if (toMs !== null && t >= toMs) return;
    running += debit - credit;
    totalDebit += debit;
    totalCredit += credit;
    ledger.push({ ...r, debit: H.round2(debit), credit: H.round2(credit), runningBalance: H.round2(running) });
  });

  let view = ledger;
  if (search) {
    const needle = search.toLowerCase();
    view = ledger.filter((r) => [r.reference, r.type, r.paymentMode, r.paymentStatus].some((v) => v && String(v).toLowerCase().includes(needle)));
  }
  if (sortOrder && sortOrder.toLowerCase() === 'desc') view = [...view].reverse();

  const total = view.length;
  const limit = pg.unpaginated ? Math.max(total, 1) : pg.limit;
  const page = pg.unpaginated ? 1 : pg.page;
  const data = view.slice((page - 1) * limit, page * limit);
  const closingBalance = H.round2(running);

  return H.send(res, {
    party,
    data,
    pagination: { total, page, limit, totalPages: total ? Math.ceil(total / limit) : 0 },
    summary: {
      openingBalance: H.round2(opening), totalDebit: H.round2(totalDebit), totalCredit: H.round2(totalCredit), closingBalance,
    },
    closingBalance, // legacy key
    filters: { partyId, transactionType: txType, ...(range.fromDate ? { fromDate: range.fromDate } : {}),
      ...(range.toDate ? { toDate: range.toDate } : {}), ...(asOf.asOfDate ? { asOfDate: asOf.asOfDate } : {}), ...(search ? { search } : {}) },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY / BRAND
// One row per product is built first (sales and purchase aggregates are two
// separate pre-aggregated sub-selects joined 1:1 on productId), and only then
// rolled up — so quantities/amounts can never be multiplied by the other side.
// Stock figures are the product's CURRENT stock (not date-filtered).
// ════════════════════════════════════════════════════════════════════════════
function groupedReport(groupBy) {
  const isCat = groupBy === 'category';
  const idCol = isCat ? 'categoryId' : 'brandId';
  const nameCol = isCat ? 'categoryName' : 'brandName';
  const otherId = isCat ? 'brandId' : 'categoryId';

  return H.handler(async (req, res) => {
    const q = req.query;
    const range = H.parseDateRange(q);
    const f = {
      [idCol]: H.parseId(idCol, q[idCol]),
      [otherId]: H.parseId(otherId, q[otherId]),
      productId: H.parseId('productId', q.productId),
      transactionType: H.parseEnum('transactionType', q.transactionType, TX_TYPES) || 'Both',
      search: H.str(q.search),
      includeProducts: H.parseBool('includeProducts', q.includeProducts) || false,
      activeOnly: H.parseBool('activeOnly', q.activeOnly) || false,
    };
    const pg = H.parsePagination(q);
    const defaultSort = f.transactionType === 'Purchase' ? 'purchaseAmount' : 'salesAmount';
    const sort = H.parseSort(q, {
      [nameCol]: nameCol, productCount: 'productCount', salesQty: 'salesQty', salesAmount: 'salesAmount',
      purchaseQty: 'purchaseQty', purchaseAmount: 'purchaseAmount', currentStock: 'currentStock',
      stockValueAtCost: 'stockValueAtCost', stockValueAtSale: 'stockValueAtSale',
    }, defaultSort, 'DESC');
    const p = new Params();

    const side = (kind, prefix) => {
      if (!(kind === 'sales' ? f.transactionType !== 'Purchase' : f.transactionType !== 'Sales')) return null;
      const c = DOC[kind];
      const conds = [`${c.h}.paymentStatus <> 'Cancelled'`];
      if (range.from) conds.push(`${c.h}.${c.dateCol} >= ${p.add(range.from)}`);
      if (range.toExclusive) conds.push(`${c.h}.${c.dateCol} < ${p.add(range.toExclusive)}`);
      return `LEFT JOIN (SELECT ${c.i}.productId, SUM(${c.i}.quantity) AS qty, SUM(${c.i}.netRate) AS amount,
          SUM(${c.i}.netRate - ${c.i}.taxAmount) AS taxable, SUM(${c.i}.taxAmount) AS tax, SUM(${c.i}.discountAmount) AS discount,
          COUNT(DISTINCT ${c.i}.${c.fk}) AS docs
        FROM ${c.itemTable} ${c.i} JOIN ${c.table} ${c.h} ON ${c.h}.id = ${c.i}.${c.fk}
        WHERE ${conds.join(' AND ')} GROUP BY ${c.i}.productId) ${prefix} ON ${prefix}.productId = pr.id`;
    };
    const sj = side('sales', 'sa');
    const pj = side('purchase', 'pa');
    const col = (alias, field, joined) => (joined ? `COALESCE(${alias}.${field}, 0)` : '0');

    const pconds = [];
    if (f[idCol]) pconds.push(`pr.${idCol} = ${p.add(f[idCol])}`);
    if (f[otherId]) pconds.push(`pr.${otherId} = ${p.add(f[otherId])}`);
    if (f.productId) pconds.push(`pr.id = ${p.add(f.productId)}`);
    if (f.search) {
      const ph = p.add(`%${H.escapeLike(f.search)}%`);
      pconds.push(isCat ? `(cat.category LIKE ${ph} OR pr.name LIKE ${ph})` : `(COALESCE(br.name, 'Unbranded') LIKE ${ph} OR pr.name LIKE ${ph})`);
    }

    const productSql = `SELECT pr.id AS productId, pr.name AS productName, pr.sku, pr.unit, pr.categoryId, cat.category AS categoryName,
        pr.brandId, COALESCE(br.name, 'Unbranded') AS brandName,
        ${col('sa', 'qty', sj)} AS salesQty, ${col('sa', 'amount', sj)} AS salesAmount, ${col('sa', 'taxable', sj)} AS salesTaxableValue,
        ${col('sa', 'tax', sj)} AS salesTax, ${col('sa', 'discount', sj)} AS salesDiscount, ${col('sa', 'docs', sj)} AS salesInvoiceCount,
        ${col('pa', 'qty', pj)} AS purchaseQty, ${col('pa', 'amount', pj)} AS purchaseAmount, ${col('pa', 'taxable', pj)} AS purchaseTaxableValue,
        ${col('pa', 'tax', pj)} AS purchaseTax, ${col('pa', 'discount', pj)} AS purchaseDiscount, ${col('pa', 'docs', pj)} AS purchaseBillCount,
        pr.stockQuantity AS currentStock, (pr.stockQuantity * pr.purchasePrice) AS stockValueAtCost, (pr.stockQuantity * pr.salesPrice) AS stockValueAtSale
      FROM products pr JOIN categories cat ON cat.id = pr.categoryId LEFT JOIN brands br ON br.id = pr.brandId
      ${sj || ''} ${pj || ''} ${where(pconds)}`;

    const baseSql = `SELECT b.${idCol} AS ${idCol}, b.${nameCol} AS ${nameCol}, COUNT(*) AS productCount,
        SUM(b.salesQty) AS salesQty, SUM(b.salesAmount) AS salesAmount, SUM(b.salesTaxableValue) AS salesTaxableValue,
        SUM(b.salesTax) AS salesTax, SUM(b.salesDiscount) AS salesDiscount,
        SUM(b.purchaseQty) AS purchaseQty, SUM(b.purchaseAmount) AS purchaseAmount, SUM(b.purchaseTaxableValue) AS purchaseTaxableValue,
        SUM(b.purchaseTax) AS purchaseTax, SUM(b.purchaseDiscount) AS purchaseDiscount,
        SUM(b.currentStock) AS currentStock, SUM(b.stockValueAtCost) AS stockValueAtCost, SUM(b.stockValueAtSale) AS stockValueAtSale
      FROM (${productSql}) b GROUP BY b.${idCol}, b.${nameCol}
      ${f.activeOnly ? 'HAVING SUM(b.salesQty) + SUM(b.purchaseQty) > 0' : ''}`;

    const groupNumeric = ['productCount', 'salesQty', 'salesAmount', 'salesTaxableValue', 'salesTax', 'salesDiscount', 'purchaseQty',
      'purchaseAmount', 'purchaseTaxableValue', 'purchaseTax', 'purchaseDiscount', 'currentStock', 'stockValueAtCost', 'stockValueAtSale'];
    const summarySql = `SELECT COUNT(*) AS ${isCat ? 'categoryCount' : 'brandCount'}, SUM(productCount) AS productCount,
        SUM(salesQty) AS salesQty, SUM(salesAmount) AS salesAmount, SUM(salesTaxableValue) AS salesTaxableValue,
        SUM(salesTax) AS salesTax, SUM(salesDiscount) AS salesDiscount, SUM(purchaseQty) AS purchaseQty,
        SUM(purchaseAmount) AS purchaseAmount, SUM(purchaseTaxableValue) AS purchaseTaxableValue, SUM(purchaseTax) AS purchaseTax,
        SUM(purchaseDiscount) AS purchaseDiscount, SUM(currentStock) AS currentStock, SUM(stockValueAtCost) AS stockValueAtCost,
        SUM(stockValueAtSale) AS stockValueAtSale FROM (${baseSql}) t`;

    const out = await H.runPaged({
      baseSql, params: p, orderBy: sort.orderBy, pg, numeric: groupNumeric, summarySql,
      summaryNumeric: [isCat ? 'categoryCount' : 'brandCount', ...groupNumeric],
    });

    if (f.includeProducts && out.data.length) {
      const ids = out.data.map((r) => r[idCol]);
      const hasNull = ids.some((v) => v === null);
      const nonNull = ids.filter((v) => v !== null);
      const idCond = [nonNull.length ? `b.${idCol} IN (${nonNull.map((v) => p.add(v)).join(',')})` : null, hasNull ? `b.${idCol} IS NULL` : null]
        .filter(Boolean).join(' OR ');
      const prodRows = H.normalize(
        await H.run(`SELECT * FROM (${productSql}) b WHERE ${idCond} ORDER BY b.productName ASC`, p.values),
        ['salesQty', 'salesAmount', 'salesTaxableValue', 'salesTax', 'salesDiscount', 'salesInvoiceCount', 'purchaseQty', 'purchaseAmount',
          'purchaseTaxableValue', 'purchaseTax', 'purchaseDiscount', 'purchaseBillCount', 'currentStock', 'stockValueAtCost', 'stockValueAtSale']
      );
      out.data.forEach((row) => { row.products = prodRows.filter((r) => r[idCol] === row[idCol]); });
    }

    return H.send(res, {
      ...out,
      filters: {
        ...(range.fromDate ? { fromDate: range.fromDate } : {}), ...(range.toDate ? { toDate: range.toDate } : {}),
        ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== false)),
      },
      sort: { sortBy: sort.sortKey, sortOrder: sort.order },
    });
  });
}

// 18. @route GET /api/reports/category-report
const categoryReport = groupedReport('category');
// 19. @route GET /api/reports/brand-report
const brandReport = groupedReport('brand');

module.exports = {
  // sales
  salesReport,
  userReport,
  salesByParty,
  salesByUser,
  salesByItem,
  itemSalesByUser,
  itemSalesByParty,
  // purchase
  purchaseReport,
  purchaseByParty,
  purchaseByItem,
  // inventory
  stockReport,
  stockSummary,
  // gst
  gstr1Report,
  gstr3bReport,
  gst2Report,
  // party
  partyOutstanding,
  customerStatement,
  // category / brand
  categoryReport,
  brandReport,
};
