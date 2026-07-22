const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const StockAdjustment = sequelize.define(
  'StockAdjustment',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    adjustmentType: {
      type: DataTypes.ENUM('ADD', 'REMOVE', 'CORRECTION'),
      allowNull: false,
      defaultValue: 'CORRECTION',
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'stock_adjustments',
    timestamps: true,
  }
);

module.exports = StockAdjustment;
