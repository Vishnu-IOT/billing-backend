const { DataTypes } = require("sequelize");
const sequelize = require("../config/sqldb");

const Party = sequelize.define(
  "Party",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: "Please add a name"
        }
      }
    },

    GST: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: "Please add a GST"
        }
      }
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: {
          msg: "Please add a valid email"
        },
        notEmpty: {
          msg: "Please add an email"
        }
      }
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: "Please add a phone number"
        }
      }
    },

    address: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: "Please add an address"
        }
      }
    }
  },
  {
    timestamps: true,
    tableName: "parties"
  }
);

module.exports = Party;