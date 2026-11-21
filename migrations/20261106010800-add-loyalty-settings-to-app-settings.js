'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('app_settings', 'loyaltyEnabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.addColumn('app_settings', 'loyaltyAmountPerPoint', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 100,
    });

    await queryInterface.addColumn('app_settings', 'loyaltyPointsPerUnit', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('app_settings', 'loyaltyPointsPerUnit');
    await queryInterface.removeColumn('app_settings', 'loyaltyAmountPerPoint');
    await queryInterface.removeColumn('app_settings', 'loyaltyEnabled');
  },
};
