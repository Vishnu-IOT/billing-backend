'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const migration = require('../migrations/20261123130000-add-sales-return-condition');

test('sales-return condition migration defaults historical rows to GOOD', async () => {
  const addedColumns = [];
  const queryInterface = {
    showAllTables: async () => ['sales_returns'],
    describeTable: async () => ({ id: {} }),
    addColumn: async (...args) => addedColumns.push(args),
  };
  const Sequelize = {
    ENUM: (...values) => ({ values }),
  };

  await migration.up(queryInterface, Sequelize);

  assert.equal(addedColumns.length, 1);
  assert.equal(addedColumns[0][0], 'sales_returns');
  assert.equal(addedColumns[0][1], 'returnCondition');
  assert.deepEqual(addedColumns[0][2], {
    type: { values: ['GOOD', 'DAMAGED', 'EXPIRED'] },
    allowNull: false,
    defaultValue: 'GOOD',
  });
});

test('sales-return condition migration is safe to rerun', async () => {
  let added = false;
  const queryInterface = {
    showAllTables: async () => ['sales_returns'],
    describeTable: async () => ({ id: {}, returnCondition: {} }),
    addColumn: async () => { added = true; },
  };

  await migration.up(queryInterface, { ENUM: () => ({}) });

  assert.equal(added, false);
});
