'use strict';

const PURCHASE_RETURN_PERMISSIONS = [
  ['view', 'View Purchase Returns'],
  ['create', 'Create Purchase Returns'],
  ['cancel', 'Cancel Purchase Returns'],
  ['print', 'Print Purchase Returns'],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        String(typeof table === 'string' ? table : table.tableName).toLowerCase()
      )
    );

    if (!tables.has('purchase_returns')) {
      await queryInterface.createTable('purchase_returns', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        returnNumber: { type: Sequelize.STRING(40), allowNull: true, unique: true },
        companyId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'companies', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        supplierId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'parties', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        purchaseId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'purchases', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        returnDate: { type: Sequelize.DATEONLY, allowNull: false },
        subtotal: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        discountAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        cgstAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        sgstAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        igstAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        totalTax: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        grandTotal: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        appliedToPayable: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        supplierCreditAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        reason: { type: Sequelize.STRING(255), allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        status: { type: Sequelize.ENUM('ACTIVE', 'CANCELLED'), allowNull: false, defaultValue: 'ACTIVE' },
        idempotencyKey: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        requestHash: { type: Sequelize.STRING(64), allowNull: false },
        createdBy: { type: Sequelize.INTEGER, allowNull: true },
        updatedBy: { type: Sequelize.INTEGER, allowNull: true },
        cancelledBy: { type: Sequelize.INTEGER, allowNull: true },
        cancelledAt: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    const currentTables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        String(typeof table === 'string' ? table : table.tableName).toLowerCase()
      )
    );
    if (!currentTables.has('purchase_return_items')) {
      await queryInterface.createTable('purchase_return_items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        purchaseReturnId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'purchase_returns', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        purchaseId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'purchases', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        purchaseItemId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'purchase_items', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        productId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        productBatchId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'product_batches', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        productName: { type: Sequelize.STRING(255), allowNull: false },
        sku: { type: Sequelize.STRING(255), allowNull: true },
        barcode: { type: Sequelize.STRING(255), allowNull: true },
        batchNumber: { type: Sequelize.STRING(255), allowNull: false },
        mrp: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
        quantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false },
        paidQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
        freeQuantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
        quantityUnit: { type: Sequelize.ENUM('PCS', 'KG'), allowNull: false, defaultValue: 'PCS' },
        purchaseRate: { type: Sequelize.DECIMAL(12, 4), allowNull: false },
        priceType: { type: Sequelize.ENUM('WITH_GST', 'WITHOUT_GST'), allowNull: false },
        gstPercentage: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        discountAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        taxableAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        cgstAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        sgstAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        igstAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        totalTax: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        totalAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        mfgDate: { type: Sequelize.DATE, allowNull: true },
        expiryDate: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    const refreshedTables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        String(typeof table === 'string' ? table : table.tableName).toLowerCase()
      )
    );
    if (!refreshedTables.has('purchase_return_credit_applications')) {
      await queryInterface.createTable('purchase_return_credit_applications', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        purchaseReturnId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'purchase_returns', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        purchaseId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'purchases', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        companyId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'companies', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        supplierId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'parties', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        status: { type: Sequelize.ENUM('ACTIVE', 'REVERSED'), allowNull: false, defaultValue: 'ACTIVE' },
        operationKey: { type: Sequelize.STRING(100), allowNull: false },
        idempotencyKey: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        createdBy: { type: Sequelize.INTEGER, allowNull: true },
        reversedBy: { type: Sequelize.INTEGER, allowNull: true },
        reversedAt: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    const purchaseColumns = await queryInterface.describeTable('purchases');
    if (purchaseColumns.companyId) {
      await queryInterface.sequelize.query(`
        UPDATE purchases pu
        JOIN (
          SELECT pi.purchaseId, MIN(pb.companyId) AS companyId
          FROM purchase_items pi
          JOIN product_batches pb ON pb.id = pi.productBatchId
          WHERE pb.companyId IS NOT NULL
          GROUP BY pi.purchaseId
          HAVING COUNT(DISTINCT pb.companyId) = 1
        ) linked ON linked.purchaseId = pu.id
        SET pu.companyId = linked.companyId
        WHERE pu.companyId IS NULL
      `);
    }

    if (currentTables.has('stock_movements')) {
      const [stockColumns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM stock_movements LIKE 'movementType'"
      );
      if (!String(stockColumns?.[0]?.Type || '').includes('PURCHASE_RETURN')) {
        await queryInterface.sequelize.query(`
          ALTER TABLE stock_movements
          MODIFY COLUMN movementType ENUM(
            'SALE','PURCHASE','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','RETURN','PURCHASE_RETURN'
          ) NOT NULL
        `);
      }
    }

    const addIndexIfMissing = async (table, name, fields) => {
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`,
        { replacements: [name] }
      );
      if (!indexes.length) await queryInterface.addIndex(table, fields, { name });
    };
    await addIndexIfMissing('purchase_returns', 'purchase_returns_company_date_idx', ['companyId', 'returnDate']);
    await addIndexIfMissing('purchase_returns', 'purchase_returns_purchase_idx', ['purchaseId']);
    await addIndexIfMissing('purchase_returns', 'purchase_returns_supplier_idx', ['supplierId']);
    await addIndexIfMissing('purchase_return_items', 'purchase_return_items_purchase_item_idx', ['purchaseItemId']);
    await addIndexIfMissing('purchase_return_items', 'purchase_return_items_batch_idx', ['productBatchId']);
    await addIndexIfMissing('purchase_return_credit_applications', 'purchase_return_credit_source_idx', ['purchaseReturnId']);
    await addIndexIfMissing('purchase_return_credit_applications', 'purchase_return_credit_purchase_idx', ['purchaseId']);
    await addIndexIfMissing('purchase_return_credit_applications', 'purchase_return_credit_supplier_idx', ['companyId', 'supplierId', 'status']);
    await addIndexIfMissing('purchase_return_credit_applications', 'purchase_return_credit_operation_idx', ['operationKey']);

    const permissionColumns = await queryInterface.describeTable('permissions');
    const [existingPermissions] = await queryInterface.sequelize.query(
      "SELECT permissionKey FROM permissions WHERE permissionKey LIKE 'purchases.returns.%'"
    );
    const existingKeys = new Set(existingPermissions.map(({ permissionKey }) => permissionKey));
    const now = new Date();
    const permissionRows = PURCHASE_RETURN_PERMISSIONS
      .filter(([action]) => !existingKeys.has(`purchases.returns.${action}`))
      .map(([action, actionName]) => ({
        module: 'purchases',
        page: 'returns',
        action,
        permissionKey: `purchases.returns.${action}`,
        description: `${actionName} Purchase Returns`,
        createdAt: now,
        updatedAt: now,
      }));
    if (permissionRows.length) await queryInterface.bulkInsert('permissions', permissionRows);
    if (!permissionColumns.permissionKey) {
      throw new Error('The permissions table does not have a permissionKey column');
    }
  },

  async down(queryInterface) {
    const [countRows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS count FROM purchase_returns'
    );
    if (Number(countRows[0]?.count || 0) > 0) {
      throw new Error('Cannot remove purchase returns after return records have been created');
    }

    await queryInterface.bulkDelete('permissions', {
      permissionKey: PURCHASE_RETURN_PERMISSIONS.map(
        ([action]) => `purchases.returns.${action}`
      ),
    });
    await queryInterface.dropTable('purchase_return_items');
    await queryInterface.dropTable('purchase_return_credit_applications');
    await queryInterface.dropTable('purchase_returns');
    const [stockColumns] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM stock_movements LIKE 'movementType'"
    );
    if (String(stockColumns?.[0]?.Type || '').includes('PURCHASE_RETURN')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE stock_movements
        MODIFY COLUMN movementType ENUM(
          'SALE','PURCHASE','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','RETURN'
        ) NOT NULL
      `);
    }
  },
};
