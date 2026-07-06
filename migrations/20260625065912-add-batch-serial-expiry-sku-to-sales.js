'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales_items', 'batchNo', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'netRate',
    });

    await queryInterface.addColumn('sales_items', 'serialNo', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'batchNo',
    });

    await queryInterface.addColumn('sales_items', 'expiryDate', {
      type: Sequelize.DATEONLY,
      allowNull: true,
      after: 'serialNo',
    });

    await queryInterface.addColumn('sales_items', 'sku', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'expiryDate',
    });

    await queryInterface.addColumn('sales_items', 'hsncode', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'sku',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales_items', 'hsncode');
    await queryInterface.removeColumn('sales_items', 'sku');
    await queryInterface.removeColumn('sales_items', 'expiryDate');
    await queryInterface.removeColumn('sales_items', 'serialNo');
    await queryInterface.removeColumn('sales_items', 'batchNo');
  },
};