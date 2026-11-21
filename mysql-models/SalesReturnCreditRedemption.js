'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const SalesReturnCreditRedemption = sequelize.define(
  'SalesReturnCreditRedemption',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    creditId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sales_return_credits', key: 'id' },
      onDelete: 'CASCADE',
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'sales', key: 'id' },
      onDelete: 'CASCADE',
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
  },
  {
    tableName: 'sales_return_credit_redemptions',
    timestamps: true,
  }
);

module.exports = SalesReturnCreditRedemption;
