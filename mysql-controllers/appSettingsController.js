// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║          FILE: appSettingsController.js                                      ║
// ║          LOCATION: backend/mysql-controllers/appSettingsController.js        ║
// ║          COPY THIS ENTIRE FILE TO YOUR PROJECT                              ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const AppSettings = require('../mysql-models/AppSettings');
const Company = require('../mysql-models/Company');
const InvoiceSettings = require('../mysql-models/Invoice_Settings');

/**
 * Keeps invoice_settings.invoice_prefix in sync with app_settings.invoicePrefix.
 * Does NOT touch next_sequence_no - that counter must only ever be
 * incremented from salesController when a real invoice is created.
 */
const syncInvoicePrefixToInvoiceSettings = async (companyId, invoicePrefix) => {
    if (!invoicePrefix) return;

    const [invoiceSettings] = await InvoiceSettings.findOrCreate({
        where: { companyId },
        defaults: { invoice_prefix: invoicePrefix, next_sequence_no: 1 },
    });

    if (invoiceSettings.invoice_prefix !== invoicePrefix) {
        await invoiceSettings.update({ invoice_prefix: invoicePrefix });
    }
};

/**
 * @desc    Get all application settings for a company
 * @route   GET /api/app-settings
 * @access  Protected
 */
const getAppSettings = async (req, res) => {
    try {
        // Get companyId from authenticated user (assuming it's set in middleware)
        const companyId = req.query.companyId || 1; // Fallback to company 1
        const userId = req.user?.id || null; // Optional: user-specific settings

        let settings = await AppSettings.findOne({
            where: { companyId },
        });

        // If no settings exist, create default settings for this company
        if (!settings) {
            settings = await AppSettings.create({
                companyId,
                userId,
            });
        }

        return res.status(200).json({
            success: true,
            data: settings,
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * @desc    Update application settings
 * @route   PUT /api/app-settings
 * @access  Protected
 */
const updateAppSettings = async (req, res) => {
    try {
        const companyId = req.body.companyId || 1;
        const settingsUpdate = req.body.settings;

        if (!settingsUpdate || Object.keys(settingsUpdate).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No settings provided to update',
            });
        }

        // Find existing settings
        let settings = await AppSettings.findOne({
            where: { companyId },
        });

        // Create if not exists
        if (!settings) {
            settings = await AppSettings.create({
                companyId,
                ...settingsUpdate,
            });
        } else {
            // Update existing
            await settings.update(settingsUpdate);
        }

        if (settingsUpdate.invoicePrefix) {
            await syncInvoicePrefixToInvoiceSettings(companyId, settingsUpdate.invoicePrefix);
        }

        return res.status(200).json({
            success: true,
            message: 'Settings updated successfully',
            data: settings,
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * @desc    Update specific setting field
 * @route   PATCH /api/app-settings/:field
 * @access  Protected
 */
const updateSettingField = async (req, res) => {
    try {
        const { field } = req.params;
        const { value, companyId = 1 } = req.body;

        if (!field || value === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Field name and value are required',
            });
        }

        // Allowed fields (to prevent injection)
        const allowedFields = [
            'invoicePrefix',
            'invoiceYearFormat',
            'invoiceSeparator',
            'invoiceStartingNumber',
            'billTheme',
            'termsAndConditions',
            'defaultDueDays',
            'dateFormat',
            'showBankDetails',
            'showUpiQr',
            'showSignature',
            'gstRegistrationType',
            'defaultTaxRate',
            'taxCalculationMode',
            'hsnDigits',
            'roundOffInvoices',
            'reverseCharge',
            'defaultPaymentMethod',
            'acceptedPaymentMethods',
            'defaultPaymentTerms',
            'creditLimitWarning',
            'defaultCreditLimit',
            'paymentRoundOff',
            'printerWidth',
            'autoPrint',
            'scannerEnabled',
            'cameraEnabled',
            'receiptHeader',
            'receiptFooter',
            'showGstOnReceipt',
            'posGridItemDisplay',
        ];

        if (!allowedFields.includes(field)) {
            return res.status(400).json({
                success: false,
                message: `Field "${field}" is not allowed`,
            });
        }

        let settings = await AppSettings.findOne({
            where: { companyId },
        });

        if (!settings) {
            settings = await AppSettings.create({
                companyId,
                [field]: value,
            });
        } else {
            await settings.update({ [field]: value });
        }

        if (field === 'invoicePrefix') {
            await syncInvoicePrefixToInvoiceSettings(companyId, value);
        }

        return res.status(200).json({
            success: true,
            message: `${field} updated successfully`,
            data: settings,
        });
    } catch (error) {
        console.error('Error updating setting field:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * @desc    Reset settings to defaults
 * @route   POST /api/app-settings/reset
 * @access  Protected
 */
const resetSettings = async (req, res) => {
    try {
        const companyId = req.body.companyId || 1;

        await AppSettings.destroy({
            where: { companyId },
        });

        const newSettings = await AppSettings.create({
            companyId,
        });

        return res.status(200).json({
            success: true,
            message: 'Settings reset to defaults',
            data: newSettings,
        });
    } catch (error) {
        console.error('Error resetting settings:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * @desc    Get settings for multiple companies (admin only)
 * @route   GET /api/app-settings/companies/:companyIds
 * @access  Protected
 */
const getSettingsByCompanies = async (req, res) => {
    try {
        const { companyIds } = req.params; // comma-separated IDs
        const idArray = companyIds.split(',').map(Number);

        const settingsList = await AppSettings.findAll({
            where: {
                companyId: { [require('sequelize').Op.in]: idArray },
            },
        });

        return res.status(200).json({
            success: true,
            data: settingsList,
        });
    } catch (error) {
        console.error('Error fetching settings for companies:', error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

module.exports = {
    getAppSettings,
    updateAppSettings,
    updateSettingField,
    resetSettings,
    getSettingsByCompanies,
};