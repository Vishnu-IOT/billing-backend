const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Customer = sequelize.define(
  'Customer',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Please add a name',
        },
      },
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Please add a phone number',
        },
      },
    },

    loyalty_points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Please add a Loyalty Points',
        },
      },
    },
  },
  {
    timestamps: true,
    tableName: 'customers',
  }
);

module.exports = Customer;
