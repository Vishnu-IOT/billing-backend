'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const shifts = [];
const counters = [
  {
    id: 41,
    companyId: 5,
    counterName: 'Main Counter',
    counterCode: 'POS-AAAA00000001',
    assignedUserId: 7,
    status: 'ACTIVE',
  },
  {
    id: 42,
    companyId: 5,
    counterName: 'Express Counter',
    counterCode: 'POS-BBBB00000002',
    assignedUserId: 8,
    status: 'ACTIVE',
  },
];
let nextShiftId = 1;
const userLockTails = new Map();
const counterLockTails = new Map();

function installMock(modulePath, exports) {
  const resolvedPath = require.resolve(modulePath);
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
  };
}

function createTransaction() {
  const transaction = {
    LOCK: { UPDATE: 'UPDATE' },
    finished: null,
    releases: [],
    async commit() {
      this.finished = 'commit';
      this.releases.forEach((release) => release());
    },
    async rollback() {
      this.finished = 'rollback';
      this.releases.forEach((release) => release());
    },
  };
  return transaction;
}

async function acquireUserLock(userId, transaction) {
  const previous = userLockTails.get(userId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  userLockTails.set(userId, previous.then(() => current));
  await previous;
  transaction.releases.push(release);
}

async function acquireCounterLock(counterId, transaction) {
  const previous = counterLockTails.get(counterId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  counterLockTails.set(counterId, previous.then(() => current));
  await previous;
  transaction.releases.push(release);
}

const sequelize = {
  transaction: async () => createTransaction(),
};

const User = {
  async findByPk(id, options = {}) {
    if (options.lock) await acquireUserLock(Number(id), options.transaction);
    return { id: Number(id), companyId: 5 };
  },
};

const POSShift = {
  async findOne({ where }) {
    return shifts.find((shift) =>
      Object.entries(where).every(([key, value]) => Number.isNaN(Number(value))
        ? shift[key] === value
        : Number(shift[key]) === Number(value))
    ) || null;
  },
  async create(values) {
    const shift = {
      id: nextShiftId++,
      ...values,
      async update(updates) {
        Object.assign(this, updates);
      },
      toJSON() {
        return { ...this };
      },
    };
    shifts.push(shift);
    return shift;
  },
  async findAll({ where }) {
    return shifts.filter((shift) =>
      Object.entries(where).every(([key, value]) => Number.isNaN(Number(value))
        ? shift[key] === value
        : Number(shift[key]) === Number(value))
    );
  },
};

const POSCounter = {
  async findOne({ where, transaction, lock }) {
    if (lock) await acquireCounterLock(Number(where.id), transaction);
    return counters.find((counter) =>
      Object.entries(where).every(([key, value]) => Number.isNaN(Number(value))
        ? counter[key] === value
        : Number(counter[key]) === Number(value))
    ) || null;
  },
};

installMock('../config/sqldb', sequelize);
installMock('../mysql-models/POSShift', POSShift);
installMock('../mysql-models/POSCounter', POSCounter);
installMock('../mysql-models/HoldBill', {});
installMock('../mysql-models/SalesBill', {});
installMock('../mysql-models/Users', User);

const {
  getCurrentShift,
  startShift,
  endShift,
  getShiftDetails,
} = require('../mysql-controllers/posController');

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

function authenticatedUser(id, role = 'Staff') {
  return { id, companyId: 5, role };
}

test.beforeEach(() => {
  shifts.length = 0;
  nextShiftId = 1;
  userLockTails.clear();
  counterLockTails.clear();
});

test('users can open simultaneous independent shifts and close only their own', async () => {
  const userA = authenticatedUser(7);
  const userB = authenticatedUser(8);
  const userAStartResponse = response();
  const userBStartResponse = response();

  await Promise.all([
    startShift(
      { loyaltyUser: userA, body: { userId: 7, companyId: 5, counterId: 41, openingFloat: 100 } },
      userAStartResponse
    ),
    startShift(
      { loyaltyUser: userB, body: { userId: 8, companyId: 5, counterId: 42, openingFloat: 250 } },
      userBStartResponse
    ),
  ]);

  assert.equal(userAStartResponse.statusCode, 201);
  assert.equal(userBStartResponse.statusCode, 201);

  const userACurrentResponse = response();
  const userBCurrentResponse = response();
  await getCurrentShift({ loyaltyUser: userA, query: {} }, userACurrentResponse);
  await getCurrentShift({ loyaltyUser: userB, query: {} }, userBCurrentResponse);
  assert.equal(userACurrentResponse.body.data.userId, 7);
  assert.equal(userBCurrentResponse.body.data.userId, 8);

  const unauthorizedCloseResponse = response();
  await endShift(
    { loyaltyUser: userB, body: { shiftId: userACurrentResponse.body.data.id, closingCashActual: 95 } },
    unauthorizedCloseResponse
  );
  assert.equal(unauthorizedCloseResponse.statusCode, 403);

  const adminHistoryResponse = response();
  await getShiftDetails(
    { loyaltyUser: authenticatedUser(9, 'Owner'), query: {} },
    adminHistoryResponse
  );
  assert.deepEqual(
    adminHistoryResponse.body.data.map((shift) => shift.userId).sort(),
    [7, 8]
  );

  const closeUserAResponse = response();
  await endShift(
    { loyaltyUser: userA, body: { shiftId: userACurrentResponse.body.data.id, closingCashActual: 95 } },
    closeUserAResponse
  );
  assert.equal(closeUserAResponse.statusCode, 200);
  assert.equal(closeUserAResponse.body.data.difference, -5);

  const userBAfterCloseResponse = response();
  await getCurrentShift({ loyaltyUser: userB, query: {} }, userBAfterCloseResponse);
  assert.equal(userBAfterCloseResponse.body.data.userId, 8);
  assert.equal(userBAfterCloseResponse.body.data.status, 'OPEN');
});

test('a POS counter cannot have concurrent open shifts', async () => {
  const user = authenticatedUser(7);
  const firstResponse = response();
  const secondResponse = response();

  await Promise.all([
    startShift({ loyaltyUser: user, body: { userId: 7, counterId: 41, openingFloat: 10 } }, firstResponse),
    startShift({ loyaltyUser: user, body: { userId: 7, counterId: 41, openingFloat: 20 } }, secondResponse),
  ]);

  assert.deepEqual(
    [firstResponse.statusCode, secondResponse.statusCode].sort(),
    [201, 409]
  );
  assert.equal(shifts.filter((shift) => shift.status === 'OPEN').length, 1);
});

test('a frontend-supplied user ID cannot start another user shift', async () => {
  const result = response();
  await startShift(
    {
      loyaltyUser: authenticatedUser(7),
      body: { userId: 8, companyId: 5, counterId: 41, openingFloat: 0 },
    },
    result
  );

  assert.equal(result.statusCode, 403);
  assert.equal(shifts.length, 0);
});

test('a company admin can close an employee shift in the same company', async () => {
  const startResponse = response();
  await startShift(
    { loyaltyUser: authenticatedUser(7), body: { userId: 7, counterId: 41, openingFloat: 0 } },
    startResponse
  );

  const closeResponse = response();
  await endShift(
    {
      loyaltyUser: authenticatedUser(9, 'Admin'),
      permissions: new Set(['shifts.management.close']),
      body: { shiftId: startResponse.body.data.id, closingCashActual: 0 },
    },
    closeResponse
  );

  assert.equal(closeResponse.statusCode, 200);
  assert.equal(closeResponse.body.data.status, 'CLOSED');
});

test('opening and closing shifts persist validated denomination totals', async () => {
  const startResponse = response();
  await startShift(
    {
      loyaltyUser: authenticatedUser(7),
      body: {
        openingFloat: 700,
        counterId: 41,
        openingDenominations: { 500: 1, 100: 2 },
      },
    },
    startResponse
  );

  assert.equal(startResponse.statusCode, 201);
  assert.equal(Number(startResponse.body.data.openingFloat), 700);
  assert.equal(startResponse.body.data.openingDenominations['500'], 1);
  assert.equal(startResponse.body.data.openingDenominations['100'], 2);

  const closeResponse = response();
  await endShift(
    {
      loyaltyUser: authenticatedUser(7),
      body: {
        shiftId: startResponse.body.data.id,
        closingCashActual: 550.5,
        closingDenominations: { 500: 1, 50: 1, 0.5: 1 },
      },
    },
    closeResponse
  );

  assert.equal(closeResponse.statusCode, 200);
  assert.equal(Number(closeResponse.body.data.closingCashActual), 550.5);
  assert.equal(closeResponse.body.data.closingDenominations['0.5'], 1);
  assert.equal(closeResponse.body.data.difference, -149.5);
});

test('shift endpoints reject invalid denomination counts and mismatched totals', async () => {
  const invalidCountResponse = response();
  await startShift(
    {
      loyaltyUser: authenticatedUser(7),
      body: {
        openingFloat: 500,
        counterId: 41,
        openingDenominations: { 500: 1.5 },
      },
    },
    invalidCountResponse
  );
  assert.equal(invalidCountResponse.statusCode, 400);
  assert.equal(shifts.length, 0);

  const mismatchResponse = response();
  await startShift(
    {
      loyaltyUser: authenticatedUser(7),
      body: {
        openingFloat: 499,
        counterId: 41,
        openingDenominations: { 500: 1 },
      },
    },
    mismatchResponse
  );
  assert.equal(mismatchResponse.statusCode, 400);
  assert.equal(shifts.length, 0);
});
