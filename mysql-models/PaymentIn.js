const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const PaymentIn = sequelize.define(
  'PaymentIn',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    partyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    paymentDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
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
    referenceNo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'payments_in',
    timestamps: true,
  }
);

module.exports = PaymentIn;
