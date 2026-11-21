'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('loyalty_gifts', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      pointsRequired: { type: Sequelize.INTEGER, allowNull: false },
      rewardType: {
        type: Sequelize.ENUM('CASH_DISCOUNT', 'PRODUCT', 'SERVICE', 'OTHER'),
        allowNull: false,
        defaultValue: 'OTHER',
      },
      rewardValue: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable('loyalty_redemptions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      customerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'RESTRICT',
      },
      pointsRedeemed: { type: Sequelize.INTEGER, allowNull: false },
      redemptionMethod: {
        type: Sequelize.ENUM('GIFT', 'MANUAL'),
        allowNull: false,
      },
      giftId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'loyalty_gifts', key: 'id' },
        onDelete: 'RESTRICT',
      },
      rewardType: {
        type: Sequelize.ENUM('CASH_DISCOUNT', 'PRODUCT', 'SERVICE', 'OTHER'),
        allowNull: true,
      },
      rewardDescription: { type: Sequelize.TEXT, allowNull: false },
      rewardValue: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      reason: { type: Sequelize.TEXT, allowNull: true },
      performedBy: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.ENUM('COMPLETED', 'REVERSED'),
        allowNull: false,
        defaultValue: 'COMPLETED',
      },
      idempotencyKey: { type: Sequelize.STRING(100), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex(
      'loyalty_redemptions',
      ['customerId', 'idempotencyKey'],
      {
        unique: true,
        name: 'loyalty_redemptions_customer_idempotency_unique',
      }
    );

    await queryInterface.createTable('loyalty_transactions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      customerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'RESTRICT',
      },
      transactionType: {
        type: Sequelize.ENUM('EARN', 'REDEEM', 'ADJUSTMENT', 'REVERSAL'),
        allowNull: false,
      },
      pointsDelta: { type: Sequelize.INTEGER, allowNull: false },
      balanceAfter: { type: Sequelize.INTEGER, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      rewardType: {
        type: Sequelize.ENUM('CASH_DISCOUNT', 'PRODUCT', 'SERVICE', 'OTHER'),
        allowNull: true,
      },
      redemptionId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'loyalty_redemptions', key: 'id' },
        onDelete: 'RESTRICT',
      },
      saleId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'sales', key: 'id' },
        onDelete: 'SET NULL',
      },
      performedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      idempotencyKey: { type: Sequelize.STRING(100), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex(
      'loyalty_transactions',
      ['customerId', 'createdAt'],
      { name: 'loyalty_transactions_customer_created_idx' }
    );
    await queryInterface.addIndex(
      'loyalty_transactions',
      ['customerId', 'idempotencyKey'],
      {
        unique: true,
        name: 'loyalty_transactions_customer_idempotency_unique',
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('loyalty_transactions');
    await queryInterface.dropTable('loyalty_redemptions');
    await queryInterface.dropTable('loyalty_gifts');
  },
};
