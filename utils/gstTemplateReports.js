'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');
const { STATE_NAMES } = require('./gstReportSnapshots');

const REPORTS = {
  gstr1: {
    file: path.join(__dirname, '..', 'templates', 'gst', 'gstr1-template.xlsx'),
    headers: {
      'GSTR1 Report': 9,
      'b2b,sez,de': 4,
      b2cl: 4,
      b2cs: 4,
      cdnr: 4,
      cdnur: 4,
      exp: 4,
      at: 4,
      atadj: 4,
      exemp: 4,
      'hsn(b2b)': 4,
      'hsn(b2c)': 4,
      itemSummary: 4,
      docs: 4,
    },
  },
  gstr2: {
    file: path.join(__dirname, '..', 'templates', 'gst', 'gstr2-template.xlsx'),
    headers: {
      'GSTR2 Report': 9,
      b2b: 4,
      b2bur: 4,
      imps: 4,
      impg: 4,
      cdnr: 4,
      cdnur: 4,
      at: 4,
      atadj: 4,
      exemp: 4,
      itcr: 4,
      hsnsum: 4,
      itemSummary: 4,
    },
  },
};

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const sum = (rows, key) => rows.reduce((total, row) => total + number(row[key]), 0);
const sumValues = (values) => values.reduce((total, value) => total + number(value), 0);
const excelDate = (value) => value ? new Date(value) : null;
const amount = (value) => value === null ? null : Number(value);
const invoiceTypeLabel = (type) => ({
  GST_INVOICE: 'Regular',
  BILL_OF_SUPPLY: 'Bill of Supply',
  NON_GST_INVOICE: 'Non-GST',
}[type] || '');
const purchaseSupplyType = (taxType) => (
  taxType === 'IGST' ? 'Inter-State' : taxType === 'CGST_SGST' ? 'Intra-State' : ''
);
const uqc = (unit) => (unit === 'KG' ? 'KGS' : unit === 'PCS' ? 'PCS' : '');

function sumKnown(rows, key, totalTax) {
  if (rows.every((row) => row[key] === null || row[key] === undefined)) {
    return number(totalTax) === 0 ? 0 : null;
  }
  if (rows.some((row) => row[key] === null || row[key] === undefined)) return null;
  return sum(rows, key);
}

function groupBy(rows, keyOf) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.values()];
}

const isRegisteredB2bSale = (row) =>
  row.billType === 'B2B' &&
  row.partyRegistrationTypeSnapshot === 'REGISTERED';

function invoiceRateGroups(rows) {
  return groupBy(rows, (row) => `${row.documentId}:${number(row.taxRate)}`);
}

function lineValues(lines) {
  const taxAmount = sum(lines, 'taxAmount');
  return {
    taxRate: number(lines[0].taxRate),
    quantity: sum(lines, 'totalQuantity'),
    taxableValue: sum(lines, 'taxableValue'),
    taxAmount,
    invoiceLinesValue: sum(lines, 'lineValue'),
    cgstAmount: sumKnown(lines, 'cgstAmount', taxAmount),
    sgstAmount: sumKnown(lines, 'sgstAmount', taxAmount),
    igstAmount: sumKnown(lines, 'igstAmount', taxAmount),
    cessAmount: sumKnown(lines, 'cessAmount', 0),
  };
}

