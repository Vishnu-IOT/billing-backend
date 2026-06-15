'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'po_number', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('sales', 'eway_bill', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('purchases', 'po_number', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('purchases', 'eway_bill', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales', 'po_number');
    await queryInterface.removeColumn('sales', 'eway_bill');
    await queryInterface.removeColumn('purchases', 'po_number');
    await queryInterface.removeColumn('purchases', 'eway_bill');
  },
};
