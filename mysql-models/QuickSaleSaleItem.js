'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const QuickSaleSaleItem = sequelize.define(
  'QuickSaleSaleItem',
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
    quickSaleAliasId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'quick_sale_aliases', key: 'id' },
      onDelete: 'RESTRICT',
    },
    productNameSnapshot: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    barcodeSnapshot: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    mrp: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    sellingPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
    },
    lineAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    discountAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    netAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    gstVerificationStatus: {
      type: DataTypes.ENUM('GST_PENDING', 'GST_VERIFIED'),
      allowNull: false,
    },
    taxableAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    taxPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    taxAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    cgstAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    sgstAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    igstAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    cessAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    hsnCodeSnapshot: {
      type: DataTypes.STRING(15),
      allowNull: true,
    },
    priceTypeSnapshot: {
      type: DataTypes.ENUM('WITH_GST', 'WITHOUT_GST'),
      allowNull: true,
    },
  },
  {
    tableName: 'quick_sale_sale_items',
    timestamps: true,
    indexes: [
      { fields: ['saleId'], name: 'quick_sale_sale_items_sale_idx' },
      { fields: ['quickSaleAliasId'], name: 'quick_sale_sale_items_alias_idx' },
      {
        fields: ['gstVerificationStatus', 'createdAt'],
        name: 'quick_sale_sale_items_tax_status_idx',
      },
    ],
  },
);

module.exports = QuickSaleSaleItem;
