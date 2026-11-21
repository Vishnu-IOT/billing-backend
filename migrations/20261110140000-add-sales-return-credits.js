'use strict';

const getTables = async (queryInterface) =>
  new Set(
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
    let tables = await getTables(queryInterface);

    if (!tables.has('sales_return_credits')) {
      await queryInterface.createTable('sales_return_credits', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        saleId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'sales', key: 'id' },
          onDelete: 'CASCADE',
        },
        code: { type: Sequelize.STRING(36), allowNull: false, unique: true },
        totalAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        remainingAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        idempotencyKey: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        requestHash: { type: Sequelize.STRING(64), allowNull: false },
        reason: { type: Sequelize.STRING(255), allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    tables = await getTables(queryInterface);
    if (!tables.has('sales_return_credit_redemptions')) {
      await queryInterface.createTable('sales_return_credit_redemptions', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        creditId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'sales_return_credits', key: 'id' },
          onDelete: 'CASCADE',
        },
        saleId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: 'sales', key: 'id' },
          onDelete: 'CASCADE',
        },
        amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    tables = await getTables(queryInterface);
    if (tables.has('sales')) {
      await addColumnIfMissing(queryInterface, 'sales', 'returnCreditAmount', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (tables.has('sales_items') && tables.has('product_batches')) {
      await addColumnIfMissing(queryInterface, 'sales_items', 'productBatchId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'product_batches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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
      if (tables.has('product_batches')) {
        await addColumnIfMissing(queryInterface, 'sales_returns', 'productBatchId', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'product_batches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        });
      } else {
        await addColumnIfMissing(queryInterface, 'sales_returns', 'productBatchId', {
          type: Sequelize.INTEGER,
          allowNull: true,
        });
      }
      await addColumnIfMissing(queryInterface, 'sales_returns', 'returnCreditId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'sales_return_credits', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
      await addColumnIfMissing(queryInterface, 'sales_returns', 'returnedAmount', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const tables = await getTables(queryInterface);
    if (tables.has('sales_return_credits')) {
      const [credits] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS count FROM sales_return_credits'
      );
      if (Number(credits[0].count) > 0) {
        throw new Error('Cannot remove sales return credits after credit records have been created');
      }
    }
    if (tables.has('sales_returns')) {
      const columns = await queryInterface.describeTable('sales_returns');
      if (columns.returnCreditId) await queryInterface.removeColumn('sales_returns', 'returnCreditId');
      if (columns.returnedAmount) await queryInterface.removeColumn('sales_returns', 'returnedAmount');
    }
    if (tables.has('sales')) {
      const columns = await queryInterface.describeTable('sales');
      if (columns.returnCreditAmount) await queryInterface.removeColumn('sales', 'returnCreditAmount');
    }
    if (tables.has('sales_return_credit_redemptions')) {
      await queryInterface.dropTable('sales_return_credit_redemptions');
    }
    if (tables.has('sales_return_credits')) {
      await queryInterface.dropTable('sales_return_credits');
    }
  },
};
