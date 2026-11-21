'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Permission = sequelize.define('Permission', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  module: { type: DataTypes.STRING(60), allowNull: false },
  page: { type: DataTypes.STRING(80), allowNull: false },
  action: { type: DataTypes.STRING(40), allowNull: false },
  permissionKey: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  description: { type: DataTypes.STRING(255), allowNull: false },
}, {
  tableName: 'permissions',
  timestamps: true,
});

module.exports = Permission;
