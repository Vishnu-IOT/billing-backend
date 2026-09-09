'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'amountPaid', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    });

    await queryInterface.addColumn('purchases', 'amountPaid', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales', 'amountPaid');
    await queryInterface.removeColumn('purchases', 'amountPaid');
  },
};
