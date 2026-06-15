const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const InvoiceSettings = sequelize.define(
  'InvoiceSettings',
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

    invoice_prefix: {
      type: DataTypes.STRING(20),
    },

    next_sequence_no: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },

    date_format: {
      type: DataTypes.STRING(20),
    },

    due_days: {
      type: DataTypes.SMALLINT,
    },

    footer_text: {
      type: DataTypes.TEXT,
    },

    auto_send_on_create: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    send_receipt_email: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    attach_pdf: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'invoice_settings',
    timestamps: false, // only updated_at exists
  }
);

module.exports = InvoiceSettings;
