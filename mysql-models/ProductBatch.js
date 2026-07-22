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
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
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
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'product_batches',
    timestamps: true,
  }
);

module.exports = ProductBatch;
