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
    // LAST 6 MONTH SALES
    // ======================
    // const salesChart = await Sale.findAll({
    //   attributes: [
    //     [fn('DATE_FORMAT', col('saleDate'), '%b %Y'), 'month'],
    //     [fn('SUM', col('totalAmount')), 'amount'],
    //   ],
    //   group: [fn('DATE_FORMAT', col('saleDate'), '%Y-%m')],
    //   order: [[col('saleDate'), 'ASC']],
    //   raw: true,
    // });

    // ======================
    // LAST 6 MONTH PURCHASE
    // ======================
    // const purchaseChart = await Sale.findAll({
    //   attributes: [
    //     [fn('DATE_FORMAT', col('purchaseDate'), '%b %Y'), 'month'],
    //     [fn('SUM', col('totalAmount')), 'amount'],
    //   ],
    //   group: [fn('DATE_FORMAT', col('purchaseDate'), '%Y-%m')],
    //   order: [[col('purchaseDate'), 'ASC']],
    //   raw: true,
    // });

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

    res.status(200).json({
      currentMonth: {
        sales: Number(totalSales),
        purchase: Number(totalPurchase),
        profit: Number(profit),
        stockValue: Number(stockValue),
      },
      //   chartData: {
      //     sales: salesChart,
      //     purchase: purchaseChart,
      //   },
      recentSales,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { dashboardData };
