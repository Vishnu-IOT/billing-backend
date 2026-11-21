const AuditLog = require('../mysql-models/AuditLog');
const User = require('../mysql-models/Users');

const logAuditEvent = async ({ userId, action, module, targetId, ipAddress, changes }) => {
  try {
    await AuditLog.create({
      userId,
      action,
      module,
      targetId: targetId ? String(targetId) : null,
      ipAddress,
      changes: typeof changes === 'string' ? changes : JSON.stringify(changes || {}),
    });
  } catch (err) {
    console.error('logAuditEvent error:', err.message);
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const { module, limit = 100 } = req.query;
    const where = {};
    if (module) where.module = module;
    const parsedLimit = Number.parseInt(limit, 10);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      return res.status(400).json({ success: false, message: 'limit must be between 1 and 500' });
    }

    const logs = await AuditLog.findAll({
      where,
      include: [{
        model: User,
        attributes: ['id', 'name', 'email'],
        where: { companyId: req.user.companyId },
        required: true,
      }],
      order: [['createdAt', 'DESC']],
      limit: parsedLimit,
    });

    return res.status(200).json({ success: true, data: logs });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { logAuditEvent, getAuditLogs };
