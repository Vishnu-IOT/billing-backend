'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const SalesReturnCredit = sequelize.define(
  'SalesReturnCredit',
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
    code: {
      type: DataTypes.STRING(36),
      allowNull: false,
      unique: true,
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    remainingAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    idempotencyKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    requestHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'sales_return_credits',
    timestamps: true,
  }
);

module.exports = SalesReturnCredit;
