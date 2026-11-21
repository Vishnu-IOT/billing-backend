'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        String(typeof table === 'string' ? table : table.tableName).toLowerCase()
      )
    );

    await queryInterface.addColumn('products', 'unitType', {
      type: Sequelize.ENUM('PIECE', 'WEIGHT'),
      allowNull: false,
      defaultValue: 'PIECE',
    });
    await queryInterface.addColumn('products', 'baseUnit', {
      type: Sequelize.ENUM('PCS', 'KG'),
      allowNull: false,
      defaultValue: 'PCS',
    });
    await queryInterface.addColumn('products', 'allowDecimalQuantity', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.changeColumn('products', 'stockQuantity', {
      type: Sequelize.DECIMAL(15, 3),
      allowNull: true,
      defaultValue: 0,
    });

    await queryInterface.changeColumn('sales_items', 'quantity', {
      type: Sequelize.DECIMAL(15, 3),
      allowNull: false,
    });
    await queryInterface.addColumn('sales_items', 'quantityUnit', {
      type: Sequelize.ENUM('PCS', 'KG'),
      allowNull: false,
      defaultValue: 'PCS',
    });

    await queryInterface.changeColumn('purchase_items', 'quantity', {
      type: Sequelize.DECIMAL(15, 3),
      allowNull: false,
    });
    await queryInterface.addColumn('purchase_items', 'quantityUnit', {
      type: Sequelize.ENUM('PCS', 'KG'),
      allowNull: false,
      defaultValue: 'PCS',
    });

    if (tables.has('stock_movements')) {
      await queryInterface.changeColumn('stock_movements', 'quantity', {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false,
      });
      await queryInterface.addColumn('stock_movements', 'quantityUnit', {
        type: Sequelize.ENUM('PCS', 'KG'),
        allowNull: true,
      });
    }

    await queryInterface.changeColumn('document_items', 'quantity', {
      type: Sequelize.DECIMAL(15, 3),
      allowNull: true,
      defaultValue: 1,
    });

    if (tables.has('stock_transfers')) {
      await queryInterface.changeColumn('stock_transfers', 'totalQuantity', {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (tables.has('stock_transfer_items')) {
      await queryInterface.changeColumn('stock_transfer_items', 'quantitySent', {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false,
      });
      await queryInterface.changeColumn('stock_transfer_items', 'quantityReceived', {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false,
        defaultValue: 0,
      });
      await queryInterface.addColumn('stock_transfer_items', 'quantityUnit', {
        type: Sequelize.ENUM('PCS', 'KG'),
        allowNull: false,
        defaultValue: 'PCS',
      });
    }

    await queryInterface.createTable('sales_returns', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
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
      quantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false },
      quantityUnit: {
        type: Sequelize.ENUM('PCS', 'KG'),
        allowNull: false,
        defaultValue: 'KG',
      },
      idempotencyKey: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      reason: { type: Sequelize.STRING(255), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('sales_returns', ['saleItemId'], {
      name: 'sales_returns_sale_item_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    const tableList = (await queryInterface.showAllTables()).map((table) =>
      String(typeof table === 'string' ? table : table.tableName).toLowerCase()
    );
    const tables = new Set(tableList);
    const lossChecks = [
      "(SELECT COUNT(*) FROM products WHERE unitType = 'WEIGHT' OR MOD(ABS(stockQuantity), 1) <> 0 OR stockQuantity > 2147483647 OR stockQuantity < -2147483648)",
      "(SELECT COUNT(*) FROM sales_items WHERE quantityUnit = 'KG' OR MOD(ABS(quantity), 1) <> 0 OR quantity > 2147483647 OR quantity < -2147483648)",
      "(SELECT COUNT(*) FROM purchase_items WHERE quantityUnit = 'KG' OR MOD(ABS(quantity), 1) <> 0 OR quantity > 2147483647 OR quantity < -2147483648)",
      "(SELECT COUNT(*) FROM document_items WHERE UPPER(unit) IN ('KG', 'GRAM') OR MOD(ABS(quantity) * 100, 1) <> 0 OR quantity > 99999999.99 OR quantity < -99999999.99)",
    ];
    if (tables.has('sales_returns')) {
      lossChecks.push('(SELECT COUNT(*) FROM sales_returns)');
    }
    if (tables.has('stock_transfer_items')) {
      lossChecks.push(
        "(SELECT COUNT(*) FROM stock_transfer_items WHERE quantityUnit = 'KG' OR MOD(ABS(quantitySent) * 100, 1) <> 0 OR MOD(ABS(quantityReceived) * 100, 1) <> 0 OR quantitySent > 99999999.99 OR quantitySent < -99999999.99 OR quantityReceived > 99999999.99 OR quantityReceived < -99999999.99)"
      );
    }
    if (tables.has('stock_transfers')) {
      lossChecks.push(
        '(SELECT COUNT(*) FROM stock_transfers WHERE MOD(ABS(totalQuantity) * 100, 1) <> 0 OR totalQuantity > 99999999.99 OR totalQuantity < -99999999.99)'
      );
    }
    if (tables.has('stock_movements')) {
      lossChecks.push(
        "(SELECT COUNT(*) FROM stock_movements WHERE quantityUnit = 'KG' OR MOD(ABS(quantity) * 100, 1) <> 0 OR quantity > 99999999.99 OR quantity < -99999999.99)"
      );
    }
    const [fractionalRows] = await queryInterface.sequelize.query(
      `SELECT ${lossChecks.join(' + ')} AS fractionalRows`
    );
    if (Number(fractionalRows[0].fractionalRows) > 0) {
      throw new Error('Cannot roll back weight quantities while fractional stock or transaction quantities exist');
    }

    await queryInterface.dropTable('sales_returns');

    if (tables.has('stock_transfer_items')) {
      await queryInterface.removeColumn('stock_transfer_items', 'quantityUnit');
      await queryInterface.changeColumn('stock_transfer_items', 'quantityReceived', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      });
      await queryInterface.changeColumn('stock_transfer_items', 'quantitySent', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      });
    }
    if (tables.has('stock_transfers')) {
      await queryInterface.changeColumn('stock_transfers', 'totalQuantity', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (tables.has('stock_movements')) {
      await queryInterface.removeColumn('stock_movements', 'quantityUnit');
      await queryInterface.changeColumn('stock_movements', 'quantity', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      });
    }

    await queryInterface.changeColumn('document_items', 'quantity', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 1,
    });

    await queryInterface.removeColumn('purchase_items', 'quantityUnit');
    await queryInterface.changeColumn('purchase_items', 'quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    await queryInterface.removeColumn('sales_items', 'quantityUnit');
    await queryInterface.changeColumn('sales_items', 'quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    await queryInterface.changeColumn('products', 'stockQuantity', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
    });
    await queryInterface.removeColumn('products', 'allowDecimalQuantity');
    await queryInterface.removeColumn('products', 'baseUnit');
    await queryInterface.removeColumn('products', 'unitType');
  },
};
