'use strict';

const sequelize = require('../config/sqldb');
const Customer = require('../mysql-models/Customer');
const LoyaltyGift = require('../mysql-models/LoyaltyGift');
const LoyaltyRedemption = require('../mysql-models/LoyaltyRedemption');
const LoyaltyTransaction = require('../mysql-models/LoyaltyTransaction');
const User = require('../mysql-models/Users');

const REWARD_TYPES = ['CASH_DISCOUNT', 'PRODUCT', 'SERVICE', 'OTHER'];
const MAX_STORED_POINTS = 2147483647;

class LoyaltyApiError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function positiveWholeNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new LoyaltyApiError(400, `${field} must be a positive whole number`);
  }
  return parsed;
}

function optionalRewardValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new LoyaltyApiError(400, 'rewardValue must be a non-negative number');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new LoyaltyApiError(400, 'rewardValue must be a non-negative number');
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function optionalText(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new LoyaltyApiError(400, `${field} must be a string`);
  }
  return value.trim() || null;
}

function optionalIdempotencyKey(req) {
  const key = req.get('Idempotency-Key') || req.body.idempotencyKey || null;
  if (key !== null && (typeof key !== 'string' || !key.trim() || key.length > 100)) {
    throw new LoyaltyApiError(400, 'Idempotency-Key must be a non-empty string of at most 100 characters');
  }
  return key ? key.trim() : null;
}

async function findExistingRedemption(customerId, idempotencyKey, transaction) {
  if (!idempotencyKey) return null;
  return LoyaltyRedemption.findOne({
    where: { customerId, idempotencyKey },
    transaction,
  });
}

function redemptionResponse(redemption, remainingPoints, replayed = false) {
  return {
    success: true,
    data: {
      redemptionId: redemption.id,
      customerId: redemption.customerId,
      pointsRedeemed: redemption.pointsRedeemed,
      redemptionMethod: redemption.redemptionMethod,
      giftId: redemption.giftId,
      rewardType: redemption.rewardType,
      rewardDescription: redemption.rewardDescription,
      rewardValue: redemption.rewardValue,
      reason: redemption.reason,
      performedBy: redemption.performedBy,
      remainingPoints,
      status: redemption.status,
      replayed,
    },
  };
}

