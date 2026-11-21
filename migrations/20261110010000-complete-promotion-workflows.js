'use strict';

const tableNames = async (queryInterface) => new Set(
  (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === 'string' ? table : table.tableName).toLowerCase()
  )
);

const addColumnIfMissing = async (queryInterface, table, column, definition) => {
  const columns = await queryInterface.describeTable(table);
  if (!Object.keys(columns).some((name) => name.toLowerCase() === column.toLowerCase())) {
    await queryInterface.addColumn(table, column, definition);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    let tables = await tableNames(queryInterface);

    if (tables.has('promotional_offers')) {
      for (const [column, definition] of Object.entries({
        giftQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 1 },
        discountPercentage: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        discountAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      })) {
        await addColumnIfMissing(queryInterface, 'promotional_offers', column, definition);
      }
    }

    if (tables.has('promotional_campaigns')) {
      await addColumnIfMissing(queryInterface, 'promotional_campaigns', 'description', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (tables.has('campaign_products')) {
      for (const [column, definition] of Object.entries({
        giftQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 1 },
        discountPercentage: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        discountAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      })) {
        await addColumnIfMissing(queryInterface, 'campaign_products', column, definition);
      }
    }

    tables = await tableNames(queryInterface);
    if (!tables.has('promotion_applications')) {
      await queryInterface.createTable('promotion_applications', {
        id: { type: Sequelize.STRING(36), primaryKey: true },
        saleId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'sales', key: 'id' },
          onDelete: 'CASCADE',
        },
        offerId: { type: Sequelize.INTEGER, allowNull: true },
        campaignId: { type: Sequelize.INTEGER, allowNull: true },
        campaignProductId: { type: Sequelize.INTEGER, allowNull: true },
        promotionName: { type: Sequelize.STRING(255), allowNull: false },
        promotionType: { type: Sequelize.STRING(40), allowNull: false },
        promotionSource: {
          type: Sequelize.ENUM('REGULAR', 'CAMPAIGN'),
          allowNull: false,
        },
        qualifyingProductId: { type: Sequelize.INTEGER, allowNull: false },
        giftProductId: { type: Sequelize.INTEGER, allowNull: true },
        paidQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
        freeQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
        discountAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        appliedAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        qualifyingSalesItemId: { type: Sequelize.INTEGER, allowNull: true },
        giftSalesItemId: { type: Sequelize.INTEGER, allowNull: true },
        snapshot: { type: Sequelize.JSON, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex('promotion_applications', ['saleId'], {
        name: 'promotion_applications_sale_idx',
      });
      await queryInterface.addIndex('promotion_applications', ['offerId'], {
        name: 'promotion_applications_offer_idx',
      });
      await queryInterface.addIndex('promotion_applications', ['campaignId'], {
        name: 'promotion_applications_campaign_idx',
      });
    }
  },

  async down(queryInterface) {
    const tables = await tableNames(queryInterface);
    if (tables.has('promotion_applications')) {
      await queryInterface.dropTable('promotion_applications');
    }
  },
};
