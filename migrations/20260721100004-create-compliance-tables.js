'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('einvoices', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      saleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'sales',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      billType: {
        type: Sequelize.STRING,
        defaultValue: 'SALE',
      },
      irn: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      ackNo: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      ackDate: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      qrCode: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('GENERATED', 'CANCELLED'),
        defaultValue: 'GENERATED',
      },
      cancelReason: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      cancelDate: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.createTable('ewaybills', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      saleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'sales',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      billType: {
        type: Sequelize.STRING,
        defaultValue: 'SALE',
      },
      ewbNo: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      ewbDate: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      validUpto: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      transporterId: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      transporterName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      distance: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      vehicleNo: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('GENERATED', 'CANCELLED'),
        defaultValue: 'GENERATED',
      },
      cancelReason: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      cancelDate: {
        type: Sequelize.DATE,
        allowNull: true,
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
    await queryInterface.dropTable('ewaybills');
    await queryInterface.dropTable('einvoices');
  },
};
