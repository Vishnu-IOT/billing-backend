const express = require('express');
const router = express.Router();
const {
  getChartOfAccounts,
  createAccount,
  getJournalEntries,
  createJournalEntry,
  getPartyLedger,
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
} = require('../mysql-controllers/accountingController');

// Chart of Accounts
router.get('/accounts', getChartOfAccounts);
router.post('/accounts', createAccount);

// Journal Entries
router.get('/journals', getJournalEntries);
router.post('/journals', createJournalEntry);

// Party Running Ledger Statement
router.get('/party-ledger', getPartyLedger);

// Financial Statements
router.get('/trial-balance', getTrialBalance);
router.get('/profit-loss', getProfitAndLoss);
router.get('/balance-sheet', getBalanceSheet);

module.exports = router;
