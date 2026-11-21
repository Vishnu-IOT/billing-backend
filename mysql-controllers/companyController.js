const Users = require('../mysql-models/Users');
const Company = require('../mysql-models/Company');
const CompanyFinancials = require('../mysql-models/Company_Financials');
const Role = require('../mysql-models/Role');
const RolePermission = require('../mysql-models/RolePermission');
const Permission = require('../mysql-models/Permission');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/sqldb');
const { logAuditEvent } = require('./auditController');
const { systemRoleDefinitions } = require('../rbac/permissionCatalog');

/**
 * Converts a string into a URL-friendly slug
 * Example: "Acme Pvt Ltd" → "acme-pvt-ltd"
 */
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// ─────────────────────────────────────────────
// USER CONTROLLERS
// ─────────────────────────────────────────────

const getAssignableRole = async (roleId, legacyRole, companyId, req) => {
  let role;
  if (roleId !== undefined && roleId !== null && roleId !== '') {
    const parsedRoleId = Number(roleId);
    if (!Number.isInteger(parsedRoleId)) return { error: 'Invalid roleId' };
    role = await Role.findOne({
      where: { id: parsedRoleId, companyId, status: 'ACTIVE' },
    });
  } else if (legacyRole !== undefined) {
    const legacySystemKeys = {
      Admin: 'ADMIN',
      Owner: 'ADMIN',
      'Purchase Manager': 'PURCHASE_MANAGER',
      Staff: 'STAFF',
    };
    if (!legacySystemKeys[legacyRole]) {
      return { error: 'Invalid role' };
    }
    const systemKey = legacySystemKeys[legacyRole];
    role = await Role.findOne({ where: { companyId, systemKey, status: 'ACTIVE' } });
  }
  if (!role) return { error: 'Select an active role in this company' };
  if (!role.isSystem || !systemRoleDefinitions[role.systemKey]) {
    return { error: 'Only the three fixed system roles can be assigned' };
  }

  if (role.systemKey === 'ADMIN' && !req.isSystemAdministrator) {
    return { error: 'Only a system administrator can assign the Administrator role', forbidden: true };
  }
  if (!req.isSystemAdministrator) {
    return { error: 'Only Administrators can assign user roles', forbidden: true };
  }
  return { role };
};