async function redeem(req, res, method) {
  const customerId = Number(req.body.customerId);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    return res.status(400).json({ success: false, message: 'customerId must be a positive integer' });
  }

  let idempotencyKey;
  try {
    idempotencyKey = optionalIdempotencyKey(req);
  } catch (error) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  try {
    const data = await sequelize.transaction(async (transaction) => {
      const customer = await Customer.findOne({
        where: { id: customerId, companyId: req.loyaltyUser.companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!customer) throw new LoyaltyApiError(404, 'Customer not found');

      const existing = await findExistingRedemption(customerId, idempotencyKey, transaction);
      if (existing) {
        return redemptionResponse(existing, Number(customer.loyalty_points || 0), true);
      }

      let pointsRedeemed;
      let gift = null;
      let rewardType = null;
      let rewardDescription;
      let rewardValue;
      const reason = optionalText(req.body.reason, 'reason');

      if (method === 'MANUAL') {
        pointsRedeemed = positiveWholeNumber(req.body.pointsToRedeem, 'pointsToRedeem');
        if (
          typeof req.body.rewardDescription !== 'string' ||
          !req.body.rewardDescription.trim()
        ) {
          throw new LoyaltyApiError(400, 'rewardDescription is required for manual redemption');
        }
        rewardDescription = req.body.rewardDescription.trim();
        if (req.body.rewardType !== undefined && req.body.rewardType !== null) {
          if (!REWARD_TYPES.includes(req.body.rewardType)) {
            throw new LoyaltyApiError(400, `rewardType must be one of ${REWARD_TYPES.join(', ')}`);
          }
          rewardType = req.body.rewardType;
        }
        rewardValue = optionalRewardValue(req.body.rewardValue);
      } else {
        const giftId = Number(req.body.giftId);
        if (!Number.isSafeInteger(giftId) || giftId <= 0) {
          throw new LoyaltyApiError(400, 'giftId must be a positive integer');
        }
        gift = await LoyaltyGift.findByPk(giftId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!gift || !gift.isActive) throw new LoyaltyApiError(404, 'Active gift not found');
        pointsRedeemed = gift.pointsRequired;
        rewardType = gift.rewardType;
        rewardDescription = gift.description || gift.name;
        rewardValue = gift.rewardValue;
      }

      const currentBalance = Number(customer.loyalty_points || 0);
      if (!Number.isSafeInteger(currentBalance) || currentBalance < 0) {
        throw new LoyaltyApiError(409, 'Customer loyalty balance is invalid');
      }
      if (currentBalance > MAX_STORED_POINTS) {
        throw new LoyaltyApiError(409, 'Customer loyalty balance exceeds the supported range');
      }
      if (pointsRedeemed > currentBalance) {
        throw new LoyaltyApiError(400, 'Insufficient loyalty points', {
          availablePoints: currentBalance,
        });
      }

      const remainingPoints = currentBalance - pointsRedeemed;
      await customer.update({ loyalty_points: remainingPoints }, { transaction });

      const redemption = await LoyaltyRedemption.create(
        {
          customerId,
          pointsRedeemed,
          redemptionMethod: method,
          giftId: gift?.id || null,
          rewardType,
          rewardDescription,
          rewardValue,
          reason,
          performedBy: req.loyaltyUser.id,
          status: 'COMPLETED',
          idempotencyKey,
        },
        { transaction }
      );

      await LoyaltyTransaction.create(
        {
          customerId,
          transactionType: 'REDEEM',
          pointsDelta: -pointsRedeemed,
          previousBalance: currentBalance,
          balanceAfter: remainingPoints,
          monetaryValue: Number(rewardValue || 0),
          description: rewardDescription,
          rewardType,
          redemptionId: redemption.id,
          performedBy: req.loyaltyUser.id,
          idempotencyKey,
        },
        { transaction }
      );

      return redemptionResponse(redemption, remainingPoints);
    });

    return res.status(data.data.replayed ? 200 : 201).json(data);
  } catch (error) {
    if (error instanceof LoyaltyApiError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        ...(error.details || {}),
      });
    }
    if (error.name === 'SequelizeUniqueConstraintError' && idempotencyKey) {
      return res.status(409).json({
        success: false,
        message: 'A request with this idempotency key has already been processed',
      });
    }
    console.error('Loyalty redemption error:', error);
    return res.status(500).json({ success: false, message: 'Unable to process loyalty redemption' });
  }
}

const redeemManual = (req, res) => redeem(req, res, 'MANUAL');
const redeemGift = (req, res) => redeem(req, res, 'GIFT');

const listGifts = async (req, res) => {
  try {
    const gifts = await LoyaltyGift.findAll({
      where: { isActive: true },
      order: [['pointsRequired', 'ASC'], ['name', 'ASC']],
    });
    return res.status(200).json({ success: true, data: gifts });
  } catch (error) {
    console.error('List loyalty gifts error:', error);
    return res.status(500).json({ success: false, message: 'Unable to fetch loyalty gifts' });
  }
};

