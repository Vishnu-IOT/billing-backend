const express = require('express');
const { login, getCurrentUser } = require('../mysql-controllers/usersController');
const { authenticateRequest } = require('../middleware/rbacAuth');
const router = express.Router();

router.post('/login-Auth', login);
router.get('/me', authenticateRequest, getCurrentUser);

module.exports = router;
