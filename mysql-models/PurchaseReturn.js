'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const PurchaseReturn = sequelize.define(
  'PurchaseReturn',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    returnNumber: { type: DataTypes.STRING(40), allowNull: true, unique: true },
    companyId: { type: DataTypes.INTEGER, allowNull: false },
    supplierId: { type: DataTypes.INTEGER, allowNull: false },
    purchaseId: { type: DataTypes.INTEGER, allowNull: false },
    returnDate: { type: DataTypes.DATEONLY, allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    discountAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    cgstAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    sgstAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    igstAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    totalTax: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    grandTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    appliedToPayable: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    supplierCreditAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    requestHash: { type: DataTypes.STRING(64), allowNull: false },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true },
    cancelledBy: { type: DataTypes.INTEGER, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'purchase_returns',
    timestamps: true,
    indexes: [
      { fields: ['companyId', 'returnDate'], name: 'purchase_returns_company_date_idx' },
      { fields: ['purchaseId'], name: 'purchase_returns_purchase_idx' },
      { fields: ['supplierId'], name: 'purchase_returns_supplier_idx' },
    ],
  }
);

module.exports = PurchaseReturn;
