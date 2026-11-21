'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const PurchaseReturnItem = sequelize.define(
  'PurchaseReturnItem',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    purchaseReturnId: { type: DataTypes.INTEGER, allowNull: false },
    purchaseId: { type: DataTypes.INTEGER, allowNull: false },
    purchaseItemId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    productBatchId: { type: DataTypes.INTEGER, allowNull: false },
    productName: { type: DataTypes.STRING(255), allowNull: false },
    sku: { type: DataTypes.STRING(255), allowNull: true },
    barcode: { type: DataTypes.STRING(255), allowNull: true },
    batchNumber: { type: DataTypes.STRING(255), allowNull: false },
    mrp: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    quantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false },
    paidQuantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
    freeQuantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
    quantityUnit: {
      type: DataTypes.ENUM('PCS', 'KG'),
      allowNull: false,
      defaultValue: 'PCS',
    },
    purchaseRate: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
    priceType: { type: DataTypes.ENUM('WITH_GST', 'WITHOUT_GST'), allowNull: false },
    gstPercentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    discountAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    taxableAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    cgstAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    sgstAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    igstAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    totalTax: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    mfgDate: { type: DataTypes.DATE, allowNull: true },
    expiryDate: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'purchase_return_items',
    timestamps: true,
    indexes: [
      { fields: ['purchaseItemId'], name: 'purchase_return_items_purchase_item_idx' },
      { fields: ['productBatchId'], name: 'purchase_return_items_batch_idx' },
    ],
  }
);

module.exports = PurchaseReturnItem;