const protectLastSystemAdministrator = async (companyId, userId, transaction) => {
  await Company.findByPk(companyId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const remaining = await Users.count({
    where: {
      companyId,
      is_active: true,
      id: { [require('sequelize').Op.ne]: userId },
    },
    include: [{
      model: Role,
      as: 'assignedRole',
      where: { companyId, systemKey: 'ADMIN', status: 'ACTIVE' },
      required: true,
    }],
    transaction,
  });
  if (!remaining) {
    const error = new Error('The company must retain at least one active system administrator');
    error.status = 409;
    throw error;
  }
};

const safeUser = (user) => {
  const data = user.get({ plain: true });
  delete data.password_hash;
  return data;
};

// @desc    Add a new user with role (Admin | Staff | Owner)
// @route   POST /api/users
// @access  admin only
const addUser = async (req, res) => {
  try {
    const { name, email, phone, password, role, status } = req.body;
    const companyId = req.user.companyId;
    if (Number(req.params.companyId) !== Number(companyId)) {
      return res.status(403).json({ success: false, message: 'Cannot manage users for another company' });
    }
    if (!name?.trim() || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    const { role: assignedRole, error, forbidden } = await getAssignableRole(
      req.body.roleId,
      role,
      companyId,
      req
    );
    if (error) return res.status(forbidden ? 403 : 400).json({ success: false, message: error });

    const exists = await Users.findOne({ where: { email } });
    if (exists) {
      return res
        .status(400)
        .json({ message: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await Users.create({
      companyId,
      name,
      email,
      phone,
      password_hash: hashedPassword,
      is_active: status === undefined ? true : status === '1' || status === true,
      roleId: assignedRole.id,
      role: assignedRole.systemKey === 'STAFF' ? 'Staff' : 'Admin',
    });
    await logAuditEvent({
      userId: req.user.id,
      action: 'CREATE',
      module: 'users',
      targetId: user.id,
      ipAddress: req.ip,
      changes: { name: user.name, roleId: user.roleId, is_active: user.is_active },
    });

    return res.status(201).json({
      success: true,
      message: 'Users Created successfully',
      data: safeUser(user),
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'Email or phone number is already in use' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update an existing user
// @route   PUT /api/users/:id
// @access  admin only
const updateUser = async (req, res) => {
  try {
    const user = await Users.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, email, phone, role, status } = req.body;
    const hasRoleChange = req.body.roleId !== undefined || role !== undefined;
    const { role: assignedRole, error, forbidden } = hasRoleChange
      ? await getAssignableRole(req.body.roleId, role, user.companyId, req)
      : { role: await Role.findOne({ where: { id: user.roleId, companyId: user.companyId } }) };
    if (error) return res.status(forbidden ? 403 : 400).json({ success: false, message: error });
    if (!assignedRole) {
      return res.status(400).json({ success: false, message: 'User must have an active role' });
    }

    const nextActive = status === undefined ? user.is_active : status === '1' || status === true;
    const previousRoleId = user.roleId;
    const previousStatus = user.is_active;
    const losingAdmin = user.is_active &&
      user.roleId &&
      (assignedRole.id !== user.roleId || !nextActive);
    const transaction = await sequelize.transaction();
    try {
      if (losingAdmin) {
        const existingRole = await Role.findOne({
          where: { id: user.roleId, companyId: user.companyId },
          transaction,
        });
        if (existingRole?.systemKey === 'ADMIN') {
          await protectLastSystemAdministrator(user.companyId, user.id, transaction);
        }
      }
      await user.update({
        name: name ?? user.name,
        email: email ?? user.email,
        phone: phone ?? user.phone,
        roleId: assignedRole.id,
        role: assignedRole.systemKey === 'STAFF' ? 'Staff' : 'Admin',
        is_active: nextActive,
      }, { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE',
      module: 'users',
      targetId: user.id,
      ipAddress: req.ip,
      changes: {
        roleId: { from: previousRoleId, to: assignedRole.id },
        is_active: { from: previousStatus, to: nextActive },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Users Updated successfully',
      data: safeUser(user),
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'Email or phone number is already in use' });
    }
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get an existing user
// @route   GET /api/users
const getUsers = async (req, res) => {
  try {
    if (Number(req.params.companyId) !== Number(req.user.companyId)) {
      return res.status(403).json({ success: false, message: 'Cannot access users for another company' });
    }
    const users = await Users.findAll({
      where: { companyId: req.user.companyId },
      attributes: {
        exclude: ['password_hash'],
        include: req.permissions?.has('users.directory.view') ? [
          [
            sequelize.literal(`(
              SELECT COUNT(*)
              FROM sales
              WHERE sales.userId = User.id
            )`),
            'totalInvoices'
          ],
          [
            sequelize.literal(`(
              SELECT COALESCE(SUM(totalAmount), 0)
              FROM sales
              WHERE sales.userId = User.id
            )`),
            'totalSalesAmount'
          ]
        ] : [],
      },
      include: [{
        model: Role,
        as: 'assignedRole',
        where: { companyId: req.user.companyId },
        required: false,
        attributes: ['id', 'name', 'systemKey'],
      }],
      order: [['created_at', 'DESC']],
    });

    if (!req.permissions?.has('users.directory.view')) {
      return res.status(200).json({
        success: true,
        message: 'User names fetched successfully',
        data: users.map(({ id, name, roleId, role, is_active }) => ({
          id,
          name,
          roleId,
          role,
          is_active,
        })),
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: users,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete User
// @route   DELETE /api/User/:id
// @access  Public
const deleteUsers = async (req, res) => {
  try {
    const id = req.params.id;
    const user = await Users.findOne({ where: { id, companyId: req.user.companyId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const transaction = await sequelize.transaction();
    try {
      const assignedRole = user.roleId
        ? await Role.findOne({
          where: { id: user.roleId, companyId: user.companyId },
          transaction,
        })
        : null;
      if (user.is_active && assignedRole?.systemKey === 'ADMIN') {
        await protectLastSystemAdministrator(user.companyId, user.id, transaction);
      }
      await user.destroy({ transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    await logAuditEvent({
      userId: req.user.id,
      action: 'DELETE',
      module: 'users',
      targetId: user.id,
      ipAddress: req.ip,
      changes: { name: user.name, roleId: user.roleId },
    });

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// @desc    Create a new company
// @route   POST /api/companies
// @access  admin only
// ─────────────────────────────────────────────
const createCompany = async (req, res) => {
  try {
    if (!req.isSystemAdministrator) {
      return res.status(403).json({ success: false, message: 'Only a system administrator can create a company' });
    }
    const {
      legal_name,
      display_name,
      business_type,
      industry,
      website,
      address_line1,
      address_line2,
      city,
      state_code,
      pincode,
      country_code,
      logo_url,
      brand_color,
      email,
      phone,
    } = req.body;

    // legal_name is required (NOT NULL in schema)
    if (!legal_name) {
      return res.status(400).json({
        success: false,
        message: 'legal_name is required',
        data: null,
      });
    }

    // Validate business_type against allowed enum values
    const VALID_BUSINESS_TYPES = [
      'Retail',
      'Wholesale',
      'Service',
      'Manufacturing',
    ];
    if (business_type && !VALID_BUSINESS_TYPES.includes(business_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid business_type. Must be one of: ${VALID_BUSINESS_TYPES.join(', ')}`,
        data: null,
      });
    }

    // Auto-generate slug from legal_name (ensure uniqueness)
    const baseSlug = slugify(legal_name);
    const existingSlug = await Company.findOne({ where: { slug: baseSlug } });
    const slug = existingSlug ? `${baseSlug}-${Date.now()}` : baseSlug;

    const transaction = await sequelize.transaction();
    let company;
    try {
      company = await Company.create({
        slug,
        legal_name,
        display_name: display_name || null,
        business_type: business_type || 'Wholesale',
        industry: industry || null,
        website: website || null,
        address_line1: address_line1 || null,
        address_line2: address_line2 || null,
        city: city || null,
        state_code: state_code || null,
        pincode: pincode || null,
        country_code: country_code || null,
        logo_url: logo_url || null,
        brand_color: brand_color || null,
        email: email || null,
        phone: phone || null,
        is_active: 1,
      }, { transaction });

      await Role.bulkCreate(Object.entries(systemRoleDefinitions).map(([systemKey, definition]) => ({
        companyId: company.id,
        name: definition.name,
        description: definition.description,
        status: 'ACTIVE',
        isSystem: true,
        systemKey,
      })), { transaction });
      const [systemRoles, permissions] = await Promise.all([
        Role.findAll({ where: { companyId: company.id, isSystem: true }, transaction }),
        Permission.findAll({ attributes: ['id', 'permissionKey'], transaction }),
      ]);
      const roleBySystemKey = new Map(systemRoles.map((role) => [role.systemKey, role]));
      const permissionIdByKey = new Map(permissions.map(({ id, permissionKey }) => [permissionKey, id]));
      const missingRoles = Object.keys(systemRoleDefinitions)
        .filter((systemKey) => !roleBySystemKey.has(systemKey));
      const missingPermissions = Object.values(systemRoleDefinitions)
        .flatMap(({ permissions: rolePermissions }) => [...rolePermissions])
        .filter((permissionKey) => !permissionIdByKey.has(permissionKey));
      if (missingRoles.length || missingPermissions.length) {
        throw new Error('RBAC permission catalogue is not initialized; run Sequelize migrations before creating companies');
      }

      const rolePermissionRows = Object.entries(systemRoleDefinitions).flatMap(
        ([systemKey, definition]) => [...definition.permissions].map((permissionKey) => ({
          roleId: roleBySystemKey.get(systemKey).id,
          permissionId: permissionIdByKey.get(permissionKey),
        }))
      );
      await RolePermission.bulkCreate(rolePermissionRows, { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: 'Company created successfully',
      data: company,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Update an existing company
// @route   PUT /api/companies/:id
// @access  admin, staff
// ─────────────────────────────────────────────
const updateCompany = async (req, res) => {
  try {
    if (Number(req.params.id) !== Number(req.user.companyId)) {
      return res.status(403).json({ success: false, message: 'Cannot update another company' });
    }
    const company = await Company.findByPk(req.params.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
        data: null,
      });
    }

    const {
      legal_name,
      display_name,
      business_type,
      industry,
      website,
      address_line1,
      address_line2,
      city,
      state_code,
      pincode,
      country_code,
      logo_url,
      brand_color,
      is_active,
      email,
      phone,
    } = req.body;

    // Validate business_type if provided
    const VALID_BUSINESS_TYPES = [
      'Retail',
      'Wholesale',
      'Service',
      'Manufacturing',
    ];
    if (business_type && !VALID_BUSINESS_TYPES.includes(business_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid business_type. Must be one of: ${VALID_BUSINESS_TYPES.join(', ')}`,
        data: null,
      });
    }

    // If legal_name is being changed, regenerate slug
    let slug = company.slug;
    if (legal_name && legal_name !== company.legal_name) {
      const baseSlug = slugify(legal_name);
      const existingSlug = await Company.findOne({ where: { slug: baseSlug } });
      slug = existingSlug ? `${baseSlug}-${Date.now()}` : baseSlug;
    }

    // Only update fields that are actually sent in the request body
    const updatedCompany = await company.update({
      slug,
      ...(legal_name !== undefined && { legal_name }),
      ...(display_name !== undefined && { display_name }),
      ...(business_type !== undefined && { business_type }),
      ...(industry !== undefined && { industry }),
      ...(website !== undefined && { website }),
      ...(address_line1 !== undefined && { address_line1 }),
      ...(address_line2 !== undefined && { address_line2 }),
      ...(city !== undefined && { city }),
      ...(state_code !== undefined && { state_code }),
      ...(pincode !== undefined && { pincode }),
      ...(country_code !== undefined && { country_code }),
      ...(logo_url !== undefined && { logo_url }),
      ...(brand_color !== undefined && { brand_color }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      // Only admin can toggle is_active
      ...(is_active !== undefined &&
        req.isSystemAdministrator && { is_active }),
    });

    return res.status(200).json({
      success: true,
      message: 'Company updated successfully',
      data: updatedCompany,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
      data: null,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get a single company by ID
// @route   GET /api/companies/:id
// @access  admin, staff, user
// ─────────────────────────────────────────────
const getCompanyById = async (req, res) => {
  try {
    if (Number(req.params.id) !== Number(req.user.companyId)) {
      return res.status(403).json({ success: false, message: 'Cannot access another company' });
    }
    const company = await Company.findByPk(req.params.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Company fetched successfully',
      data: company,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
      data: null,
    });
  }
};

// ─────────────────────────────────────────────
// COMPANY FINANCIALS CONTROLLERS
// ─────────────────────────────────────────────

// @desc    Add financials for a company
// @route   POST /api/companies/:id/financials
// @access  admin only
const createCompanyFinancials = async (req, res) => {
  try {
    if (!req.isSystemAdministrator) {
      return res.status(403).json({ success: false, message: 'Only a system administrator can create company financial details' });
    }
    const company = await Company.findByPk(req.params.id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const {
      gstin,
      pan,
      tan,
      cin,
      bank_name,
      bank_account_enc,
      ifsc_code,
      account_type,
    } = req.body;

    const VALID_ACCOUNT_TYPES = ['Savings', 'Current', 'Salary', 'Other'];

    if (account_type && !VALID_ACCOUNT_TYPES.includes(account_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid account type`,
      });
    }

    const financials = await CompanyFinancials.create({
      companyId: req.params.id,
      gstin,
      pan,
      tan,
      cin,
      bank_name,
      bank_account_enc,
      ifsc_code,
      account_type,
    });

    return res.status(201).json({
      success: true,
      message: 'Company Financials Created successfully',
      data: financials,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update financials for a company
// @route   PUT /api/companies/:id/financials/:financialId
// @access  admin, staff
const updateCompanyFinancials = async (req, res) => {
  try {
    if (Number(req.params.companyId) !== Number(req.user.companyId)) {
      return res.status(403).json({ success: false, message: 'Cannot update another company financial record' });
    }
    const financials = await CompanyFinancials.findOne({
      where: {
        id: req.params.id,
        companyId: req.params.companyId,
      },
    });

    if (!financials) {
      return res.status(404).json({ message: 'Financial record not found' });
    }

    const {
      gstin,
      pan,
      tan,
      cin,
      bank_name,
      bank_account_enc,
      ifsc_code,
      account_type,
    } = req.body;

    const updateData = {
      ...(gstin !== undefined && { gstin }),
      ...(pan !== undefined && { pan }),
      ...(tan !== undefined && { tan }),
      ...(cin !== undefined && { cin }),
      ...(bank_name !== undefined && { bank_name }),
      ...(bank_account_enc !== undefined && {
        bank_account_enc,
      }),
      ...(ifsc_code !== undefined && { ifsc_code }),
      ...(account_type !== undefined && {
        account_type,
      }),
    };

    // if (req.user.role === 'admin' && fiscal_year) {
    //   updateData.fiscal_year = fiscal_year;
    // }

    await financials.update(updateData);

    return res.status(200).json({
      success: true,
      message: 'Company Financials Updated successfully',
      data: financials,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getCompanyFinancials = async (req, res) => {
  try {
    if (Number(req.params.id) !== Number(req.user.companyId)) {
      return res.status(403).json({ success: false, message: 'Cannot access another company financial record' });
    }
    const financials = await CompanyFinancials.findOne({
      where: {
        companyId: req.params.id,
      },
    });

    if (!financials) {
      return res.status(404).json({
        success: false,
        message: 'Company financials not found',
      });
    }

    const data = financials.get({ plain: true });
    if (!req.permissions?.has('settings.company.view') && !req.isSystemAdministrator) {
      delete data.bank_name;
      delete data.bank_account_enc;
      delete data.ifsc_code;
      delete data.account_type;
    }

    return res.status(200).json({
      success: true,
      message: 'Company financials fetched successfully',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  addUser,
  updateUser,
  getUsers,
  deleteUsers,
  createCompany,
  getCompanyById,
  updateCompany,
  createCompanyFinancials,
  updateCompanyFinancials,
  getCompanyFinancials,
};
