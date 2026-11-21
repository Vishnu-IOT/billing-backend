'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Sequelize = require('sequelize');
const migration = require('../migrations/20261106030000-add-pos-shift-denominations');

function createQueryInterface(initialColumns = {}) {
  const columns = { ...initialColumns };
  const calls = [];
  return {
    columns,
    calls,
    async describeTable() {
      return { ...columns };
    },
    async addColumn(table, column, definition) {
      calls.push(['add', table, column, definition]);
      columns[column] = definition;
    },
    async removeColumn(table, column) {
      calls.push(['remove', table, column]);
      delete columns[column];
    },
  };
}

test('denomination migration safely adds missing columns and can run repeatedly', async () => {
  const queryInterface = createQueryInterface();

  await migration.up(queryInterface, Sequelize);
  await migration.up(queryInterface, Sequelize);

  assert.deepEqual(
    queryInterface.calls.map((call) => call.slice(0, 3)),
    [
      ['add', 'pos_shifts', 'openingDenominations'],
      ['add', 'pos_shifts', 'closingDenominations'],
    ],
  );
  assert.equal(queryInterface.columns.openingDenominations.allowNull, true);
  assert.equal(queryInterface.columns.closingDenominations.allowNull, true);
});

test('denomination migration leaves existing columns intact and safely rolls back', async () => {
  const queryInterface = createQueryInterface({
    openingDenominations: { type: Sequelize.TEXT, allowNull: true },
    closingDenominations: { type: Sequelize.TEXT, allowNull: true },
  });

  await migration.up(queryInterface, Sequelize);
  assert.equal(queryInterface.calls.length, 0);

  await migration.down(queryInterface);
  await migration.down(queryInterface);
  assert.deepEqual(
    queryInterface.calls.map((call) => call.slice(0, 3)),
    [
      ['remove', 'pos_shifts', 'closingDenominations'],
      ['remove', 'pos_shifts', 'openingDenominations'],
    ],
  );
});
