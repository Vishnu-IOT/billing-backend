'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const PosSaleIdempotency = sequelize.define(
  'PosSaleIdempotency',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    idempotencyKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    requestHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    response: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'sales', key: 'id' },
      onDelete: 'RESTRICT',
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'pos_sale_idempotencies',
    timestamps: true,
  }
);

module.exports = PosSaleIdempotency;
