const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const ProductBatch = sequelize.define(
  'ProductBatch',
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
    batchNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mfgDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    quantity: {
      type: DataTypes.DECIMAL(15, 3),
      defaultValue: 0,
      get() {
        const value = this.getDataValue('quantity');
        return value === null || value === undefined ? value : Number(value);
      },
    },
    freeQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      defaultValue: 0,
      get() {
        const value = this.getDataValue('freeQuantity');
        return value === null || value === undefined ? value : Number(value);
      },
    },
    totalReceivedQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      defaultValue: 0,
      get() {
        const value = this.getDataValue('totalReceivedQuantity');
        return value === null || value === undefined ? value : Number(value);
      },
    },
    availableQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      defaultValue: 0,
      get() {
        const value = this.getDataValue('availableQuantity');
        return value === null || value === undefined ? value : Number(value);
      },
    },
    mrp: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    salePrice: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    purchasePrice: {
      type: DataTypes.DECIMAL(12, 4),
      defaultValue: 0.00,
    },
    inventoryUnitCost: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: true,
    },
    discount: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
    },
    gstPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'product_batches',
    timestamps: true,
    hooks: {
      beforeValidate(batch) {
        if (batch && batch.availableQuantity !== undefined && batch.quantity === undefined) {
          batch.quantity = batch.availableQuantity;
        }
        if (batch && batch.quantity !== undefined && batch.availableQuantity === undefined) {
          batch.availableQuantity = batch.quantity;
        }
        if (batch && batch.totalReceivedQuantity === undefined && batch.freeQuantity !== undefined) {
          batch.totalReceivedQuantity = Number(batch.quantity || 0) + Number(batch.freeQuantity || 0);
        }
      },
    },
  }
);

module.exports = ProductBatch;
