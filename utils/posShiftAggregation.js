'use strict';

const { Op } = require('sequelize');
const POSShift = require('../mysql-models/POSShift');
const Sale = require('../mysql-models/SalesBill');

const PAYMENT_BUCKETS = ['cash', 'upi', 'card', 'other'];
const NON_PAYMENT_KEYS = new Set([
  'amountreceived',
  'amountreturned',
  'change',
  'credit',
  'creditamount',
  'storecredit',
  'storecreditamount',
  'returncredit',
  'returncreditamount',
  'loyaltyredemption',
  'loyaltyredemptionamount',
  'loyaltypointsredeemed',
  'remainingamount',
  'method',
  'mode',
  'type',
  'paymentmethod',
  'amount',
  'value',
  'paymentstatus',
  'reference',
  'referenceno',
  'referenceid',
  'transactionid',
  'notes',
]);

const toCents = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.round((amount + Number.EPSILON) * 100)
    : 0;
};

const toAmounts = (cents) =>
  Object.fromEntries(PAYMENT_BUCKETS.map((bucket) => [bucket, cents[bucket] / 100]));

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z]/g, '');

const bucketForMethod = (method) => {
  const key = normalizeKey(method);
  if (key.includes('cash')) return 'cash';
  if (key.includes('upi')) return 'upi';
  if (key.includes('card') || key.includes('creditcard') || key.includes('debitcard')) {
    return 'card';
  }
  return 'other';
};

const parsePaymentDetails = (paymentDetails) => {
  let details = paymentDetails;
  for (let attempt = 0; attempt < 2 && typeof details === 'string'; attempt += 1) {
    try {
      details = JSON.parse(details);
    } catch (error) {
      throw new Error('Stored POS payment details are not valid JSON');
    }
  }
  return details && typeof details === 'object' ? details : null;
};

const normalizePaymentAllocations = ({
  paymentDetails,
  paymentMethod,
  totalAmount,
  returnCreditAmount = 0,
  loyaltyRedemptionAmount = 0,
}) => {
  const details = parsePaymentDetails(paymentDetails);
  const cents = Object.fromEntries(PAYMENT_BUCKETS.map((bucket) => [bucket, 0]));
  let foundAllocation = false;

  const add = (bucket, value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('POS payment allocations must be non-negative amounts');
    }
    cents[bucket] += toCents(amount);
    foundAllocation = true;
  };

  const readAllocationArray = (entries) => {
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const method = entry.method || entry.paymentMethod || entry.mode || entry.type;
      const amount = entry.amount ?? entry.value;
      if (method != null && amount != null) add(bucketForMethod(method), amount);
    });
  };

  if (Array.isArray(details)) {
    readAllocationArray(details);
  } else if (details) {
    const singleMethod = details.method || details.paymentMethod || details.mode || details.type;
    const singleAmount = details.amount ?? details.value;
    if (singleMethod != null && singleAmount != null) {
      add(bucketForMethod(singleMethod), singleAmount);
    }

    for (const [key, value] of Object.entries(details)) {
      const normalizedKey = normalizeKey(key);
      if (NON_PAYMENT_KEYS.has(normalizedKey)) continue;

      if (['payments', 'allocations', 'paymentallocations'].includes(normalizedKey)) {
        if (Array.isArray(value)) readAllocationArray(value);
        continue;
      }

      if (value == null || typeof value === 'object') continue;
      const amount = Number(value);
      if (!Number.isFinite(amount)) continue;

      if (normalizedKey === 'cash' || normalizedKey === 'cashamount') {
        add('cash', amount);
      } else if (normalizedKey === 'upi' || normalizedKey === 'upiamount') {
        add('upi', amount);
      } else if (normalizedKey === 'card' || normalizedKey === 'cardamount') {
        add('card', amount);
      } else if (normalizedKey === 'other' || normalizedKey === 'otheramount') {
        add('other', amount);
      } else {
        add(bucketForMethod(key), amount);
      }
    }
  }

  if (!foundAllocation) {
    const dueCents = Math.max(
      0,
      toCents(totalAmount) -
        toCents(returnCreditAmount) -
        toCents(loyaltyRedemptionAmount)
    );
    if (dueCents > 0) {
      const method = normalizeKey(paymentMethod);
      if (method === 'split') {
        throw new Error('POS payment allocations are required for split payments');
      }
      if (method) {
        cents[bucketForMethod(paymentMethod)] = dueCents;
      }
    }
  }

  return toAmounts(cents);
};

const buildStoredPaymentDetails = ({
  paymentDetails,
  paymentMethod,
  totalAmount,
  returnCreditAmount = 0,
  loyaltyRedemptionAmount = 0,
  returnCredit,
}) => {
  const details = parsePaymentDetails(paymentDetails);
  return {
    ...(!Array.isArray(details) && details && typeof details === 'object' ? details : {}),
    ...normalizePaymentAllocations({
      paymentDetails,
      paymentMethod,
      totalAmount,
      returnCreditAmount,
      loyaltyRedemptionAmount,
    }),
    ...((returnCredit || details?.returnCredit) && {
      returnCredit: returnCredit || details.returnCredit,
    }),
    ...(loyaltyRedemptionAmount > 0 && {
      loyaltyRedemptionAmount: Number(loyaltyRedemptionAmount),
    }),
  };
};

const recalculatePosShiftTotals = async (shiftId, transaction) => {
  if (!shiftId) return null;

  const shift = await POSShift.findByPk(shiftId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!shift) return null;

  const sales = await Sale.findAll({
    where: {
      shiftId: shift.id,
      userId: shift.userId,
      bill_type: 'B2C',
      paymentStatus: { [Op.ne]: 'Cancelled' },
    },
    attributes: [
      'id',
      'paymentDetails',
      'totalAmount',
      'returnCreditAmount',
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const totalsInCents = Object.fromEntries(PAYMENT_BUCKETS.map((bucket) => [bucket, 0]));
  for (const sale of sales) {
    const allocations = normalizePaymentAllocations({
      paymentDetails: sale.paymentDetails,
      paymentMethod: sale.paymentMethod,
      totalAmount: sale.totalAmount,
      returnCreditAmount: sale.returnCreditAmount,
      loyaltyRedemptionAmount:
        parsePaymentDetails(sale.paymentDetails)?.loyaltyRedemptionAmount || 0,
    });
    for (const bucket of PAYMENT_BUCKETS) {
      totalsInCents[bucket] += toCents(allocations[bucket]);
    }
  }

  const totals = toAmounts(totalsInCents);
  await shift.update(
    {
      cashSalesTotal: totals.cash,
      upiSalesTotal: totals.upi,
      cardSalesTotal: totals.card,
      otherSalesTotal: totals.other,
      totalSalesCount: sales.length,
    },
    { transaction }
  );
  return shift;
};

module.exports = {
  normalizePaymentAllocations,
  buildStoredPaymentDetails,
  recalculatePosShiftTotals,
};