function mapSales(sales, returns) {
  const details = invoiceRateGroups(sales).map((lines) => {
    const first = lines[0];
    return {
      ...first,
      ...lineValues(lines),
      invoiceValue: number(first.totalAmount),
      placeOfSupply:
        first.placeOfSupplyNameSnapshot ||
        (first.placeOfSupplyStateCodeSnapshot
          ? STATE_NAMES[first.placeOfSupplyStateCodeSnapshot] || ''
          : ''),
      gstin: first.partyGstinSnapshot || '',
    };
  });
  const b2b = details.filter((row) =>
    row.billType === 'B2B' &&
    row.partyRegistrationTypeSnapshot === 'REGISTERED' &&
    row.gstin
  );
  const b2c = details.filter((row) => row.billType === 'B2C');
  const b2cl = b2c.filter((row) =>
    row.taxTypeSnapshot === 'IGST' && row.invoiceValue > 100000
  );
  const b2cs = b2c.filter((row) => !b2cl.includes(row));
  const b2csRows = groupBy(
    b2cs,
    (row) => `${row.placeOfSupplyStateCodeSnapshot || ''}:${row.taxRate}`
  ).map((group) => [
    'OE',
    group[0].placeOfSupply,
    null,
    group[0].taxRate,
    sum(group, 'taxableValue'),
    sumKnown(group, 'cessAmount', 0),
    null,
  ]);
  const returnedRows = returns.map((row) => {
    const fraction = number(row.saleItemQuantity) > 0
      ? number(row.quantity) / number(row.saleItemQuantity)
      : 0;
    const taxAmount = number(row.saleItemTaxAmount) * fraction;
    return {
      ...row,
      returnTaxableValue: number(row.returnedAmount) - taxAmount,
      returnTaxAmount: taxAmount,
      returnCgstAmount: row.saleItemCgstAmount === null
        ? null
        : number(row.saleItemCgstAmount) * fraction,
      returnSgstAmount: row.saleItemSgstAmount === null
        ? null
        : number(row.saleItemSgstAmount) * fraction,
      returnIgstAmount: row.saleItemIgstAmount === null
        ? null
        : number(row.saleItemIgstAmount) * fraction,
    };
  });
  const hsn = aggregateHsn(sales);

  return {
    details,
    b2b,
    b2c,
    b2cl,
    b2cs: b2csRows,
    returns: returnedRows,
    hsnB2b: aggregateHsn(sales.filter((row) =>
      row.billType === 'B2B' &&
      row.partyRegistrationTypeSnapshot === 'REGISTERED'
    )),
    hsnB2c: aggregateHsn(sales.filter((row) => row.billType === 'B2C')),
    hsn,
    summary: {
      invoiceCount: new Set(sales.map((row) => row.documentId)).size,
      taxableValue: sum(sales, 'taxableValue'),
      taxAmount: sum(sales, 'taxAmount'),
      invoiceValue: sumValues([...new Map(sales.map((row) => [
        row.documentId,
        number(row.totalAmount),
      ])).values()]),
      b2bInvoiceCount: new Set(b2b.map((row) => row.documentId)).size,
      b2cInvoiceCount: new Set(b2c.map((row) => row.documentId)).size,
      returns: sum(returns, 'returnedAmount'),
    },
  };
}

function mapPurchases(purchases) {
  const details = invoiceRateGroups(purchases).map((lines) => {
    const first = lines[0];
    return {
      ...first,
      ...lineValues(lines),
      invoiceValue: number(first.totalAmount),
      placeOfSupply:
        first.placeOfSupplyNameSnapshot ||
        (first.placeOfSupplyStateCodeSnapshot
          ? STATE_NAMES[first.placeOfSupplyStateCodeSnapshot] || ''
          : ''),
      gstin: first.partyGstinSnapshot || '',
      itcEligible:
        first.invoiceType === 'GST_INVOICE' &&
        Boolean(first.itcEligible) &&
        !Boolean(first.reverseCharge),
    };
  });
  const hsn = aggregateHsn(purchases);
  const nonGstPurchases = purchases.filter((row) =>
    row.invoiceType === 'NON_GST_INVOICE'
  );

  return {
    details,
    b2b: details.filter((row) =>
      row.invoiceType === 'GST_INVOICE' &&
      row.partyRegistrationTypeSnapshot === 'REGISTERED' &&
      row.gstin
    ),
    b2bur: details.filter((row) =>
      row.partyRegistrationTypeSnapshot === 'UNREGISTERED' ||
      row.invoiceType === 'NON_GST_INVOICE'
    ),
    hsn,
    summary: {
      billCount: new Set(purchases.map((row) => row.documentId)).size,
      taxableValue: sum(purchases, 'taxableValue'),
      taxAmount: sum(purchases, 'taxAmount'),
      invoiceValue: sumValues([...new Map(purchases.map((row) => [
        row.documentId,
        number(row.totalAmount),
      ])).values()]),
      eligibleItc: sum(details.filter((row) => row.itcEligible), 'taxAmount'),
      ineligibleItc: sum(details.filter((row) => !row.itcEligible), 'taxAmount'),
      nonGstValue: sum(nonGstPurchases, 'lineValue'),
    },
  };
}

function aggregateHsn(rows) {
  return groupBy(rows, (row) =>
    `${row.hsncode || ''}:${row.productName || ''}:${number(row.taxRate)}:${row.quantityUnit || ''}`
  ).map((group) => {
    const values = lineValues(group);
    return {
      hsn: group[0].hsncode || '',
      description: group[0].productName || '',
      unit: uqc(group[0].quantityUnit),
      ...values,
      totalValue: values.taxableValue + values.taxAmount,
    };
  });
}

