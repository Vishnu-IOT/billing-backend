const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const PromotionalOffer = sequelize.define(
  'PromotionalOffer',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    offerType: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'BUY_X_GET_Y_FREE',
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'products',
        key: 'id',
      },
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'categories',
        key: 'id',
      },
    },
    buyQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
      defaultValue: 1,
    },
    giftQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
      defaultValue: 1,
    },
    freeQuantity: {
      type: DataTypes.DECIMAL(15, 3),
      allowNull: false,
      defaultValue: 0,
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
    discountValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    specialPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    giftProductId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'products', key: 'id' },
      onDelete: 'SET NULL',
    },
    eligibleBillType: {
      type: DataTypes.ENUM('BOTH', 'B2C', 'B2B'),
      allowNull: false,
      defaultValue: 'BOTH',
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'promotional_offers',
    timestamps: true,
  }
);

module.exports = PromotionalOffer;
