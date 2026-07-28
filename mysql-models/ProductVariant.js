const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const ProductVariant = sequelize.define(
  'ProductVariant',
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
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    barcode: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    variantName: {
      type: DataTypes.STRING,
      allowNull: false, // e.g. "Red / XL"
    },
    attributes: {
      type: DataTypes.TEXT,
      allowNull: true, // JSON string e.g. {"color": "Red", "size": "XL"}
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    stockQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    tableName: 'product_variants',
    timestamps: true,
  }
);

module.exports = ProductVariant;
