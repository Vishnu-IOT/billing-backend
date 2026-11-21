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

    taxTypeSnapshot: {
      type: DataTypes.ENUM('CGST_SGST', 'IGST'),
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

    reverseCharge: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
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

    roundOff: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },

    returnCreditAmount: {
      type: DataTypes.DECIMAL(12, 2),
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

    bill_type: {
      type: DataTypes.ENUM('B2C', 'B2B'),
      allowNull: false,
      defaultValue: 'B2C',
    },

    taxDocumentType: {
      type: DataTypes.ENUM(
        'RETAIL_INVOICE',
        'SALES_RECEIPT_GST_PENDING',
        'GST_TAX_INVOICE',
      ),
      allowNull: false,
      defaultValue: 'RETAIL_INVOICE',
    },

    shiftId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'pos_shifts',
        key: 'id',
      },
    },

    paymentDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    saleDate: {
      type: DataTypes.DATEONLY,
      defaultValue: DataTypes.NOW,
    },

    warehouseId: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },

  },
  {
    tableName: 'sales',
    timestamps: true,
  }
);

module.exports = Sale;