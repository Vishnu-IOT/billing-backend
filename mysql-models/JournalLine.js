const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const JournalLine = sequelize.define(
  'JournalLine',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    journalEntryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    partyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    debitAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.0,
    },
    creditAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.0,
    },
    memo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'journal_lines',
    timestamps: true,
  }
);

module.exports = JournalLine;
