const Expense = require('../mysql-models/Expense');
const Sale = require('../mysql-models/SalesBill');
const Purchase = require('../mysql-models/PurchaseBill');
const { Op } = require('sequelize');

const getExpenses = async (req, res) => {
  try {
    const expenses = await Expense.findAll({
      order: [['expenseDate', 'DESC']],
    });
    return res.status(200).json(expenses);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const addExpense = async (req, res) => {
  try {
    const { category, amount, paymentMode, expenseDate, referenceNo, description, receiptUrl, companyId } = req.body;

    const expense = await Expense.create({
      category,
      amount,
      paymentMode: paymentMode || 'Cash',
      expenseDate: expenseDate || new Date(),
      referenceNo,
      description,
      receiptUrl,
      companyId: companyId || 1,
    });

    return res.status(201).json(expense);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findByPk(id);

    if (!expense) {
      return res.status(404).json({ message: 'Expense record not found' });
    }

    await expense.destroy();
    return res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAnalyticsSummary = async (req, res) => {
  try {
    const sales = await Sale.findAll();
    const purchases = await Purchase.findAll();
    const expenses = await Expense.findAll();

    const totalSales = sales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
    const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const netProfit = totalSales - totalPurchases - totalExpenses;

    const totalReceivables = sales
      .filter((s) => s.paymentStatus !== 'Paid')
      .reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);

    const totalPayables = purchases
      .filter((p) => p.paymentStatus !== 'Paid')
      .reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);

    return res.status(200).json({
      totalSales,
      totalPurchases,
      totalExpenses,
      netProfit,
      totalReceivables,
      totalPayables,
      salesCount: sales.length,
      purchaseCount: purchases.length,
      expenseCount: expenses.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getExpenses,
  addExpense,
  deleteExpense,
  getAnalyticsSummary,
};
