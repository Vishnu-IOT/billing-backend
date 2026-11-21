'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Sequelize = require('sequelize');
const { permissionCatalog } = require('../rbac/permissionCatalog');
const migration = require('../migrations/20261123120000-create-quick-sales');

function createQueryInterface() {
  const quickSalePermissions = permissionCatalog.filter(
    ({ module }) => module === 'quick-sales',
  );
  const roles = [
    { id: 1, systemKey: 'ADMIN' },
    { id: 2, systemKey: 'STAFF' },
  ];
  const permissions = quickSalePermissions.map((permission, index) => ({
    id: index + 10,
    permissionKey: permission.permissionKey,
  }));
  const existingRolePermissions = [
    ...permissions.map(({ id: permissionId }) => ({ roleId: 1, permissionId })),
    {
      roleId: 2,
      permissionId: permissions.find(
        ({ permissionKey }) => permissionKey === 'quick-sales.creation.create',
      ).id,
    },
  ];
  const bulkInserts = [];

  return {
    bulkInserts,
    async createTable() {},
    async addIndex() {},
    async addColumn() {},
    async bulkInsert(table, rows) {
      bulkInserts.push({ table, rows });
    },
    sequelize: {
      async query(sql) {
        if (sql.includes('SELECT `permissionKey` FROM `permissions`')) {
          return [permissions.map(({ permissionKey }) => ({ permissionKey }))];
        }
        if (sql.includes('SELECT `id`, `systemKey` FROM `roles`')) {
          return [roles];
        }
        if (sql.includes('SELECT `id`, `permissionKey` FROM `permissions`')) {
          return [permissions];
        }
        if (sql.includes('SELECT `roleId`, `permissionId` FROM `role_permissions`')) {
          return [existingRolePermissions];
        }
        throw new Error(`Unexpected migration query: ${sql}`);
      },
    },
  };
}

test('Quick Sale migration does not duplicate RBAC permissions or system-role grants', async () => {
  const queryInterface = createQueryInterface();

  await migration.up(queryInterface, Sequelize);

  assert.deepEqual(queryInterface.bulkInserts, []);
});
