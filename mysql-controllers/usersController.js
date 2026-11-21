// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../mysql-models/Users');
const Company = require('../mysql-models/Company');
const { resolveUserAccess } = require('../rbac/resolvePermissions');

const userWithAccess = async (user) => {
  const { role, permissions } = await resolveUserAccess(user);
  if (!role) return null;
  return {
    id: user.id,
    companyId: user.companyId,
    email: user.email,
    name: user.name,
    role: user.role,
    roleId: role.id,
    roleName: role.name,
    roleSystemKey: role.systemKey,
    permissions,
  };
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password are required' });
    }

    // 2. Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid credentials' });
    }

    // 3. Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'User account is inactive' });
    }
    const company = await Company.findByPk(user.companyId, {
      attributes: ['id', 'is_active'],
    });
    if (!company || !company.is_active) {
      return res.status(403).json({ success: false, message: 'User company is inactive or unavailable' });
    }

    const userSnapshot = await userWithAccess(user);
    if (!userSnapshot) {
      return res.status(403).json({
        success: false,
        message: 'This account has no active role. Run the RBAC database migration and assign an active role.',
      });
    }

    // 4. Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email }, // payload
      process.env.JWT_SECRET, // secret key
      { expiresIn: '1d' } // options
    );

    // 5. Send response
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: userSnapshot,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error' });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const snapshot = user && await userWithAccess(user);
    if (!snapshot) {
      return res.status(403).json({ success: false, message: 'User does not have an active role' });
    }
    return res.json({ success: true, user: snapshot });
  } catch (error) {
    console.error('Current user access refresh error:', error);
    return res.status(500).json({ success: false, message: 'Unable to refresh user permissions' });
  }
};

module.exports = { login, getCurrentUser };
