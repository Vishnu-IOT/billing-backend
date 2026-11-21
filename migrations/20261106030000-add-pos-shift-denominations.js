'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('pos_shifts');
    if (!columns.openingDenominations) {
      await queryInterface.addColumn('pos_shifts', 'openingDenominations', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!columns.closingDenominations) {
      await queryInterface.addColumn('pos_shifts', 'closingDenominations', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('pos_shifts');
    if (columns.closingDenominations) {
      await queryInterface.removeColumn('pos_shifts', 'closingDenominations');
    }
    if (columns.openingDenominations) {
      await queryInterface.removeColumn('pos_shifts', 'openingDenominations');
    }
  },
};
