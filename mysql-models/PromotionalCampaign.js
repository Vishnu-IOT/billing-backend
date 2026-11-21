'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

module.exports = sequelize.define(
  'PromotionalCampaign',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    campaignType: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'SEASONAL' },
    startDate: { type: DataTypes.DATE, allowNull: false },
    endDate: { type: DataTypes.DATE, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: 'promotional_campaigns',
    timestamps: true,
    indexes: [
      { fields: ['isActive', 'startDate', 'endDate', 'priority'], name: 'campaign_active_dates_priority_idx' },
    ],
  }
);
