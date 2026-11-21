'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Role = sequelize.define('Role', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'companies', key: 'id' },
    onDelete: 'CASCADE',
  },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.STRING(500), allowNull: true },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
    allowNull: false,
    defaultValue: 'ACTIVE',
  },
  isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  systemKey: {
    type: DataTypes.ENUM('ADMIN', 'PURCHASE_MANAGER', 'STAFF'),
    allowNull: true,
  },
}, {
  tableName: 'roles',
  timestamps: true,
  indexes: [{ unique: true, fields: ['companyId', 'name'] }],
});

module.exports = Role;
