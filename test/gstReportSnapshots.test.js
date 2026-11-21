'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  captureGstPartySnapshot,
  capturePurchaseGstSnapshot,
  splitStoredTax,
  stateCode,
} = require('../utils/gstReportSnapshots');

test('captures supplier and supply-place snapshots without later lookups', () => {
  assert.deepEqual(
    capturePurchaseGstSnapshot({
      companyId: 7,
      companyStateCode: 'Tamil Nadu',
      party: {
        name: 'Supplier',
        GST: '27ABCDE1234F1Z5',
        gstRegistrationType: 'REGISTERED',
      },
    }),
    {
      companyId: 7,
      partyNameSnapshot: 'Supplier',
      partyGstinSnapshot: '27ABCDE1234F1Z5',
      partyRegistrationTypeSnapshot: 'REGISTERED',
      placeOfSupplyStateCodeSnapshot: '33',
      placeOfSupplyNameSnapshot: 'Tamil Nadu',
    }
  );
});

test('captures intra-state and inter-state sales tax classification', () => {
  const intraState = captureGstPartySnapshot({
    companyId: 4,
    companyStateCode: '33',
    party: { name: 'Customer', GST: '33ABCDE1234F1Z5' },
    billType: 'B2B',
  });
  const interState = captureGstPartySnapshot({
    companyId: 4,
    companyStateCode: '33',
    party: { name: 'Customer', GST: '27ABCDE1234F1Z5' },
    billType: 'B2B',
  });

  assert.equal(intraState.taxTypeSnapshot, 'CGST_SGST');
  assert.equal(intraState.placeOfSupplyNameSnapshot, 'Tamil Nadu');
  assert.equal(interState.taxTypeSnapshot, 'IGST');
  assert.equal(interState.placeOfSupplyNameSnapshot, 'Maharashtra');
});

test('does not invent a place of supply for a B2C sale without one', () => {
  const snapshot = captureGstPartySnapshot({
    companyId: 3,
    companyStateCode: '33',
    partyName: 'Walk-in Customer',
    billType: 'B2C',
  });

  assert.equal(snapshot.partyRegistrationTypeSnapshot, 'UNREGISTERED');
  assert.equal(snapshot.placeOfSupplyStateCodeSnapshot, null);
  assert.equal(snapshot.taxTypeSnapshot, null);
});

test('does not infer historical tax splits when classification is missing', () => {
  assert.deepEqual(splitStoredTax(18, 18, null), {
    cgstAmount: null,
    sgstAmount: null,
    igstAmount: null,
    cessAmount: null,
  });
  assert.deepEqual(splitStoredTax(0, 18, null), {
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    cessAmount: 0,
  });
  assert.equal(stateCode('Maharashtra'), '27');
});
