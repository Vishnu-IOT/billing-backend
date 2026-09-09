const { Op, fn, col, literal } = require('sequelize');
const Sale = require('../mysql-models/SalesBill');
const Purchase = require('../mysql-models/PurchaseBill');
const Product = require('../mysql-models/Product');
const Customer = require('../mysql-models/Customer');
const Party = require('../mysql-models/Party');

const dashboardData = async (req, res) => {
  try {
    const startDate = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );

    const endDate = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    );

    // ======================
    // CURRENT MONTH SALES
    // ======================
    const totalSales =
      (await Sale.sum('totalAmount', {
        where: {
          saleDate: {
            [Op.between]: [startDate, endDate],
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
            [Op.between]: [startDate, endDate],
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
    const stockValue =
      (
        await Product.findOne({
          attributes: [
            [fn('SUM', literal('stockQuantity * purchasePrice')), 'stockValue'],
          ],
          raw: true,
        })
      )?.stockValue || 0;

    // ======================
    // LAST 12 MONTHS SALES + PURCHASE (bar chart)
    // ======================
    const now = new Date();
    const chartMonths = 12;
    const chartStart = new Date(now.getFullYear(), now.getMonth() - (chartMonths - 1), 1);

    const salesChartRows = await Sale.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('saleDate'), '%Y-%m'), 'monthKey'],
        [fn('SUM', col('totalAmount')), 'amount'],
      ],
      where: { saleDate: { [Op.gte]: chartStart } },
      group: [fn('DATE_FORMAT', col('saleDate'), '%Y-%m')],
      raw: true,
    });

    const purchaseChartRows = await Purchase.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('purchaseDate'), '%Y-%m'), 'monthKey'],
        [fn('SUM', col('totalAmount')), 'amount'],
      ],
      where: { purchaseDate: { [Op.gte]: chartStart } },
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
