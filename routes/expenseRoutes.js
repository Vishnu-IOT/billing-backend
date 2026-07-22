const express = require('express');
const router = express.Router();
const {
  getExpenses,
  addExpense,
  deleteExpense,
} = require('../mysql-controllers/expenseController');

router.get('/get-Expenses', getExpenses);
router.post('/add-Expense', addExpense);
router.delete('/delete-Expense/:id', deleteExpense);

module.exports = router;
