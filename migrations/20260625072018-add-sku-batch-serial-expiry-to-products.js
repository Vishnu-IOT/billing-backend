'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'sku', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addColumn('products', 'batchNo', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addColumn('products', 'serialNo', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addColumn('products', 'expiryDate', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('products', 'expiryDate');
    await queryInterface.removeColumn('products', 'serialNo');
    await queryInterface.removeColumn('products', 'batchNo');
    await queryInterface.removeColumn('products', 'sku');
  },
};