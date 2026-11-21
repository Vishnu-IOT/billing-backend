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
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
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
      allowNull: true,
    },
    gstRegistrationType: {
      type: DataTypes.ENUM('REGISTERED', 'UNREGISTERED'),
      allowNull: false,
      defaultValue: 'UNREGISTERED',
    },

    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        isEmailIfPresent(value) {
          if (value === null || value === undefined || String(value).trim() === "") {
            return;
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())) {
            throw new Error("Please add a valid email");
          }
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