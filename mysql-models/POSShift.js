const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const POSShift = sequelize.define(
  'POSShift',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    terminalId: {
      type: DataTypes.STRING,
      defaultValue: 'POS-TERMINAL-1',
    },
    openedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    openingFloat: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    closingCashActual: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    closingCashExpected: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    cashSalesTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    cardSalesTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    upiSalesTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    totalSalesCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'CLOSED'),
      defaultValue: 'OPEN',
    },
  },
  {
    tableName: 'pos_shifts',
    timestamps: true,
  }
);

module.exports = POSShift;