function salesRows(data, docs) {
  const main = data.details.map((row) => [
    row.gstin,
    row.partyNameSnapshot || '',
    'Sale',
    row.invoiceNumber,
    excelDate(row.invoiceDate),
    row.invoiceValue,
    row.taxRate,
    null,
    row.taxableValue,
    row.reverseCharge === null ? null : row.reverseCharge ? 'Y' : 'N',
    amount(row.igstAmount),
    amount(row.cgstAmount),
    amount(row.sgstAmount),
    amount(row.cessAmount),
    row.placeOfSupply,
  ]);
  const b2b = data.b2b.map((row) => [
    row.gstin,
    row.partyNameSnapshot || '',
    row.invoiceNumber,
    excelDate(row.invoiceDate),
    row.invoiceValue,
    row.placeOfSupply,
    row.reverseCharge === null ? null : row.reverseCharge ? 'Y' : 'N',
    null,
    'Regular',
    null,
    row.taxRate,
    row.taxableValue,
    row.cessAmount,
  ]);
  const b2cl = data.b2cl.map((row) => [
    row.invoiceNumber,
    excelDate(row.invoiceDate),
    row.invoiceValue,
    row.placeOfSupply,
    null,
    row.taxRate,
    row.taxableValue,
    row.cessAmount,
    null,
  ]);
  const cdnr = groupBy(
    data.returns.filter(isRegisteredB2bSale),
    (row) => `${row.returnCreditId || row.returnId}:${row.taxRate}`
  ).map((group) => {
    const row = group[0];
    return [
      row.partyGstinSnapshot || '',
      row.partyNameSnapshot || '',
      row.returnCreditCode || '',
      excelDate(row.returnDate),
      'C',
      row.placeOfSupplyNameSnapshot || '',
      row.reverseCharge === null ? null : row.reverseCharge ? 'Y' : 'N',
      'Regular',
      sum(group, 'returnedAmount'),
      null,
      number(row.taxRate),
      sum(group, 'returnTaxableValue'),
      null,
    ];
  });
  const cdnur = groupBy(
    data.returns.filter((row) => !isRegisteredB2bSale(row)),
    (row) => `${row.returnCreditId || row.returnId}:${row.taxRate}`
  ).map((group) => {
    const row = group[0];
    return [
      row.billType === 'B2C' ? 'B2C' : 'B2CL',
      row.returnCreditCode || '',
      excelDate(row.returnDate),
      'C',
      row.placeOfSupplyNameSnapshot || '',
      sum(group, 'returnedAmount'),
      null,
      number(row.taxRate),
      sum(group, 'returnTaxableValue'),
      null,
    ];
  });
  const hsnRows = (items) => items.map((row) => [
    row.hsn,
    row.description,
    row.unit,
    row.quantity,
    row.totalValue,
    row.taxRate,
    row.taxableValue,
    row.igstAmount,
    row.cgstAmount,
    row.sgstAmount,
    row.cessAmount,
  ]);
  const docRows = docs.length ? [[
    'Invoices',
    docs[0].from,
    docs[0].to,
    docs[0].total,
    docs[0].cancelled,
  ]] : [];

  return {
    'GSTR1 Report': main,
    'b2b,sez,de': b2b,
    b2cl,
    b2cs: data.b2cs,
    cdnr,
    cdnur,
    exp: [],
    at: [],
    atadj: [],
    exemp: [],
    'hsn(b2b)': hsnRows(data.hsnB2b),
    'hsn(b2c)': hsnRows(data.hsnB2c),
    itemSummary: hsnRows(data.hsn),
    docs: docRows,
  };
}

