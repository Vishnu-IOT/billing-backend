'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateAppliedReturnCredit,
  calculateReturnCreditAmount,
} = require('../utils/salesReturnCredits');

test('return credit is prorated from the original paid line total', () => {
  assert.equal(
    calculateReturnCreditAmount(
      { quantity: 3, netRate: 10.01 },
      1
    ),
    3.34
  );
});

test('return credit never exceeds the remaining amount of a line', () => {
  assert.equal(
    calculateReturnCreditAmount(
      { quantity: 3, netRate: 10.01 },
      1,
      10
    ),
    0.01
  );
});

test('scanned return credit is capped at the current sale total', () => {
  assert.equal(calculateAppliedReturnCredit(12.5, 20), 12.5);
  assert.equal(calculateAppliedReturnCredit(20, 12.5), 12.5);
});

test('invalid return-credit quantities are rejected', () => {
  assert.throws(
    () => calculateReturnCreditAmount({ quantity: 2, netRate: 10 }, 3),
    /valid/
  );
});
