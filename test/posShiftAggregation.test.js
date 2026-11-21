'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { Op } = require('sequelize');

const aggregationPath = path.resolve(__dirname, '../utils/posShiftAggregation.js');
const shifts = [
  { id: 1, userId: 7, companyId: 3, cashSalesTotal: 0, upiSalesTotal: 0, cardSalesTotal: 0, otherSalesTotal: 0, totalSalesCount: 0 },
  { id: 2, userId: 8, companyId: 3, cashSalesTotal: 0, upiSalesTotal: 0, cardSalesTotal: 0, otherSalesTotal: 0, totalSalesCount: 0 },
];
let sales = [];
let salesQueryOptions = null;

const dependencies = {
  sequelize: { Op },
  '../mysql-models/POSShift': {
    findByPk: async (id) => {
      const shift = shifts.find((entry) => Number(entry.id) === Number(id));
      if (!shift) return null;
      return {
        ...shift,
        update: async (values) => Object.assign(shift, values),
      };
    },
  },
  '../mysql-models/SalesBill': {
    findAll: async (options) => {
      salesQueryOptions = options;
      return sales.filter((sale) =>
        Number(sale.shiftId) === Number(options.where.shiftId) &&
        Number(sale.userId) === Number(options.where.userId) &&
        sale.bill_type === options.where.bill_type &&
        sale.paymentStatus !== options.where.paymentStatus[Op.ne]
      );
    },
  },
};

const originalLoad = Module._load;
Module._load = function loadWithShiftStubs(request, parent, isMain) {
  if (parent?.filename === aggregationPath && dependencies[request]) {
    return dependencies[request];
  }
  return originalLoad.call(this, request, parent, isMain);
};
const {
  normalizePaymentAllocations,
  buildStoredPaymentDetails,
  recalculatePosShiftTotals,
} = require(aggregationPath);
Module._load = originalLoad;

const transaction = { LOCK: { UPDATE: 'UPDATE' } };

test.beforeEach(() => {
  sales = [];
  salesQueryOptions = null;
  shifts.forEach((shift) => {
    Object.assign(shift, {
      cashSalesTotal: 0,
      upiSalesTotal: 0,
      cardSalesTotal: 0,
      otherSalesTotal: 0,
      totalSalesCount: 0,
    });
  });
});

test('aggregates cash, UPI and card allocations from separate POS bills', async () => {
  sales = [
    { id: 1, shiftId: 1, userId: 7, bill_type: 'B2C', paymentStatus: 'Paid', totalAmount: 500, paymentDetails: '{"cash":500}' },
    { id: 2, shiftId: 1, userId: 7, bill_type: 'B2C', paymentStatus: 'Paid', totalAmount: 800, paymentDetails: '{"upi":800}' },
    { id: 3, shiftId: 1, userId: 7, bill_type: 'B2C', paymentStatus: 'Paid', totalAmount: 1000, paymentDetails: '{"card":1000}' },
  ];

  await recalculatePosShiftTotals(1, transaction);

  assert.equal(shifts[0].totalSalesCount, 3);
  assert.equal(shifts[0].cashSalesTotal, 500);
  assert.equal(shifts[0].upiSalesTotal, 800);
  assert.equal(shifts[0].cardSalesTotal, 1000);
});

test('aggregates split payments and excludes store credit from physical collections', async () => {
  const allocations = normalizePaymentAllocations({
    paymentDetails: {
      cash: 300,
      upi: 200,
      returnCredit: { amount: 100 },
    },
    totalAmount: 600,
    returnCreditAmount: 100,
  });
  assert.deepEqual(allocations, { cash: 300, upi: 200, card: 0, other: 0 });

  sales = [{
    id: 1,
    shiftId: 1,
    userId: 7,
    bill_type: 'B2C',
    paymentStatus: 'Paid',
    totalAmount: 600,
    returnCreditAmount: 100,
    paymentDetails: JSON.stringify(allocations),
  }];
  await recalculatePosShiftTotals(1, transaction);

  assert.equal(shifts[0].totalSalesCount, 1);
  assert.equal(shifts[0].cashSalesTotal, 300);
  assert.equal(shifts[0].upiSalesTotal, 200);
});

