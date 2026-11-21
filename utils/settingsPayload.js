'use strict';

const RESERVED_SETTINGS_KEYS = new Set([
  'id',
  'companyId',
  'userId',
  'createdAt',
  'updatedAt',
]);

const getSettingsUpdate = (body = {}) => {
  const source = body.settings &&
    typeof body.settings === 'object' &&
    !Array.isArray(body.settings)
    ? body.settings
    : body;

  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !RESERVED_SETTINGS_KEYS.has(key))
  );
};

module.exports = { getSettingsUpdate };
