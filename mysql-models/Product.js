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

    unbatchedAverageCost: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: true,
    },

    purchasePriceType: {
      type: DataTypes.ENUM('WITH_GST', 'WITHOUT_GST'),
      allowNull: false,
      defaultValue: 'WITHOUT_GST',
    },

    sellingPriceType: {
      type: DataTypes.ENUM('WITH_GST', 'WITHOUT_GST'),
      allowNull: false,
      defaultValue: 'WITHOUT_GST',
    },

    profitMargin: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      defaultValue: null,
    },

    discount: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    stockQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      defaultValue: 0,
      get() {
        const value = this.getDataValue('stockQuantity');
        return value === null || value === undefined ? value : Number(value);
      },
    },

    unitType: {
      type: DataTypes.ENUM('PIECE', 'WEIGHT'),
      allowNull: false,
      defaultValue: 'PIECE',
    },

    baseUnit: {
      type: DataTypes.ENUM('PCS', 'KG'),
      allowNull: false,
      defaultValue: 'PCS',
    },

    allowDecimalQuantity: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    unit: {
      type: DataTypes.STRING(20),
      defaultValue: 'pcs',
    },

    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'categories',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },

    sku: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    batchNo: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    serialNo: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    expiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    minStockLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
    },

    reorderLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 10,
    },

    minOrderQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },

    brandId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'products',
    timestamps: true,
  }
);

module.exports = Product;
