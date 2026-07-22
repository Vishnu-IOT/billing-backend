const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Document = sequelize.define(
  'Document',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    documentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    documentNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    validUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    partyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    subTotal: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    taxAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    discount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'draft',
    },
    convertedInvoiceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    terms: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'documents',
    timestamps: true,
  }
);

module.exports = Document;
