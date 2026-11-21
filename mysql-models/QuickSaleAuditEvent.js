'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const QuickSaleAuditEvent = sequelize.define(
  'QuickSaleAuditEvent',
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
    quickSaleAliasId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'quick_sale_aliases', key: 'id' },
      onDelete: 'RESTRICT',
    },
    actorUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    action: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    previousValues: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    nextValues: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: 'quick_sale_audit_events',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['companyId', 'createdAt'], name: 'quick_sale_audit_company_date_idx' },
      { fields: ['quickSaleAliasId', 'createdAt'], name: 'quick_sale_audit_alias_date_idx' },
    ],
  },
);

module.exports = QuickSaleAuditEvent;
