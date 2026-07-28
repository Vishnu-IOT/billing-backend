const Account = require('../mysql-models/Account');
const JournalEntry = require('../mysql-models/JournalEntry');
const JournalLine = require('../mysql-models/JournalLine');
const Party = require('../mysql-models/Party');
const sequelize = require('../config/sqldb');

// Seed default Chart of Accounts if table is empty
const ensureDefaultAccounts = async () => {
  const count = await Account.count();
  if (count === 0) {
    await Account.bulkCreate([
      { accountCode: '1000', name: 'Cash in Hand', accountType: 'ASSET', currentBalance: 0 },
      { accountCode: '1010', name: 'Bank Account', accountType: 'ASSET', currentBalance: 0 },
      { accountCode: '1100', name: 'Accounts Receivable', accountType: 'ASSET', currentBalance: 0 },
      { accountCode: '2000', name: 'Accounts Payable', accountType: 'LIABILITY', currentBalance: 0 },
      { accountCode: '3000', name: 'Owner Equity', accountType: 'EQUITY', currentBalance: 0 },
      { accountCode: '4000', name: 'Sales Revenue', accountType: 'INCOME', currentBalance: 0 },
      { accountCode: '5000', name: 'Purchase Account / Cost of Goods', accountType: 'EXPENSE', currentBalance: 0 },
      { accountCode: '6000', name: 'General & Operating Expenses', accountType: 'EXPENSE', currentBalance: 0 },
    ]);
  }
};

