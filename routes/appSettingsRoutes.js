const express = require('express');
const router = express.Router();

const {
    getAppSettings,
    updateAppSettings,
    updateSettingField,
    resetSettings,
    getSettingsByCompanies,
} = require('../mysql-controllers/appSettingsController');
const {
    authenticateLoyaltyUser,
    requireLoyaltyAdmin,
} = require('../middleware/loyaltyAuth');
const { getSettingsUpdate } = require('../utils/settingsPayload');

const loyaltySettingFields = new Set([
    'loyaltyEnabled',
    'loyaltyAmountPerPoint',
    'loyaltyPointsPerUnit',
]);

const loyaltySettingsAdminGuard = ({ always = false } = {}) => (req, res, next) => {
    const update = req.method === 'PATCH'
        ? { [req.params.field]: true }
        : getSettingsUpdate(req.body);
    const changesLoyaltySettings =
        update && typeof update === 'object' &&
        Object.keys(update).some((field) => loyaltySettingFields.has(field));

    if (!always && !changesLoyaltySettings) {
        return next();
    }

    return authenticateLoyaltyUser(req, res, () =>
        requireLoyaltyAdmin(req, res, () => {
            const requestedCompanyIds = [
                req.body?.companyId,
                req.body?.settings?.companyId,
            ].filter((companyId) => companyId !== undefined && companyId !== null);
            const authenticatedCompanyId = Number(req.loyaltyUser.companyId);

            if (
                requestedCompanyIds.some(
                    (companyId) => Number(companyId) !== authenticatedCompanyId
                )
            ) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only update settings for your company',
                });
            }

            if (!req.body) {
                req.body = {};
            }
            req.body.companyId = authenticatedCompanyId;
            return next();
        })
    );
};

// GET all settings for current company
router.get('/', getAppSettings);

// PUT update all settings
router.put('/', loyaltySettingsAdminGuard(), updateAppSettings);

// PATCH update single field
router.patch('/:field', loyaltySettingsAdminGuard(), updateSettingField);

// POST reset to defaults
router.post('/reset', loyaltySettingsAdminGuard({ always: true }), resetSettings);

// GET settings for multiple companies
router.get('/companies/:companyIds', getSettingsByCompanies);

module.exports = router;