const createGift = async (req, res) => {
  try {
    const { name, description, pointsRequired, rewardType = 'OTHER', rewardValue } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      throw new LoyaltyApiError(400, 'name is required');
    }
    const points = positiveWholeNumber(pointsRequired, 'pointsRequired');
    if (!REWARD_TYPES.includes(rewardType)) {
      throw new LoyaltyApiError(400, `rewardType must be one of ${REWARD_TYPES.join(', ')}`);
    }
    const gift = await LoyaltyGift.create({
      name: name.trim(),
      description: description || null,
      pointsRequired: points,
      rewardType,
      rewardValue: optionalRewardValue(rewardValue),
    });
    return res.status(201).json({ success: true, data: gift });
  } catch (error) {
    if (error instanceof LoyaltyApiError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateGift = async (req, res) => {
  try {
    const gift = await LoyaltyGift.findByPk(req.params.giftId);
    if (!gift) return res.status(404).json({ success: false, message: 'Gift not found' });

    const updates = {};
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
        throw new LoyaltyApiError(400, 'name cannot be empty');
      }
      updates.name = req.body.name.trim();
    }
    if (req.body.description !== undefined) updates.description = req.body.description || null;
    if (req.body.pointsRequired !== undefined) {
      updates.pointsRequired = positiveWholeNumber(req.body.pointsRequired, 'pointsRequired');
    }
    if (req.body.rewardType !== undefined) {
      if (!REWARD_TYPES.includes(req.body.rewardType)) {
        throw new LoyaltyApiError(400, `rewardType must be one of ${REWARD_TYPES.join(', ')}`);
      }
      updates.rewardType = req.body.rewardType;
    }
    if (req.body.rewardValue !== undefined) updates.rewardValue = optionalRewardValue(req.body.rewardValue);
    if (req.body.isActive !== undefined) {
      if (typeof req.body.isActive !== 'boolean') {
        throw new LoyaltyApiError(400, 'isActive must be a boolean');
      }
      updates.isActive = req.body.isActive;
    }

    await gift.update(updates);
    return res.status(200).json({ success: true, data: gift });
  } catch (error) {
    if (error instanceof LoyaltyApiError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(400).json({ success: false, message: error.message });
  }
};

const getCustomerTransactions = async (req, res) => {
  const customerId = Number(req.params.customerId);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    return res.status(400).json({ success: false, message: 'customerId must be a positive integer' });
  }

  try {
    const customer = await Customer.findOne({
      where: { id: customerId, companyId: req.loyaltyUser.companyId },
      attributes: ['id', 'name', 'phone', 'loyalty_points'],
    });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const result = await LoyaltyTransaction.findAndCountAll({
      where: { customerId },
      include: [
        {
          model: LoyaltyRedemption,
          as: 'redemption',
          required: false,
          attributes: [
            'id',
            'redemptionMethod',
            'giftId',
            'rewardDescription',
            'rewardType',
            'rewardValue',
            'reason',
            'status',
          ],
        },
        {
          model: User,
          as: 'performedByUser',
          required: false,
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
    return res.status(200).json({
      success: true,
      data: {
        customer,
        count: result.count,
        transactions: result.rows,
      },
    });
  } catch (error) {
    console.error('Get loyalty history error:', error);
    return res.status(500).json({ success: false, message: 'Unable to fetch loyalty history' });
  }
};

const reverseRedemption = async (req, res) => {
  const redemptionId = Number(req.params.redemptionId);
  if (!Number.isSafeInteger(redemptionId) || redemptionId <= 0) {
    return res.status(400).json({ success: false, message: 'redemptionId must be a positive integer' });
  }

  let idempotencyKey;
  try {
    idempotencyKey = optionalIdempotencyKey(req);
  } catch (error) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  try {
    const data = await sequelize.transaction(async (transaction) => {
      const redemption = await LoyaltyRedemption.findByPk(redemptionId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!redemption) throw new LoyaltyApiError(404, 'Redemption not found');

      const customer = await Customer.findOne({
        where: { id: redemption.customerId, companyId: req.loyaltyUser.companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!customer) throw new LoyaltyApiError(404, 'Customer not found');

      if (idempotencyKey) {
        const prior = await LoyaltyTransaction.findOne({
          where: {
            customerId: customer.id,
            transactionType: 'REVERSAL',
            redemptionId,
            idempotencyKey,
          },
          transaction,
        });
        if (prior) {
          return {
            redemptionId,
            customerId: customer.id,
            remainingPoints: Number(customer.loyalty_points || 0),
            status: redemption.status,
            replayed: true,
          };
        }
      }

      if (redemption.status !== 'COMPLETED') {
        throw new LoyaltyApiError(409, 'Only completed redemptions can be reversed');
      }

      const currentBalance = Number(customer.loyalty_points || 0);
      if (!Number.isSafeInteger(currentBalance) || currentBalance < 0) {
        throw new LoyaltyApiError(409, 'Customer loyalty balance is invalid');
      }
      const remainingPoints = currentBalance + redemption.pointsRedeemed;
      if (remainingPoints > MAX_STORED_POINTS) {
        throw new LoyaltyApiError(409, 'Reversal would exceed the supported loyalty balance');
      }
      await customer.update({ loyalty_points: remainingPoints }, { transaction });
      await redemption.update({ status: 'REVERSED' }, { transaction });
      await LoyaltyTransaction.create(
        {
          customerId: customer.id,
          transactionType: 'REVERSAL',
          pointsDelta: redemption.pointsRedeemed,
          previousBalance: currentBalance,
          balanceAfter: remainingPoints,
          monetaryValue: Number(redemption.rewardValue || 0),
          description: `Reversal: ${redemption.rewardDescription}`,
          rewardType: redemption.rewardType,
          redemptionId: redemption.id,
          performedBy: req.loyaltyUser.id,
          idempotencyKey,
        },
        { transaction }
      );
      return {
        redemptionId,
        customerId: customer.id,
        pointsRestored: redemption.pointsRedeemed,
        remainingPoints,
        status: 'REVERSED',
      };
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof LoyaltyApiError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    if (error.name === 'SequelizeUniqueConstraintError' && idempotencyKey) {
      return res.status(409).json({ success: false, message: 'A request with this idempotency key has already been processed' });
    }
    console.error('Reverse loyalty redemption error:', error);
    return res.status(500).json({ success: false, message: 'Unable to reverse loyalty redemption' });
  }
};

const adjustPoints = async (req, res) => {
  const customerId = Number(req.params.customerId);
  const pointsAdjustment = Number(req.body.pointsAdjustment);
  const description = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    return res.status(400).json({ success: false, message: 'customerId must be a positive integer' });
  }
  if (!Number.isSafeInteger(pointsAdjustment) || pointsAdjustment === 0) {
    return res.status(400).json({ success: false, message: 'pointsAdjustment must be a non-zero whole number' });
  }
  if (!description) {
    return res.status(400).json({ success: false, message: 'reason is required for point adjustments' });
  }

  let idempotencyKey;
  try {
    idempotencyKey = optionalIdempotencyKey(req);
  } catch (error) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  try {
    const data = await sequelize.transaction(async (transaction) => {
      const customer = await Customer.findOne({
        where: { id: customerId, companyId: req.loyaltyUser.companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!customer) throw new LoyaltyApiError(404, 'Customer not found');

      if (idempotencyKey) {
        const prior = await LoyaltyTransaction.findOne({
          where: {
            customerId,
            transactionType: 'ADJUSTMENT',
            idempotencyKey,
          },
          transaction,
        });
        if (prior) {
          return {
            transactionId: prior.id,
            customerId,
            pointsAdjustment: prior.pointsDelta,
            remainingPoints: Number(customer.loyalty_points || 0),
            replayed: true,
          };
        }
      }

      const currentBalance = Number(customer.loyalty_points || 0);
      if (!Number.isSafeInteger(currentBalance) || currentBalance < 0) {
        throw new LoyaltyApiError(409, 'Customer loyalty balance is invalid');
      }
      if (currentBalance > MAX_STORED_POINTS) {
        throw new LoyaltyApiError(409, 'Customer loyalty balance exceeds the supported range');
      }
      const remainingPoints = currentBalance + pointsAdjustment;
      if (remainingPoints < 0) {
        throw new LoyaltyApiError(400, 'Adjustment cannot make the loyalty balance negative');
      }
      if (remainingPoints > MAX_STORED_POINTS) {
        throw new LoyaltyApiError(400, 'Adjustment exceeds the supported loyalty balance');
      }
      await customer.update({ loyalty_points: remainingPoints }, { transaction });
      const entry = await LoyaltyTransaction.create(
        {
          customerId,
          transactionType: 'ADJUSTMENT',
          pointsDelta: pointsAdjustment,
          previousBalance: currentBalance,
          balanceAfter: remainingPoints,
          monetaryValue: 0,
          description,
          performedBy: req.loyaltyUser.id,
          idempotencyKey,
        },
        { transaction }
      );
      return { transactionId: entry.id, customerId, pointsAdjustment, remainingPoints, replayed: false };
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof LoyaltyApiError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    if (error.name === 'SequelizeUniqueConstraintError' && idempotencyKey) {
      return res.status(409).json({ success: false, message: 'A request with this idempotency key has already been processed' });
    }
    console.error('Adjust loyalty points error:', error);
    return res.status(500).json({ success: false, message: 'Unable to adjust loyalty points' });
  }
};

module.exports = {
  redeemManual,
  redeemGift,
  listGifts,
  createGift,
  updateGift,
  getCustomerTransactions,
  reverseRedemption,
  adjustPoints,
};
