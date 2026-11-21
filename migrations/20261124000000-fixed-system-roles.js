'use strict';

const { systemRoleDefinitions } = require('../rbac/permissionCatalog');

const normalizeRoleName = (name) =>
  String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const roleKeyByName = new Map([
  ['administrator', 'ADMIN'],
  ['admin', 'ADMIN'],
  ['owner', 'ADMIN'],
  ['system administrator', 'ADMIN'],
  ['purchase manager', 'PURCHASE_MANAGER'],
  ['purchasing manager', 'PURCHASE_MANAGER'],
  ['procurement manager', 'PURCHASE_MANAGER'],
  ['staff', 'STAFF'],
  ['cashier', 'STAFF'],
  ['sales staff', 'STAFF'],
  ['operator', 'STAFF'],
]);

const keyForRole = (role) =>
  role.isSystem && systemRoleDefinitions[role.systemKey]
    ? role.systemKey
    : role.isSystem
      ? roleKeyByName.get(normalizeRoleName(role.name)) || null
      : null;

const keyForUnassignedUser = (role) => {
  if (role === 'Staff') return 'STAFF';
  if (role === 'Owner' || role === 'Admin') return 'ADMIN';
  return 'STAFF';
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('roles', 'systemKey', {
      type: Sequelize.ENUM('ADMIN', 'PURCHASE_MANAGER', 'STAFF'),
      allowNull: true,
    });

    const [companies] = await queryInterface.sequelize.query(
      'SELECT `id` FROM `companies` ORDER BY `id`'
    );
    const [legacyRoles] = await queryInterface.sequelize.query(
      'SELECT `id`, `companyId`, `name`, `description`, `status`, `isSystem`, `systemKey` FROM `roles` ORDER BY `id`'
    );
    const [users] = await queryInterface.sequelize.query(
      'SELECT `id`, `companyId`, `roleId`, `role` FROM `users` ORDER BY `id`'
    );
    const legacyRoleById = new Map(legacyRoles.map((role) => [Number(role.id), role]));
    const fixedRoleIdByCompanyKey = new Map();
    const companyIds = new Set(companies.map(({ id }) => Number(id)));
    for (const { companyId } of users) companyIds.add(Number(companyId));

    for (const companyId of companyIds) {
      const companyRoles = legacyRoles.filter((role) => Number(role.companyId) === companyId);
      for (const systemKey of Object.keys(systemRoleDefinitions)) {
        const matchingRoles = companyRoles
          .filter((role) => keyForRole(role) === systemKey)
          .sort((left, right) => {
            const leftSystemMatch = left.systemKey === systemKey ? 0 : 1;
            const rightSystemMatch = right.systemKey === systemKey ? 0 : 1;
            return leftSystemMatch - rightSystemMatch || Number(left.id) - Number(right.id);
          });
        if (matchingRoles.length) {
          fixedRoleIdByCompanyKey.set(`${companyId}:${systemKey}`, Number(matchingRoles[0].id));
        }
      }
    }

    const now = new Date();
    await queryInterface.sequelize.transaction(async (transaction) => {
      const namesByCompany = new Map();
      for (const role of legacyRoles) {
        const companyId = Number(role.companyId);
        if (!namesByCompany.has(companyId)) namesByCompany.set(companyId, new Set());
        namesByCompany.get(companyId).add(normalizeRoleName(role.name));
      }
      for (const role of legacyRoles) {
        const oldName = String(role.name || '');
        const oldDescription = String(role.description || '').trim();
        const retiredDescription = [
          oldDescription,
          `Retired legacy role name: ${oldName}`,
        ].filter(Boolean).join(' | ').slice(0, 500);
        const companyNames = namesByCompany.get(Number(role.companyId));
        const baseName = `Legacy role ${role.id}`;
        let legacyName = baseName;
        for (let suffix = 2; companyNames.has(normalizeRoleName(legacyName)); suffix += 1) {
          legacyName = `${baseName} ${suffix}`;
        }
        companyNames.add(normalizeRoleName(legacyName));
        await queryInterface.bulkUpdate('roles', {
          name: legacyName,
          description: retiredDescription,
          status: 'INACTIVE',
          isSystem: false,
          systemKey: null,
          updatedAt: now,
        }, { id: role.id }, { transaction });
      }

      const rolesToCreate = [];
      for (const companyId of companyIds) {
        for (const [systemKey, definition] of Object.entries(systemRoleDefinitions)) {
          if (!fixedRoleIdByCompanyKey.has(`${companyId}:${systemKey}`)) {
            rolesToCreate.push({
              companyId,
              name: definition.name,
              description: definition.description,
              status: 'ACTIVE',
              isSystem: true,
              systemKey,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }
      if (rolesToCreate.length) {
        await queryInterface.bulkInsert('roles', rolesToCreate, { transaction });
      }

      const [fixedRoles] = await queryInterface.sequelize.query(
        'SELECT `id`, `companyId`, `systemKey` FROM `roles` WHERE `isSystem` = 1',
        { transaction }
      );
      const roleIdsByCompanyKey = new Map(
        fixedRoles.map(({ id, companyId, systemKey }) => [
          `${Number(companyId)}:${systemKey}`,
          Number(id),
        ])
      );

      for (const [companyIdText, roleId] of fixedRoleIdByCompanyKey) {
        const [, systemKey] = companyIdText.split(':');
        const definition = systemRoleDefinitions[systemKey];
        await queryInterface.bulkUpdate('roles', {
          name: definition.name,
          description: definition.description,
          status: 'ACTIVE',
          isSystem: true,
          systemKey,
          updatedAt: now,
        }, { id: roleId }, { transaction });
        roleIdsByCompanyKey.set(companyIdText, roleId);
      }

      const [permissions] = await queryInterface.sequelize.query(
        'SELECT `id`, `permissionKey` FROM `permissions`',
        { transaction }
      );
      const permissionIdByKey = new Map(
        permissions.map(({ id, permissionKey }) => [permissionKey, Number(id)])
      );
      const requiredKeys = new Set(
        Object.values(systemRoleDefinitions)
          .flatMap(({ permissions: rolePermissions }) => [...rolePermissions])
      );
      const missingKeys = [...requiredKeys].filter((key) => !permissionIdByKey.has(key));
      if (missingKeys.length) {
        throw new Error(`RBAC permission catalogue is missing: ${missingKeys.join(', ')}`);
      }

      const fixedRoleIds = [...roleIdsByCompanyKey.values()];
      if (fixedRoleIds.length) {
        await queryInterface.bulkDelete('role_permissions', {
          roleId: { [Sequelize.Op.in]: fixedRoleIds },
        }, { transaction });
      }
      const rolePermissionRows = [];
      for (const [companySystemKey, roleId] of roleIdsByCompanyKey) {
        const systemKey = companySystemKey.slice(companySystemKey.indexOf(':') + 1);
        for (const permissionKey of systemRoleDefinitions[systemKey].permissions) {
          rolePermissionRows.push({
            roleId,
            permissionId: permissionIdByKey.get(permissionKey),
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      if (rolePermissionRows.length) {
        await queryInterface.bulkInsert('role_permissions', rolePermissionRows, { transaction });
      }

      for (const user of users) {
        const legacyRole = legacyRoleById.get(Number(user.roleId));
        const systemKey = legacyRole ? keyForRole(legacyRole) || 'STAFF' : keyForUnassignedUser(user.role);
        const roleId = roleIdsByCompanyKey.get(`${Number(user.companyId)}:${systemKey}`);
        if (!roleId) {
          throw new Error(`Missing ${systemKey} role for company ${user.companyId}`);
        }
        await queryInterface.bulkUpdate('users', {
          roleId,
          role: systemKey === 'STAFF' ? 'Staff' : 'Admin',
          updated_at: now,
        }, { id: user.id }, { transaction });
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [purchaseManagerRoles] = await queryInterface.sequelize.query(
        'SELECT `id`, `companyId` FROM `roles` WHERE `systemKey` = ?',
        { replacements: ['PURCHASE_MANAGER'], transaction }
      );
      for (const role of purchaseManagerRoles) {
        const [staffRoles] = await queryInterface.sequelize.query(
          'SELECT `id` FROM `roles` WHERE `companyId` = ? AND `systemKey` = ? LIMIT 1',
          { replacements: [role.companyId, 'STAFF'], transaction }
        );
        if (!staffRoles.length) {
          throw new Error(`Cannot roll back without a Staff role for company ${role.companyId}`);
        }
        await queryInterface.bulkUpdate('users', {
          roleId: staffRoles[0].id,
          role: 'Staff',
          updated_at: new Date(),
        }, { roleId: role.id }, { transaction });
        await queryInterface.bulkUpdate('roles', {
          name: `Legacy purchase manager ${role.id}`,
          status: 'INACTIVE',
          isSystem: false,
          systemKey: null,
          updatedAt: new Date(),
        }, { id: role.id }, { transaction });
      }
    });

    await queryInterface.changeColumn('roles', 'systemKey', {
      type: Sequelize.ENUM('ADMIN', 'STAFF'),
      allowNull: true,
    });
  },
};
