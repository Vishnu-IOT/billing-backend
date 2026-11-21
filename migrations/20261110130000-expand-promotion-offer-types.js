'use strict';

const tableNames = async (queryInterface) => new Set(
  (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === 'string' ? table : table.tableName).toLowerCase()
  )
);

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await tableNames(queryInterface);

    for (const table of ['promotional_offers', 'campaign_products']) {
      if (!tables.has(table)) continue;

      const columns = await queryInterface.describeTable(table);
      const offerTypeColumn = Object.keys(columns).find(
        (column) => column.toLowerCase() === 'offertype'
      );
      if (!offerTypeColumn) continue;

      await queryInterface.changeColumn(table, offerTypeColumn, {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: 'BUY_X_GET_Y_FREE',
      });
    }
  },

  async down() {
    throw new Error(
      'Rollback is disabled because narrowing offerType could invalidate persisted promotion data.'
    );
  },
};
