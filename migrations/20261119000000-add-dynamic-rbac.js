'use strict';

const {
  permissionCatalog,
  staffSystemPermissions,
} = require('../rbac/permissionCatalog');

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    await queryInterface.createTable('roles', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: true },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      isSystem: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      systemKey: {
        type: Sequelize.ENUM('ADMIN', 'STAFF'),
        allowNull: true,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('roles', ['companyId', 'name'], {
      unique: true,
      name: 'roles_company_name_unique',
    });

    await queryInterface.createTable('permissions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      module: { type: Sequelize.STRING(60), allowNull: false },
      page: { type: Sequelize.STRING(80), allowNull: false },
      action: { type: Sequelize.STRING(40), allowNull: false },
      permissionKey: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      description: { type: Sequelize.STRING(255), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('role_permissions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      roleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      permissionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'permissions', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('role_permissions', ['roleId', 'permissionId'], {
      unique: true,
      name: 'role_permissions_role_permission_unique',
    });

    await queryInterface.addColumn('users', 'roleId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addIndex('users', ['roleId'], { name: 'users_role_id_index' });
    await queryInterface.addConstraint('users', {
      fields: ['roleId'],
      type: 'foreign key',
      name: 'users_role_id_fk',
      references: { table: 'roles', field: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    });

    await queryInterface.bulkInsert('permissions', permissionCatalog.map(({
      module,
      page,
      action,
      permissionKey,
      description,
    }) => ({
      module,
      page,
      action,
      permissionKey,
      description,
      createdAt: now,
      updatedAt: now,
    })));

    const [companies] = await queryInterface.sequelize.query(
      'SELECT `id` FROM `companies` ORDER BY `id`'
    );
    const roleRows = companies.flatMap(({ id: companyId }) => [
      {
        companyId,
        name: 'Administrator',
        description: 'System role with full company access',
        status: 'ACTIVE',
        isSystem: true,
        systemKey: 'ADMIN',
        createdAt: now,
        updatedAt: now,
      },
      {
        companyId,
        name: 'Staff',
        description: 'Default role for existing staff accounts',
        status: 'ACTIVE',
        isSystem: true,
        systemKey: 'STAFF',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    if (roleRows.length) await queryInterface.bulkInsert('roles', roleRows);

    const [roles] = await queryInterface.sequelize.query(
      'SELECT `id`, `companyId`, `systemKey` FROM `roles` WHERE `isSystem` = 1'
    );
    const [permissions] = await queryInterface.sequelize.query(
      'SELECT `id`, `permissionKey` FROM `permissions`'
    );
    const permissionIdsByKey = new Map(
      permissions.map(({ id, permissionKey }) => [permissionKey, id])
    );
    const rolePermissionRows = roles.flatMap(({ id: roleId, systemKey }) => {
      const keys = systemKey === 'ADMIN'
        ? permissions.map(({ permissionKey }) => permissionKey)
        : [...staffSystemPermissions];
      return keys.map((key) => ({
        roleId,
        permissionId: permissionIdsByKey.get(key),
        createdAt: now,
        updatedAt: now,
      }));
    });
    if (rolePermissionRows.length) {
      await queryInterface.bulkInsert('role_permissions', rolePermissionRows);
    }

    const [users] = await queryInterface.sequelize.query(
      'SELECT `id`, `companyId`, `role` FROM `users` ORDER BY `id`'
    );
    const roleIds = new Map(
      roles.map(({ id, companyId, systemKey }) => [`${companyId}:${systemKey}`, id])
    );
    for (const user of users) {
      const systemKey = user.role === 'Staff' ? 'STAFF' : 'ADMIN';
      const roleId = roleIds.get(`${user.companyId}:${systemKey}`);
      if (!roleId) {
        throw new Error(`Missing ${systemKey} role for company ${user.companyId}`);
      }
      await queryInterface.bulkUpdate('users', { roleId }, { id: user.id });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('users', 'users_role_id_fk');
    await queryInterface.removeIndex('users', 'users_role_id_index');
    await queryInterface.removeColumn('users', 'roleId');
    await queryInterface.dropTable('role_permissions');
    await queryInterface.dropTable('permissions');
    await queryInterface.dropTable('roles');
  },
};
