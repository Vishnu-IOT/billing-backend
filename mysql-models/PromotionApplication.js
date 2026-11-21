'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

module.exports = sequelize.define(
  'PromotionApplication',
  {
    id: { type: DataTypes.STRING(36), primaryKey: true },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sales', key: 'id' },
      onDelete: 'CASCADE',
    },
    offerId: { type: DataTypes.INTEGER, allowNull: true },
    campaignId: { type: DataTypes.INTEGER, allowNull: true },
    campaignProductId: { type: DataTypes.INTEGER, allowNull: true },
    promotionName: { type: DataTypes.STRING(255), allowNull: false },
    promotionType: { type: DataTypes.STRING(40), allowNull: false },
    promotionSource: {
      type: DataTypes.ENUM('REGULAR', 'CAMPAIGN'),
      allowNull: false,
    },
    qualifyingProductId: { type: DataTypes.INTEGER, allowNull: false },
    giftProductId: { type: DataTypes.INTEGER, allowNull: true },
    paidQuantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
    freeQuantity: { type: DataTypes.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
    discountAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    appliedAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    qualifyingSalesItemId: { type: DataTypes.INTEGER, allowNull: true },
    giftSalesItemId: { type: DataTypes.INTEGER, allowNull: true },
    snapshot: { type: DataTypes.JSON, allowNull: false },
  },
  {
    tableName: 'promotion_applications',
    timestamps: true,
    indexes: [
      { fields: ['saleId'], name: 'promotion_applications_sale_idx' },
      { fields: ['offerId'], name: 'promotion_applications_offer_idx' },
      { fields: ['campaignId'], name: 'promotion_applications_campaign_idx' },
    ],
  }
);
