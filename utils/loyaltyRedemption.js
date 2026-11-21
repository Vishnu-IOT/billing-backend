'use strict';

const toCents = (value, label) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be a non-negative amount`);
  }
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${label} is outside the supported amount range`);
  }
  return cents;
};

const calculateLoyaltyRedemption = ({
  requestedPoints,
  balance,
  totalAmount,
  returnCreditAmount = 0,
  settings,
}) => {
  const points = Number(requestedPoints);
  const availablePoints = Number(balance);
  if (!Number.isSafeInteger(points) || points < 0) {
    throw new Error('Loyalty points to redeem must be a non-negative whole number');
  }
  if (!Number.isSafeInteger(availablePoints) || availablePoints < 0) {
    throw new Error('Customer loyalty balance is invalid');
  }
  if (points === 0) return { pointsRedeemed: 0, amount: 0 };
  if (settings?.loyaltyRedemptionEnabled !== true) {
    throw new Error('Loyalty redemption is not enabled for this company');
  }
  if (points > availablePoints) {
    throw new Error('Customer does not have enough loyalty points');
  }
  const minimumPoints = Number(settings.loyaltyMinimumRedemptionPoints ?? 1);
  if (!Number.isSafeInteger(minimumPoints) || minimumPoints < 1) {
    throw new Error('Company minimum loyalty redemption setting is invalid');
  }
  if (points < minimumPoints) {
    throw new Error(`At least ${minimumPoints} loyalty points are required to redeem`);
  }

  const rateCents = toCents(
    settings.loyaltyRedemptionAmountPerPoint,
    'Loyalty redemption value per point'
  );
  if (rateCents <= 0) throw new Error('Loyalty redemption value per point must be greater than zero');

  const percentage = Number(settings.loyaltyMaxRedemptionPercentage);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('Company loyalty redemption limit is invalid');
  }
  const percentageBasisPoints = Math.round(percentage * 100);
  const amountCents = points * rateCents;
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error('Loyalty redemption amount is outside the supported range');
  }
  const balanceDueCents = Math.max(
    0,
    toCents(totalAmount, 'Sale total') -
      toCents(returnCreditAmount, 'Return credit')
  );
  const maximumCents = Math.floor(
    (balanceDueCents * percentageBasisPoints) / 10000
  );
  if (amountCents > maximumCents) {
    throw new Error('Loyalty redemption exceeds the company limit for this sale');
  }
  return { pointsRedeemed: points, amount: amountCents / 100 };
};

const prorateLoyaltyPoints = (totalPoints, totalReturnedAmount, saleTotal) => {
  const points = Number(totalPoints);
  const returnedCents = toCents(totalReturnedAmount, 'Returned amount');
  const saleCents = toCents(saleTotal, 'Sale total');
  if (!Number.isSafeInteger(points) || points < 0) {
    throw new Error('Loyalty point total is invalid');
  }
  if (saleCents <= 0 || returnedCents <= 0 || points === 0) return 0;
  if (returnedCents >= saleCents) return points;
  return Math.floor((points * returnedCents) / saleCents);
};

module.exports = { calculateLoyaltyRedemption, prorateLoyaltyPoints };
