'use strict';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDateOnly(value) {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function dateOnlyValue(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  if (!isValidDateOnly(value)) {
    throw new Error(`Invalid date: ${value}`);
  }
  return true;
}

function nextDateOnly(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function dateOnlyRange(startDate, endDate) {
  const range = {};

  if (startDate) {
    range.start = dateOnlyValue(startDate)
      ? startDate
      : new Date(startDate);
  }

  if (endDate) {
    if (dateOnlyValue(endDate)) {
      range.endExclusive = nextDateOnly(endDate);
    } else {
      range.endInclusive = new Date(endDate);
    }
  }

  return range;
}

function monthRange(year, zeroBasedMonth) {
  const start = new Date(Date.UTC(year, zeroBasedMonth, 1)).toISOString().slice(0, 10);
  const endExclusive = new Date(Date.UTC(year, zeroBasedMonth + 1, 1))
    .toISOString()
    .slice(0, 10);
  return {
    start,
    endExclusive,
  };
}

function indiaMonthRange(now = new Date(), monthsBack = 0) {
  const indiaNow = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return monthRange(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth() - monthsBack);
}

module.exports = { dateOnlyRange, monthRange, indiaMonthRange };
