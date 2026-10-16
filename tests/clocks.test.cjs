const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshot } = require('../clocks.js');

const cases = [
  ['Kathmandu before midnight', '2026-10-16T18:14:59Z', '22:14', '2026-10-16', '23:59', '2026-10-16', '59'],
  ['Kathmandu after midnight', '2026-10-16T18:15:00Z', '22:15', '2026-10-16', '00:00', '2026-10-17', '00'],
  ['Dubai before midnight', '2026-10-16T19:59:59Z', '23:59', '2026-10-16', '01:44', '2026-10-17', '59'],
  ['Dubai after midnight', '2026-10-16T20:00:00Z', '00:00', '2026-10-17', '01:45', '2026-10-17', '00'],
  ['Kathmandu year transition', '2026-12-31T18:15:00Z', '22:15', '2026-12-31', '00:00', '2027-01-01', '00'],
  ['Dubai year transition', '2026-12-31T20:00:00Z', '00:00', '2027-01-01', '01:45', '2027-01-01', '00'],
  ['Leap day', '2028-02-28T20:00:00Z', '00:00', '2028-02-29', '01:45', '2028-02-29', '00'],
  ['Quarter-hour offset and zero padding', '2026-10-16T00:00:07Z', '04:00', '2026-10-16', '05:45', '2026-10-16', '07'],
];
for (const [name, instant, dt, dd, kt, kd, seconds] of cases) {
  test(name, () => {
    const value = snapshot(instant);
    assert.equal(value.dubai.time, dt);
    assert.equal(value.dubai.day, dd);
    assert.equal(value.kathmandu.time, kt);
    assert.equal(value.kathmandu.day, kd);
    assert.equal(value.dubai.seconds, seconds);
    assert.equal(value.kathmandu.seconds, seconds);
    assert.equal(value.dubai.iso, value.kathmandu.iso);
  });
}
