const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const StockTransfer = sequelize.define(
  'StockTransfer',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    transferNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    fromWarehouseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    toWarehouseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    transferDate: {
      type: DataTypes.DATEONLY,
      defaultValue: DataTypes.NOW,
    },
    status: {
      type: DataTypes.ENUM('DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED'),
      defaultValue: 'DRAFT',
    },
    totalQuantity: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'stock_transfers',
    timestamps: true,
  }
);

module.exports = StockTransfer;
