const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Sale = sequelize.define(
  'Sale',
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

    po_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    eway_bill: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    partyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'parties',
        key: 'id',
      },
    },

    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'customers',
        key: 'id',
      },
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
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
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },

    tax: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },

    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },

    paymentStatus: {
      type: DataTypes.ENUM('Paid', 'Unpaid', 'Overdue', 'Cancelled'),
      defaultValue: 'Unpaid',
    },

    bill_type: {
      type: DataTypes.ENUM('B2C', 'B2B'),
      allowNull: false,
      defaultValue: 'B2C',
    },

    saleDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'sales',
    timestamps: true,
  }
);

module.exports = Sale;
