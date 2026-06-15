const Party = require('../mysql-models/Party');
const Purchase = require('../mysql-models/PurchaseBill');
const Sale = require('../mysql-models/SalesBill');

// @desc    Get all party
// @route   GET /api/party
const getParty = async (req, res) => {
  try {
    const customers = await Party.findAll();

    res.status(200).json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single Party
// @route   GET /api/Partys/:id
const getPartyById = async (req, res) => {
  try {
    const customer = await Party.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Party not found' });
    }

    res.status(200).json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get invoice Party
// @route   GET /api/Partys/:id
const getPartyInvoiceById = async (req, res) => {
  try {
    const partyId = req.params.id;

    const [sales, purchases] = await Promise.all([
      Sale.findAll({ where: { partyId } }),
      Purchase.findAll({ where: { partyId } }),
    ]);

    // Add type field
    const formattedSales = sales.map((item) => ({
      ...item.toJSON(),
      type: 'Sale',
    }));

    const formattedPurchases = purchases.map((item) => ({
      ...item.toJSON(),
      type: 'Purchase',
    }));

    // Merge both
    const combinedData = [...formattedSales, ...formattedPurchases];

    res.status(200).json(combinedData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new Party
// @route   POST /api/Partys
const createParty = async (req, res) => {
  try {
    const { name, GST, email, phone, address } = req.body;

    const customerExists = await Party.findOne({
      where: { email },
    });

    if (customerExists) {
      return res.status(400).json({ message: 'Party already exists' });
    }

    const customer = await Party.create({
      name,
      GST,
      email,
      phone,
      address,
    });

    res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update Party
// @route   PUT /api/Partys/:id
const updateParty = async (req, res) => {
  try {
    const customer = await Party.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Party not found' });
    }

    await customer.update(req.body);

    res.status(200).json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete Party
// @route   DELETE /api/Partys/:id
const deleteParty = async (req, res) => {
  try {
    const customer = await Party.findByPk(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Party not found' });
    }

    await customer.destroy();

    res.status(200).json({
      id: req.params.id,
      message: 'Party deleted',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getParty,
  getPartyById,
  getPartyInvoiceById,
  createParty,
  updateParty,
  deleteParty,
};
