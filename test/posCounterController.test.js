'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const counters = [];
const shifts = [];
const users = [
  { id: 7, companyId: 5, name: 'Cashier One', email: 'one@example.test', role: 'Staff', is_active: true },
  { id: 8, companyId: 5, name: 'Cashier Two', email: 'two@example.test', role: 'Staff', is_active: true },
  { id: 9, companyId: 6, name: 'Other Company', email: 'other@example.test', role: 'Staff', is_active: true },
  { id: 10, companyId: 5, name: 'Inactive Staff', email: 'inactive@example.test', role: 'Staff', is_active: false },
];
let nextCounterId = 1;

function installMock(modulePath, exports) {
  const resolvedPath = require.resolve(modulePath);
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
  };
}

function matches(row, where) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && Op.ne in expected) {
      return Number(row[key]) !== Number(expected[Op.ne]);
    }
    if (expected == null || row[key] == null) return row[key] === expected;
    return String(row[key]) === String(expected);
  });
}

const sequelize = {
  async transaction() {
    return {
      LOCK: { UPDATE: 'UPDATE' },
      finished: null,
      async commit() { this.finished = 'commit'; },
      async rollback() { this.finished = 'rollback'; },
    };
  },
};

const User = {
  async findOne({ where }) {
    return users.find((user) => matches(user, where)) || null;
  },
};

const POSShift = {
  async findOne({ where }) {
    return shifts.find((shift) => matches(shift, where)) || null;
  },
};

const POSCounter = {
  async findOne({ where }) {
    return counters.find((counter) => matches(counter, where)) || null;
  },
  async findAll({ where }) {
    return counters.filter((counter) => matches(counter, where));
  },
  async create(values) {
    const counter = {
      id: nextCounterId++,
      ...values,
      async update(updates) { Object.assign(this, updates); },
      async reload() { return this; },
    };
    counters.push(counter);
    return counter;
  },
};

installMock('../config/sqldb', sequelize);
installMock('../mysql-models/POSCounter', POSCounter);
installMock('../mysql-models/POSShift', POSShift);
installMock('../mysql-models/Users', User);

const {
  listCounters,
  getAssignedCounters,
  createCounter,
  updateCounter,
} = require('../mysql-controllers/posCounterController');

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const request = (body = {}, params = {}, user = { id: 7, companyId: 5 }) => ({
  body,
  params,
  loyaltyUser: user,
});

test.beforeEach(() => {
  counters.length = 0;
  shifts.length = 0;
  nextCounterId = 1;
});

test('counter creation enforces company-scoped one-to-one staff assignment', async () => {
  const first = response();
  await createCounter(request({ counterName: 'Main', assignedUserId: 7 }), first);
  assert.equal(first.statusCode, 201);

  const duplicate = response();
  await createCounter(request({ counterName: 'Second', assignedUserId: 7 }), duplicate);
  assert.equal(duplicate.statusCode, 409);

  const crossCompany = response();
  await createCounter(request({ counterName: 'Other', assignedUserId: 9 }), crossCompany);
  assert.equal(crossCompany.statusCode, 400);

  const inactive = response();
  await createCounter(request({ counterName: 'Inactive', assignedUserId: 10 }), inactive);
  assert.equal(inactive.statusCode, 400);
});

test('counter updates block reassignment during an open shift and allow it after close', async () => {
  const created = response();
  await createCounter(request({ counterName: 'Main', assignedUserId: 7 }), created);

  shifts.push({ counterId: 1, companyId: 5, status: 'OPEN' });
  const blocked = response();
  await updateCounter(request(
    { assignedUserId: 8 },
    { id: 1 },
  ), blocked);
  assert.equal(blocked.statusCode, 409);
  assert.equal(counters[0].assignedUserId, 7);

  shifts.length = 0;
  const updated = response();
  await updateCounter(request(
    { assignedUserId: 8 },
    { id: 1 },
  ), updated);
  assert.equal(updated.statusCode, 200);
  assert.equal(counters[0].assignedUserId, 8);
});

test('counter listings are restricted to the authenticated company and active assignment', async () => {
  counters.push(
    { id: 1, companyId: 5, counterName: 'Main', assignedUserId: 7, status: 'ACTIVE' },
    { id: 2, companyId: 6, counterName: 'Other', assignedUserId: 7, status: 'ACTIVE' },
    { id: 3, companyId: 5, counterName: 'Disabled', assignedUserId: 7, status: 'INACTIVE' },
  );
  const all = response();
  await listCounters(request(), all);
  assert.deepEqual(all.body.data.map((counter) => counter.id), [1, 3]);

  const assigned = response();
  await getAssignedCounters(request(), assigned);
  assert.deepEqual(assigned.body.data.map((counter) => counter.id), [1]);
});
