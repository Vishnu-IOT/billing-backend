'use strict';

const LOYALTY_SETTING_FIELDS = [
  'loyaltyEnabled',
  'loyaltyAmountPerPoint',
  'loyaltyPointsPerUnit',
  'loyaltyRedemptionEnabled',
  'loyaltyRedemptionAmountPerPoint',
  'loyaltyMinimumRedemptionPoints',
  'loyaltyMaxRedemptionPercentage',
];

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const parseNumber = (value, fieldName) => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  return parsed;
};

const parseAmountPerPoint = (value) => {
  const amount = parseNumber(value, 'loyaltyAmountPerPoint');
  const minorUnits = Math.round(amount * 100);
  if (
    amount > 9999999999.99 ||
    Math.abs(amount * 100 - minorUnits) > Number.EPSILON * Math.max(1, amount * 100)
  ) {
    throw new Error('loyaltyAmountPerPoint must have no more than two decimal places');
  }
  return amount;
};

const validateLoyaltySettingsUpdate = (updates, currentSettings) => {
  const proposed = {
    loyaltyEnabled: currentSettings.loyaltyEnabled,
    loyaltyAmountPerPoint: currentSettings.loyaltyAmountPerPoint,
    loyaltyPointsPerUnit: currentSettings.loyaltyPointsPerUnit,
    loyaltyRedemptionEnabled: currentSettings.loyaltyRedemptionEnabled ?? false,
    loyaltyRedemptionAmountPerPoint:
      currentSettings.loyaltyRedemptionAmountPerPoint ?? 1,
    loyaltyMinimumRedemptionPoints:
      currentSettings.loyaltyMinimumRedemptionPoints ?? 1,
    loyaltyMaxRedemptionPercentage:
      currentSettings.loyaltyMaxRedemptionPercentage ?? 100,
  };

  if (hasOwn(updates, 'loyaltyEnabled')) {
    if (typeof updates.loyaltyEnabled !== 'boolean') {
      throw new Error('loyaltyEnabled must be a boolean');
    }
    proposed.loyaltyEnabled = updates.loyaltyEnabled;
  }

  if (hasOwn(updates, 'loyaltyAmountPerPoint')) {
    proposed.loyaltyAmountPerPoint = parseAmountPerPoint(updates.loyaltyAmountPerPoint);
  } else {
    proposed.loyaltyAmountPerPoint = parseAmountPerPoint(proposed.loyaltyAmountPerPoint);
  }

  if (hasOwn(updates, 'loyaltyPointsPerUnit')) {
    proposed.loyaltyPointsPerUnit = parseNumber(
      updates.loyaltyPointsPerUnit,
      'loyaltyPointsPerUnit'
    );
  } else {
    proposed.loyaltyPointsPerUnit = parseNumber(
      proposed.loyaltyPointsPerUnit,
      'loyaltyPointsPerUnit'
    );
  }

  if (proposed.loyaltyEnabled !== true && proposed.loyaltyEnabled !== false) {
    throw new Error('loyaltyEnabled must be a boolean');
  }
  if (proposed.loyaltyAmountPerPoint < 0 ||
      (proposed.loyaltyEnabled && proposed.loyaltyAmountPerPoint === 0)) {
    throw new Error(
      'loyaltyAmountPerPoint must be greater than zero when loyalty is enabled'
    );
  }
  if (
    !Number.isSafeInteger(proposed.loyaltyPointsPerUnit) ||
    proposed.loyaltyPointsPerUnit <= 0 ||
    proposed.loyaltyPointsPerUnit > 2147483647
  ) {
    throw new Error('loyaltyPointsPerUnit must be a positive whole number');
  }

  if (hasOwn(updates, 'loyaltyRedemptionEnabled')) {
    if (typeof updates.loyaltyRedemptionEnabled !== 'boolean') {
      throw new Error('loyaltyRedemptionEnabled must be a boolean');
    }
    proposed.loyaltyRedemptionEnabled = updates.loyaltyRedemptionEnabled;
  }
  if (hasOwn(updates, 'loyaltyRedemptionAmountPerPoint')) {
    proposed.loyaltyRedemptionAmountPerPoint = parseAmountPerPoint(
      updates.loyaltyRedemptionAmountPerPoint
    );
  } else {
    proposed.loyaltyRedemptionAmountPerPoint = parseAmountPerPoint(
      proposed.loyaltyRedemptionAmountPerPoint
    );
  }
  if (
    proposed.loyaltyRedemptionAmountPerPoint <= 0 ||
    proposed.loyaltyRedemptionAmountPerPoint > 9999999999.99
  ) {
    throw new Error('loyaltyRedemptionAmountPerPoint must be greater than zero');
  }
  if (hasOwn(updates, 'loyaltyMinimumRedemptionPoints')) {
    proposed.loyaltyMinimumRedemptionPoints = parseNumber(
      updates.loyaltyMinimumRedemptionPoints,
      'loyaltyMinimumRedemptionPoints'
    );
  } else {
    proposed.loyaltyMinimumRedemptionPoints = parseNumber(
      proposed.loyaltyMinimumRedemptionPoints,
      'loyaltyMinimumRedemptionPoints'
    );
  }
  if (
    !Number.isSafeInteger(proposed.loyaltyMinimumRedemptionPoints) ||
    proposed.loyaltyMinimumRedemptionPoints <= 0 ||
    proposed.loyaltyMinimumRedemptionPoints > 2147483647
  ) {
    throw new Error('loyaltyMinimumRedemptionPoints must be a positive whole number');
  }
  if (hasOwn(updates, 'loyaltyMaxRedemptionPercentage')) {
    proposed.loyaltyMaxRedemptionPercentage = parseNumber(
      updates.loyaltyMaxRedemptionPercentage,
      'loyaltyMaxRedemptionPercentage'
    );
  } else {
    proposed.loyaltyMaxRedemptionPercentage = parseNumber(
      proposed.loyaltyMaxRedemptionPercentage,
      'loyaltyMaxRedemptionPercentage'
    );
  }
  if (
    proposed.loyaltyMaxRedemptionPercentage < 0 ||
    proposed.loyaltyMaxRedemptionPercentage > 100 ||
    Math.abs(
      proposed.loyaltyMaxRedemptionPercentage * 100 -
        Math.round(proposed.loyaltyMaxRedemptionPercentage * 100)
    ) > Number.EPSILON * 100
  ) {
    throw new Error('loyaltyMaxRedemptionPercentage must be between 0 and 100 with at most two decimal places');
  }

  return Object.fromEntries(
    LOYALTY_SETTING_FIELDS
      .filter((field) => hasOwn(updates, field))
      .map((field) => [field, proposed[field]])
  );
};

