'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('app_settings', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      companyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'companies',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      // Invoice & Billing
      invoicePrefix: {
        type: Sequelize.STRING(20),
        defaultValue: 'INV',
      },

      invoiceYearFormat: {
        type: Sequelize.STRING(20),
        defaultValue: 'YY-YY',
      },

      invoiceSeparator: {
        type: Sequelize.STRING(5),
        defaultValue: '-',
      },

      invoiceStartingNumber: {
        type: Sequelize.STRING(10),
        defaultValue: '1',
      },

      billTheme: {
        type: Sequelize.STRING(50),
        defaultValue: 'classic',
      },

      termsAndConditions: {
        type: Sequelize.TEXT,
        defaultValue: 'Goods once sold will not be returned.',
      },

      defaultDueDays: {
        type: Sequelize.INTEGER,
        defaultValue: 30,
      },

      dateFormat: {
        type: Sequelize.STRING(20),
        defaultValue: 'DD/MM/YYYY',
      },

      showBankDetails: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      showUpiQr: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      showSignature: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      // Tax & GST
      gstRegistrationType: {
        type: Sequelize.ENUM('Regular', 'Composite', 'Unregistered'),
        defaultValue: 'Regular',
      },

      defaultTaxRate: {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 18.00,
      },

      taxCalculationMode: {
        type: Sequelize.ENUM('Inclusive', 'Exclusive'),
        defaultValue: 'Inclusive',
      },

      hsnDigits: {
        type: Sequelize.ENUM('2', '4', '6', '8'),
        defaultValue: '4',
      },

      roundOffInvoices: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      reverseCharge: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      // Payments
      defaultPaymentMethod: {
        type: Sequelize.STRING(50),
        defaultValue: 'Cash',
      },

      acceptedPaymentMethods: {
        type: Sequelize.JSON,
        defaultValue: ['Cash', 'UPI', 'Bank Transfer', 'Cheque'],
      },

      defaultPaymentTerms: {
        type: Sequelize.STRING(50),
        defaultValue: 'Immediate',
      },

      creditLimitWarning: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      defaultCreditLimit: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 50000,
      },

      paymentRoundOff: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      // POS & Printing
      printerWidth: {
        type: Sequelize.ENUM('58', '80'),
        defaultValue: '80',
      },

      autoPrint: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      scannerEnabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      cameraEnabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      receiptHeader: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      receiptFooter: {
        type: Sequelize.TEXT,
        defaultValue: 'Thank you for shopping with us!',
      },

      showGstOnReceipt: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      posGridItemDisplay: {
        type: Sequelize.STRING(100),
        defaultValue: 'Name + Price',
      },

      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        allowNull: false,
      },
    });

    // Add unique index on companyId (only 1 company-wide setting per company)
    await queryInterface.addIndex('app_settings', ['companyId'], {
      unique: true,
      name: 'unique_company_settings',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('app_settings');
  },
};