'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const SalesReturn = sequelize.define(
  'SalesReturn',
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
    saleItemId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sales_items', key: 'id' },
      onDelete: 'CASCADE',
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'products', key: 'id' },
      onDelete: 'CASCADE',
    },
    productBatchId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'product_batches', key: 'id' },
    },
    returnCreditId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'sales_return_credits', key: 'id' },
    },
    quantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
    },
    returnedAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    quantityUnit: {
      type: DataTypes.ENUM('PCS', 'KG'),
      allowNull: false,
      defaultValue: 'PCS',
    },
    returnCondition: {
      type: DataTypes.ENUM('GOOD', 'DAMAGED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'GOOD',
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
    tableName: 'sales_returns',
    timestamps: true,
    indexes: [
      { fields: ['saleItemId'], name: 'sales_returns_sale_item_idx' },
    ],
  }
);

module.exports = SalesReturn;
