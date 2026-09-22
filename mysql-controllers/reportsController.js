const sequelize = require('../config/sqldb');
const { QueryTypes } = require('sequelize');

// All reports accept optional ?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD query
// params to scope the date range; omit both for all-time. Deliberately
// implemented with raw SQL rather than ORM include/group — reports need
// precise multi-table aggregation that's fragile to express correctly
// through Sequelize's association-based query builder, and raw SQL here
// is easier to verify is actually correct.

function dateClause(column, fromDate, toDate, params) {
  if (fromDate && toDate) {
    params.push(fromDate, toDate);
    return `AND ${column} BETWEEN ? AND ?`;
  }
  return '';
}

// @route GET /api/reports/sales-by-party
const salesByParty = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const params = [];
    const dateFilter = dateClause('s.saleDate', fromDate, toDate, params);

    const rows = await sequelize.query(
      `SELECT p.id AS partyId, p.name AS partyName,
              COUNT(DISTINCT s.id) AS invoiceCount,
              SUM(s.totalAmount) AS totalSales,
              SUM(s.amountPaid) AS totalPaid,
              SUM(s.totalAmount - s.amountPaid) AS outstanding
       FROM sales s
       JOIN parties p ON p.id = s.partyId
       WHERE 1=1 ${dateFilter}
       GROUP BY p.id, p.name
       ORDER BY totalSales DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/reports/sales-by-user
const salesByUser = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const params = [];
    const dateFilter = dateClause('s.saleDate', fromDate, toDate, params);

    const rows = await sequelize.query(
      `SELECT u.id AS userId, u.name AS userName,
              COUNT(DISTINCT s.id) AS invoiceCount,
              SUM(s.totalAmount) AS totalSales
       FROM sales s
       LEFT JOIN users u ON u.id = s.userId
       WHERE 1=1 ${dateFilter}
       GROUP BY u.id, u.name
       ORDER BY totalSales DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/reports/sales-by-item
const salesByItem = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const params = [];
    const dateFilter = dateClause('s.saleDate', fromDate, toDate, params);

    const rows = await sequelize.query(
      `SELECT si.productId, si.productName,
              SUM(si.quantity) AS totalQuantity,
              SUM(si.netRate) AS totalSales,
              COUNT(DISTINCT si.saleId) AS invoiceCount
       FROM sales_items si
       JOIN sales s ON s.id = si.saleId
       WHERE 1=1 ${dateFilter}
       GROUP BY si.productId, si.productName
       ORDER BY totalSales DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/reports/item-sales-by-user
const itemSalesByUser = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const params = [];
    const dateFilter = dateClause('s.saleDate', fromDate, toDate, params);

    const rows = await sequelize.query(
      `SELECT u.id AS userId, u.name AS userName,
              si.productId, si.productName,
              SUM(si.quantity) AS totalQuantity,
              SUM(si.netRate) AS totalSales
       FROM sales_items si
       JOIN sales s ON s.id = si.saleId
       LEFT JOIN users u ON u.id = s.userId
       WHERE 1=1 ${dateFilter}
       GROUP BY u.id, u.name, si.productId, si.productName
       ORDER BY userName, totalSales DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/reports/stock-summary
const stockSummary = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, name, sku, unit, stockQuantity,
              purchasePrice, salesPrice,
              (stockQuantity * purchasePrice) AS stockValueAtCost,
              (stockQuantity * salesPrice) AS stockValueAtSale,
              minStockLevel,
              CASE
                WHEN stockQuantity <= 0 THEN 'Out of Stock'
                WHEN stockQuantity < COALESCE(minStockLevel, 5) THEN 'Low Stock'
                ELSE 'In Stock'
              END AS stockStatus
       FROM products
       ORDER BY name ASC`,
      { type: QueryTypes.SELECT }
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.totalStockValueAtCost += Number(r.stockValueAtCost) || 0;
        acc.totalStockValueAtSale += Number(r.stockValueAtSale) || 0;
        return acc;
      },
      { totalStockValueAtCost: 0, totalStockValueAtSale: 0 }
    );

    return res.status(200).json({ success: true, data: rows, totals });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/reports/gst2 — purchase-side GST summary (input tax credit),
//        the mirror of a GSTR-1/GSTR-3B sales-side report
const gst2Report = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const params = [];
    const dateFilter = dateClause('p.purchaseDate', fromDate, toDate, params);

    const rows = await sequelize.query(
      `SELECT pi.taxPercentage AS taxRate,
              SUM(pi.baseRate) AS taxableValue,
              SUM(pi.taxAmount) AS taxAmount,
              SUM(pi.netRate) AS totalValue,
              COUNT(DISTINCT pi.purchaseId) AS billCount
       FROM purchase_items pi
       JOIN purchases p ON p.id = pi.purchaseId
       WHERE 1=1 ${dateFilter}
       GROUP BY pi.taxPercentage
       ORDER BY taxRate ASC`,
      { replacements: params, type: QueryTypes.SELECT }
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.totalTaxableValue += Number(r.taxableValue) || 0;
        acc.totalTaxAmount += Number(r.taxAmount) || 0;
        return acc;
      },
      { totalTaxableValue: 0, totalTaxAmount: 0 }
    );

    return res.status(200).json({ success: true, data: rows, totals });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/reports/party-outstanding — receivables per customer
const partyOutstanding = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT p.id AS partyId, p.name AS partyName, p.phone, p.email,
              COUNT(s.id) AS unpaidInvoiceCount,
              SUM(s.totalAmount) AS totalInvoiced,
              SUM(s.amountPaid) AS totalPaid,
              SUM(s.totalAmount - s.amountPaid) AS outstanding
       FROM sales s
       JOIN parties p ON p.id = s.partyId
       WHERE s.paymentStatus IN ('Unpaid', 'Partial', 'Overdue')
       GROUP BY p.id, p.name, p.phone, p.email
       HAVING outstanding > 0
       ORDER BY outstanding DESC`,
      { type: QueryTypes.SELECT }
    );

    const totalOutstanding = rows.reduce((s, r) => s + (Number(r.outstanding) || 0), 0);

    return res.status(200).json({ success: true, data: rows, totalOutstanding });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/reports/customer-statement?partyId=12 — full ledger for one party
const customerStatement = async (req, res) => {
  try {
    const { partyId, fromDate, toDate } = req.query;
    if (!partyId) {
      return res.status(400).json({ message: 'partyId is required' });
    }

    const saleParams = [partyId];
    const saleDateFilter = dateClause('saleDate', fromDate, toDate, saleParams);
    const sales = await sequelize.query(
      `SELECT id, invoiceNumber AS reference, saleDate AS date,
              totalAmount AS debit, 0 AS credit, paymentStatus
       FROM sales
       WHERE partyId = ? ${saleDateFilter}`,
      { replacements: saleParams, type: QueryTypes.SELECT }
    );

    const paymentParams = [partyId];
    const paymentDateFilter = dateClause('paymentDate', fromDate, toDate, paymentParams);
    const payments = await sequelize.query(
      `SELECT id, referenceNo AS reference, paymentDate AS date,
              0 AS debit, amount AS credit, paymentMode
       FROM payments_in
       WHERE partyId = ? ${paymentDateFilter}`,
      { replacements: paymentParams, type: QueryTypes.SELECT }
    );

    // merge sale (debit) and payment (credit) rows into one chronological ledger
    const ledger = [...sales, ...payments].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    let running = 0;
    const withRunningBalance = ledger.map((row) => {
      running += Number(row.debit || 0) - Number(row.credit || 0);
      return { ...row, runningBalance: running };
    });

    return res.status(200).json({
      success: true,
      data: withRunningBalance,
      closingBalance: running,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/reports/purchase-by-party
const purchaseByParty = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const params = [];
    const dateFilter = dateClause('p.purchaseDate', fromDate, toDate, params);

    const rows = await sequelize.query(
      `SELECT pt.id AS partyId, pt.name AS partyName,
              COUNT(DISTINCT p.id) AS billCount,
              SUM(p.totalAmount) AS totalPurchases
       FROM purchases p
       JOIN parties pt ON pt.id = p.partyId
       WHERE 1=1 ${dateFilter}
       GROUP BY pt.id, pt.name
       ORDER BY totalPurchases DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/reports/purchase-by-item
const purchaseByItem = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const params = [];
    const dateFilter = dateClause('p.purchaseDate', fromDate, toDate, params);

    const rows = await sequelize.query(
      `SELECT pi.productId, pi.productName,
              SUM(pi.quantity) AS totalQuantity,
              SUM(pi.netRate) AS totalPurchases,
              COUNT(DISTINCT pi.purchaseId) AS billCount
       FROM purchase_items pi
       JOIN purchases p ON p.id = pi.purchaseId
       WHERE 1=1 ${dateFilter}
       GROUP BY pi.productId, pi.productName
       ORDER BY totalPurchases DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  salesByParty,
  salesByUser,
  salesByItem,
  itemSalesByUser,
  stockSummary,
  gst2Report,
  partyOutstanding,
  customerStatement,
  purchaseByParty,
  purchaseByItem,
};
