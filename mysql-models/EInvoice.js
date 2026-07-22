const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const EInvoice = sequelize.define(
  'EInvoice',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    billType: {
      type: DataTypes.STRING,
      defaultValue: 'SALE',
    },
    irn: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    ackNo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ackDate: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    qrCode: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('GENERATED', 'CANCELLED'),
      defaultValue: 'GENERATED',
    },
    cancelReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cancelDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'einvoices',
    timestamps: true,
  }
);

module.exports = EInvoice;
