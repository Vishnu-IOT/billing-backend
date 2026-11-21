'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        String(typeof table === 'string' ? table : table.tableName).toLowerCase()
      )
    );
    if (!tables.has('sales')) return;

    const columns = await queryInterface.describeTable('sales');
    if (!columns.roundOff) {
      await queryInterface.addColumn('sales', 'roundOff', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const tables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        String(typeof table === 'string' ? table : table.tableName).toLowerCase()
      )
    );
    if (!tables.has('sales')) return;

    const columns = await queryInterface.describeTable('sales');
    if (columns.roundOff) {
      await queryInterface.removeColumn('sales', 'roundOff');
    }
  },
};