function purchaseRows(data) {
  const main = data.details.map((row) => [
    row.gstin,
    row.partyNameSnapshot || '',
    'Purchase',
    row.invoiceNumber,
    excelDate(row.invoiceDate),
    row.invoiceValue,
    row.taxRate,
    null,
    row.taxableValue,
    amount(row.igstAmount),
    amount(row.cgstAmount),
    amount(row.sgstAmount),
    amount(row.cessAmount),
    row.placeOfSupply,
  ]);
  const purchaseItc = (row) => row.itcEligible;
  const b2b = data.b2b.map((row) => [
    row.gstin,
    row.invoiceNumber,
    excelDate(row.invoiceDate),
    row.invoiceValue,
    row.placeOfSupply,
    row.reverseCharge ? 'Y' : 'N',
    invoiceTypeLabel(row.invoiceType),
    row.taxRate,
    row.taxableValue,
    row.igstAmount,
    row.cgstAmount,
    row.sgstAmount,
    row.cessAmount,
    purchaseItc(row) ? 'Inputs' : 'Ineligible',
    purchaseItc(row) ? row.igstAmount : 0,
    purchaseItc(row) ? row.cgstAmount : 0,
    purchaseItc(row) ? row.sgstAmount : 0,
    purchaseItc(row) ? row.cessAmount : 0,
  ]);
  const b2bur = data.b2bur.map((row) => [
    row.partyNameSnapshot || '',
    row.invoiceNumber,
    excelDate(row.invoiceDate),
    row.invoiceValue,
    row.placeOfSupply,
    purchaseSupplyType(row.taxType),
    row.taxRate,
    row.taxableValue,
    row.igstAmount,
    row.cgstAmount,
    row.sgstAmount,
    row.cessAmount,
    'Ineligible',
    0,
    0,
    0,
    0,
  ]);
  const hsnRows = data.hsn.map((row) => [
    row.hsn,
    row.description,
    row.unit,
    row.quantity,
    row.totalValue,
    row.taxableValue,
    row.igstAmount,
    row.cgstAmount,
    row.sgstAmount,
    row.cessAmount,
  ]);

  return {
    'GSTR2 Report': main,
    b2b,
    b2bur,
    imps: [],
    impg: [],
    cdnr: [],
    cdnur: [],
    at: [],
    atadj: [],
    exemp: [],
    itcr: [],
    hsnsum: hsnRows,
    itemSummary: hsnRows,
  };
}

function clearValue(cell) {
  cell.value = null;
}

function cloneRowStyle(source, target, maxColumn) {
  if (!source || !target) return;
  if (source.height) target.height = source.height;
  for (let column = 1; column <= maxColumn; column += 1) {
    const sourceCell = source.getCell(column);
    const targetCell = target.getCell(column);
    if (sourceCell.hasStyle) targetCell.style = { ...sourceCell.style };
  }
}

function populateWorksheet(worksheet, headerRowNumber, rows) {
  const header = worksheet.getRow(headerRowNumber);
  const maxColumn = Math.max(worksheet.columnCount, header.cellCount);
  const firstDataRow = headerRowNumber + 1;
  const existingEnd = Math.max(worksheet.rowCount, firstDataRow);
  for (let rowNumber = firstDataRow; rowNumber <= existingEnd; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= Math.max(row.cellCount, maxColumn); column += 1) {
      clearValue(row.getCell(column));
    }
  }

  const styleSource = worksheet.getRow(firstDataRow);
  rows.forEach((values, index) => {
    const rowNumber = firstDataRow + index;
    const row = worksheet.getRow(rowNumber);
    if (rowNumber > existingEnd) cloneRowStyle(styleSource, row, maxColumn);
    values.forEach((value, valueIndex) => {
      row.getCell(valueIndex + 1).value = value;
    });
  });
}

function setLabeledValue(worksheet, label, value) {
  worksheet.eachRow((row) => {
    row.eachCell((cell, column) => {
      if (typeof cell.value === 'string' && cell.value.trim() === label) {
        row.getCell(column + 1).value = value ?? null;
      }
    });
  });
}

function writeCompanyMetadata(worksheet, company, periodLabel) {
  setLabeledValue(worksheet, 'Period', periodLabel);
  setLabeledValue(worksheet, '1. GSTIN', company.gstin);
  setLabeledValue(worksheet, '2.a Legal name of the registered person.', company.legalName);
  setLabeledValue(worksheet, '2.b Trade name, if any', company.tradeName);
}

function clearSampleSummaryValues(worksheet, headerRowNumber) {
  for (let rowNumber = 1; rowNumber < headerRowNumber; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.eachCell((cell) => {
      if (typeof cell.value === 'number' || cell.value instanceof Date) {
        cell.value = null;
      }
    });
  }
}

