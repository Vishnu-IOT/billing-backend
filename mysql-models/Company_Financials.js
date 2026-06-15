const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

  const CompanyFinancials = sequelize.define(
    'CompanyFinancials',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'companies',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      gstin: {
        type: DataTypes.STRING(15),
        unique: true,
        allowNull: true,
      },

      pan: {
        type: DataTypes.STRING(10),
        unique: true,
        allowNull: true,
      },

      tan: {
        type: DataTypes.STRING(10),
      },

      cin: {
        type: DataTypes.STRING(21),
      },

      bank_name: {
        type: DataTypes.STRING(100),
      },

      bank_account_enc: {
        type: DataTypes.TEXT,
      },

      ifsc_code: {
        type: DataTypes.STRING(11),
        validate: {
          is: /^[A-Z]{4}0[A-Z0-9]{6}$/, // IFSC validation (India)
        },
      },

      account_type: {
        type: DataTypes.ENUM('Savings', 'Current', 'Salary', 'Other'),
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
      tableName: 'company_financials',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

module.exports = CompanyFinancials;
