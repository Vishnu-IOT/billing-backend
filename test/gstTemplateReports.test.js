'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  buildGstTemplateReport,
  mapPurchases,
  mapSales,
  REPORTS,
} = require('../utils/gstTemplateReports');

const registeredCustomer = {
  documentId: 12,
  invoiceNumber: 'INV/2026/0012',
  invoiceDate: new Date('2026-07-10T00:00:00Z'),
  billType: 'B2B',
  totalAmount: 118,
  partyNameSnapshot: 'Retail Customer',
  partyGstinSnapshot: '33ABCDE1234F1Z5',
  partyRegistrationTypeSnapshot: 'REGISTERED',
  taxTypeSnapshot: 'CGST_SGST',
  placeOfSupplyStateCodeSnapshot: '33',
  placeOfSupplyNameSnapshot: 'Tamil Nadu',
  reverseCharge: false,
  productName: 'Sample Item',
  hsncode: '123456',
  quantityUnit: 'PCS',
  totalQuantity: 1,
  taxRate: 18,
  taxableValue: 100,
  taxAmount: 18,
  cgstAmount: 9,
  sgstAmount: 9,
  igstAmount: 0,
  cessAmount: 0,
  lineValue: 118,
};

const registeredSupplier = {
  ...registeredCustomer,
  documentId: 26,
  invoiceNumber: 'PUR/2026/0026',
  invoiceType: 'GST_INVOICE',
  taxType: 'CGST_SGST',
  itcEligible: true,
};

test('maps sales into B2B/B2C and HSN totals without double-counting invoice values', () => {
  const b2c = {
    ...registeredCustomer,
    documentId: 13,
    invoiceNumber: 'INV/2026/0013',
    billType: 'B2C',
    totalAmount: 59,
    partyRegistrationTypeSnapshot: 'UNREGISTERED',
    partyGstinSnapshot: null,
    taxableValue: 50,
    taxAmount: 9,
    cgstAmount: 4.5,
    sgstAmount: 4.5,
    lineValue: 59,
  };
  const mapped = mapSales([registeredCustomer, b2c], []);

  assert.equal(mapped.b2b.length, 1);
  assert.equal(mapped.b2c.length, 1);
  assert.equal(mapped.summary.invoiceCount, 2);
  assert.equal(mapped.summary.invoiceValue, 177);
  assert.equal(mapped.summary.taxableValue, 150);
  assert.equal(mapped.hsn.length, 1);
  assert.equal(mapped.hsn[0].quantity, 2);
});

test('keeps B2C invoices in the B2C sections even when their party snapshot is registered', () => {
  const b2c = {
    ...registeredCustomer,
    billType: 'B2C',
    partyRegistrationTypeSnapshot: 'REGISTERED',
    hsncode: '0902',
  };
  const mapped = mapSales([b2c], []);

  assert.equal(mapped.b2b.length, 0);
  assert.equal(mapped.b2c.length, 1);
  assert.equal(mapped.hsnB2b.length, 0);
  assert.equal(mapped.hsnB2c[0].hsn, '0902');
});

test('places B2C return credits in the unregistered credit-note sheet', async () => {
  const generated = await buildGstTemplateReport({
    reportType: 'gstr1',
    returns: [{
      returnId: 31,
      returnCreditId: 8,
      returnCreditCode: 'RET-0008',
      returnDate: new Date('2026-07-12T00:00:00Z'),
      billType: 'B2C',
      partyRegistrationTypeSnapshot: 'REGISTERED',
      partyGstinSnapshot: '33ABCDE1234F1Z5',
      partyNameSnapshot: 'Retail Customer',
      saleItemQuantity: 1,
      quantity: 1,
      returnedAmount: 118,
      saleItemTaxAmount: 18,
      saleItemCgstAmount: 9,
      saleItemSgstAmount: 9,
      saleItemIgstAmount: 0,
      taxRate: 18,
      placeOfSupplyNameSnapshot: 'Tamil Nadu',
      reverseCharge: false,
    }],
  });

  assert.equal(generated.sheets.find((sheet) => sheet.name === 'cdnr').rowCount, 0);
  assert.equal(generated.sheets.find((sheet) => sheet.name === 'cdnur').rowCount, 1);
});

test('does not claim purchase tax as ITC unless the saved invoice is eligible', () => {
  const eligible = mapPurchases([registeredSupplier]);
  const ineligible = mapPurchases([{
    ...registeredSupplier,
    documentId: 27,
    invoiceType: 'BILL_OF_SUPPLY',
    itcEligible: false,
  }]);

  assert.equal(eligible.summary.eligibleItc, 18);
  assert.equal(eligible.summary.ineligibleItc, 0);
  assert.equal(ineligible.summary.eligibleItc, 0);
  assert.equal(ineligible.summary.ineligibleItc, 18);
});

test('generated workbooks retain template sheet names, headings, and row positions', async () => {
  for (const [reportType, rows, expectedDataSheet, expectedCell] of [
    ['gstr1', { sales: [registeredCustomer] }, 'b2b,sez,de', 'A5'],
    ['gstr2', { purchases: [registeredSupplier] }, 'b2b', 'A5'],
  ]) {
    const generated = await buildGstTemplateReport({
      reportType,
      ...rows,
      docs: [{ from: 'INV/2026/0012', to: 'INV/2026/0012', total: 1, cancelled: 0 }],
      company: { gstin: '33ABCDE1234F1Z5', legalName: 'Example Company' },
      periodLabel: 'FY 2026-27',
    });
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(Buffer.from(generated.buffer));
    const expectedNames = Object.keys(REPORTS[reportType].headers);

    assert.deepEqual(reopened.worksheets.map((sheet) => sheet.name), expectedNames);
    assert.equal(reopened.getWorksheet(expectedDataSheet).getCell(expectedCell).value, '33ABCDE1234F1Z5');
    assert.equal(generated.sheets.length, expectedNames.length);
    assert.equal(generated.sheets[0].transactionStartRow, 10);
    assert.ok(generated.sheets.every((sheet) => sheet.columns.some((column) => column.heading)));

    const template = new ExcelJS.Workbook();
    await template.xlsx.readFile(REPORTS[reportType].file);
    for (const [sheetName, headerRowNumber] of Object.entries(REPORTS[reportType].headers)) {
      const before = template.getWorksheet(sheetName).getRow(headerRowNumber);
      const after = reopened.getWorksheet(sheetName).getRow(headerRowNumber);
      assert.equal(after.cellCount, before.cellCount, `${sheetName} column count`);
      for (let column = 1; column <= before.cellCount; column += 1) {
        assert.equal(
          after.getCell(column).value,
          before.getCell(column).value,
          `${sheetName} heading column ${column}`
        );
      }
    }
  }
});
