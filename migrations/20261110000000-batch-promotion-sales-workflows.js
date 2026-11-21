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

    if (tables.has('product_batches')) {
      await queryInterface.changeColumn('product_batches', 'quantity', {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false,
        defaultValue: 0,
      });
      await queryInterface.changeColumn('product_batches', 'purchasePrice', {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (tables.has('sales_items')) {
      await addColumnIfMissing(queryInterface, 'sales_items', 'purchaseCost', {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: true,
      });
      await addColumnIfMissing(queryInterface, 'sales_items', 'promotionSource', {
        type: Sequelize.STRING(20),
        allowNull: true,
      });
      await addColumnIfMissing(queryInterface, 'sales_items', 'promotionId', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
      await addColumnIfMissing(queryInterface, 'sales_items', 'promoApplicationId', {
        type: Sequelize.STRING(36),
        allowNull: true,
      });
      await addColumnIfMissing(queryInterface, 'sales_items', 'itemRole', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'QUALIFYING',
      });
    }

    if (tables.has('stock_movements') && tables.has('product_batches')) {
      await addColumnIfMissing(queryInterface, 'stock_movements', 'batchId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'product_batches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (tables.has('sales_returns')) {
      await addColumnIfMissing(queryInterface, 'sales_returns', 'productBatchId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'product_batches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    } else {
      await queryInterface.createTable('sales_returns', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        saleId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'sales', key: 'id' },
          onDelete: 'CASCADE',
        },
        saleItemId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'sales_items', key: 'id' },
          onDelete: 'CASCADE',
        },
        productId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onDelete: 'CASCADE',
        },
        productBatchId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'product_batches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        quantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false },
        quantityUnit: {
          type: Sequelize.ENUM('PCS', 'KG'),
          allowNull: false,
          defaultValue: 'PCS',
        },
        idempotencyKey: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        reason: { type: Sequelize.STRING(255), allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    tables = await tableNames(queryInterface);
    if (tables.has('promotional_offers')) {
      await queryInterface.changeColumn('promotional_offers', 'offerType', {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: 'BUY_X_GET_Y_FREE',
      });
      for (const [column, definition] of Object.entries({
        discountValue: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        specialPrice: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
        giftProductId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'products', key: 'id' },
          onDelete: 'SET NULL',
        },
        eligibleBillType: {
          type: Sequelize.ENUM('BOTH', 'B2C', 'B2B'),
          allowNull: false,
          defaultValue: 'BOTH',
        },
        priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      })) {
        await addColumnIfMissing(queryInterface, 'promotional_offers', column, definition);
      }
    }

    tables = await tableNames(queryInterface);
    if (!tables.has('promotional_campaigns')) {
      await queryInterface.createTable('promotional_campaigns', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING(255), allowNull: false },
        campaignType: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'SEASONAL' },
        startDate: { type: Sequelize.DATE, allowNull: false },
        endDate: { type: Sequelize.DATE, allowNull: false },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        companyId: { type: Sequelize.INTEGER, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex(
        'promotional_campaigns',
        ['isActive', 'startDate', 'endDate', 'priority'],
        { name: 'campaign_active_dates_priority_idx' }
      );
    }

    tables = await tableNames(queryInterface);
    if (!tables.has('campaign_products')) {
      await queryInterface.createTable('campaign_products', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        campaignId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'promotional_campaigns', key: 'id' },
          onDelete: 'CASCADE',
        },
        productId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'products', key: 'id' },
          onDelete: 'CASCADE',
        },
        categoryId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'categories', key: 'id' },
          onDelete: 'CASCADE',
        },
        offerType: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'BUY_X_GET_Y_FREE' },
        buyQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 1 },
        freeQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
        discountValue: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        specialPrice: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
        giftProductId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'products', key: 'id' },
          onDelete: 'SET NULL',
        },
        eligibleBillType: {
          type: Sequelize.ENUM('BOTH', 'B2C', 'B2B'),
          allowNull: false,
          defaultValue: 'BOTH',
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex('campaign_products', ['campaignId', 'productId'], {
        name: 'campaign_products_campaign_product_idx',
      });
      await queryInterface.addIndex('campaign_products', ['categoryId'], {
        name: 'campaign_products_category_idx',
      });
    }
  },

  async down(queryInterface) {
    const tables = await tableNames(queryInterface);
    if (tables.has('campaign_products')) await queryInterface.dropTable('campaign_products');
    if (tables.has('promotional_campaigns')) await queryInterface.dropTable('promotional_campaigns');
  },
};
