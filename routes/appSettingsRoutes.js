const express = require('express');
const router = express.Router();

const {
    getAppSettings,
    updateAppSettings,
    updateSettingField,
    resetSettings,
    getSettingsByCompanies,
} = require('../mysql-controllers/appSettingsController');

// GET all settings for current company
router.get('/', getAppSettings);

// PUT update all settings
router.put('/', updateAppSettings);

// PATCH update single field
router.patch('/:field', updateSettingField);

// POST reset to defaults
router.post('/reset', resetSettings);

// GET settings for multiple companies
router.get('/companies/:companyIds', getSettingsByCompanies);

module.exports = router;