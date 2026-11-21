'use strict';

const { Op } = require('sequelize');
const Role = require('../mysql-models/Role');
const User = require('../mysql-models/Users');
const {
  permissionCatalog,
  systemRoleDefinitions,
} = require('../rbac/permissionCatalog');

const publicRole = (role) => ({
  id: role.id,
  companyId: role.companyId,
  name: role.name,
  description: role.description,
  status: role.status,
  isSystem: role.isSystem,
  systemKey: role.systemKey,
  permissions: role.permissions || [],
  userCount: role.userCount ?? 0,
});

const fixedRoleWhere = (companyId) => ({
  companyId,
  status: 'ACTIVE',
  isSystem: true,
  systemKey: { [Op.in]: Object.keys(systemRoleDefinitions) },
});

const listRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      where: fixedRoleWhere(req.user.companyId),
      include: [{
        model: User,
        as: 'users',
        where: { companyId: req.user.companyId },
        required: false,
        attributes: ['id'],
      }],
      order: [['id', 'ASC']],
    });

    return res.json({
      success: true,
      data: roles.map((role) => {
        const definition = systemRoleDefinitions[role.systemKey];
        return publicRole({
          ...role.get({ plain: true }),
          name: definition.name,
          description: definition.description,
          permissions: [...definition.permissions],
          userCount: role.users?.length || 0,
        });
      }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const listAssignableRoles = async (req, res) => {
  if (!req.isSystemAdministrator) {
    return res.status(403).json({ success: false, message: 'Only Administrators can assign roles' });
  }

  try {
    const roles = await Role.findAll({
      where: fixedRoleWhere(req.user.companyId),
      attributes: ['id', 'companyId', 'name', 'systemKey', 'status'],
      order: [['id', 'ASC']],
    });
    return res.json({
      success: true,
      data: roles.map((role) => ({
        ...role.get({ plain: true }),
        name: systemRoleDefinitions[role.systemKey].name,
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getPermissionCatalog = (req, res) =>
  res.json({ success: true, data: permissionCatalog });

const getRolePermissions = async (req, res) => {
  try {
    const role = await Role.findOne({
      where: {
        id: req.params.id,
        ...fixedRoleWhere(req.user.companyId),
      },
    });
    if (!role) return res.status(404).json({ success: false, message: 'Fixed role not found' });
    return res.json({
      success: true,
      data: [...systemRoleDefinitions[role.systemKey].permissions],
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const rejectRoleMutation = (req, res) =>
  res.status(403).json({
    success: false,
    message: 'Role definitions and permissions are fixed and cannot be changed',
  });

module.exports = {
  listRoles,
  listAssignableRoles,
  getPermissionCatalog,
  getRolePermissions,
  rejectRoleMutation,
};
