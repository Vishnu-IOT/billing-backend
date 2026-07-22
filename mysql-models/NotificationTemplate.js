const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const NotificationTemplate = sequelize.define(
  'NotificationTemplate',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    channel: {
      type: DataTypes.ENUM('whatsapp', 'sms', 'email'),
      allowNull: false,
    },
    event: {
      type: DataTypes.ENUM('invoice', 'overdue'),
      allowNull: false,
    },
    templateText: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'notification_templates',
    timestamps: true,
  }
);

module.exports = NotificationTemplate;