const calculateLoyaltyPoints = (eligibleAmount, settings) => {
  if (!settings) {
    throw new Error('Loyalty settings are unavailable for this company');
  }
  if (settings.loyaltyEnabled === false) {
    return 0;
  }
  if (settings.loyaltyEnabled !== true) {
    throw new Error('Loyalty enabled setting is missing or invalid');
  }

  const amount = parseNumber(eligibleAmount, 'Eligible purchase amount');
  const amountPerPoint = parseAmountPerPoint(settings.loyaltyAmountPerPoint);
  const pointsPerUnit = parseNumber(
    settings.loyaltyPointsPerUnit,
    'loyaltyPointsPerUnit'
  );
  const eligibleMinorUnits = Math.round(amount * 100);
  const thresholdMinorUnits = Math.round(amountPerPoint * 100);

  if (!Number.isSafeInteger(eligibleMinorUnits) || eligibleMinorUnits < 0) {
    throw new Error('Eligible purchase amount must be a non-negative valid amount');
  }
  if (!Number.isSafeInteger(thresholdMinorUnits) || thresholdMinorUnits <= 0) {
    throw new Error('loyaltyAmountPerPoint must be greater than zero');
  }
  if (
    !Number.isSafeInteger(pointsPerUnit) ||
    pointsPerUnit <= 0 ||
    pointsPerUnit > 2147483647
  ) {
    throw new Error('loyaltyPointsPerUnit must be a positive whole number');
  }

  const points = Math.floor(eligibleMinorUnits / thresholdMinorUnits) * pointsPerUnit;
  if (!Number.isSafeInteger(points) || points > 2147483647) {
    throw new Error('Calculated loyalty points exceed the supported balance range');
  }

  return points;
};

module.exports = {
  LOYALTY_SETTING_FIELDS,
  validateLoyaltySettingsUpdate,
  calculateLoyaltyPoints,
};
