const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Purchase = sequelize.define(
  'Purchase',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    invoiceNumber: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },

    partyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'parties',
        key: 'id',
      },
    },

    global_discount_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.0,
    },

    global_discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },

    baseRate: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.0,
    },

    tax: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.0,
    },

    totalAmount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.0,
    },

    paymentStatus: {
      type: DataTypes.ENUM('Paid', 'Unpaid', 'Overdue', 'Cancelled'),
      defaultValue: 'Unpaid',
    },

    purchaseDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'purchases',
    timestamps: true,
  }
);

module.exports = Purchase;