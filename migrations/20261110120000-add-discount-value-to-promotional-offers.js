'use strict';

const tableNames = async (queryInterface) => new Set(
  (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === 'string' ? table : table.tableName).toLowerCase()
  )
);

const hasColumn = (columns, name) =>
  Object.keys(columns).some((column) => column.toLowerCase() === name.toLowerCase());

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await tableNames(queryInterface);
    if (!tables.has('promotional_offers')) {
      throw new Error('promotional_offers table is missing; cannot add discountValue');
    }

    const columns = await queryInterface.describeTable('promotional_offers');
    if (!hasColumn(columns, 'discountValue')) {
      await queryInterface.addColumn('promotional_offers', 'discountValue', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down() {
    throw new Error(
      'Rollback is disabled to avoid deleting persisted offer discount values.'
    );
  },
};
