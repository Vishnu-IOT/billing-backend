const { DataTypes } = require('sequelize');
const sequelize = require('../config/sqldb');

const AppSettings = sequelize.define(
    'AppSettings',
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        companyId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'companies',
                key: 'id',
            },
            onDelete: 'CASCADE',
        },

        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id',
            },
            onDelete: 'CASCADE',
        },

        /* ===== INVOICE & BILLING ===== */
        invoicePrefix: {
            type: DataTypes.STRING(20),
            defaultValue: 'INV',
        },

        invoiceYearFormat: {
            type: DataTypes.STRING(20),
            defaultValue: 'YY-YY',
        },

        invoiceSeparator: {
            type: DataTypes.STRING(5),
            defaultValue: '-',
        },

        invoiceStartingNumber: {
            type: DataTypes.STRING(10),
            defaultValue: '1',
        },

        billTheme: {
            type: DataTypes.STRING(50),
            defaultValue: 'classic',
        },

        termsAndConditions: {
            type: DataTypes.TEXT,
            defaultValue: 'Goods once sold will not be returned.',
        },

        defaultDueDays: {
            type: DataTypes.INTEGER,
            defaultValue: 30,
        },

        dateFormat: {
            type: DataTypes.STRING(20),
            defaultValue: 'DD/MM/YYYY',
        },

        showBankDetails: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },

        showUpiQr: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },

        showSignature: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },

        /* ===== TAX & GST ===== */
        gstRegistrationType: {
            type: DataTypes.ENUM('Regular', 'Composite', 'Unregistered'),
            defaultValue: 'Regular',
        },

        defaultTaxRate: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 18.00,
        },

        taxCalculationMode: {
            type: DataTypes.ENUM('Inclusive', 'Exclusive'),
            defaultValue: 'Inclusive',
        },

        hsnDigits: {
            type: DataTypes.ENUM('2', '4', '6', '8'),
            defaultValue: '4',
        },

        roundOffInvoices: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },

        reverseCharge: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },

        /* ===== PAYMENTS ===== */
        defaultPaymentMethod: {
            type: DataTypes.STRING(50),
            defaultValue: 'Cash',
        },

        acceptedPaymentMethods: {
            type: DataTypes.JSON, // Stores array: ['Cash', 'UPI', 'Bank Transfer']
            defaultValue: ['Cash', 'UPI', 'Bank Transfer', 'Cheque'],
        },

        defaultPaymentTerms: {
            type: DataTypes.STRING(50),
            defaultValue: 'Immediate',
        },

        creditLimitWarning: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },

        defaultCreditLimit: {
            type: DataTypes.DECIMAL(12, 2),
            defaultValue: 50000,
        },

        paymentRoundOff: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },

        /* ===== POS & PRINTING ===== */
        printerWidth: {
            type: DataTypes.ENUM('58', '80'),
            defaultValue: '80',
        },

        autoPrint: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },

        scannerEnabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },

        cameraEnabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },

        receiptHeader: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        receiptFooter: {
            type: DataTypes.TEXT,
            defaultValue: 'Thank you for shopping with us!',
        },

        showGstOnReceipt: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },

        posGridItemDisplay: {
            type: DataTypes.STRING(100),
            defaultValue: 'Name + Price',
        },

        /* ===== METADATA ===== */
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },

        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            onUpdate: DataTypes.NOW,
        },
    },
    {
        tableName: 'app_settings',
        timestamps: true,
    }
);

module.exports = AppSettings;