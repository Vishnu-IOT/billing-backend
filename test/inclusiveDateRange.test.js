'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dateOnlyRange,
  indiaMonthRange,
  monthRange,
} = require('../utils/inclusiveDateRange');

test('monthly range starts on day one and ends exclusively at next month', () => {
  assert.deepEqual(monthRange(2026, 10), {
    start: '2026-11-01',
    endExclusive: '2026-12-01',
  });
});

test('current India month uses the IST calendar even when the server date is still UTC October', () => {
  assert.deepEqual(indiaMonthRange(new Date('2026-10-31T19:00:00.000Z')), {
    start: '2026-11-01',
    endExclusive: '2026-12-01',
  });
});

test('date-only filters include the first date and use the next date as an exclusive bound', () => {
  assert.deepEqual(dateOnlyRange('2026-11-01', '2026-11-30'), {
    start: '2026-11-01',
    endExclusive: '2026-12-01',
  });
});
