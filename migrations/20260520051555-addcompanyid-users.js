'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove old foreign key
    await queryInterface.removeConstraint('companies', 'companies_ibfk_1');

    // Remove old column
    await queryInterface.removeColumn('companies', 'userId');

    // Add companyId in users table
    await queryInterface.addColumn('users', 'companyId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Add foreign key constraint
    await queryInterface.addConstraint('users', {
      fields: ['companyId'],
      type: 'foreign key',
      name: 'fk_users_company',
      references: {
        table: 'companies',
        field: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove companyId foreign key
    await queryInterface.removeConstraint('users', 'fk_users_company');

    // Remove companyId column
    await queryInterface.removeColumn('users', 'companyId');

    // Add back userId column in companies
    await queryInterface.addColumn('companies', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    // Re-add old foreign key
    await queryInterface.addConstraint('companies', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'companies_ibfk_1',
      references: {
        table: 'users',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },
};
