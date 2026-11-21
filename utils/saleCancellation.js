'use strict';

const hasRecordedPayment = (sale) =>
  Number(sale?.amountPaid || 0) > 0 ||
  ['Paid', 'Partial'].includes(String(sale?.paymentStatus || '').trim());

module.exports = { hasRecordedPayment };