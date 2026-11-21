const { Op, fn, col } = require('sequelize');
const Sale = require('../mysql-models/SalesBill');
const Purchase = require('../mysql-models/PurchaseBill');
const Product = require('../mysql-models/Product');
const ProductBatch = require('../mysql-models/ProductBatch');
const Company = require('../mysql-models/Company');
const Customer = require('../mysql-models/Customer');
const Party = require('../mysql-models/Party');
const { calculateInventoryValuation } = require('../utils/inventoryValuation');
const { indiaMonthRange } = require('../utils/inclusiveDateRange');

const getExpiryAlertBatches = async (expiryDateCondition) =>
  ProductBatch.findAll({
    where: {
      availableQuantity: { [Op.gt]: 0 },
      expiryDate: expiryDateCondition,
    },
    include: [{
      model: Product,
      attributes: ['id', 'name', 'baseUnit'],
      required: true,
    }],
    attributes: ['id', 'productId', 'batchNumber', 'expiryDate', 'availableQuantity'],
    order: [['expiryDate', 'ASC'], ['id', 'ASC']],
    limit: 20,
  });

const dashboardData = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const expiringThrough = new Date(today);
    expiringThrough.setDate(expiringThrough.getDate() + 30);
    expiringThrough.setHours(23, 59, 59, 999);

    const currentMonthRange = indiaMonthRange(now);

    // ======================
    // CURRENT MONTH SALES
    // ======================
    const totalSales =
      (await Sale.sum('totalAmount', {
        where: {
          saleDate: {
            [Op.gte]: currentMonthRange.start,
            [Op.lt]: currentMonthRange.endExclusive,
          },
        },
      })) || 0;

    // ======================
    // CURRENT MONTH PURCHASE
    // ======================
    const totalPurchase =
      (await Purchase.sum('totalAmount', {
        where: {
          purchaseDate: {
            [Op.gte]: currentMonthRange.start,
            [Op.lt]: currentMonthRange.endExclusive,
          },
        },
      })) || 0;

    // ======================
    // PROFIT
    // ======================
    const profit = totalSales - totalPurchase;

    // ======================
    // STOCK VALUE
    // ======================
    const companies = await Company.findAll({
      attributes: ['id'],
      where: { is_active: true },
      raw: true,
    });
    if (companies.length !== 1) {
      throw new Error(
        'Dashboard inventory valuation requires exactly one active company because products are not company-scoped'
      );
    }
    const companyId = companies[0].id;
    const [products, batches] = await Promise.all([
      Product.findAll({
        attributes: ['id', 'stockQuantity', 'unbatchedAverageCost'],
        raw: true,
      }),
      ProductBatch.findAll({
        attributes: ['productId', 'availableQuantity', 'inventoryUnitCost'],
        where: { [Op.or]: [{ companyId }, { companyId: null }] },
        raw: true,
      }),
    ]);
    const stockValue = calculateInventoryValuation(products, batches);
    const [expiredBatches, expiringBatches] = await Promise.all([
      getExpiryAlertBatches({ [Op.lt]: today }),
      getExpiryAlertBatches({ [Op.between]: [today, expiringThrough] }),
    ]);

    // ======================
    // LAST 12 MONTHS SALES + PURCHASE (bar chart)
    // ======================
    const chartMonths = 12;
    const chartStartRange = indiaMonthRange(now, chartMonths - 1);

    const salesChartRows = await Sale.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('saleDate'), '%Y-%m'), 'monthKey'],
        [fn('SUM', col('totalAmount')), 'amount'],
      ],
      where: {
        saleDate: {
          [Op.gte]: chartStartRange.start,
          [Op.lt]: currentMonthRange.endExclusive,
        },
      },
      group: [fn('DATE_FORMAT', col('saleDate'), '%Y-%m')],
      raw: true,
    });

    const purchaseChartRows = await Purchase.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('purchaseDate'), '%Y-%m'), 'monthKey'],
        [fn('SUM', col('totalAmount')), 'amount'],
      ],
      where: {
        purchaseDate: {
          [Op.gte]: chartStartRange.start,
          [Op.lt]: currentMonthRange.endExclusive,
        },
      },
      group: [fn('DATE_FORMAT', col('purchaseDate'), '%Y-%m')],
      raw: true,
    });

    const salesByMonth = Object.fromEntries(salesChartRows.map((r) => [r.monthKey, Number(r.amount) || 0]));
    const purchaseByMonth = Object.fromEntries(purchaseChartRows.map((r) => [r.monthKey, Number(r.amount) || 0]));

    // build a continuous run of the last 12 months so months with zero activity still appear on the chart
    const chartData = [];
    for (let i = chartMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      chartData.push({
        month: label,
        monthKey,
        sales: salesByMonth[monthKey] || 0,
        purchase: purchaseByMonth[monthKey] || 0,
      });
    }

    // ======================
    // RECENT 3 SALES
    // ======================
    const recentSales = await Sale.findAll({
      limit: 3,
      order: [['saleDate', 'DESC']],
      attributes: [
        'id',
        'invoiceNumber',
        'totalAmount',
        'saleDate',
        'paymentStatus',
      ],
      include: [
        {
          model: Customer,
          attributes: ['id', 'name'],
          required: false,
        },
        {
          model: Party,
          attributes: ['id', 'name'],
          required: false,
        },
      ],
    });

    return res.status(200).json({
      currentMonth: {
        sales: Number(totalSales),
        purchase: Number(totalPurchase),
        profit: Number(profit),
        stockValue: Number(stockValue),
      },
      chartData,
      recentSales,
      expiryAlerts: {
        expired: expiredBatches,
        expiring: expiringBatches,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { dashboardData };
