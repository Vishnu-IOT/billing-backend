const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const EWayBill = sequelize.define(
  'EWayBill',
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
    ewbNo: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    ewbDate: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    validUpto: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    transporterId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    transporterName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    distance: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    vehicleNo: {
      type: DataTypes.STRING,
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
    tableName: 'ewaybills',
    timestamps: true,
  }
);

module.exports = EWayBill;