// Get Chart of Accounts
const getChartOfAccounts = async (req, res) => {
  try {
    await ensureDefaultAccounts();
    const accounts = await Account.findAll({
      order: [['accountCode', 'ASC']],
    });
    return res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Create Account
const createAccount = async (req, res) => {
  try {
    const { accountCode, name, accountType, parentAccountId } = req.body;
    if (!accountCode || !name || !accountType) {
      return res.status(400).json({ message: 'Account code, name, and account type are required' });
    }

    const account = await Account.create({
      accountCode,
      name,
      accountType,
      parentAccountId: parentAccountId || null,
      currentBalance: 0,
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: account,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get Journal Entries
const getJournalEntries = async (req, res) => {
  try {
    const entries = await JournalEntry.findAll({
      include: [
        {
          model: JournalLine,
          as: 'lines',
          include: [
            { model: Account, as: 'Account', attributes: ['id', 'accountCode', 'name', 'accountType'] },
            { model: Party, as: 'Party', attributes: ['id', 'name'] },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    return res.status(200).json({
      success: true,
      data: entries,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Create Manual Journal Entry (Double-Entry check)
const createJournalEntry = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { entryDate, narration, lines, createdBy } = req.body;

    if (!lines || lines.length < 2) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Journal entry requires at least 2 lines (debit & credit)' });
    }

    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debitAmount || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.creditAmount || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      await transaction.rollback();
      return res.status(400).json({ message: `Unbalanced entry: Total Debit (${totalDebit}) must equal Total Credit (${totalCredit})` });
    }

    const entryNumber = `JV-${Date.now().toString().slice(-6)}`;
    const entry = await JournalEntry.create(
      {
        entryNumber,
        entryDate: entryDate || new Date(),
        referenceType: 'MANUAL',
        narration: narration || '',
        totalDebit,
        totalCredit,
        createdBy,
      },
      { transaction }
    );

    for (const line of lines) {
      await JournalLine.create(
        {
          journalEntryId: entry.id,
          accountId: line.accountId,
          partyId: line.partyId || null,
          debitAmount: Number(line.debitAmount || 0),
          creditAmount: Number(line.creditAmount || 0),
          memo: line.memo || '',
        },
        { transaction }
      );

      // Update account running balance
      const account = await Account.findByPk(line.accountId, { transaction });
      if (account) {
        const netChange = Number(line.debitAmount || 0) - Number(line.creditAmount || 0);
        await account.increment('currentBalance', { by: netChange, transaction });
      }
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Journal Entry posted successfully',
      data: entry,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

// Get Party Running Balance Ledger Statement
const getPartyLedger = async (req, res) => {
  try {
    const { partyId } = req.query;
    if (!partyId) {
      return res.status(400).json({ message: 'partyId query parameter is required' });
    }

    const party = await Party.findByPk(partyId);
    if (!party) {
      return res.status(404).json({ message: 'Party not found' });
    }

    const lines = await JournalLine.findAll({
      where: { partyId },
      include: [
        {
          model: JournalEntry,
          attributes: ['id', 'entryNumber', 'entryDate', 'referenceType', 'referenceId', 'narration'],
        },
        {
          model: Account,
          as: 'Account',
          attributes: ['id', 'accountCode', 'name'],
        },
      ],
      order: [[JournalEntry, 'entryDate', 'ASC']],
    });

    let runningBalance = 0;
    const statement = lines.map((line) => {
      const debit = Number(line.debitAmount || 0);
      const credit = Number(line.creditAmount || 0);
      runningBalance += debit - credit;

      return {
        id: line.id,
        date: line.JournalEntry?.entryDate,
        entryNumber: line.JournalEntry?.entryNumber,
        referenceType: line.JournalEntry?.referenceType,
        referenceId: line.JournalEntry?.referenceId,
        narration: line.JournalEntry?.narration || line.memo,
        accountName: line.Account?.name,
        debit,
        credit,
        runningBalance,
      };
    });

    return res.status(200).json({
      success: true,
      party: { id: party.id, name: party.name, phone: party.phone },
      closingBalance: runningBalance,
      data: statement,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get Trial Balance
const getTrialBalance = async (req, res) => {
  try {
    await ensureDefaultAccounts();
    const accounts = await Account.findAll({
      order: [['accountCode', 'ASC']],
    });

    let totalDebit = 0;
    let totalCredit = 0;

    const data = accounts.map((acc) => {
      const bal = Number(acc.currentBalance || 0);
      let debit = 0;
      let credit = 0;

      if (['ASSET', 'EXPENSE'].includes(acc.accountType)) {
        if (bal >= 0) debit = bal;
        else credit = Math.abs(bal);
      } else {
        if (bal >= 0) credit = bal;
        else debit = Math.abs(bal);
      }

      totalDebit += debit;
      totalCredit += credit;

      return {
        id: acc.id,
        accountCode: acc.accountCode,
        name: acc.name,
        accountType: acc.accountType,
        debit,
        credit,
      };
    });

    return res.status(200).json({
      success: true,
      totalDebit,
      totalCredit,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      data,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get Profit and Loss Statement
const getProfitAndLoss = async (req, res) => {
  try {
    await ensureDefaultAccounts();
    const incomeAccounts = await Account.findAll({ where: { accountType: 'INCOME' } });
    const expenseAccounts = await Account.findAll({ where: { accountType: 'EXPENSE' } });

    const totalRevenue = incomeAccounts.reduce((sum, a) => sum + Math.abs(Number(a.currentBalance || 0)), 0);
    const totalExpenses = expenseAccounts.reduce((sum, a) => sum + Math.abs(Number(a.currentBalance || 0)), 0);
    const netProfit = totalRevenue - totalExpenses;

    return res.status(200).json({
      success: true,
      totalRevenue,
      totalExpenses,
      netProfit,
      incomeAccounts,
      expenseAccounts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get Balance Sheet
const getBalanceSheet = async (req, res) => {
  try {
    await ensureDefaultAccounts();
    const assetAccounts = await Account.findAll({ where: { accountType: 'ASSET' } });
    const liabilityAccounts = await Account.findAll({ where: { accountType: 'LIABILITY' } });
    const equityAccounts = await Account.findAll({ where: { accountType: 'EQUITY' } });

    const totalAssets = assetAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);
    const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);
    const totalEquity = equityAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);

    return res.status(200).json({
      success: true,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      assetAccounts,
      liabilityAccounts,
      equityAccounts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Automated journal entry helper for Sales, Purchases, Payments, Expenses
const recordAutomatedJournalEntry = async ({
  referenceType,
  referenceId,
  amount,
  partyId = null,
  narration = '',
  debitAccountCode = '1000',
  creditAccountCode = '4000',
  transaction = null,
}) => {
  try {
    await ensureDefaultAccounts();

    const debitAccount = await Account.findOne({ where: { accountCode: debitAccountCode }, transaction });
    const creditAccount = await Account.findOne({ where: { accountCode: creditAccountCode }, transaction });

    if (!debitAccount || !creditAccount) return null;

    const entryNumber = `JV-AUTO-${Date.now().toString().slice(-6)}`;
    const entry = await JournalEntry.create(
      {
        entryNumber,
        entryDate: new Date(),
        referenceType,
        referenceId: String(referenceId),
        narration: narration || `Auto entry for ${referenceType} #${referenceId}`,
        totalDebit: amount,
        totalCredit: amount,
      },
      { transaction }
    );

    // Debit Line
    await JournalLine.create(
      {
        journalEntryId: entry.id,
        accountId: debitAccount.id,
        partyId,
        debitAmount: amount,
        creditAmount: 0,
        memo: `Debit ${debitAccount.name}`,
      },
      { transaction }
    );

    // Credit Line
    await JournalLine.create(
      {
        journalEntryId: entry.id,
        accountId: creditAccount.id,
        partyId,
        debitAmount: 0,
        creditAmount: amount,
        memo: `Credit ${creditAccount.name}`,
      },
      { transaction }
    );

    // Update balances
    await debitAccount.increment('currentBalance', { by: amount, transaction });
    await creditAccount.increment('currentBalance', { by: -amount, transaction });

    return entry;
  } catch (err) {
    console.error('recordAutomatedJournalEntry error:', err.message);
    return null;
  }
};

module.exports = {
  getChartOfAccounts,
  createAccount,
  getJournalEntries,
  createJournalEntry,
  getPartyLedger,
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
  recordAutomatedJournalEntry,
};

