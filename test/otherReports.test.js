'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function loadWithDatabaseStub(request, parent, isMain) {
  const filename = String(parent?.filename || '').replace(/\\/g, '/');
  if (request === '../config/sqldb' && filename.includes('/billing-backend/')) {
    return { query: async () => [] };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let reports;
let reportHelpers;
try {
  reports = require('../mysql-controllers/otherReportsController');
  reportHelpers = require('../utils/reportHelpers');
} finally {
  Module._load = originalLoad;
}

test('all Other Reports enforce company scope and stable server-side ordering', () => {
  const builders = [
    ['sales-returns', reports.buildSalesReturns, 'sales returns'],
    ['purchase-returns', reports.buildPurchaseReturns, 'purchase returns'],
    ['expiry-products', reports.buildExpiryProducts, 'expiry products'],
    ['loyalty-redemptions', reports.buildLoyaltyRedemptions, 'loyalty redemptions'],
  ];

  builders.forEach(([type, build], index) => {
    const result = build({}, index + 1);
    assert.match(result.baseSql, /companyId = :companyId/);
    assert.equal(result.params.values.companyId, index + 1, type);
    assert.match(result.sort.orderBy, /,\s*id ASC$/);
    assert.ok(result.summarySql.includes('FROM ('), type);
  });
});

test('sales-return filters are parameterized and expose the saved return condition', () => {
  const malicious = "%' OR 1=1 --";
  const result = reports.buildSalesReturns({
    fromDate: '2026-04-01',
    toDate: '2026-04-30',
    productName: malicious,
  }, 7);

  assert.match(result.baseSql, /si\.productName LIKE :p\d+/);
  assert.doesNotMatch(result.baseSql, /OR 1=1/);
  assert.ok(Object.values(result.params.values).some((value) => String(value).includes("\\%")));
  assert.match(result.baseSql, /sr\.returnCondition,/);
  assert.match(result.baseSql, /sr\.createdAt >= :p\d+/);
  assert.match(result.baseSql, /sr\.createdAt < :p\d+/);
});

test('sales-return history filters and summarizes saved return conditions', () => {
  const result = reports.buildSalesReturns({
    returnCondition: 'DAMAGED',
    productId: '4',
    categoryId: '5',
    brandId: '6',
    customerId: '7',
    batchNumber: 'BATCH-8',
    createdBy: '9',
  }, 3);

  assert.match(result.baseSql, /sr\.returnCondition = :p\d+/);
  assert.match(result.baseSql, /COALESCE\(pb\.batchNumber, si\.batchNo\) LIKE :p\d+/);
  assert.match(result.baseSql, /si\.price AS originalSellingRate/);
  assert.match(result.baseSql, /AS previousReturnedQuantity/);
  assert.match(result.summarySql, /AS resalableQuantity/);
  assert.match(result.summarySql, /AS damagedQuantity/);
  assert.match(result.summarySql, /AS expiredQuantity/);
  assert.match(result.summarySql, /AS damagedReturnAmount/);
  assert.match(result.conditionSql, /GROUP BY returnCondition/);
  assert.ok(Object.values(result.params.values).includes('DAMAGED'));
  assert.ok(Object.values(result.params.values).includes(4));
  assert.ok(Object.values(result.params.values).includes(5));
  assert.ok(Object.values(result.params.values).includes(6));
  assert.ok(Object.values(result.params.values).includes(7));
  assert.ok(Object.values(result.params.values).includes(9));
});

test('sales-return condition filter rejects conditions absent from the saved model', () => {
  assert.throws(
    () => reports.buildSalesReturns({ returnCondition: 'NOT_RECORDED' }, 1),
    (error) => error.status === 400 && /returnCondition/.test(error.message),
  );
});

test('report normalization preserves configured three-decimal quantities and default two-decimal values', () => {
  const [row] = reportHelpers.normalize(
    [{ returnedQuantity: 1.23456, returnAmount: 12.3456 }],
    ['returnedQuantity', 'returnAmount'],
    { returnedQuantity: 3 },
  );

  assert.equal(row.returnedQuantity, 1.235);
  assert.equal(row.returnAmount, 12.35);
});

test('stock movement joins cannot duplicate return rows', () => {
  const sales = reports.buildSalesReturns({}, 1).baseSql;
  const purchases = reports.buildPurchaseReturns({}, 1).baseSql;

  assert.match(sales, /GROUP BY referenceId\s*\) sm_latest/);
  assert.match(purchases, /GROUP BY referenceId, productId, batchId\s*\) sm_latest/);
  assert.match(sales, /BINARY sm_latest\.referenceId = BINARY CAST\(sr\.id AS CHAR\)/);
  assert.match(purchases, /BINARY sm_latest\.referenceId = BINARY CAST\(pr\.id AS CHAR\)/);
});

test('expiry buckets are mutually exclusive and report available batch stock only', () => {
  const result = reports.buildExpiryProducts({ expiryStatus: 'WITHIN_30_DAYS' }, 4);

  assert.match(result.baseSql, /pb\.availableQuantity > 0/);
  assert.match(result.baseSql, /DATE_ADD\(CURRENT_DATE\(\), INTERVAL 7 DAY\)/);
  assert.match(result.baseSql, /DATE_ADD\(CURRENT_DATE\(\), INTERVAL 30 DAY\)/);
  assert.match(result.baseSql, /DATE_ADD\(CURRENT_DATE\(\), INTERVAL 60 DAY\)/);
  assert.ok(Object.values(result.params.values).includes('WITHIN_30_DAYS'));
});
