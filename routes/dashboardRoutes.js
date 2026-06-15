const express = require('express');
const router = express.Router();

const { dashboardData } = require('../mysql-controllers/dashboardController');

router.get('/get-dashboard', dashboardData);

module.exports = router;
