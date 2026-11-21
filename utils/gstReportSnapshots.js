'use strict';

const { GSTIN_PATTERN, inferPartyRegistrationType, normalizeGstin, splitTax } =
  require('./gstInvoiceTax');

const STATE_NAMES = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (before division)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

const STATE_CODES_BY_NAME = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code])
);

function stateCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{1,2}$/.test(raw)) {
    const code = raw.padStart(2, '0');
    return STATE_NAMES[code] ? code : null;
  }
  const gstin = normalizeGstin(raw);
  const gstinCode = gstin.slice(0, 2);
  return GSTIN_PATTERN.test(gstin) && STATE_NAMES[gstinCode]
    ? gstinCode
    : STATE_CODES_BY_NAME[raw.toLowerCase()] || null;
}

function captureGstPartySnapshot({
  companyId,
  companyStateCode,
  companyGstin,
  party,
  partyName,
  placeOfSupplyStateCode,
  taxType,
  billType,
}) {
  const sellerState = stateCode(companyGstin) || stateCode(companyStateCode);
  const partyGstin = normalizeGstin(party?.GST) || null;
  const partyState = stateCode(partyGstin);
  const placeCode =
    stateCode(placeOfSupplyStateCode) ||
    (billType === 'B2B' ? partyState : null);
  const taxTypeSnapshot =
    taxType ||
    (sellerState && placeCode
      ? sellerState === placeCode
        ? 'CGST_SGST'
        : 'IGST'
      : null);

  return {
    companyId:
      companyId !== null &&
      companyId !== undefined &&
      Number.isInteger(Number(companyId))
        ? Number(companyId)
        : null,
    partyNameSnapshot: party?.name || partyName || null,
    partyGstinSnapshot: partyGstin,
    partyRegistrationTypeSnapshot: party
      ? inferPartyRegistrationType(party)
      : billType === 'B2C'
        ? 'UNREGISTERED'
        : null,
    placeOfSupplyStateCodeSnapshot: placeCode,
    placeOfSupplyNameSnapshot: placeCode ? STATE_NAMES[placeCode] || null : null,
    taxTypeSnapshot: ['CGST_SGST', 'IGST'].includes(taxTypeSnapshot)
      ? taxTypeSnapshot
      : null,
  };
}

function splitStoredTax(amount, rate, taxType) {
  const numericAmount = Number(amount || 0);
  if (Number.isFinite(numericAmount) && numericAmount === 0) {
    return { cgstAmount: 0, sgstAmount: 0, igstAmount: 0, cessAmount: 0 };
  }
  if (!['CGST_SGST', 'IGST'].includes(taxType)) {
    return { cgstAmount: null, sgstAmount: null, igstAmount: null, cessAmount: null };
  }
  const split = splitTax(numericAmount, rate, taxType);
  return {
    cgstAmount: split.cgstAmount,
    sgstAmount: split.sgstAmount,
    igstAmount: split.igstAmount,
    cessAmount: 0,
  };
}

function capturePurchaseGstSnapshot({
  companyId,
  companyStateCode,
  party,
  placeOfSupplyStateCode,
  partySnapshot,
}) {
  const snapshotParty = partySnapshot || party;
  const placeCode =
    stateCode(placeOfSupplyStateCode) || stateCode(companyStateCode);
  return {
    companyId:
      companyId !== null &&
      companyId !== undefined &&
      Number.isInteger(Number(companyId))
        ? Number(companyId)
        : null,
    partyNameSnapshot: snapshotParty?.name || null,
    partyGstinSnapshot: normalizeGstin(snapshotParty?.GST) || null,
    partyRegistrationTypeSnapshot: snapshotParty
      ? inferPartyRegistrationType(snapshotParty)
      : null,
    placeOfSupplyStateCodeSnapshot: placeCode,
    placeOfSupplyNameSnapshot: placeCode ? STATE_NAMES[placeCode] || null : null,
  };
}

module.exports = {
  STATE_NAMES,
  captureGstPartySnapshot,
  capturePurchaseGstSnapshot,
  splitStoredTax,
  stateCode,
};
