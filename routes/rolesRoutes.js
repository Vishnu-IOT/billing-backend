'use strict';

const express = require('express');
const {
  authenticateRequest,
  requirePermission,
  requireAnyPermission,
} = require('../middleware/rbacAuth');
const {
  listRoles,
  listAssignableRoles,
  getRolePermissions,
  rejectRoleMutation,
} = require('../mysql-controllers/roleController');

const router = express.Router();
router.use(authenticateRequest);
router.get('/assignable', requireAnyPermission([
  'users.directory.create',
  'users.directory.edit',
]), listAssignableRoles);
router.get('/', requirePermission('roles.configuration.view'), listRoles);
router.post('/', requirePermission('roles.configuration.create'), rejectRoleMutation);
router.get('/:id/permissions', requirePermission('roles.configuration.view'), getRolePermissions);
router.put('/:id/permissions', requirePermission('roles.configuration.manage'), rejectRoleMutation);
router.post('/:id/duplicate', requirePermission('roles.configuration.create'), rejectRoleMutation);
router.put('/:id', requirePermission('roles.configuration.edit'), rejectRoleMutation);
router.delete('/:id', requirePermission('roles.configuration.delete'), rejectRoleMutation);

module.exports = router;
