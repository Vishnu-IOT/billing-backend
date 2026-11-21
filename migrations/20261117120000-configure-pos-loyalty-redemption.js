'use strict';

const tableNames = async (queryInterface) =>
  new Set(
    (await queryInterface.showAllTables()).map((table) =>
      String(typeof table === 'string' ? table : table.tableName).toLowerCase()
    )
  );

module.exports = {
  async up(queryInterface, Sequelize) {
    let tables = await tableNames(queryInterface);
    if (!tables.has('pos_sale_idempotencies')) {
      await queryInterface.createTable('pos_sale_idempotencies', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        idempotencyKey: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        requestHash: { type: Sequelize.STRING(64), allowNull: false },
        response: { type: Sequelize.TEXT, allowNull: true },
        saleId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: 'sales', key: 'id' },
          onDelete: 'RESTRICT',
        },
        companyId: { type: Sequelize.INTEGER, allowNull: false },
        userId: { type: Sequelize.INTEGER, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }
    if (tables.has('app_settings')) {
      const settingsColumns = await queryInterface.describeTable('app_settings');
      const addSettingsColumn = async (name, definition) => {
        if (!settingsColumns[name]) {
          await queryInterface.addColumn('app_settings', name, definition);
        }
      };
      await addSettingsColumn('loyaltyRedemptionEnabled', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
      });
      await addSettingsColumn('loyaltyRedemptionAmountPerPoint', {
        type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 1,
      });
      await addSettingsColumn('loyaltyMinimumRedemptionPoints', {
        type: Sequelize.INTEGER, allowNull: false, defaultValue: 1,
      });
      await addSettingsColumn('loyaltyMaxRedemptionPercentage', {
        type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 100,
      });
    }
    if (tables.has('loyalty_redemptions')) {
      const redemptionColumns = await queryInterface.describeTable('loyalty_redemptions');
      if (!redemptionColumns.saleId) {
        await queryInterface.addColumn('loyalty_redemptions', 'saleId', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'sales', key: 'id' },
          onDelete: 'RESTRICT',
        });
      }
      if (!redemptionColumns.pointsReversed) {
        await queryInterface.addColumn('loyalty_redemptions', 'pointsReversed', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        });
      }
      const indexes = await queryInterface.showIndex('loyalty_redemptions');
      if (!indexes.some((index) => index.name === 'loyalty_redemptions_sale_unique')) {
        await queryInterface.addIndex('loyalty_redemptions', ['saleId'], {
          unique: true,
          name: 'loyalty_redemptions_sale_unique',
        });
      }
    }
    if (tables.has('loyalty_transactions')) {
      const transactionColumns = await queryInterface.describeTable('loyalty_transactions');
      if (!transactionColumns.previousBalance) {
        await queryInterface.addColumn('loyalty_transactions', 'previousBalance', {
          type: Sequelize.INTEGER,
          allowNull: true,
        });
      }
      if (!transactionColumns.monetaryValue) {
        await queryInterface.addColumn('loyalty_transactions', 'monetaryValue', {
          type: Sequelize.DECIMAL(12, 2),
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = await tableNames(queryInterface);
    if (tables.has('loyalty_redemptions')) {
      const indexes = await queryInterface.showIndex('loyalty_redemptions');
      if (indexes.some((index) => index.name === 'loyalty_redemptions_sale_unique')) {
        await queryInterface.removeIndex(
          'loyalty_redemptions',
          'loyalty_redemptions_sale_unique'
        );
      }
      const columns = await queryInterface.describeTable('loyalty_redemptions');
      if (columns.pointsReversed) {
        await queryInterface.removeColumn('loyalty_redemptions', 'pointsReversed');
      }
      if (columns.saleId) {
        await queryInterface.removeColumn('loyalty_redemptions', 'saleId');
      }
    }
    if (tables.has('app_settings')) {
      const columns = await queryInterface.describeTable('app_settings');
      for (const column of [
        'loyaltyMaxRedemptionPercentage',
        'loyaltyMinimumRedemptionPoints',
        'loyaltyRedemptionAmountPerPoint',
        'loyaltyRedemptionEnabled',
      ]) {
        if (columns[column]) await queryInterface.removeColumn('app_settings', column);
      }
    }
    if (tables.has('loyalty_transactions')) {
      const columns = await queryInterface.describeTable('loyalty_transactions');
      if (columns.monetaryValue) {
        await queryInterface.removeColumn('loyalty_transactions', 'monetaryValue');
      }
      if (columns.previousBalance) {
        await queryInterface.removeColumn('loyalty_transactions', 'previousBalance');
      }
    }
    if (tables.has('pos_sale_idempotencies')) {
      await queryInterface.dropTable('pos_sale_idempotencies');
    }
  },
};
