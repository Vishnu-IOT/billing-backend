'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'profitMargin', {
      type: Sequelize.DECIMAL(8, 2),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('products', 'profitMargin');
  },
};