function fillHeaderSummaries(worksheet, reportType, result, rows) {
  const set = (cell, value) => {
    worksheet.getCell(cell).value = value ?? null;
  };
  const sumColumn = (sheet, columnIndex) =>
    sumValues((rows[sheet] || []).map((row) => row[columnIndex]));
  const uniqueInvoiceValue = (items) =>
    sumValues([...new Map(items.map((row) => [
      row.documentId,
      number(row.totalAmount),
    ])).values()]);

  if (reportType === 'gstr1') {
    switch (worksheet.name) {
      case 'b2b,sez,de': {
        const detail = rows['b2b,sez,de'] || [];
        set('A3', new Set(detail.map((row) => row[0])).size);
        set('C3', result.b2bInvoiceCount);
        set('E3', uniqueInvoiceValue(result.details.filter((row) =>
          row.billType === 'B2B' &&
          row.partyRegistrationTypeSnapshot === 'REGISTERED' &&
          row.gstin
        )));
        set('L3', sumColumn(worksheet.name, 11));
        set('M3', sumColumn(worksheet.name, 12));
        break;
      }
      case 'b2cl': {
        const detail = result.details.filter((row) => result.b2cl.includes(row));
        set('A3', new Set(detail.map((row) => row.documentId)).size);
        set('C3', uniqueInvoiceValue(detail));
        set('G3', sumColumn(worksheet.name, 6));
        set('H3', sumColumn(worksheet.name, 7));
        break;
      }
      case 'b2cs':
        set('E3', sumColumn(worksheet.name, 4));
        set('F3', sumColumn(worksheet.name, 5));
        break;
      case 'cdnr':
        set('A3', new Set(result.returns
          .filter(isRegisteredB2bSale)
          .map((row) => row.partyGstinSnapshot)).size);
        set('C3', (rows.cdnr || []).length);
        set('I3', sumColumn(worksheet.name, 8));
        set('L3', sumColumn(worksheet.name, 11));
        set('M3', sumColumn(worksheet.name, 12));
        break;
      case 'cdnur':
        set('B3', (rows.cdnur || []).length);
        set('F3', sumColumn(worksheet.name, 5));
        set('I3', sumColumn(worksheet.name, 8));
        set('J3', sumColumn(worksheet.name, 9));
        break;
      case 'exp':
        set('B3', 0);
        set('D3', 0);
        set('F3', 0);
        set('I3', 0);
        break;
      case 'at':
        set('D3', 0);
        set('E3', 0);
        break;
      case 'atadj':
        set('D3', 0);
        set('E3', 0);
        break;
      case 'hsn(b2b)':
      case 'hsn(b2c)':
      case 'itemSummary': {
        const rowKey = worksheet.name === 'hsn(b2b)'
          ? 'hsn(b2b)'
          : worksheet.name === 'hsn(b2c)'
            ? 'hsn(b2c)'
            : 'itemSummary';
        const detail = rows[rowKey] || [];
        set('A3', detail.length);
        set('E3', sumColumn(rowKey, 4));
        set('G3', sumColumn(rowKey, 6));
        set('H3', sumColumn(rowKey, 7));
        set('I3', sumColumn(rowKey, 8));
        set('J3', sumColumn(rowKey, 9));
        set('K3', sumColumn(rowKey, 10));
        break;
      }
      case 'docs':
        set('D3', result.documentTotal);
        set('E3', result.cancelledDocumentTotal);
        break;
      default:
        break;
    }
    return;
  }

  switch (worksheet.name) {
    case 'b2b': {
      const detail = result.b2b;
      set('A3', new Set(detail.map((row) => row.gstin)).size);
      set('B3', new Set(detail.map((row) => row.documentId)).size);
      set('D3', uniqueInvoiceValue(detail));
      set('I3', sum(detail, 'taxableValue'));
      set('J3', sumKnown(detail, 'igstAmount', sum(detail, 'taxAmount')));
      set('K3', sumKnown(detail, 'cgstAmount', sum(detail, 'taxAmount')));
      set('L3', sumKnown(detail, 'sgstAmount', sum(detail, 'taxAmount')));
      set('M3', sumKnown(detail, 'cessAmount', 0));
      set('O3', sum(detail.filter((row) => row.itcEligible), 'igstAmount'));
      set('P3', sum(detail.filter((row) => row.itcEligible), 'cgstAmount'));
      set('Q3', sum(detail.filter((row) => row.itcEligible), 'sgstAmount'));
      set('R3', sum(detail.filter((row) => row.itcEligible), 'cessAmount'));
      break;
    }
    case 'b2bur': {
      const detail = result.b2bur;
      set('B3', new Set(detail.map((row) => row.documentId)).size);
      set('D3', uniqueInvoiceValue(detail));
      set('H3', sum(detail, 'taxableValue'));
      set('I3', sumKnown(detail, 'igstAmount', sum(detail, 'taxAmount')));
      set('J3', sumKnown(detail, 'cgstAmount', sum(detail, 'taxAmount')));
      set('K3', sumKnown(detail, 'sgstAmount', sum(detail, 'taxAmount')));
      set('L3', sumKnown(detail, 'cessAmount', 0));
      set('N3', 0);
      set('O3', 0);
      set('P3', 0);
      set('Q3', 0);
      break;
    }
    case 'imps':
      ['A3', 'C3', 'F3', 'G3', 'H3', 'J3', 'K3'].forEach((cell) => set(cell, 0));
      break;
    case 'impg':
      ['B3', 'D3', 'H3', 'I3', 'J3', 'L3', 'M3'].forEach((cell) => set(cell, 0));
      break;
    case 'cdnr':
      ['A3', 'B3', 'D3', 'J3', 'L3', 'M3', 'N3', 'O3', 'P3', 'R3', 'S3', 'T3', 'U3']
        .forEach((cell) => set(cell, 0));
      break;
    case 'cdnur':
      ['A3', 'C3', 'J3', 'L3', 'M3', 'N3', 'O3', 'P3', 'R3', 'S3', 'T3', 'U3']
        .forEach((cell) => set(cell, 0));
      break;
    case 'at':
      set('C3', 0);
      set('D3', 0);
      break;
    case 'atadj':
      set('C3', 0);
      set('D3', 0);
      break;
    case 'hsnsum':
    case 'itemSummary': {
      const key = worksheet.name;
      const detail = rows[key] || [];
      set('A3', detail.length);
      set('E3', sumColumn(key, 4));
      set('F3', sumColumn(key, 5));
      set('G3', sumColumn(key, 6));
      set('H3', sumColumn(key, 7));
      set('I3', sumColumn(key, 8));
      set('J3', sumColumn(key, 9));
      break;
    }
    default:
      break;
  }
}

