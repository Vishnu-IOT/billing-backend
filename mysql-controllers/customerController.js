const Customer = require('../mysql-models/Customer');

// @desc    Get all customers
// @route   GET /api/customers
const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.findAll({
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
    const customer = await Customer.findByPk(req.params.id);

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
      where: { phone },
    });

    if (customerExists) {
      return res.status(400).json({ message: 'Customer already exists' });
    }

    const customer = await Customer.create({
      name,
      phone,
      loyalty_points,
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
    const customer = await Customer.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    await customer.update(req.body);

    return res.status(200).json(customer);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);

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
