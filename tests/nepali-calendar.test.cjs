'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const calendar = require('../nepali-calendar.js');
const anchors = [
  ['1943-04-14', 2000, 1, 1],
  ['1993-04-13', 2050, 1, 1],
  ['2013-04-14', 2070, 1, 1],
  ['2018-04-14', 2075, 1, 1],
  ['2023-04-14', 2080, 1, 1],
  ['2024-04-13', 2081, 1, 1],
  ['2025-04-14', 2082, 1, 1],
  ['2026-04-14', 2083, 1, 1],
  ['2026-04-29', 2083, 1, 16],
  ['2027-04-13', 2083, 12, 30]
];
test('known date anchors convert in both directions', () => {
  for (const [iso, year, month, day] of anchors) {
    const bs = calendar.fromISO(iso);
    assert.deepEqual([bs.year, bs.month, bs.day], [year, month, day], iso);
    assert.equal(calendar.toISO(year, month, day), iso);
  }
});
test('every supported day round trips and consecutive BS days advance one Gregorian day', () => {
  let previous = Date.parse(calendar.range.minISO) - 86400000;
  let count = 0;
  for (let year = calendar.range.minYear; year <= calendar.range.maxYear; year++) {
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= calendar.daysInMonth(year, month); day++) {
        const iso = calendar.toISO(year, month, day);
        assert.equal(Date.parse(iso) - previous, 86400000);
        const bs = calendar.fromISO(iso);
        assert.deepEqual([bs.year, bs.month, bs.day], [year, month, day]);
        previous = Date.parse(iso);
        count++;
      }
    }
  }
  assert.equal(new Date(previous).toISOString().slice(0, 10), calendar.range.maxISO);
  assert.ok(count > 30000);
});
test('rejects malformed, normalized, and out-of-range inputs', () => {
  for (const value of [null, undefined, 20260101, new Date(), '', '2024-2-01', '2024-01-01T00:00:00Z', ' 2024-01-01']) assert.throws(() => calendar.fromISO(value), TypeError);
  for (const value of ['2023-02-29', '2024-02-30', '2024-13-01', '2024-00-01', '2024-01-00', '1943-04-13', '2027-04-14', '0000-01-01']) assert.throws(() => calendar.fromISO(value), RangeError);
  for (const args of [[1999,1,1],[2084,1,1],[2081,0,1],[2081,13,1],[2081,1,0],[2081,2,33],[2081,1,1.5],['2081',1,1],[NaN,1,1],[2081,Infinity,1]]) assert.throws(() => calendar.toISO(...args), RangeError);
  assert.equal(calendar.daysInMonth(2081, 2), 32);
  assert.equal(calendar.fromISO('2024-02-29').iso, '2024-02-29');
});
test('browser globals work without Node, network, or local timezone conversion', () => {
  const context = vm.createContext({});
  for (const file of ['vendor/bs-data.js', 'nepali-calendar.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  assert.equal(context.JangeNepali.toISO(2081, 1, 1), '2024-04-13');
  assert.equal(context.JangeNepali.fromISO('2024-04-13').weekday, 6);
  assert.throws(() => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'nepali-calendar.js'), 'utf8')), /Load vendor/);
});
test('labels, range, and metadata are immutable', () => {
  assert.equal(calendar.devanagari('2083-01-16'), '२०८३-०१-१६');
  assert.equal(calendar.months.length, 12);
  assert.equal(calendar.fromISO('2024-04-13').monthName, 'Baisakh');
  assert.equal(calendar.fromISO('2024-04-13').monthNameNepali, 'वैशाख');
  for (const value of [calendar, calendar.range, calendar.months, calendar.monthsNepali, calendar.fromISO('2024-04-13')]) assert.ok(Object.isFrozen(value));
});
test('conversion results agree in Kathmandu, UTC, and DST-observing zones', () => {
  const { execFileSync } = require('node:child_process');
  const script = "const c=require('./nepali-calendar.js'); console.log(JSON.stringify(['2024-03-10','2024-11-03','2026-04-14'].map(s=>[c.fromISO(s),c.toISO(c.fromISO(s).year,c.fromISO(s).month,c.fromISO(s).day)])))";
  const outputs = ['UTC', 'Asia/Kathmandu', 'America/New_York', 'Pacific/Kiritimati'].map(TZ => execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env: { ...process.env, TZ }, encoding: 'utf8' }));
  for (const output of outputs) assert.equal(output, outputs[0]);
});
