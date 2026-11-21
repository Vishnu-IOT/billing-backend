'use strict';

const getTables = async (queryInterface) =>
  new Set(
    (await queryInterface.showAllTables()).map((table) =>
      String(typeof table === 'string' ? table : table.tableName).toLowerCase()
    )
  );

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await getTables(queryInterface);
    if (!tables.has('sales_returns')) return;

    const columns = await queryInterface.describeTable('sales_returns');
    if (!Object.keys(columns).some((name) => name.toLowerCase() === 'returncondition')) {
      await queryInterface.addColumn('sales_returns', 'returnCondition', {
        type: Sequelize.ENUM('GOOD', 'DAMAGED', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'GOOD',
      });
    }
  },

  async down(queryInterface) {
    const tables = await getTables(queryInterface);
    if (!tables.has('sales_returns')) return;

    const columns = await queryInterface.describeTable('sales_returns');
    if (Object.keys(columns).some((name) => name.toLowerCase() === 'returncondition')) {
      await queryInterface.removeColumn('sales_returns', 'returnCondition');
    }
  },
};
