'use strict';

const jwt = require('jsonwebtoken');
const User = require('../mysql-models/Users');
const Company = require('../mysql-models/Company');
const { resolveUserAccess } = require('../rbac/resolvePermissions');

const authenticateRequest = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Authentication is required' });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ success: false, message: 'Authentication is not configured' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || typeof payload !== 'object' || !Number.isInteger(Number(payload.id))) {
      return res.status(401).json({ success: false, message: 'Invalid authentication token' });
    }

    const user = await User.findByPk(Number(payload.id));
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'User is not authorized' });
    }
    const company = await Company.findByPk(user.companyId, {
      attributes: ['id', 'is_active'],
    });
    if (!company || !company.is_active) {
      return res.status(403).json({ success: false, message: 'User company is inactive or unavailable' });
    }

    const { role, permissions } = await resolveUserAccess(user);
    if (!role) {
      return res.status(403).json({ success: false, message: 'An active role is required' });
    }

    req.user = user;
    req.authRole = role;
    req.permissions = new Set(permissions);
    req.isSystemAdministrator = role.isSystem && role.systemKey === 'ADMIN';
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
    }
    return next(error);
  }
};

const requirePermission = (permissionKey) => (req, res, next) => {
  if (req.isSystemAdministrator || req.permissions?.has(permissionKey)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: `Permission required: ${permissionKey}`,
    requiredPermission: permissionKey,
  });
};

const requireAnyPermission = (permissionKeys) => (req, res, next) => {
  if (req.isSystemAdministrator || permissionKeys.some((key) => req.permissions?.has(key))) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: `One of these permissions is required: ${permissionKeys.join(', ')}`,
    requiredPermissions: permissionKeys,
  });
};

module.exports = {
  authenticateRequest,
  requirePermission,
  requireAnyPermission,
};
