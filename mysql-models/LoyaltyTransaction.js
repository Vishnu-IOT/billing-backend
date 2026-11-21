'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const LoyaltyTransaction = sequelize.define(
  'LoyaltyTransaction',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'customers', key: 'id' },
      onDelete: 'RESTRICT',
    },
    transactionType: {
      type: DataTypes.ENUM('EARN', 'REDEEM', 'ADJUSTMENT', 'REVERSAL'),
      allowNull: false,
    },
    pointsDelta: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    balanceAfter: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0 },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rewardType: {
      type: DataTypes.ENUM('CASH_DISCOUNT', 'PRODUCT', 'SERVICE', 'OTHER'),
      allowNull: true,
    },
    redemptionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'loyalty_redemptions', key: 'id' },
      onDelete: 'RESTRICT',
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'sales', key: 'id' },
      onDelete: 'SET NULL',
    },
    performedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    idempotencyKey: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: 'loyalty_transactions',
    timestamps: true,
    indexes: [
      { fields: ['customerId', 'createdAt'], name: 'loyalty_transactions_customer_created_idx' },
      {
        unique: true,
        fields: ['customerId', 'idempotencyKey'],
        name: 'loyalty_transactions_customer_idempotency_unique',
      },
    ],
  }
);

module.exports = LoyaltyTransaction;
