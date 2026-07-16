const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const PurchaseItem = sequelize.define(
  'PurchaseItem',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    purchaseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'purchases',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },

    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id',
      },
    },

    productName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    discountPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },

    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    baseRate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    taxPercentage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    taxAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    netRate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    sku: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    batchNo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    serialNo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    expiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    hsncode: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'purchase_items',
    timestamps: true,
  }
);

module.exports = PurchaseItem;