const POSShift = require('../mysql-models/POSShift');
const HoldBill = require('../mysql-models/HoldBill');
const Sale = require('../mysql-models/SalesBill');
const User = require('../mysql-models/Users');
const POSCounter = require('../mysql-models/POSCounter');
const sequelize = require('../config/sqldb');
const { Op } = require('sequelize');

const CASH_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];

function readDenominationCounts(value) {
  if (value == null) return { counts: null, total: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Cash denominations must be an object of denomination counts' };
  }

  const allowedKeys = new Set(CASH_DENOMINATIONS.map(String));
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return { error: 'Cash denominations contain an unsupported denomination' };
  }

  const counts = {};
  let total = 0;
  for (const denomination of CASH_DENOMINATIONS) {
    const key = String(denomination);
    const rawCount = Object.prototype.hasOwnProperty.call(value, key)
      ? value[key]
      : 0;
    const count = Number(rawCount);
    if (
      !['number', 'string'].includes(typeof rawCount) ||
      rawCount === '' ||
      (typeof rawCount === 'string' && rawCount.trim() === '') ||
      (typeof rawCount === 'string' && !/^\d+$/.test(rawCount)) ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      return { error: `Count for ₹${denomination} must be a non-negative whole number` };
    }
    counts[key] = count;
    total += denomination * count;
  }

  const roundedTotal = Math.round(total * 100) / 100;
  if (!Number.isFinite(roundedTotal) || roundedTotal > 99999999.99) {
    return { error: 'Counted cash exceeds the supported shift amount' };
  }
  return { counts, total: roundedTotal };
}

function matchesDenominationTotal(amount, total) {
  if (amount == null) return true;
  const parsedAmount = Number(amount);
  return Number.isFinite(parsedAmount) &&
    Math.round(parsedAmount * 100) === Math.round(total * 100);
}

