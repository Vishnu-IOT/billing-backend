'use strict';

const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    await queryInterface.bulkInsert('users', [
      {
        name: 'Admin',
        email: 'admin12@gmail.com',
        phone: '9876543210',
        password_hash: hashedPassword,
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', {
      email: 'admin@example.com'
    });
  }
};