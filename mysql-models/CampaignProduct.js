'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

module.exports = sequelize.define(
  'CampaignProduct',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    campaignId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'promotional_campaigns', key: 'id' },
      onDelete: 'CASCADE',
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'products', key: 'id' },
      onDelete: 'CASCADE',
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'categories', key: 'id' },
      onDelete: 'CASCADE',
    },
    offerType: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'BUY_X_GET_Y_FREE' },
    buyQuantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false, defaultValue: 1 },
    giftQuantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false, defaultValue: 1 },
    freeQuantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
    discountPercentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    discountAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    discountValue: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    specialPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    giftProductId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'products', key: 'id' },
      onDelete: 'SET NULL',
    },
    eligibleBillType: {
      type: DataTypes.ENUM('BOTH', 'B2C', 'B2B'),
      allowNull: false,
      defaultValue: 'BOTH',
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: 'campaign_products',
    timestamps: true,
    indexes: [
      { fields: ['campaignId', 'productId'], name: 'campaign_products_campaign_product_idx' },
      { fields: ['categoryId'], name: 'campaign_products_category_idx' },
    ],
  }
);
