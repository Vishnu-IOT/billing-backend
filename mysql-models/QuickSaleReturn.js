'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const QuickSaleReturn = sequelize.define(
  'QuickSaleReturn',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sales', key: 'id' },
      onDelete: 'CASCADE',
    },
    quickSaleSaleItemId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'quick_sale_sale_items', key: 'id' },
      onDelete: 'RESTRICT',
    },
    returnCreditId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sales_return_credits', key: 'id' },
      onDelete: 'RESTRICT',
    },
    quantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
    },
    returnedAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    idempotencyKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'quick_sale_returns',
    timestamps: true,
    indexes: [
      { fields: ['saleId'], name: 'quick_sale_returns_sale_idx' },
      { fields: ['quickSaleSaleItemId'], name: 'quick_sale_returns_item_idx' },
      { fields: ['returnCreditId'], name: 'quick_sale_returns_credit_idx' },
    ],
  },
);

module.exports = QuickSaleReturn;
