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
      allowNull: false,
      references: {
        model: 'parties',
        key: 'id',
      },
    },

    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    partyNameSnapshot: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    partyGstinSnapshot: {
      type: DataTypes.STRING(15),
      allowNull: true,
    },

    partyRegistrationTypeSnapshot: {
      type: DataTypes.ENUM('REGISTERED', 'UNREGISTERED'),
      allowNull: true,
    },

    placeOfSupplyStateCodeSnapshot: {
      type: DataTypes.STRING(2),
      allowNull: true,
    },

    placeOfSupplyNameSnapshot: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },

    invoiceType: {
      type: DataTypes.ENUM('GST_INVOICE', 'BILL_OF_SUPPLY', 'NON_GST_INVOICE'),
      allowNull: true,
    },

    taxType: {
      type: DataTypes.ENUM('CGST_SGST', 'IGST'),
      allowNull: true,
    },

    reverseCharge: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    reverseChargeAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },

    itcEligible: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    itcEligibleAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },

    itcIneligibleAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
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
      type: DataTypes.ENUM('Paid', 'Unpaid', 'Partial', 'Overdue', 'Cancelled'),
      defaultValue: 'Unpaid',
    },

    amountPaid: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },

    purchaseDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    warehouseId: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
  },
  {
    tableName: 'purchases',
    timestamps: true,
  }
);

module.exports = Purchase;