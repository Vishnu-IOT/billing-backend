'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const LoyaltyRedemption = sequelize.define(
  'LoyaltyRedemption',
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
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'sales', key: 'id' },
      onDelete: 'RESTRICT',
    },
    pointsRedeemed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    pointsReversed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    redemptionMethod: {
      type: DataTypes.ENUM('GIFT', 'MANUAL'),
      allowNull: false,
    },
    giftId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'loyalty_gifts', key: 'id' },
      onDelete: 'RESTRICT',
    },
    rewardType: {
      type: DataTypes.ENUM('CASH_DISCOUNT', 'PRODUCT', 'SERVICE', 'OTHER'),
      allowNull: true,
    },
    rewardDescription: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    rewardValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: { min: 0 },
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    performedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    status: {
      type: DataTypes.ENUM('COMPLETED', 'REVERSED'),
      allowNull: false,
      defaultValue: 'COMPLETED',
    },
    idempotencyKey: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: 'loyalty_redemptions',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['customerId', 'idempotencyKey'],
        name: 'loyalty_redemptions_customer_idempotency_unique',
      },
      {
        unique: true,
        fields: ['saleId'],
        name: 'loyalty_redemptions_sale_unique',
      },
    ],
  }
);

module.exports = LoyaltyRedemption;
