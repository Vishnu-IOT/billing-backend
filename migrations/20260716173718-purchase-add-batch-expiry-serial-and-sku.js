'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('purchase_items', 'batchNo', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'netRate',
    });

    await queryInterface.addColumn('purchase_items', 'serialNo', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'batchNo',
    });

    await queryInterface.addColumn('purchase_items', 'expiryDate', {
      type: Sequelize.DATEONLY,
      allowNull: true,
      after: 'serialNo',
    });

    await queryInterface.addColumn('purchase_items', 'sku', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'expiryDate',
    });

    await queryInterface.addColumn('purchase_items', 'hsncode', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'sku',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('purchase_items', 'hsncode');
    await queryInterface.removeColumn('purchase_items', 'sku');
    await queryInterface.removeColumn('purchase_items', 'expiryDate');
    await queryInterface.removeColumn('purchase_items', 'serialNo');
    await queryInterface.removeColumn('purchase_items', 'batchNo');
  },
};