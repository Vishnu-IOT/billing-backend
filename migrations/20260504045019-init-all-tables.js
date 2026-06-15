'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Owners
    await queryInterface.createTable('owners', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      gst: { type: Sequelize.STRING, unique: true, allowNull: false },
      phone: { type: Sequelize.STRING, allowNull: false },
      email: Sequelize.STRING,
      address: Sequelize.TEXT,
      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 2. Categories
    await queryInterface.createTable('categories', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      category: { type: Sequelize.STRING, unique: true, allowNull: false },
      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 3. Parties
    await queryInterface.createTable('parties', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      gst: { type: Sequelize.STRING, unique: true, allowNull: false },
      phone: { type: Sequelize.STRING, allowNull: false },
      email: Sequelize.STRING,
      address: Sequelize.TEXT,
      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 4. Customers
    await queryInterface.createTable('customers', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      phone: { type: Sequelize.STRING, allowNull: false },
      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 5. Users
    await queryInterface.createTable('users', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, unique: true, allowNull: false },
      password_hash: { type: Sequelize.STRING, allowNull: false },
      role: {
        type: Sequelize.ENUM('Owner', 'Admin', 'Staff'),
        defaultValue: 'Owner',
      },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      last_login_at: Sequelize.DATE,
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 6. Companies
    await queryInterface.createTable('companies', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      userId: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      slug: { type: Sequelize.STRING, unique: true },
      legal_name: { type: Sequelize.STRING, allowNull: false },
      display_name: Sequelize.STRING,
      business_type: {
        type: Sequelize.ENUM('Retail', 'Wholesale', 'Service', 'Manufacturing'),
        defaultValue: 'Wholesale',
      },
      industry: Sequelize.STRING,
      website: Sequelize.STRING,
      address_line1: Sequelize.STRING,
      address_line2: Sequelize.STRING,
      city: Sequelize.STRING,
      state_code: Sequelize.STRING,
      pincode: Sequelize.STRING,
      country_code: Sequelize.STRING,
      logo_url: Sequelize.TEXT,
      brand_color: Sequelize.STRING,
      currency: Sequelize.STRING,
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 7. Company Financials
    await queryInterface.createTable('company_financials', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      gstin: { type: Sequelize.STRING, unique: true },
      pan: { type: Sequelize.STRING, unique: true },
      tan: Sequelize.STRING,
      cin: Sequelize.STRING,
      bank_name: Sequelize.STRING,
      bank_account_enc: Sequelize.TEXT,
      ifsc_code: Sequelize.STRING,
      account_type: Sequelize.ENUM('Savings', 'Current', 'Salary', 'Other'),
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 8. Invoice Settings
    await queryInterface.createTable('invoice_settings', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      companyId: {
        type: Sequelize.INTEGER,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      invoice_prefix: Sequelize.STRING,
      next_sequence_no: { type: Sequelize.INTEGER, defaultValue: 1 },
      date_format: Sequelize.STRING,
      due_days: Sequelize.INTEGER,
      footer_text: Sequelize.TEXT,
      auto_send_on_create: { type: Sequelize.BOOLEAN, defaultValue: false },
      send_receipt_email: { type: Sequelize.BOOLEAN, defaultValue: false },
      attach_pdf: { type: Sequelize.BOOLEAN, defaultValue: false },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 9. Products
    await queryInterface.createTable('products', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      HSNCode: { type: Sequelize.STRING, unique: true },
      MRP: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      taxRate: { type: Sequelize.INTEGER, defaultValue: 0 },
      salesPrice: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      purchasePrice: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      discount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      stockQuantity: { type: Sequelize.INTEGER, defaultValue: 0 },
      unit: {
        type: Sequelize.ENUM(
          'pcs',
          'kg',
          'g',
          'ltr',
          'ml',
          'box',
          'packet',
          'mtr',
          'nos'
        ),
        defaultValue: 'pcs',
      },
      categoryId: {
        type: Sequelize.INTEGER,
        references: { model: 'categories', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 10. Sales
    await queryInterface.createTable('sales', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      invoiceNumber: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },

      partyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'parties',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      global_discount_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0,
      },

      global_discount_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      baseRate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      tax: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      totalAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      paymentStatus: {
        type: Sequelize.ENUM('Paid', 'Unpaid', 'Overdue', 'Cancelled'),
        defaultValue: 'Unpaid',
      },

      saleDate: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },

      receiptDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },

      paymentMode: {
        type: Sequelize.ENUM('Cash', 'Cheque', 'Online', 'NEFT/RTGS'),
        defaultValue: 'Cash',
      },

      receiptNo: {
        type: Sequelize.STRING(50),
        unique: true,
        allowNull: true,
      },

      referenceNo: {
        type: Sequelize.STRING(50),
        unique: true,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },

      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    // 11. Sales Items
    await queryInterface.createTable('sales_items', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },

      saleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sales', key: 'id' },
        onDelete: 'CASCADE',
      },

      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
      },

      productName: { type: Sequelize.STRING, allowNull: false },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },

      discountPercentage: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
      discountAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      baseRate: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },

      taxPercentage: { type: Sequelize.INTEGER, defaultValue: 0 },
      taxAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },

      netRate: { type: Sequelize.DECIMAL(10, 2), allowNull: false },

      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 12. Purchases
    await queryInterface.createTable('purchases', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      invoiceNumber: { type: Sequelize.STRING, unique: true, allowNull: false },

      partyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'parties', key: 'id' },
        onDelete: 'CASCADE',
      },

      global_discount_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0,
      },
      global_discount_amount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      baseRate: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      tax: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      totalAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },

      paymentStatus: {
        type: Sequelize.ENUM('Paid', 'Unpaid', 'Overdue', 'Cancelled'),
        defaultValue: 'Unpaid',
      },

      purchaseDate: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },

      receiptDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },

      paymentMode: {
        type: Sequelize.ENUM('Cash', 'Cheque', 'Online', 'NEFT/RTGS'),
        defaultValue: 'Cash',
      },

      receiptNo: {
        type: Sequelize.STRING(50),
        unique: true,
        allowNull: true,
      },

      referenceNo: {
        type: Sequelize.STRING(50),
        unique: true,
        allowNull: true,
      },

      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 13. Purchase Items
    await queryInterface.createTable('purchase_items', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },

      purchaseId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'purchases', key: 'id' },
        onDelete: 'CASCADE',
      },

      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
      },

      productName: { type: Sequelize.STRING, allowNull: false },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },

      discountPercentage: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
      discountAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      baseRate: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },

      taxPercentage: { type: Sequelize.INTEGER, defaultValue: 0 },
      taxAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },

      netRate: { type: Sequelize.DECIMAL(10, 2), allowNull: false },

      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 14. Payments
    await queryInterface.createTable('payments', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },

      saleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sales', key: 'id' },
        onDelete: 'CASCADE',
      },

      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },

      paymentMethod: {
        type: Sequelize.ENUM('Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'),
        allowNull: false,
      },

      paymentDate: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      note: Sequelize.TEXT,

      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 15. Stock History
    await queryInterface.createTable('stock_history', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },

      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'CASCADE',
      },

      actionType: {
        type: Sequelize.ENUM('PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN'),
        allowNull: false,
      },

      quantity: { type: Sequelize.INTEGER, allowNull: false },
      oldStock: { type: Sequelize.INTEGER, allowNull: false },
      newStock: { type: Sequelize.INTEGER, allowNull: false },

      referenceId: Sequelize.INTEGER,

      referenceType: {
        type: Sequelize.ENUM('SALE', 'PURCHASE', 'MANUAL'),
        defaultValue: 'MANUAL',
      },

      note: Sequelize.TEXT,

      createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropAllTables();
    await queryInterface.dropTable('stock_history');
    await queryInterface.dropTable('payments');
    await queryInterface.dropTable('purchase_items');
    await queryInterface.dropTable('sales_items');
    await queryInterface.dropTable('purchases');
    await queryInterface.dropTable('sales');
    await queryInterface.dropTable('products');
    await queryInterface.dropTable('invoice_settings');
    await queryInterface.dropTable('company_financials');
    await queryInterface.dropTable('companies');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('customers');
    await queryInterface.dropTable('parties');
    await queryInterface.dropTable('categories');
    await queryInterface.dropTable('owners');
  },
};
