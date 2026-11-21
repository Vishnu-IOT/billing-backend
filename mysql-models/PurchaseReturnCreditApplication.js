'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const PurchaseReturnCreditApplication = sequelize.define(
  'PurchaseReturnCreditApplication',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    purchaseReturnId: { type: DataTypes.INTEGER, allowNull: false },
    purchaseId: { type: DataTypes.INTEGER, allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    supplierId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'REVERSED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    operationKey: { type: DataTypes.STRING(100), allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    reversedBy: { type: DataTypes.INTEGER, allowNull: true },
    reversedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'purchase_return_credit_applications',
    timestamps: true,
    indexes: [
      { fields: ['purchaseReturnId'], name: 'purchase_return_credit_source_idx' },
      { fields: ['purchaseId'], name: 'purchase_return_credit_purchase_idx' },
      { fields: ['companyId', 'supplierId', 'status'], name: 'purchase_return_credit_supplier_idx' },
    ],
  }
);

module.exports = PurchaseReturnCreditApplication;
