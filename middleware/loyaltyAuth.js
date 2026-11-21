'use strict';

const jwt = require('jsonwebtoken');
const User = require('../mysql-models/Users');

const authenticateLoyaltyUser = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Bearer token is required' });
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

    if (!['Owner', 'Admin', 'Staff'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'User is not authorized for loyalty actions' });
    }

    req.loyaltyUser = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
    }
    return next(error);
  }
};

const requireLoyaltyAdmin = (req, res, next) => {
  if (
    req.isSystemAdministrator ||
    req.permissions?.has('customers.loyalty.manage') ||
    req.permissions?.has('shifts.management.edit')
  ) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Permission required: customers.loyalty.manage or shifts.management.edit',
  });
};

module.exports = {
  authenticateLoyaltyUser,
  requireLoyaltyAdmin,
};
