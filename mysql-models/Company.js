const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const Company = sequelize.define(
  'Company',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    slug: {
      type: DataTypes.STRING(80),
      unique: true,
      allowNull: true,
    },

    legal_name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },

    display_name: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },

    email: {
      type: DataTypes.STRING(120),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: {
          msg: 'Invalid email format',
        },
      },
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: {
          msg: 'Please add a phone number',
        },
      },
    },

    business_type: {
      type: DataTypes.ENUM('Retail', 'Wholesale', 'Service', 'Manufacturing'),
      defaultValue: 'Wholesale',
    },

    industry: {
      type: DataTypes.STRING(80),
    },

    website: {
      type: DataTypes.STRING(255),
      validate: {
        isUrl: true,
      },
    },

    address_line1: {
      type: DataTypes.STRING(255),
    },

    address_line2: {
      type: DataTypes.STRING(255),
    },

    city: {
      type: DataTypes.STRING(80),
    },

    state_code: {
      type: DataTypes.STRING(2),
    },

    pincode: {
      type: DataTypes.STRING(20),
    },

    country_code: {
      type: DataTypes.STRING(2),
    },

    logo_url: {
      type: DataTypes.TEXT,
    },

    brand_color: {
      type: DataTypes.STRING(7),
      validate: {
        is: /^#([0-9A-Fa-f]{6})$/, // HEX color validation
      },
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'companies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = Company;
