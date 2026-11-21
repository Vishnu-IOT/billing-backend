const Customer = require('../mysql-models/Customer');

// @desc    Get all customers
// @route   GET /api/customers
const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.findAll({
      where: { companyId: req.user.companyId },
      attributes: ['id', 'name', 'phone', 'loyalty_points'],
    });

    return res.status(200).json({
      success: true,
      message: 'Customers fetched successfully',
      data: customers,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    return res.status(200).json(customer);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Create new customer
// @route   POST /api/customers
const createCustomer = async (req, res) => {
  try {
    const { name, phone, loyalty_points } = req.body;

    const customerExists = await Customer.findOne({
      where: { phone, companyId: req.user.companyId },
    });

    if (customerExists) {
      return res.status(400).json({ message: 'Customer already exists' });
    }

    const customer = await Customer.create({
      name,
      phone,
      loyalty_points,
      companyId: req.user.companyId,
    });

    return res.status(201).json(customer);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const updates = {
      ...(req.body.name !== undefined && { name: req.body.name }),
      ...(req.body.phone !== undefined && { phone: req.body.phone }),
      ...(req.body.loyalty_points !== undefined && {
        loyalty_points: req.body.loyalty_points,
      }),
    };
    await customer.update(updates);

    return res.status(200).json(customer);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({
      where: { id: req.params.id, companyId: req.user.companyId },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    await customer.destroy();

    return res.status(200).json({
      id: req.params.id,
      message: 'Customer deleted',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
