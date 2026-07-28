const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const HoldBill = sequelize.define(
  'HoldBill',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    holdNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    customerName: {
      type: DataTypes.STRING,
      defaultValue: 'Walk-in Customer',
    },
    customerPhone: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    cartData: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    note: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    status: {
      type: DataTypes.ENUM('HELD', 'RESUMED', 'CANCELLED'),
      defaultValue: 'HELD',
    },
  },
  {
    tableName: 'hold_bills',
    timestamps: true,
  }
);

module.exports = HoldBill;
