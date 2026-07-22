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
  },
  {
    tableName: 'document_items',
    timestamps: true,
  }
);

module.exports = DocumentItem;
