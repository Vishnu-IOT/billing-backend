'use strict';

const express = require('express');
const { authenticateRequest, requirePermission } = require('../middleware/rbacAuth');
const { getPermissionCatalog } = require('../mysql-controllers/roleController');

const router = express.Router();
router.use(authenticateRequest);
router.get('/', requirePermission('roles.configuration.view'), getPermissionCatalog);

module.exports = router;
