'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('companies', 'email', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
      after: 'display_name',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('companies', 'email');
  },
};
