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
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
      get() {
        const value = this.getDataValue('quantity');
        return value === null || value === undefined ? value : Number(value);
      },
    },

    paidQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: true,
      defaultValue: null,
      get() {
        const value = this.getDataValue('paidQuantity');
        return value === null || value === undefined ? this.quantity : Number(value);
      },
    },

    freeQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
      defaultValue: 0,
      get() {
        const value = this.getDataValue('freeQuantity');
        return value === null || value === undefined ? 0 : Number(value);
      },
    },

    totalQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
      defaultValue: 0,
      get() {
        const value = this.getDataValue('totalQuantity');
        return value === null || value === undefined ? (Number(this.quantity || 0) + Number(this.freeQuantity || 0)) : Number(value);
      },
    },

    quantityUnit: {
      type: DataTypes.ENUM('PCS', 'KG'),
      allowNull: false,
      defaultValue: 'PCS',
    },

    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    priceType: {
      type: DataTypes.ENUM('WITH_GST', 'WITHOUT_GST'),
      allowNull: true,
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

    productGstRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },

    cgstRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },

    cgstAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    sgstRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },

    sgstAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    igstRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },

    igstAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    cessAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
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

    productBatchId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'product_batches',
        key: 'id',
      },
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