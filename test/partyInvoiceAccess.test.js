'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { getPartyInvoiceVisibility } = require('../utils/partyInvoiceVisibility');

test('Purchase Manager party invoice history is limited to purchase invoices', () => {
  assert.deepEqual(
    getPartyInvoiceVisibility({
      permissions: new Set(['parties.directory.view', 'purchases.invoices.view']),
    }),
    { sales: false, purchases: true }
  );
});

test('report viewers and Administrators can view both party invoice types', () => {
  assert.deepEqual(
    getPartyInvoiceVisibility({
      permissions: new Set(['reports.business.view']),
    }),
    { sales: true, purchases: true }
  );
  assert.deepEqual(
    getPartyInvoiceVisibility({ isSystemAdministrator: true }),
    { sales: true, purchases: true }
  );
});
