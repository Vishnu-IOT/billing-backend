'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notification_templates', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      channel: {
        type: Sequelize.ENUM('whatsapp', 'sms', 'email'),
        allowNull: false,
      },
      event: {
        type: Sequelize.ENUM('invoice', 'overdue'),
        allowNull: false,
      },
      templateText: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      companyId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('notification_templates');
  },
};
