'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'purchasePriceType', {
      type: Sequelize.ENUM('WITH_GST', 'WITHOUT_GST'),
      allowNull: false,
      defaultValue: 'WITHOUT_GST',
    });

    await queryInterface.addColumn('products', 'sellingPriceType', {
      type: Sequelize.ENUM('WITH_GST', 'WITHOUT_GST'),
      allowNull: false,
      defaultValue: 'WITHOUT_GST',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('products', 'sellingPriceType');
    await queryInterface.removeColumn('products', 'purchasePriceType');
  },
};
