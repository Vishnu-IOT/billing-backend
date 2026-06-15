const express = require('express');
const { login } = require('../mysql-controllers/usersController');
const router = express.Router();

router.post('/login-Auth', login);

module.exports = router;
