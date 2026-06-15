'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'customerId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'customers', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales', 'customerId');
  },
};
