const Party = require('../mysql-models/Party');
const Purchase = require('../mysql-models/PurchaseBill');
const Sale = require('../mysql-models/SalesBill');

// @desc    Get all party
// @route   GET /api/party
const getParty = async (req, res) => {
  try {
    const customers = await Party.findAll();

    return res.status(200).json(customers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

    return res.status(200).json(customer);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

    return res.status(200).json(combinedData);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

    return res.status(201).json(customer);
  } catch (error) {
    return res.status(400).json({ message: error.message });
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

    return res.status(200).json(customer);
  } catch (error) {
    return res.status(400).json({ message: error.message });
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

    return res.status(200).json({
      id: req.params.id,
      message: 'Party deleted',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getPartyAgeing = async (req, res) => {
  try {
    const partyId = req.params.id;
    const party = await Party.findByPk(partyId);

    if (!party) {
      return res.status(404).json({ message: 'Party not found' });
    }

    const unpaidSales = await Sale.findAll({
      where: {
        partyId,
        paymentStatus: ['Unpaid', 'Overdue'],
      },
    });

    const now = new Date();
    let bucket0_30 = 0;
    let bucket31_60 = 0;
    let bucket61_90 = 0;
    let bucket90Plus = 0;

    unpaidSales.forEach((s) => {
      const saleDate = new Date(s.saleDate || s.createdAt);
      const diffDays = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
      const amount = Number(s.totalAmount || 0);

      if (diffDays <= 30) {
        bucket0_30 += amount;
      } else if (diffDays <= 60) {
        bucket31_60 += amount;
      } else if (diffDays <= 90) {
        bucket61_90 += amount;
      } else {
        bucket90Plus += amount;
      }
    });

    return res.status(200).json({
      partyId: Number(partyId),
      partyName: party.name,
      totalUnpaid: bucket0_30 + bucket31_60 + bucket61_90 + bucket90Plus,
      aging: {
        '0-30': bucket0_30,
        '31-60': bucket31_60,
        '61-90': bucket61_90,
        '90+': bucket90Plus,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getParty,
  getPartyById,
  getPartyInvoiceById,
  createParty,
  updateParty,
  deleteParty,
  getPartyAgeing,
};

