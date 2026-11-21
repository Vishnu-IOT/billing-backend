const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');
const User = require('./Users');
const Company = require('./Company');
const POSCounter = require('./POSCounter');

const POSShift = sequelize.define(
  'POSShift',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'companies',
        key: 'id',
      },
    },
    terminalId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    counterId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'pos_counters', key: 'id' },
      onDelete: 'RESTRICT',
    },
    counterNameSnapshot: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    openedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    openingFloat: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    openingDenominations: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const value = this.getDataValue('openingDenominations');
        return value ? JSON.parse(value) : null;
      },
      set(value) {
        this.setDataValue(
          'openingDenominations',
          value == null ? null : JSON.stringify(value)
        );
      },
    },
    closingCashActual: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    closingDenominations: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const value = this.getDataValue('closingDenominations');
        return value ? JSON.parse(value) : null;
      },
      set(value) {
        this.setDataValue(
          'closingDenominations',
          value == null ? null : JSON.stringify(value)
        );
      },
    },
    closingCashExpected: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    cashSalesTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    cashInTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    cashOutTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    cashRefundsTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    cardSalesTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    upiSalesTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    otherSalesTotal: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    totalSalesCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'CLOSED'),
      defaultValue: 'OPEN',
    },
  },
  {
    tableName: 'pos_shifts',
    timestamps: true,
    indexes: [
      {
        name: 'idx_pos_shifts_company_user_status',
        fields: ['companyId', 'userId', 'status'],
      },
      {
        name: 'idx_pos_shifts_company_counter_status',
        fields: ['companyId', 'counterId', 'status'],
      },
    ],
  }
);

POSShift.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});
POSShift.belongsTo(Company, {
  foreignKey: 'companyId',
  as: 'company',
});
POSShift.belongsTo(POSCounter, {
  foreignKey: 'counterId',
  as: 'counter',
});

User.hasMany(POSShift, {
  foreignKey: 'userId',
  as: 'posShifts',
});
POSCounter.hasMany(POSShift, {
  foreignKey: 'counterId',
  as: 'shifts',
});
module.exports = POSShift;
