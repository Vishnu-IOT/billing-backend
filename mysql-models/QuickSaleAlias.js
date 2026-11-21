'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const QuickSaleAlias = sequelize.define(
  'QuickSaleAlias',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    identityKey: {
      type: DataTypes.STRING(270),
      allowNull: false,
    },
    barcode: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    gstVerificationStatus: {
      type: DataTypes.ENUM('GST_PENDING', 'GST_VERIFIED'),
      allowNull: false,
      defaultValue: 'GST_PENDING',
    },
    verifiedTaxRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    verifiedHsnCode: {
      type: DataTypes.STRING(15),
      allowNull: true,
    },
    verifiedPriceType: {
      type: DataTypes.ENUM('WITH_GST', 'WITHOUT_GST'),
      allowNull: true,
    },
    mappingStatus: {
      type: DataTypes.ENUM('UNLINKED', 'LINKED'),
      allowNull: false,
      defaultValue: 'UNLINKED',
    },
    linkedProductId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'products', key: 'id' },
      onDelete: 'SET NULL',
    },
    reviewStatus: {
      type: DataTypes.ENUM('PENDING', 'REVIEWED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    verifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    mappedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    reviewedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    mappedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'quick_sale_aliases',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['companyId', 'identityKey'],
        name: 'quick_sale_aliases_company_identity_unique',
      },
      {
        fields: ['companyId', 'gstVerificationStatus', 'mappingStatus', 'reviewStatus'],
        name: 'quick_sale_aliases_company_status_idx',
      },
      {
        fields: ['linkedProductId'],
        name: 'quick_sale_aliases_product_idx',
      },
    ],
  },
);

module.exports = QuickSaleAlias;
