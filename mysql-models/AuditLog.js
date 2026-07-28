const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false, // e.g. "CREATE_INVOICE", "DELETE_PRODUCT", "CLOSE_SHIFT"
    },
    module: {
      type: DataTypes.STRING(50),
      allowNull: false, // e.g. "SALES", "POS", "INVENTORY", "ACCOUNTING"
    },
    targetId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    changes: {
      type: DataTypes.TEXT,
      allowNull: true, // JSON metadata of changes
    },
  },
  {
    tableName: 'audit_logs',
    timestamps: true,
  }
);

module.exports = AuditLog;
