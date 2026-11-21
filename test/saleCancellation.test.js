'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasRecordedPayment } = require('../utils/saleCancellation');

test('cancellation treats paid and partial statuses as recorded payment', () => {
  assert.equal(hasRecordedPayment({ paymentStatus: 'Paid', amountPaid: 0 }), true);
  assert.equal(hasRecordedPayment({ paymentStatus: 'Partial', amountPaid: 0 }), true);
  assert.equal(hasRecordedPayment({ paymentStatus: 'Unpaid', amountPaid: 1 }), true);
});

test('cancellation is allowed only when no payment is recorded', () => {
  assert.equal(hasRecordedPayment({ paymentStatus: 'Unpaid', amountPaid: 0 }), false);
  assert.equal(hasRecordedPayment({ paymentStatus: 'Overdue', amountPaid: 0 }), false);
});