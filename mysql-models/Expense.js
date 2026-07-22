const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Expense = sequelize.define(
  'Expense',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    paymentMode: {
      type: DataTypes.STRING,
      defaultValue: 'Cash',
    },
    expenseDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    referenceNo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    receiptUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'expenses',
    timestamps: true,
  }
);

module.exports = Expense;
