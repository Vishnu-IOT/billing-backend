const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../mysql-controllers/auditController');

router.get('/get-AuditLogs', getAuditLogs);

module.exports = router;
