const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const StockMovement = sequelize.define(
  'StockMovement',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    warehouseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    batchId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    movementType: {
      type: DataTypes.ENUM('SALE', 'PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'RETURN', 'PURCHASE_RETURN'),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
    },
    quantityUnit: {
      type: DataTypes.ENUM('PCS', 'KG'),
      allowNull: true,
    },
    referenceType: {
      type: DataTypes.STRING,
      allowNull: true, // e.g. 'SalesBill', 'PurchaseBill', 'StockTransfer'
    },
    referenceId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    performedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'stock_movements',
    timestamps: true,
  }
);

module.exports = StockMovement;
