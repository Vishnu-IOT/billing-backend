const express = require('express');
const router = express.Router();
const { getAnalyticsSummary } = require('../mysql-controllers/expenseController');

router.get('/get-Summary', getAnalyticsSummary);

module.exports = router;
