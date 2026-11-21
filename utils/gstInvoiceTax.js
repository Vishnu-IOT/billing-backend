'use strict';

const INVOICE_TYPES = ['GST_INVOICE', 'BILL_OF_SUPPLY', 'NON_GST_INVOICE'];
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GST_STATE_CODES = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '32', '33', '34', '35', '36', '37', '38', '97',
]);

const normalizeGstin = (value) => String(value || '').trim().toUpperCase();

const inferPartyRegistrationType = (party) => {
  if (party?.gstRegistrationType === 'REGISTERED' ||
      party?.gstRegistrationType === 'UNREGISTERED') {
    return party.gstRegistrationType;
  }
  return GSTIN_PATTERN.test(normalizeGstin(party?.GST))
    ? 'REGISTERED'
    : 'UNREGISTERED';
};

const validatePartyRegistration = ({ gstRegistrationType, GST }) => {
  const registrationType = gstRegistrationType || (
    GSTIN_PATTERN.test(normalizeGstin(GST)) ? 'REGISTERED' : 'UNREGISTERED'
  );
  const gstin = normalizeGstin(GST);

  if (!['REGISTERED', 'UNREGISTERED'].includes(registrationType)) {
    throw new Error('GST registration type must be REGISTERED or UNREGISTERED');
  }
  if (registrationType === 'REGISTERED' && !GSTIN_PATTERN.test(gstin)) {
    throw new Error('A valid 15-character GSTIN is required for a registered party');
  }
  return {
    gstRegistrationType: registrationType,
    GST: registrationType === 'REGISTERED' ? gstin : null,
  };
};

const validatePurchaseInvoiceType = (party, invoiceType) => {
  if (!INVOICE_TYPES.includes(invoiceType)) {
    throw new Error(`invoiceType must be one of ${INVOICE_TYPES.join(', ')}`);
  }
  const registrationType = inferPartyRegistrationType(party);
  const valid =
    (registrationType === 'REGISTERED' &&
      ['GST_INVOICE', 'BILL_OF_SUPPLY'].includes(invoiceType)) ||
    (registrationType === 'UNREGISTERED' && invoiceType === 'NON_GST_INVOICE');
  if (!valid) {
    throw new Error(
      `${registrationType === 'REGISTERED' ? 'Registered' : 'Unregistered'} suppliers cannot be used with ${invoiceType.replace(/_/g, ' ')}`,
    );
  }
  return registrationType;
};

const stateCodeFromGstin = (value) => {
  const gstin = normalizeGstin(value);
  const code = gstin.slice(0, 2);
  return GSTIN_PATTERN.test(gstin) && GST_STATE_CODES.has(code) ? code : null;
};

const resolvePurchaseTaxType = ({
  partyGstin,
  companyGstin,
  companyStateCode,
  override,
  placeOfSupplyStateCode,
}) => {
  if (override && !['CGST_SGST', 'IGST'].includes(override)) {
    throw new Error('taxTypeOverride must be CGST_SGST or IGST');
  }
  if (override) return override;

  const sellerState = stateCodeFromGstin(partyGstin);
  const rawCompanyStateCode = String(companyStateCode || '').trim();
  const buyerState =
    (GST_STATE_CODES.has(String(placeOfSupplyStateCode || '').trim().padStart(2, '0'))
      ? String(placeOfSupplyStateCode).trim().padStart(2, '0')
      : null) ||
    stateCodeFromGstin(companyGstin) ||
    (/^\d{1,2}$/.test(rawCompanyStateCode)
      ? GST_STATE_CODES.has(rawCompanyStateCode.padStart(2, '0'))
        ? rawCompanyStateCode.padStart(2, '0')
        : null
      : null);
  if (!sellerState || !buyerState) {
    throw new Error(
      'Set the company GSTIN/state or explicitly select CGST + SGST or IGST',
    );
  }
  return sellerState === buyerState ? 'CGST_SGST' : 'IGST';
};

const splitTax = (amount, rate, taxType) => {
  const totalAmount = Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;
  const totalRate = Number(rate || 0);
  if (taxType === 'IGST') {
    return {
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: totalRate,
      igstAmount: totalAmount,
    };
  }
  const cgstAmount = Math.round((totalAmount / 2 + Number.EPSILON) * 100) / 100;
  return {
    cgstRate: totalRate / 2,
    cgstAmount,
    sgstRate: totalRate / 2,
    sgstAmount: Math.round((totalAmount - cgstAmount + Number.EPSILON) * 100) / 100,
    igstRate: 0,
    igstAmount: 0,
  };
};

module.exports = {
  GSTIN_PATTERN,
  INVOICE_TYPES,
  inferPartyRegistrationType,
  normalizeGstin,
  stateCodeFromGstin,
  resolvePurchaseTaxType,
  splitTax,
  validatePartyRegistration,
  validatePurchaseInvoiceType,
};
