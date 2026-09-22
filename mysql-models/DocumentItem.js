const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const DocumentItem = sequelize.define(
  'DocumentItem',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    documentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 1,
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    tax: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    discountPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
    },
    discountAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    hsnCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sku: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    batchNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    serialNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    expiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  },
  {
    tableName: 'document_items',
    timestamps: true,
  }
);

module.exports = DocumentItem;