// Get active shift for terminal/user
const getCurrentShift = async (req, res) => {
  try {
    const { id: userId, companyId } = req.loyaltyUser;
    if (
      (req.query.userId != null && Number(req.query.userId) !== Number(userId)) ||
      (req.query.companyId != null && Number(req.query.companyId) !== Number(companyId))
    ) {
      return res.status(403).json({ message: 'Shift identity does not match the authenticated user' });
    }

    const currentShift = await POSShift.findOne({
      where: { userId, companyId, status: 'OPEN' },
      include: [{
        model: POSCounter,
        as: 'counter',
        attributes: ['id', 'counterName', 'counterCode', 'status'],
      }],
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
  const transaction = await sequelize.transaction();
  try {
    const {
      userId,
      openingFloat,
      openingDenominations,
      counterId: requestedCounterId,
      notes,
    } = req.body;
    const authenticatedUser = req.loyaltyUser;
    const authenticatedUserId = Number(authenticatedUser.id);
    const companyId = Number(authenticatedUser.companyId);

    if (
      !Number.isInteger(authenticatedUserId) ||
      !Number.isInteger(companyId) ||
      (userId != null && Number(userId) !== authenticatedUserId) ||
      (req.body.companyId != null && Number(req.body.companyId) !== companyId)
    ) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Shift identity does not match the authenticated user' });
    }

    const counterId = Number(requestedCounterId);
    if (!Number.isInteger(counterId) || counterId <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Select an assigned POS counter before starting a shift' });
    }

    const denominationResult = readDenominationCounts(openingDenominations);
    if (denominationResult.error) {
      await transaction.rollback();
      return res.status(400).json({ message: denominationResult.error });
    }

    const openingCash = denominationResult.counts
      ? denominationResult.total
      : Number(openingFloat ?? 0);
    if (
      denominationResult.counts &&
      !matchesDenominationTotal(openingFloat, denominationResult.total)
    ) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Opening float does not match the denomination count total' });
    }
    if (!Number.isFinite(openingCash) || openingCash < 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Opening float must be a non-negative amount' });
    }

    const counter = await POSCounter.findOne({
      where: {
        id: counterId,
        companyId,
        assignedUserId: authenticatedUserId,
        status: 'ACTIVE',
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!counter) {
      await transaction.rollback();
      return res.status(403).json({
        message: 'This active POS counter is not assigned to your account. Contact an administrator.',
      });
    }

    const occupiedShift = await POSShift.findOne({
      where: { counterId, companyId, status: 'OPEN' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (occupiedShift) {
      await transaction.rollback();
      return res.status(409).json({
        message: 'This POS counter already has an open shift. Choose another assigned counter or contact an administrator.',
      });
    }

    // Locking the user row serializes concurrent starts on different counters.
    const lockedUser = await User.findByPk(authenticatedUserId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lockedUser || Number(lockedUser.companyId) !== companyId) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Authenticated user company is unavailable' });
    }

    const existingOpenShift = await POSShift.findOne({
      where: { userId: authenticatedUserId, companyId, status: 'OPEN' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (existingOpenShift) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'An active shift is already open for this user',
        data: existingOpenShift,
      });
    }

    const shift = await POSShift.create({
      userId: authenticatedUserId,
      companyId,
      terminalId: counter.counterCode,
      counterId: counter.id,
      counterNameSnapshot: counter.counterName,
      openingFloat: openingCash,
      openingDenominations: denominationResult.counts,
      openedAt: new Date(),
      notes,
      status: 'OPEN',
    }, { transaction });
    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'POS Shift opened successfully',
      data: {
        ...shift.toJSON(),
        counter: {
          id: counter.id,
          counterName: counter.counterName,
          counterCode: counter.counterCode,
          status: counter.status,
        },
      },
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

// End active shift & reconcile cash drawer
const endShift = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { shiftId, closingCashActual, closingDenominations, notes } = req.body;
    const authenticatedUser = req.loyaltyUser;
    const canCloseAnyShift = req.isSystemAdministrator ||
      req.permissions?.has('shifts.management.close');
    const denominationResult = readDenominationCounts(closingDenominations);
    if (denominationResult.error) {
      await transaction.rollback();
      return res.status(400).json({ message: denominationResult.error });
    }
    const actualCash = denominationResult.counts
      ? denominationResult.total
      : Number(closingCashActual ?? 0);

    if (
      denominationResult.counts &&
      !matchesDenominationTotal(closingCashActual, denominationResult.total)
    ) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Closing cash does not match the denomination count total' });
    }

    if (!Number.isFinite(actualCash) || actualCash < 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Closing cash must be a non-negative amount' });
    }

    const shift = await POSShift.findOne({
      where: { id: shiftId, companyId: authenticatedUser.companyId },
      include: [{
        model: POSCounter,
        as: 'counter',
        attributes: ['id', 'counterName', 'counterCode', 'status'],
      }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!shift) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Shift session not found' });
    }

    if (Number(shift.userId) !== Number(authenticatedUser.id) && !canCloseAnyShift) {
      await transaction.rollback();
      return res.status(403).json({ message: 'You can only close your own shift' });
    }

    if (shift.status === 'CLOSED') {
      await transaction.rollback();
      return res.status(400).json({ message: 'This shift is already closed' });
    }

    const opening = Number(shift.openingFloat || 0);
    const cashSales = Number(shift.cashSalesTotal || 0);
    const cashIn = Number(shift.cashInTotal || 0);
    const cashOut = Number(shift.cashOutTotal || 0);
    const cashRefunds = Number(shift.cashRefundsTotal || 0);
    const closingExpected = opening + cashSales + cashIn - cashOut - cashRefunds;
    const diff = actualCash - closingExpected;

    await shift.update({
      closingCashActual: actualCash,
      closingDenominations: denominationResult.counts,
      closingCashExpected: closingExpected,
      closedAt: new Date(),
      status: 'CLOSED',
      notes: notes ? `${shift.notes || ''} | Closing notes: ${notes}` : shift.notes,
    }, { transaction });
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'POS Shift closed successfully',
      data: {
        ...shift.toJSON(),
        difference: diff,
      },
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

//get all shift details
const getShiftDetails = async (req, res) => {
  try {
    const { userId, counterId, fromDate, toDate, status } = req.query;

    const whereClause = { companyId: req.loyaltyUser.companyId };

    // User filter
    if (userId) {
      whereClause.userId = userId;
    }
    if (counterId) {
      whereClause.counterId = counterId;
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
        {
          model: POSCounter,
          as: 'counter',
          attributes: ['id', 'counterName', 'counterCode', 'status'],
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
