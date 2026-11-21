'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const RolePermission = sequelize.define('RolePermission', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  roleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'roles', key: 'id' },
    onDelete: 'CASCADE',
  },
  permissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'permissions', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  tableName: 'role_permissions',
  timestamps: true,
  indexes: [{ unique: true, fields: ['roleId', 'permissionId'] }],
});

module.exports = RolePermission;
