'use strict';

const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const POSCounter = require('../mysql-models/POSCounter');
const POSShift = require('../mysql-models/POSShift');
const User = require('../mysql-models/Users');
const sequelize = require('../config/sqldb');

const userSummary = {
  model: User,
  as: 'assignedUser',
  attributes: ['id', 'name', 'email', 'role', 'is_active'],
};

const isUniqueConstraintError = (error) =>
  error.name === 'SequelizeUniqueConstraintError' ||
  error.original?.code === 'ER_DUP_ENTRY';

const validateName = (value) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new Error('Counter name is required and must be 120 characters or fewer');
  }
  return value.trim();
};

const findAssignableStaff = async ({ userId, companyId, transaction }) => {
  if (userId == null || userId === '') return null;
  const parsedId = Number(userId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error('Select a valid staff member');
  }
  const user = await User.findOne({
    where: {
      id: parsedId,
      companyId,
      role: 'Staff',
      is_active: true,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!user) {
    throw new Error('The selected staff member is inactive or does not belong to this company');
  }
  return user;
};

const ensureStaffHasNoOpenShift = async ({ userId, companyId, transaction }) => {
  if (!userId) return;
  const openShift = await POSShift.findOne({
    where: { userId, companyId, status: 'OPEN' },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (openShift) {
    throw Object.assign(new Error('Close the staff member’s open shift before changing counter assignments'), {
      status: 409,
    });
  }
};

const listCounters = async (req, res) => {
  try {
    const counters = await POSCounter.findAll({
      where: { companyId: req.loyaltyUser.companyId },
      include: [userSummary],
      order: [['counterName', 'ASC']],
    });
    return res.status(200).json({ success: true, data: counters });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAssignedCounters = async (req, res) => {
  try {
    const counters = await POSCounter.findAll({
      where: {
        companyId: req.loyaltyUser.companyId,
        assignedUserId: req.loyaltyUser.id,
        status: 'ACTIVE',
      },
      order: [['counterName', 'ASC']],
    });
    return res.status(200).json({ success: true, data: counters });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createCounter = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const companyId = Number(req.loyaltyUser.companyId);
    const counterName = validateName(req.body.counterName);
    const assignedUser = await findAssignableStaff({
      userId: req.body.assignedUserId,
      companyId,
      transaction,
    });
    await ensureStaffHasNoOpenShift({
      userId: assignedUser?.id,
      companyId,
      transaction,
    });

    if (assignedUser) {
      const currentAssignment = await POSCounter.findOne({
        where: { companyId, assignedUserId: assignedUser.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (currentAssignment) {
        throw Object.assign(new Error('This staff member is already assigned to another POS counter'), {
          status: 409,
        });
      }
    }

    const duplicateName = await POSCounter.findOne({
      where: { companyId, counterName },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (duplicateName) {
      throw Object.assign(new Error('A POS counter with this name already exists'), { status: 409 });
    }

    const counter = await POSCounter.create({
      companyId,
      counterName,
      counterCode: `POS-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
      assignedUserId: assignedUser?.id || null,
      status: 'ACTIVE',
    }, { transaction });
    await transaction.commit();
    return res.status(201).json({ success: true, data: counter });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    const status = error.status || (isUniqueConstraintError(error) ? 409 : 400);
    return res.status(status).json({ success: false, message: error.message });
  }
};

const updateCounter = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const companyId = Number(req.loyaltyUser.companyId);
    const counter = await POSCounter.findOne({
      where: { id: req.params.id, companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!counter) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'POS counter not found' });
    }

    const hasAssignmentChange = Object.prototype.hasOwnProperty.call(
      req.body,
      'assignedUserId'
    );
    const nextAssignedUser = hasAssignmentChange
      ? await findAssignableStaff({
        userId: req.body.assignedUserId,
        companyId,
        transaction,
      })
      : null;
    const nextAssignedUserId = hasAssignmentChange
      ? nextAssignedUser?.id || null
      : counter.assignedUserId;
    const nextStatus = req.body.status === undefined
      ? counter.status
      : String(req.body.status).toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(nextStatus)) {
      throw new Error('Counter status must be ACTIVE or INACTIVE');
    }

    const changesOperationalState =
      (hasAssignmentChange &&
        Number(nextAssignedUserId || 0) !== Number(counter.assignedUserId || 0)) ||
      nextStatus !== counter.status;
    if (changesOperationalState) {
      const openCounterShift = await POSShift.findOne({
        where: { counterId: counter.id, companyId, status: 'OPEN' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (openCounterShift) {
        throw Object.assign(new Error('Close the counter’s open shift before changing its assignment or status'), {
          status: 409,
        });
      }
    }

    if (hasAssignmentChange && nextAssignedUserId) {
      await ensureStaffHasNoOpenShift({
        userId: nextAssignedUserId,
        companyId,
        transaction,
      });
      const conflictingAssignment = await POSCounter.findOne({
        where: {
          companyId,
          assignedUserId: nextAssignedUserId,
          id: { [Op.ne]: counter.id },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (conflictingAssignment) {
        throw Object.assign(new Error('This staff member is already assigned to another POS counter'), {
          status: 409,
        });
      }
    }

    const updates = { status: nextStatus };
    if (req.body.counterName !== undefined) {
      updates.counterName = validateName(req.body.counterName);
    }
    if (hasAssignmentChange) updates.assignedUserId = nextAssignedUserId;
    await counter.update(updates, { transaction });
    await counter.reload({ include: [userSummary], transaction });
    await transaction.commit();
    return res.status(200).json({ success: true, data: counter });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    const status = error.status || (isUniqueConstraintError(error) ? 409 : 400);
    return res.status(status).json({ success: false, message: error.message });
  }
};

module.exports = {
  listCounters,
  getAssignedCounters,
  createCounter,
  updateCounter,
};
