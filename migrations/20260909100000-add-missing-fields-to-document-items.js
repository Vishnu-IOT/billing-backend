'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('document_items', 'discountPercentage', {
      type: Sequelize.DECIMAL(5, 2),
      defaultValue: 0.0,
    });
    await queryInterface.addColumn('document_items', 'discountAmount', {
      type: Sequelize.DECIMAL(12, 2),
      defaultValue: 0.0,
    });
    await queryInterface.addColumn('document_items', 'hsnCode', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('document_items', 'sku', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('document_items', 'batchNumber', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('document_items', 'serialNumber', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('document_items', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('document_items', 'expiryDate', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('document_items', 'discountPercentage');
    await queryInterface.removeColumn('document_items', 'discountAmount');
    await queryInterface.removeColumn('document_items', 'hsnCode');
    await queryInterface.removeColumn('document_items', 'sku');
    await queryInterface.removeColumn('document_items', 'batchNumber');
    await queryInterface.removeColumn('document_items', 'serialNumber');
    await queryInterface.removeColumn('document_items', 'notes');
    await queryInterface.removeColumn('document_items', 'expiryDate');
  },
};
