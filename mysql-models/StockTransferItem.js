const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const StockTransferItem = sequelize.define(
  'StockTransferItem',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    stockTransferId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantitySent: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    quantityReceived: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
  },
  {
    tableName: 'stock_transfer_items',
    timestamps: true,
  }
);

module.exports = StockTransferItem;
