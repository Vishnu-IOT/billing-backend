const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Account = sequelize.define(
  'Account',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    accountCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    accountType: {
      type: DataTypes.ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'),
      allowNull: false,
    },
    parentAccountId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    currentBalance: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'accounts',
    timestamps: true,
  }
);

module.exports = Account;
