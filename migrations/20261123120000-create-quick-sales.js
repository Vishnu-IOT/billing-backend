'use strict';

const { permissionCatalog } = require('../rbac/permissionCatalog');

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const permissions = permissionCatalog.filter(({ module }) => module === 'quick-sales');

    await queryInterface.createTable('quick_sale_aliases', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      name: { type: Sequelize.STRING(255), allowNull: false },
      identityKey: { type: Sequelize.STRING(270), allowNull: false },
      barcode: { type: Sequelize.STRING(255), allowNull: true },
      gstVerificationStatus: {
        type: Sequelize.ENUM('GST_PENDING', 'GST_VERIFIED'),
        allowNull: false,
        defaultValue: 'GST_PENDING',
      },
      verifiedTaxRate: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      verifiedHsnCode: { type: Sequelize.STRING(15), allowNull: true },
      verifiedPriceType: {
        type: Sequelize.ENUM('WITH_GST', 'WITHOUT_GST'),
        allowNull: true,
      },
      mappingStatus: {
        type: Sequelize.ENUM('UNLINKED', 'LINKED'),
        allowNull: false,
        defaultValue: 'UNLINKED',
      },
      linkedProductId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'products', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      reviewStatus: {
        type: Sequelize.ENUM('PENDING', 'REVIEWED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      verifiedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      mappedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      reviewedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      verifiedAt: { type: Sequelize.DATE, allowNull: true },
      mappedAt: { type: Sequelize.DATE, allowNull: true },
      reviewedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('quick_sale_aliases', ['companyId', 'identityKey'], {
      unique: true,
      name: 'quick_sale_aliases_company_identity_unique',
    });
    await queryInterface.addIndex(
      'quick_sale_aliases',
      ['companyId', 'gstVerificationStatus', 'mappingStatus', 'reviewStatus'],
      { name: 'quick_sale_aliases_company_status_idx' },
    );
    await queryInterface.addIndex('quick_sale_aliases', ['linkedProductId'], {
      name: 'quick_sale_aliases_product_idx',
    });

    await queryInterface.createTable('quick_sale_sale_items', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      saleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sales', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      quickSaleAliasId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'quick_sale_aliases', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      productNameSnapshot: { type: Sequelize.STRING(255), allowNull: false },
      barcodeSnapshot: { type: Sequelize.STRING(255), allowNull: true },
      mrp: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      sellingPrice: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      quantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false },
      lineAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      discountAmount: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      netAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      gstVerificationStatus: {
        type: Sequelize.ENUM('GST_PENDING', 'GST_VERIFIED'),
        allowNull: false,
      },
      taxableAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
      taxPercentage: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      taxAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
      cgstAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
      sgstAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
      igstAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
      cessAmount: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
      hsnCodeSnapshot: { type: Sequelize.STRING(15), allowNull: true },
      priceTypeSnapshot: {
        type: Sequelize.ENUM('WITH_GST', 'WITHOUT_GST'),
        allowNull: true,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('quick_sale_sale_items', ['saleId'], {
      name: 'quick_sale_sale_items_sale_idx',
    });
    await queryInterface.addIndex('quick_sale_sale_items', ['quickSaleAliasId'], {
      name: 'quick_sale_sale_items_alias_idx',
    });
    await queryInterface.addIndex(
      'quick_sale_sale_items',
      ['gstVerificationStatus', 'createdAt'],
      { name: 'quick_sale_sale_items_tax_status_idx' },
    );

    await queryInterface.createTable('quick_sale_returns', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      saleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sales', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      quickSaleSaleItemId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'quick_sale_sale_items', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      returnCreditId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sales_return_credits', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      quantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false },
      returnedAmount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      idempotencyKey: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      reason: { type: Sequelize.STRING(255), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('quick_sale_returns', ['saleId'], {
      name: 'quick_sale_returns_sale_idx',
    });
    await queryInterface.addIndex('quick_sale_returns', ['quickSaleSaleItemId'], {
      name: 'quick_sale_returns_item_idx',
    });
    await queryInterface.addIndex('quick_sale_returns', ['returnCreditId'], {
      name: 'quick_sale_returns_credit_idx',
    });

    await queryInterface.createTable('quick_sale_audit_events', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      quickSaleAliasId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'quick_sale_aliases', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      actorUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      action: { type: Sequelize.STRING(40), allowNull: false },
      reason: { type: Sequelize.STRING(255), allowNull: true },
      previousValues: { type: Sequelize.JSON, allowNull: true },
      nextValues: { type: Sequelize.JSON, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('quick_sale_audit_events', ['companyId', 'createdAt'], {
      name: 'quick_sale_audit_company_date_idx',
    });
    await queryInterface.addIndex(
      'quick_sale_audit_events',
      ['quickSaleAliasId', 'createdAt'],
      { name: 'quick_sale_audit_alias_date_idx' },
    );

    await queryInterface.addColumn('sales', 'taxDocumentType', {
      type: Sequelize.ENUM(
        'RETAIL_INVOICE',
        'SALES_RECEIPT_GST_PENDING',
        'GST_TAX_INVOICE',
      ),
      allowNull: false,
      defaultValue: 'RETAIL_INVOICE',
    });

    if (permissions.length) {
      const permissionKeys = permissions.map(({ permissionKey }) => permissionKey);
      const [existingPermissionRows] = await queryInterface.sequelize.query(
        'SELECT `permissionKey` FROM `permissions` WHERE `permissionKey` IN (:permissionKeys)',
        { replacements: { permissionKeys } },
      );
      const existingPermissionKeys = new Set(
        existingPermissionRows.map(({ permissionKey }) => permissionKey),
      );
      const missingPermissions = permissions.filter(
        ({ permissionKey }) => !existingPermissionKeys.has(permissionKey),
      );
      if (missingPermissions.length) {
        await queryInterface.bulkInsert('permissions', missingPermissions.map((permission) => ({
        module: permission.module,
        page: permission.page,
        action: permission.action,
        permissionKey: permission.permissionKey,
        description: permission.description,
        createdAt: now,
        updatedAt: now,
        })));
      }

      const [systemRoles] = await queryInterface.sequelize.query(
        "SELECT `id`, `systemKey` FROM `roles` WHERE `isSystem` = 1 AND `systemKey` IN ('ADMIN', 'STAFF')",
      );
      const [permissionRows] = await queryInterface.sequelize.query(
        'SELECT `id`, `permissionKey` FROM `permissions` WHERE `permissionKey` IN (:permissionKeys)',
        { replacements: { permissionKeys } },
      );
      if (permissionRows.length && systemRoles.length) {
        const [existingRolePermissions] = await queryInterface.sequelize.query(
          'SELECT `roleId`, `permissionId` FROM `role_permissions` WHERE `roleId` IN (:roleIds) AND `permissionId` IN (:permissionIds)',
          {
            replacements: {
              roleIds: systemRoles.map(({ id }) => id),
              permissionIds: permissionRows.map(({ id }) => id),
            },
          },
        );
        const existingRolePermissionKeys = new Set(
          existingRolePermissions.map(({ roleId, permissionId }) => `${roleId}:${permissionId}`),
        );
        const creationPermission = permissionRows.find(
          ({ permissionKey }) => permissionKey === 'quick-sales.creation.create',
        );
        const rolePermissionRows = systemRoles.flatMap((role) => {
          const assignedPermissions = role.systemKey === 'ADMIN'
            ? permissionRows
            : creationPermission
              ? [creationPermission]
              : [];
          return assignedPermissions
            .filter(({ id }) => !existingRolePermissionKeys.has(`${role.id}:${id}`))
            .map(({ id: permissionId }) => ({
              roleId: role.id,
              permissionId,
              createdAt: now,
              updatedAt: now,
            }));
        });
        if (rolePermissionRows.length) {
          await queryInterface.bulkInsert('role_permissions', rolePermissionRows);
        }
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales', 'taxDocumentType');
    await queryInterface.dropTable('quick_sale_audit_events');
    await queryInterface.dropTable('quick_sale_returns');
    await queryInterface.dropTable('quick_sale_sale_items');
    await queryInterface.dropTable('quick_sale_aliases');
    await queryInterface.sequelize.query(
      "DELETE rp FROM role_permissions rp JOIN permissions p ON p.id = rp.permissionId WHERE p.permissionKey LIKE 'quick-sales.%'",
    );
    await queryInterface.bulkDelete('permissions', {
      permissionKey: { [require('sequelize').Op.like]: 'quick-sales.%' },
    });
  },
};
