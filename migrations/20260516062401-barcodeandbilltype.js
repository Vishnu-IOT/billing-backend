'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'bill_type', {
      type: Sequelize.ENUM('B2B', 'B2C'),
      allowNull: false,
      defaultValue: 'B2C',
    });

    await queryInterface.addColumn('products', 'barcode', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('customers', 'loyalty_points', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales', 'bill_type');
    await queryInterface.removeColumn('products', 'barcode');
    await queryInterface.removeColumn('customers', 'loyalty_points');
  },
};
