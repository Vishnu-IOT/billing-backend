'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
const queries = [];
const sequelizeStub = {
  query: async (sql, options) => {
    queries.push({ sql, replacements: options.replacements });
    if (sql.includes('FROM companies c')) {
      return [{ id: 5, legalName: 'Example Store', tradeName: 'Example Store', gstin: '33ABCDE1234F1Z5' }];
    }
    if (sql.includes('COUNT(DISTINCT id) AS invoiceCount')) {
      return [{ invoiceCount: 0, missingPartySnapshot: 0, missingPlaceOfSupply: 0 }];
    }
    return [];
  },
};

let controller;
Module._load = function loadWithDatabaseStub(request, parent, isMain) {
  const filename = String(parent?.filename || '').replace(/\\/g, '/');
  if (request === '../config/sqldb' && filename.includes('/billing-backend/')) {
    return sequelizeStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  controller = require('../mysql-controllers/gstTemplateReportsController');
} finally {
  Module._load = originalLoad;
}

function responseStub() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function preview(type) {
  queries.length = 0;
  const response = responseStub();
  await controller.previewGstTemplateReport({
    params: { type },
    query: {},
    loyaltyUser: { companyId: 5 },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  return queries;
}

test('GST template reports use product HSN as a fallback and keep sales in B2C sheets', async () => {
  const salesQueries = await preview('gstr1');
  const saleLines = salesQueries.find(({ sql }) => sql.includes('gst_sales_lines')).sql;
  const saleReturns = salesQueries.find(({ sql }) => sql.includes('FROM sales_returns sr')).sql;
  const salesDocumentsQuery = salesQueries.find(({ sql }) => sql.includes('SELECT invoiceNumber, paymentStatus FROM `sales`'));
  const salesDocuments = salesDocumentsQuery.sql;
  const quality = salesQueries.find(({ sql }) => sql.includes('COUNT(DISTINCT id) AS invoiceCount')).sql;

  assert.match(saleLines, /COALESCE\(NULLIF\(TRIM\(si\.hsncode\), ''\), NULLIF\(TRIM\(pr\.HSNCode\), ''\)\) AS hsncode/);
  assert.match(saleLines, /LEFT JOIN products pr ON pr\.id = si\.productId/);
  assert.match(saleLines, /AND s\.bill_type = 'B2C'/);
  assert.match(saleReturns, /s\.bill_type = 'B2C'/);
  assert.match(salesDocuments, /bill_type = :p\d+/);
  assert.ok(Object.values(salesDocumentsQuery.replacements).includes('B2C'));
  assert.match(quality, /bill_type = 'B2C'/);

  const purchaseQueries = await preview('gstr2');
  const purchaseLines = purchaseQueries.find(({ sql }) => sql.includes('FROM purchases pu')).sql;
  assert.match(purchaseLines, /COALESCE\(NULLIF\(TRIM\(pi\.hsncode\), ''\), NULLIF\(TRIM\(pr\.HSNCode\), ''\)\) AS hsncode/);
  assert.match(purchaseLines, /LEFT JOIN products pr ON pr\.id = pi\.productId/);
});
