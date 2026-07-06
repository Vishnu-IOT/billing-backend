const Users = require('../mysql-models/Users');
const Company = require('../mysql-models/Company');
const CompanyFinancials = require('../mysql-models/Company_Financials');
const bcrypt = require('bcryptjs');

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

// @desc    Add a new user with role (Admin | Staff | Owner)
// @route   POST /api/users
// @access  admin only
const addUser = async (req, res) => {
  try {
    const { name, email, phone, password, role, status } = req.body;

    const { companyId } = req.params;

    const VALID_ROLES = ['Admin', 'Staff', 'Owner'];
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

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
      is_active: status === '1',
      role: role || 'Owner', // default role
    });

    return res.status(201).json({
      success: true,
      message: 'Users Created successfully',
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update an existing user
// @route   PUT /api/users/:id
// @access  admin only
const updateUser = async (req, res) => {
  try {
    const user = await Users.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, email, phone, role, status } = req.body;

    const VALID_ROLES = ['Admin', 'Staff', 'Owner'];
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    await user.update({ name, email, phone, role, is_active: status === '1' });

    return res.status(200).json({
      success: true,
      message: 'Users Updated successfully',
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get an existing user
// @route   GET /api/users
const getUsers = async (req, res) => {
  try {
    const users = await Users.findAll({
      attributes: {
        exclude: ['password'],
      },

      order: [['created_at', 'DESC']],
    });

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

    const deleted = await Users.destroy({
      where: { id },
    });

    if (!deleted) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
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

    const company = await Company.create({
      slug,
      legal_name,
      display_name: display_name || null,
      business_type: business_type || 'Wholesale', // schema default
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
    });

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
        req.user.role === 'admin' && { is_active }),
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

    return res.status(200).json({
      success: true,
      message: 'Company financials fetched successfully',
      data: financials,
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
