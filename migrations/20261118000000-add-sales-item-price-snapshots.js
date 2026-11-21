'use strict';

const tableNames = async (queryInterface) =>
  new Set(
    (await queryInterface.showAllTables()).map((table) =>
      String(typeof table === 'string' ? table : table.tableName).toLowerCase()
    )
  );

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await tableNames(queryInterface);
    if (!tables.has('sales_items')) return;

    const columns = await queryInterface.describeTable('sales_items');
    if (!columns.mrp) {
      await queryInterface.addColumn('sales_items', 'mrp', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      });
    }
    if (!columns.priceType) {
      await queryInterface.addColumn('sales_items', 'priceType', {
        type: Sequelize.ENUM('WITH_GST', 'WITHOUT_GST'),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tables = await tableNames(queryInterface);
    if (!tables.has('sales_items')) return;

    const columns = await queryInterface.describeTable('sales_items');
    if (columns.priceType) {
      await queryInterface.removeColumn('sales_items', 'priceType');
    }
    if (columns.mrp) {
      await queryInterface.removeColumn('sales_items', 'mrp');
    }
  },
};
