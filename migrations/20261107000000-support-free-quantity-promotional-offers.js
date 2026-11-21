'use strict';

const hasColumn = (columns, name) => Object.keys(columns).some((key) => key.toLowerCase() === name.toLowerCase());

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        String(typeof table === 'string' ? table : table.tableName).toLowerCase()
      )
    );

    if (tables.has('product_batches')) {
      const productBatchColumns = await queryInterface.describeTable('product_batches');
      if (!hasColumn(productBatchColumns, 'freeQuantity')) {
        await queryInterface.addColumn('product_batches', 'freeQuantity', {
          type: Sequelize.DECIMAL(15, 3),
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!hasColumn(productBatchColumns, 'totalReceivedQuantity')) {
        await queryInterface.addColumn('product_batches', 'totalReceivedQuantity', {
          type: Sequelize.DECIMAL(15, 3),
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!hasColumn(productBatchColumns, 'availableQuantity')) {
        await queryInterface.addColumn('product_batches', 'availableQuantity', {
          type: Sequelize.DECIMAL(15, 3),
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!hasColumn(productBatchColumns, 'discount')) {
        await queryInterface.addColumn('product_batches', 'discount', {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!hasColumn(productBatchColumns, 'gstPercentage')) {
        await queryInterface.addColumn('product_batches', 'gstPercentage', {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0,
        });
      }
    }

    if (tables.has('purchase_items')) {
      const purchaseColumns = await queryInterface.describeTable('purchase_items');
      if (!hasColumn(purchaseColumns, 'paidQuantity')) {
        await queryInterface.addColumn('purchase_items', 'paidQuantity', {
          type: Sequelize.DECIMAL(15, 3),
          allowNull: true,
          defaultValue: null,
        });
      }
      if (!hasColumn(purchaseColumns, 'freeQuantity')) {
        await queryInterface.addColumn('purchase_items', 'freeQuantity', {
          type: Sequelize.DECIMAL(15, 3),
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!hasColumn(purchaseColumns, 'totalQuantity')) {
        await queryInterface.addColumn('purchase_items', 'totalQuantity', {
          type: Sequelize.DECIMAL(15, 3),
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!hasColumn(purchaseColumns, 'productBatchId')) {
        await queryInterface.addColumn('purchase_items', 'productBatchId', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'product_batches', key: 'id' },
        });
      }
    }

    if (tables.has('sales_items')) {
      const salesColumns = await queryInterface.describeTable('sales_items');
      if (!hasColumn(salesColumns, 'paidQuantity')) {
        await queryInterface.addColumn('sales_items', 'paidQuantity', {
          type: Sequelize.DECIMAL(15, 3),
          allowNull: true,
          defaultValue: null,
        });
      }
      if (!hasColumn(salesColumns, 'freeQuantity')) {
        await queryInterface.addColumn('sales_items', 'freeQuantity', {
          type: Sequelize.DECIMAL(15, 3),
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!hasColumn(salesColumns, 'totalQuantity')) {
        await queryInterface.addColumn('sales_items', 'totalQuantity', {
          type: Sequelize.DECIMAL(15, 3),
          allowNull: false,
          defaultValue: 0,
        });
      }
      if (!hasColumn(salesColumns, 'offerId')) {
        await queryInterface.addColumn('sales_items', 'offerId', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'promotional_offers', key: 'id' },
        });
      }
      if (!hasColumn(salesColumns, 'offerName')) {
        await queryInterface.addColumn('sales_items', 'offerName', {
          type: Sequelize.STRING(255),
          allowNull: true,
        });
      }
      if (!hasColumn(salesColumns, 'productBatchId')) {
        await queryInterface.addColumn('sales_items', 'productBatchId', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'product_batches', key: 'id' },
        });
      }
    }

    if (!tables.has('promotional_offers')) {
      await queryInterface.createTable('promotional_offers', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        name: { type: Sequelize.STRING(255), allowNull: false },
        offerType: {
          type: Sequelize.ENUM('BUY_X_GET_Y_FREE', 'BUY_X_GET_Y_FREE_FIXED', 'BUY_N_GET_M_FREE'),
          allowNull: false,
          defaultValue: 'BUY_X_GET_Y_FREE',
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
        buyQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 1 },
        freeQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
        startDate: { type: Sequelize.DATE, allowNull: true },
        endDate: { type: Sequelize.DATE, allowNull: true },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        String(typeof table === 'string' ? table : table.tableName).toLowerCase()
      )
    );

    if (tables.has('promotional_offers')) {
      await queryInterface.dropTable('promotional_offers');
    }

    if (tables.has('sales_items')) {
      const salesColumns = await queryInterface.describeTable('sales_items');
      if (hasColumn(salesColumns, 'productBatchId')) await queryInterface.removeColumn('sales_items', 'productBatchId');
      if (hasColumn(salesColumns, 'offerName')) await queryInterface.removeColumn('sales_items', 'offerName');
      if (hasColumn(salesColumns, 'offerId')) await queryInterface.removeColumn('sales_items', 'offerId');
      if (hasColumn(salesColumns, 'totalQuantity')) await queryInterface.removeColumn('sales_items', 'totalQuantity');
      if (hasColumn(salesColumns, 'freeQuantity')) await queryInterface.removeColumn('sales_items', 'freeQuantity');
      if (hasColumn(salesColumns, 'paidQuantity')) await queryInterface.removeColumn('sales_items', 'paidQuantity');
    }

    if (tables.has('purchase_items')) {
      const purchaseColumns = await queryInterface.describeTable('purchase_items');
      if (hasColumn(purchaseColumns, 'productBatchId')) await queryInterface.removeColumn('purchase_items', 'productBatchId');
      if (hasColumn(purchaseColumns, 'totalQuantity')) await queryInterface.removeColumn('purchase_items', 'totalQuantity');
      if (hasColumn(purchaseColumns, 'freeQuantity')) await queryInterface.removeColumn('purchase_items', 'freeQuantity');
      if (hasColumn(purchaseColumns, 'paidQuantity')) await queryInterface.removeColumn('purchase_items', 'paidQuantity');
    }

    if (tables.has('product_batches')) {
      const batchColumns = await queryInterface.describeTable('product_batches');
      if (hasColumn(batchColumns, 'gstPercentage')) await queryInterface.removeColumn('product_batches', 'gstPercentage');
      if (hasColumn(batchColumns, 'discount')) await queryInterface.removeColumn('product_batches', 'discount');
      if (hasColumn(batchColumns, 'availableQuantity')) await queryInterface.removeColumn('product_batches', 'availableQuantity');
      if (hasColumn(batchColumns, 'totalReceivedQuantity')) await queryInterface.removeColumn('product_batches', 'totalReceivedQuantity');
      if (hasColumn(batchColumns, 'freeQuantity')) await queryInterface.removeColumn('product_batches', 'freeQuantity');
    }
  },
};
