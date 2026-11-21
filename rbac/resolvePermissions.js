'use strict';

const Role = require('../mysql-models/Role');
const { systemRoleDefinitions } = require('./permissionCatalog');

const resolveUserAccess = async (user) => {
  const role = user.roleId
    ? await Role.findOne({
      where: {
        id: user.roleId,
        companyId: user.companyId,
        status: 'ACTIVE',
      },
    })
    : null;

  if (!role) {
    return { role: null, permissions: [] };
  }

  if (role.isSystem && role.systemKey && systemRoleDefinitions[role.systemKey]) {
    return {
      role,
      permissions: [...systemRoleDefinitions[role.systemKey].permissions],
    };
  }

  return { role, permissions: [] };
};

module.exports = { resolveUserAccess };
