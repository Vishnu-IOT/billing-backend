'use strict';

const { systemRoleDefinitions } = require('../rbac/permissionCatalog');

module.exports = {
  async up(queryInterface, Sequelize) {
    const [companies] = await queryInterface.sequelize.query(
      'SELECT `id` FROM `companies` ORDER BY `id`'
    );
    const [permissions] = await queryInterface.sequelize.query(
      'SELECT `id`, `permissionKey` FROM `permissions`'
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

    await queryInterface.sequelize.transaction(async (transaction) => {
      const fixedRoleIds = new Map();
      const now = new Date();
      for (const { id: companyId } of companies) {
        const [existingRoles] = await queryInterface.sequelize.query(
          'SELECT `id`, `systemKey` FROM `roles` WHERE `companyId` = ? AND `isSystem` = 1',
          { replacements: [companyId], transaction }
        );
        const roleBySystemKey = new Map(
          existingRoles.map((role) => [role.systemKey, Number(role.id)])
        );
        for (const [systemKey, definition] of Object.entries(systemRoleDefinitions)) {
          let roleId = roleBySystemKey.get(systemKey);
          if (!roleId) {
            await queryInterface.bulkInsert('roles', [{
              companyId,
              name: definition.name,
              description: definition.description,
              status: 'ACTIVE',
              isSystem: true,
              systemKey,
              createdAt: now,
              updatedAt: now,
            }], { transaction });
            const [insertedRoles] = await queryInterface.sequelize.query(
              'SELECT `id` FROM `roles` WHERE `companyId` = ? AND `systemKey` = ? ORDER BY `id` DESC LIMIT 1',
              { replacements: [companyId, systemKey], transaction }
            );
            roleId = Number(insertedRoles[0]?.id);
          } else {
            await queryInterface.bulkUpdate('roles', {
              name: definition.name,
              description: definition.description,
              status: 'ACTIVE',
              isSystem: true,
              updatedAt: now,
            }, { id: roleId }, { transaction });
          }
          if (!roleId) {
            throw new Error(`Unable to seed ${systemKey} role for company ${companyId}`);
          }
          fixedRoleIds.set(`${companyId}:${systemKey}`, roleId);
        }
      }

      const roleIds = [...fixedRoleIds.values()];
      if (roleIds.length) {
        await queryInterface.bulkDelete('role_permissions', {
          roleId: { [Sequelize.Op.in]: roleIds },
        }, { transaction });
      }
      const rolePermissionRows = [];
      for (const [companySystemKey, roleId] of fixedRoleIds) {
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
    });
  },

  async down() {
    // Fixed role grants are required system data and are not removed by seed rollback.
  },
};
