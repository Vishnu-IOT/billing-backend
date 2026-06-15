'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
      after: 'partyId',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales', 'userId');
  },
};
