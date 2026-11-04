// Shared helpers for the reporting module (mysql-controllers/reportsController.js).
//
// Everything here is deliberately small and dependency-free so each report can
// compose: parse + validate query params -> build WHERE fragments (all values
// go through named replacements, never string-concatenated) -> run one query
// for the page, one for the count and one for the summary over the WHOLE
// filtered set.

const sequelize = require('../config/sqldb');
const { QueryTypes } = require('sequelize');

// ─── Errors ────────────────────────────────────────────────────────────────
class ReportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ─── Primitive parsers (all return `undefined` when the param is absent/blank,
//     and throw ReportError(400) when it is present but invalid) ────────────
const isBlank = (v) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ||
  (typeof v === 'string' && ['undefined', 'null'].includes(v.trim().toLowerCase()));

const str = (v) => (isBlank(v) ? undefined : String(Array.isArray(v) ? v[0] : v).trim());

function parseId(name, v) {
  if (isBlank(v)) return undefined;
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ReportError(`${name} must be a positive integer`);
  }
  return n;
}

function parseBool(name, v) {
  if (isBlank(v)) return undefined;
  const s = String(Array.isArray(v) ? v[0] : v).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  throw new ReportError(`${name} must be true or false`);
}

// Case-insensitive match against an allow-list; returns the canonical spelling.
function parseEnum(name, v, allowed) {
  if (isBlank(v)) return undefined;
  const s = String(Array.isArray(v) ? v[0] : v).trim().toLowerCase().replace(/[\s_-]+/g, '');
  const hit = allowed.find((a) => a.toLowerCase().replace(/[\s_-]+/g, '') === s);
  if (!hit) {
    throw new ReportError(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return hit;
}

// ─── Dates ─────────────────────────────────────────────────────────────────
// Dates are handled as plain 'YYYY-MM-DD' / 'YYYY-MM-DD HH:mm:ss' strings and
// never round-tripped through JS Date, because the Sequelize connection is
// pinned to +05:30 and a JS Date would be shifted through UTC.
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function validYmd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseDateOnly(name, v) {
  if (isBlank(v)) return undefined;
  const s = String(Array.isArray(v) ? v[0] : v).trim();
  const m = DATE_RE.exec(s);
  if (!m || !validYmd(Number(m[1]), Number(m[2]), Number(m[3]))) {
    throw new ReportError(`${name} must be a valid date in YYYY-MM-DD format`);
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Range is [from 00:00:00, toExclusive 00:00:00) so the whole of `toDate` is
// included (start-of-day .. end-of-day) without relying on 23:59:59 literals.
function parseDateRange(q, fromKey = 'fromDate', toKey = 'toDate') {
  const from = parseDateOnly(fromKey, q[fromKey]);
  const to = parseDateOnly(toKey, q[toKey]);
  if (from && to && from > to) {
    throw new ReportError(`${fromKey} cannot be after ${toKey}`);
  }
  return {
    from: from ? `${from} 00:00:00` : undefined,
    toExclusive: to ? `${addDays(to, 1)} 00:00:00` : undefined,
    fromDate: from,
    toDate: to,
  };
}

// asOfDate → exclusive upper bound (everything up to the end of that day)
function parseAsOf(q, key = 'asOfDate') {
  const d = parseDateOnly(key, q[key]);
  return d ? { asOfDate: d, asOfExclusive: `${addDays(d, 1)} 00:00:00` } : {};
}

// Indian financial year helpers (Apr–Mar). Accepts 2026-27, 2026-2027 or 2026.
function parseFinancialYear(v) {
  if (isBlank(v)) return undefined;
  const s = String(Array.isArray(v) ? v[0] : v).trim();
  const m = /^(\d{4})(?:\s*-\s*(\d{2}|\d{4}))?$/.exec(s);
  if (!m) throw new ReportError('financialYear must look like 2026-27, 2026-2027 or 2026');
  const start = Number(m[1]);
  if (m[2]) {
    const end = m[2].length === 2 ? Number(m[2]) : Number(m[2]) % 100;
    if (end !== (start + 1) % 100) {
      throw new ReportError('financialYear end must be the year after its start (e.g. 2026-27)');
    }
  }
  return start;
}

// month: 1-12 (needs financialYear to resolve the calendar year) or YYYY-MM
function parseMonth(v, fyStart) {
  if (isBlank(v)) return undefined;
  const s = String(Array.isArray(v) ? v[0] : v).trim();
  let y;
  let mo;
  const ym = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (ym) {
    y = Number(ym[1]);
    mo = Number(ym[2]);
  } else if (/^\d{1,2}$/.test(s)) {
    mo = Number(s);
    if (fyStart === undefined) {
      throw new ReportError('month given as 1-12 requires financialYear; otherwise pass month as YYYY-MM');
    }
    y = mo >= 4 ? fyStart : fyStart + 1;
  } else {
    throw new ReportError('month must be 1-12 (with financialYear) or YYYY-MM');
  }
  if (mo < 1 || mo > 12) throw new ReportError('month must be between 1 and 12');
  const from = `${y}-${String(mo).padStart(2, '0')}-01`;
  const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  return { from, toExclusive: next };
}

// GST period = intersection of financialYear, month and fromDate/toDate.
function parseGstPeriod(q) {
  const fy = parseFinancialYear(q.financialYear);
  const month = parseMonth(q.month, fy);
  const { fromDate, toDate } = parseDateRange(q);

  let from = null;
  let toEx = null;
  const tighten = (f, t) => {
    if (f && (!from || f > from)) from = f;
    if (t && (!toEx || t < toEx)) toEx = t;
  };
  if (fy !== undefined) tighten(`${fy}-04-01`, `${fy + 1}-04-01`);
  if (month) tighten(month.from, month.toExclusive);
  if (fromDate) tighten(fromDate, null);
  if (toDate) tighten(null, addDays(toDate, 1));

  return {
    from: from ? `${from} 00:00:00` : undefined,
    toExclusive: toEx ? `${toEx} 00:00:00` : undefined,
    empty: Boolean(from && toEx && from >= toEx), // e.g. month outside the chosen FY
    financialYear: fy,
  };
}

// ─── Pagination / sorting / search ─────────────────────────────────────────
const MAX_LIMIT = 500;

// legacy=true -> endpoints that used to return everything: stay unpaginated
// unless the caller opts in with page/limit.
function parsePagination(q, { defaultLimit = 50, legacy = false } = {}) {
  const hasPage = !isBlank(q.page);
  const hasLimit = !isBlank(q.limit);
  const pageRaw = hasPage ? Number(Array.isArray(q.page) ? q.page[0] : q.page) : 1;
  const limitRaw = hasLimit ? Number(Array.isArray(q.limit) ? q.limit[0] : q.limit) : defaultLimit;
  if (!Number.isInteger(pageRaw) || pageRaw < 1) throw new ReportError('page must be an integer >= 1');
  if (!Number.isInteger(limitRaw) || limitRaw < 1) throw new ReportError('limit must be an integer >= 1');
  if (limitRaw > MAX_LIMIT) throw new ReportError(`limit cannot exceed ${MAX_LIMIT}`);
  const unpaginated = legacy && !hasPage && !hasLimit;
  return { page: pageRaw, limit: limitRaw, unpaginated };
}

// `allowed` maps public sortBy keys -> SQL column/alias (whitelist: nothing from
// the query string ever reaches ORDER BY directly).
function parseSort(q, allowed, defaultKey, defaultOrder = 'DESC') {
  const key = str(q.sortBy);
  let col = allowed[defaultKey];
  let sortKey = defaultKey;
  if (key) {
    const hit = Object.keys(allowed).find((k) => k.toLowerCase() === key.toLowerCase());
    if (!hit) throw new ReportError(`sortBy must be one of: ${Object.keys(allowed).join(', ')}`);
    col = allowed[hit];
    sortKey = hit;
  }
  const ord = str(q.sortOrder);
  let order = defaultOrder;
  if (ord) {
    if (!['asc', 'desc'].includes(ord.toLowerCase())) throw new ReportError('sortOrder must be asc or desc');
    order = ord.toUpperCase();
  }
  return { sortKey, order, orderBy: `${col} ${order}, 1 ASC` };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// ─── Named-replacement builder ─────────────────────────────────────────────
class Params {
  constructor() {
    this.values = {};
    this.n = 0;
  }
  add(value) {
    const key = `p${this.n++}`;
    this.values[key] = value;
    return `:${key}`;
  }
}

// ─── Query + response plumbing ─────────────────────────────────────────────
const run = (sql, replacements) =>
  sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function normalize(rows, numericKeys) {
  return rows.map((r) => {
    const out = { ...r };
    numericKeys.forEach((k) => {
      if (k in out) out[k] = out[k] === null || out[k] === undefined ? 0 : round2(out[k]);
    });
    return out;
  });
}

function normalizeObject(obj, numericKeys) {
  return normalize([obj || {}], numericKeys)[0];
}

// Paginated "grouped / listed" query:
//   baseSql  = the full filtered query WITHOUT ORDER/LIMIT (one row per result row)
//   The page, the count and the summary all run against that same base so
//   totals are over the entire filtered dataset, never just the current page.
async function runPaged({ baseSql, params, orderBy, pg, numeric = [], summarySql, summaryNumeric }) {
  const countP = run(`SELECT COUNT(*) AS total FROM (${baseSql}) t`, params.values);
  const sumP = summarySql ? run(summarySql, params.values) : Promise.resolve(null);
  const [countRows, sumRows] = await Promise.all([countP, sumP]);
  const total = Number(countRows[0].total) || 0;

  const limit = pg.unpaginated ? Math.max(total, 1) : pg.limit;
  const page = pg.unpaginated ? 1 : pg.page;
  const offset = (page - 1) * limit;

  const rows = total
    ? await run(
        `SELECT * FROM (${baseSql}) t ORDER BY ${orderBy} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params.values
      )
    : [];

  return {
    data: normalize(rows, numeric),
    pagination: { total, page, limit, totalPages: total ? Math.ceil(total / limit) : 0 },
    summary: sumRows ? normalizeObject(sumRows[0], summaryNumeric || numeric) : undefined,
  };
}

function send(res, payload) {
  return res.status(200).json({ success: true, ...payload });
}

// Wraps a handler: ReportError -> 400/404 with { success:false, message }.
// Anything else -> 500 (same { message } shape the old handlers used).
const handler = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof ReportError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Report error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Reusable SQL fragments ────────────────────────────────────────────────
// Invoices created already "Paid" never get amountPaid / payments_in written
// by createInvoice, so a bare (totalAmount - amountPaid) overstates what is
// owed. Treat status as the source of truth for fully-paid invoices.
const effPaid = (a) => `(CASE WHEN ${a}.paymentStatus = 'Paid' THEN ${a}.totalAmount ELSE ${a}.amountPaid END)`;
const balanceDue = (a) =>
  `(CASE WHEN ${a}.paymentStatus IN ('Paid','Cancelled') THEN 0 ELSE GREATEST(${a}.totalAmount - ${a}.amountPaid, 0) END)`;

// Party type is not a column on `parties` (one table for customers and
// suppliers). It is derived from what the party has actually transacted:
//   Customer = has >=1 sale, Supplier = has >=1 purchase, Both = has both.
const partyHasSale = (a) => `EXISTS (SELECT 1 FROM sales _ps WHERE _ps.partyId = ${a}.id)`;
const partyHasPurchase = (a) => `EXISTS (SELECT 1 FROM purchases _pp WHERE _pp.partyId = ${a}.id)`;
const partyTypeExpr = (a) =>
  `(CASE WHEN ${partyHasSale(a)} AND ${partyHasPurchase(a)} THEN 'Both'
         WHEN ${partyHasSale(a)} THEN 'Customer'
         WHEN ${partyHasPurchase(a)} THEN 'Supplier'
         ELSE 'None' END)`;

function partyTypeCondition(a, partyType) {
  if (partyType === 'Customer') return partyHasSale(a);
  if (partyType === 'Supplier') return partyHasPurchase(a);
  if (partyType === 'Both') return `(${partyHasSale(a)} AND ${partyHasPurchase(a)})`;
  return null;
}

module.exports = {
  ReportError,
  str,
  isBlank,
  parseId,
  parseBool,
  parseEnum,
  parseDateOnly,
  parseDateRange,
  parseAsOf,
  parseGstPeriod,
  parseFinancialYear,
  parsePagination,
  parseSort,
  escapeLike,
  addDays,
  Params,
  run,
  runPaged,
  normalize,
  normalizeObject,
  round2,
  send,
  handler,
  effPaid,
  balanceDue,
  partyTypeExpr,
  partyTypeCondition,
};