test('supports other payment methods and ignores payment metadata', async () => {
  sales = [{
    id: 1,
    shiftId: 1,
    userId: 7,
    bill_type: 'B2C',
    paymentStatus: 'Partial',
    totalAmount: 1000,
    paymentDetails: '{"bankTransfer":250,"cash":100,"amountReturned":50}',
  }];

  await recalculatePosShiftTotals(1, transaction);

  assert.equal(shifts[0].otherSalesTotal, 250);
  assert.equal(shifts[0].cashSalesTotal, 100);
  assert.equal(shifts[0].totalSalesCount, 1);
});

test('recalculation is idempotent and removes cancelled sales without affecting another user', async () => {
  sales = [
    { id: 1, shiftId: 1, userId: 7, bill_type: 'B2C', paymentStatus: 'Paid', totalAmount: 500, paymentDetails: '{"cash":500}' },
    { id: 2, shiftId: 1, userId: 7, bill_type: 'B2C', paymentStatus: 'Cancelled', totalAmount: 200, paymentDetails: '{"upi":200}' },
    { id: 3, shiftId: 2, userId: 8, bill_type: 'B2C', paymentStatus: 'Paid', totalAmount: 900, paymentDetails: '{"card":900}' },
    { id: 4, shiftId: 1, userId: 7, bill_type: 'B2B', paymentStatus: 'Paid', totalAmount: 300, paymentDetails: '{"cash":300}' },
  ];

  await recalculatePosShiftTotals(1, transaction);
  await recalculatePosShiftTotals(1, transaction);
  await recalculatePosShiftTotals(2, transaction);

  assert.equal(shifts[0].cashSalesTotal, 500);
  assert.equal(shifts[0].totalSalesCount, 1);
  assert.equal(shifts[1].cardSalesTotal, 900);
  assert.equal(shifts[1].totalSalesCount, 1);
});

test('replaces totals when an invoice is edited and removes it when cancelled', async () => {
  const sale = {
    id: 1,
    shiftId: 1,
    userId: 7,
    bill_type: 'B2C',
    paymentStatus: 'Paid',
    totalAmount: 500,
    paymentDetails: '{"cash":500}',
  };
  sales = [sale];

  await recalculatePosShiftTotals(1, transaction);
  sale.totalAmount = 300;
  sale.paymentDetails = '{"card":300}';
  await recalculatePosShiftTotals(1, transaction);

  assert.equal(shifts[0].totalSalesCount, 1);
  assert.equal(shifts[0].cashSalesTotal, 0);
  assert.equal(shifts[0].cardSalesTotal, 300);

  sale.paymentStatus = 'Cancelled';
  await recalculatePosShiftTotals(1, transaction);
  assert.equal(shifts[0].totalSalesCount, 0);
  assert.equal(shifts[0].cardSalesTotal, 0);
});

test('stores canonical tender allocations and preserves the return-credit marker', () => {
  const details = buildStoredPaymentDetails({
    paymentDetails: '{"cash":300,"upi":200}',
    totalAmount: 600,
    returnCreditAmount: 100,
    returnCredit: { amount: 100 },
  });

  assert.deepEqual(details, {
    cash: 300,
    upi: 200,
    card: 0,
    other: 0,
    returnCredit: { amount: 100 },
  });
});

test('subtracts loyalty redemption from fallback physical tender and keeps it as metadata', () => {
  const details = buildStoredPaymentDetails({
    paymentDetails: null,
    paymentMethod: 'Cash',
    totalAmount: 100,
    returnCreditAmount: 10,
    loyaltyRedemptionAmount: 20,
  });

  assert.equal(details.cash, 70);
  assert.equal(details.loyaltyRedemptionAmount, 20);
});

test('recalculates a loyalty-discounted POS sale without selecting a nonexistent sales column', async () => {
  sales = [{
    id: 1,
    shiftId: 1,
    userId: 7,
    bill_type: 'B2C',
    paymentStatus: 'Paid',
    totalAmount: 100,
    returnCreditAmount: 0,
    paymentDetails: '{"cash":80,"loyaltyRedemptionAmount":20}',
  }];

  await recalculatePosShiftTotals(1, transaction);

  assert.deepEqual(salesQueryOptions.attributes, [
    'id',
    'paymentDetails',
    'totalAmount',
    'returnCreditAmount',
  ]);
  assert.equal(shifts[0].cashSalesTotal, 80);
  assert.equal(shifts[0].totalSalesCount, 1);
});
