'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const LoyaltyGift = sequelize.define(
  'LoyaltyGift',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pointsRequired: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    rewardType: {
      type: DataTypes.ENUM('CASH_DISCOUNT', 'PRODUCT', 'SERVICE', 'OTHER'),
      allowNull: false,
      defaultValue: 'OTHER',
    },
    rewardValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: { min: 0 },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'loyalty_gifts',
    timestamps: true,
  }
);

module.exports = LoyaltyGift;
