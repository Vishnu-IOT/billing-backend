const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const JournalEntry = sequelize.define(
  'JournalEntry',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    entryNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    entryDate: {
      type: DataTypes.DATEONLY,
      defaultValue: DataTypes.NOW,
    },
    referenceType: {
      type: DataTypes.ENUM('SALE', 'PURCHASE', 'PAYMENT_IN', 'PAYMENT_OUT', 'EXPENSE', 'MANUAL'),
      defaultValue: 'MANUAL',
    },
    referenceId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    narration: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    totalDebit: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.0,
    },
    totalCredit: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.0,
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'journal_entries',
    timestamps: true,
  }
);

module.exports = JournalEntry;