async function buildGstTemplateReport({
  reportType,
  sales = [],
  purchases = [],
  returns = [],
  docs = [],
  company = {},
  periodLabel = '',
}) {
  const config = REPORTS[reportType];
  if (!config) throw new Error('Unsupported GST report type');

  const reportData = reportType === 'gstr1'
    ? mapSales(sales, returns)
    : mapPurchases(purchases);
  if (reportType === 'gstr1') {
    reportData.summary.documentTotal = sum(docs, 'total');
    reportData.summary.cancelledDocumentTotal = sum(docs, 'cancelled');
  }
  const outputRows = reportType === 'gstr1'
    ? salesRows(reportData, docs)
    : purchaseRows(reportData);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.file);

  for (const [sheetName, headerRowNumber] of Object.entries(config.headers)) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) throw new Error(`Missing template worksheet: ${sheetName}`);
    clearSampleSummaryValues(worksheet, headerRowNumber);
    populateWorksheet(worksheet, headerRowNumber, outputRows[sheetName] || []);
    fillHeaderSummaries(worksheet, reportType, reportData, outputRows);
    if (sheetName === `${reportType === 'gstr1' ? 'GSTR1' : 'GSTR2'} Report`) {
      writeCompanyMetadata(worksheet, company, periodLabel);
    }
  }

  const sheets = Object.entries(config.headers).map(([name, headerRowNumber]) => {
    const worksheet = workbook.getWorksheet(name);
    const header = worksheet.getRow(headerRowNumber);
    const columns = [];
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const heading = header.getCell(column).value;
      columns.push({
        letter: worksheet.getColumn(column).letter,
        heading: typeof heading === 'string' ? heading : '',
      });
    }
    const rows = outputRows[name] || [];
    return {
      name,
      headerRow: headerRowNumber,
      transactionStartRow: headerRowNumber + 1,
      columns,
      rowCount: rows.length,
      previewRows: rows.slice(0, 25),
    };
  });

  return {
    workbook,
    sheets,
    summary: reportData.summary,
    buffer: await workbook.xlsx.writeBuffer(),
  };
}

module.exports = {
  REPORTS,
  aggregateHsn,
  buildGstTemplateReport,
  mapPurchases,
  mapSales,
  populateWorksheet,
};
