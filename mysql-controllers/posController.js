const POSShift = require('../mysql-models/POSShift');
const HoldBill = require('../mysql-models/HoldBill');
const Sale = require('../mysql-models/SalesBill');
const User = require('../mysql-models/Users');
const { Op } = require('sequelize');

// Get active shift for terminal/user
const getCurrentShift = async (req, res) => {
  try {
    const { userId } = req.query;
    const whereClause = { status: 'OPEN' };
    if (userId) whereClause.userId = userId;

    const currentShift = await POSShift.findOne({
      where: whereClause,
      order: [['openedAt', 'DESC']],
    });

    return res.status(200).json({
      success: true,
      data: currentShift || null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Start a new POS shift session
const startShift = async (req, res) => {
  try {
    const { userId, openingFloat, terminalId, notes } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required to start a shift' });
    }

    // Check if user already has an open shift
    const existingOpenShift = await POSShift.findOne({
      where: { userId, status: 'OPEN' },
    });

    if (existingOpenShift) {
      return res.status(400).json({
        message: 'An active shift is already open for this user',
        data: existingOpenShift,
      });
    }

    const shift = await POSShift.create({
      userId,
      terminalId: terminalId || 'POS-TERMINAL-1',
      openingFloat: Number(openingFloat || 0),
      openedAt: new Date(),
      notes,
      status: 'OPEN',
    });

    return res.status(201).json({
      success: true,
      message: 'POS Shift opened successfully',
      data: shift,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// End active shift & reconcile cash drawer
const endShift = async (req, res) => {
  try {
    const { shiftId, closingCashActual, notes } = req.body;

    const shift = await POSShift.findByPk(shiftId);
    if (!shift) {
      return res.status(404).json({ message: 'Shift session not found' });
    }

    if (shift.status === 'CLOSED') {
      return res.status(400).json({ message: 'This shift is already closed' });
    }

    const opening = Number(shift.openingFloat || 0);
    const cashSales = Number(shift.cashSalesTotal || 0);
    const closingExpected = opening + cashSales;
    const actualCash = Number(closingCashActual || 0);
    const diff = actualCash - closingExpected;

    await shift.update({
      closingCashActual: actualCash,
      closingCashExpected: closingExpected,
      closedAt: new Date(),
      status: 'CLOSED',
      notes: notes ? `${shift.notes || ''} | Closing notes: ${notes}` : shift.notes,
    });

    return res.status(200).json({
      success: true,
      message: 'POS Shift closed successfully',
      data: {
        ...shift.toJSON(),
        difference: diff,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

//get all shift details
const getShiftDetails = async (req, res) => {
  try {
    const { userId, fromDate, toDate, status } = req.query;

    const whereClause = {};

    // User filter
    if (userId) {
      whereClause.userId = userId;
    }

    // Status filter
    if (status) {
      whereClause.status = status;
    }

    // From date + To date filter
    if (fromDate && toDate) {
      const startOfDay = new Date(`${fromDate}T00:00:00`);
      const endOfDay = new Date(`${toDate}T23:59:59.999`);

      whereClause.openedAt = {
        [Op.between]: [startOfDay, endOfDay],
      };
    } else if (fromDate) {
      const startOfDay = new Date(`${fromDate}T00:00:00`);

      whereClause.openedAt = {
        [Op.gte]: startOfDay,
      };
    } else if (toDate) {
      const endOfDay = new Date(`${toDate}T23:59:59.999`);

      whereClause.openedAt = {
        [Op.lte]: endOfDay,
      };
    }

    const shifts = await POSShift.findAll({
      where: whereClause,

      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        },
      ],

      order: [['openedAt', 'DESC']],
    });

    return res.status(200).json({
      success: true,
      message: 'Shift details fetched successfully',
      count: shifts.length,
      data: shifts,
    });
  } catch (error) {
    console.error('Get Shift Details Error:', error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Hold a cart in POS
const holdCart = async (req, res) => {
  try {
    const { customerName, customerPhone, cartData, totalAmount, note, userId } = req.body;

    if (!cartData) {
      return res.status(400).json({ message: 'Cart data is required to hold bill' });
    }

    const holdNumber = `HOLD-${Date.now().toString().slice(-6)}`;
    const record = await HoldBill.create({
      holdNumber,
      userId,
      customerName: customerName || 'Walk-in Customer',
      customerPhone: customerPhone || '',
      cartData: typeof cartData === 'string' ? cartData : JSON.stringify(cartData),
      totalAmount: Number(totalAmount || 0),
      note: note || '',
      status: 'HELD',
    });

    return res.status(201).json({
      success: true,
      message: 'Cart held successfully',
      data: record,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get all active held carts
const getHoldCarts = async (req, res) => {
  try {
    const records = await HoldBill.findAll({
      where: { status: 'HELD' },
      order: [['createdAt', 'DESC']],
    });

    const parsed = records.map((r) => {
      const plain = r.toJSON();
      try {
        plain.cartData = JSON.parse(plain.cartData);
      } catch (e) {
        // keep as is
      }
      return plain;
    });

    return res.status(200).json({
      success: true,
      data: parsed,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Resume held cart
const resumeHoldCart = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await HoldBill.findByPk(id);

    if (!record) {
      return res.status(404).json({ message: 'Held cart not found' });
    }

    await record.update({ status: 'RESUMED' });

    let cartData = record.cartData;
    try {
      cartData = JSON.parse(record.cartData);
    } catch (e) { }

    return res.status(200).json({
      success: true,
      message: 'Held cart resumed',
      data: {
        ...record.toJSON(),
        cartData,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Cancel held cart
const cancelHoldCart = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await HoldBill.findByPk(id);

    if (!record) {
      return res.status(404).json({ message: 'Held cart not found' });
    }

    await record.update({ status: 'CANCELLED' });

    return res.status(200).json({
      success: true,
      message: 'Held cart cancelled',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCurrentShift,
  startShift,
  endShift,
  getShiftDetails,
  holdCart,
  getHoldCarts,
  resumeHoldCart,
  cancelHoldCart,
};
