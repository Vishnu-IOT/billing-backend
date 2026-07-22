'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('documents', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      documentType: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      documentNumber: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      validUntil: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      partyId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'parties',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      subTotal: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
      },
      taxAmount: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
      },
      discount: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
      },
      totalAmount: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
      },
      status: {
        type: Sequelize.STRING,
        defaultValue: 'draft',
      },
      convertedInvoiceId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      terms: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      companyId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.createTable('document_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      documentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'documents',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      productId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      quantity: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 1,
      },
      unit: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      price: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
      },
      tax: {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0.00,
      },
      total: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('document_items');
    await queryInterface.dropTable('documents');
  },
};
