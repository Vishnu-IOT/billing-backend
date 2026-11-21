'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  inferPartyRegistrationType,
  resolvePurchaseTaxType,
  stateCodeFromGstin,
  splitTax,
  validatePartyRegistration,
  validatePurchaseInvoiceType,
} = require('../utils/gstInvoiceTax');

const registeredParty = {
  GST: '29ABCDE1234F1Z5',
  gstRegistrationType: 'REGISTERED',
};

test('party GST registration validates registered and unregistered records', () => {
  assert.deepEqual(
    validatePartyRegistration({
      gstRegistrationType: 'REGISTERED',
      GST: '29abcde1234f1z5',
    }),
    {
      gstRegistrationType: 'REGISTERED',
      GST: '29ABCDE1234F1Z5',
    },
  );
  assert.deepEqual(
    validatePartyRegistration({
      gstRegistrationType: 'UNREGISTERED',
      GST: '',
    }),
    { gstRegistrationType: 'UNREGISTERED', GST: null },
  );
  assert.throws(
    () => validatePartyRegistration({
      gstRegistrationType: 'REGISTERED',
      GST: 'invalid',
    }),
    /valid 15-character GSTIN/,
  );
  assert.equal(inferPartyRegistrationType({ GST: '29ABCDE1234F1Z5' }), 'REGISTERED');
});

test('supplier registration restricts purchase invoice types', () => {
  assert.equal(validatePurchaseInvoiceType(registeredParty, 'GST_INVOICE'), 'REGISTERED');
  assert.equal(validatePurchaseInvoiceType(registeredParty, 'BILL_OF_SUPPLY'), 'REGISTERED');
  assert.throws(
    () => validatePurchaseInvoiceType(registeredParty, 'NON_GST_INVOICE'),
    /cannot be used/,
  );
  assert.equal(
    validatePurchaseInvoiceType({ gstRegistrationType: 'UNREGISTERED' }, 'NON_GST_INVOICE'),
    'UNREGISTERED',
  );
});

test('supplier state is derived only from a valid supported GSTIN', () => {
  assert.equal(stateCodeFromGstin(registeredParty.GST), '29');
  assert.equal(stateCodeFromGstin('00ABCDE1234F1Z5'), null);
});

test('tax type resolves from state codes or an explicit override', () => {
  assert.equal(
    resolvePurchaseTaxType({
      partyGstin: registeredParty.GST,
      companyGstin: '29XYZDE1234F1Z8',
    }),
    'CGST_SGST',
  );
  assert.equal(
    resolvePurchaseTaxType({
      partyGstin: registeredParty.GST,
      companyStateCode: '27',
    }),
    'IGST',
  );
  assert.equal(
    resolvePurchaseTaxType({
      partyGstin: registeredParty.GST,
      companyStateCode: '27',
      placeOfSupplyStateCode: '29',
    }),
    'CGST_SGST',
  );
  assert.equal(
    resolvePurchaseTaxType({
      partyGstin: registeredParty.GST,
      override: 'IGST',
    }),
    'IGST',
  );
  assert.throws(
    () => resolvePurchaseTaxType({ partyGstin: registeredParty.GST }),
    /Set the company GSTIN\/state/,
  );
});

test('GST splitting assigns tax to either IGST or equal CGST and SGST', () => {
  assert.deepEqual(splitTax(18, 18, 'IGST'), {
    cgstRate: 0,
    cgstAmount: 0,
    sgstRate: 0,
    sgstAmount: 0,
    igstRate: 18,
    igstAmount: 18,
  });
  assert.deepEqual(splitTax(5.01, 5, 'CGST_SGST'), {
    cgstRate: 2.5,
    cgstAmount: 2.51,
    sgstRate: 2.5,
    sgstAmount: 2.5,
    igstRate: 0,
    igstAmount: 0,
  });
});
