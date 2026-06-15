'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add phone column
    await queryInterface.addColumn('companies', 'phone', {
      type: Sequelize.STRING(30),
      allowNull: true,
      after: 'email',
    });

    // Remove currency column
    await queryInterface.removeColumn('companies', 'currency');
  },

  async down(queryInterface, Sequelize) {
    // Add back currency column
    await queryInterface.addColumn('companies', 'currency', {
      type: Sequelize.CHAR(3),
      allowNull: true,
    });

    // Remove phone column
    await queryInterface.removeColumn('companies', 'phone');
  },
};
