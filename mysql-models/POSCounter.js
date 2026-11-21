'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');
const User = require('./Users');
const Company = require('./Company');

const POSCounter = sequelize.define(
  'POSCounter',
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
    counterName: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    counterCode: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    assignedUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
  },
  {
    tableName: 'pos_counters',
    timestamps: true,
    indexes: [
      {
        name: 'uq_pos_counters_company_name',
        unique: true,
        fields: ['companyId', 'counterName'],
      },
      {
        name: 'uq_pos_counters_company_code',
        unique: true,
        fields: ['companyId', 'counterCode'],
      },
      {
        name: 'uq_pos_counters_company_staff',
        unique: true,
        fields: ['companyId', 'assignedUserId'],
      },
      {
        name: 'idx_pos_counters_company_status',
        fields: ['companyId', 'status'],
      },
    ],
  }
);

POSCounter.belongsTo(User, {
  foreignKey: 'assignedUserId',
  as: 'assignedUser',
});
POSCounter.belongsTo(Company, {
  foreignKey: 'companyId',
  as: 'company',
});

module.exports = POSCounter;
