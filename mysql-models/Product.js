const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Product = sequelize.define(
  'Product',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    HSNCode: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },

    barcode: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    MRP: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    taxRate: {
      type: DataTypes.ENUM('0', '5', '12', '18', '28'),
      defaultValue: '0',
    },

    salesPrice: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    purchasePrice: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    discount: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    stockQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    unit: {
      type: DataTypes.ENUM(
        'pcs',
        'kg',
        'g',
        'ltr',
        'ml',
        'box',
        'packet',
        'mtr',
        'nos'
      ),
      defaultValue: 'pcs',
    },

    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'categories',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
  },
  {
    tableName: 'products',
    timestamps: true,
  }
);

module.exports = Product;
