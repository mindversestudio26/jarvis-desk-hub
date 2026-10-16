const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../shifts.js');
const A = require('../alarms.js');

const settings = { enabled: true, prep: 60, commute: 30, snooze: 10, sound: 'chime' };
const shift = over => ({ id: 's1', date: '2026-10-17', type: 'morning', start: '06:00', end: '15:00', zone: 'Asia/Dubai', note: '', source: 'manual', ...over });
const iso = ms => new Date(ms).toISOString();
const from = Date.parse('2026-10-16T12:00:00Z');

test('alarm = shift start − preparation − commute, in Dubai time', () => {
  const { alarms } = S.plan([shift()], settings, {}, from);
  assert.equal(alarms.length, 1);
  assert.equal(alarms[0].time, '04:30');
  assert.equal(alarms[0].date, '2026-10-17');
  assert.equal(iso(alarms[0].at), '2026-10-17T00:30:00.000Z');
  assert.equal(alarms[0].label, 'Morning shift 06:00');
});
test('an early shift moves its alarm to the previous day', () => {
  const { alarms } = S.plan([shift({ type: 'night', start: '01:00', date: '2026-10-18' })], settings, {}, from);
  assert.equal(alarms[0].date, '2026-10-17');
  assert.equal(alarms[0].time, '23:30');
});
test('days off, holidays and travel never ring', () => {
  const { alarms } = S.plan(['off', 'holiday', 'travel'].map((type, i) => shift({ id: 'x' + i, type, start: null })), settings, {}, from);
  assert.equal(alarms.length, 0);
});
test('a working shift without a start time is reported, never guessed', () => {
  const { alarms, missing } = S.plan([shift({ start: null })], settings, {}, from);
  assert.equal(alarms.length, 0);
  assert.equal(missing.length, 1);
});
test('duplicate shifts collapse into one alarm', () => {
  const { alarms } = S.plan([shift(), shift({ id: 's2' })], settings, {}, from);
  assert.equal(alarms.length, 1);
});
test('overrides: off, and a custom time that survives recalculation', () => {
  assert.equal(S.plan([shift()], settings, { s1: { off: true } }, from).alarms[0].off, true);
  const custom = S.plan([shift()], settings, { s1: { time: '04:10' } }, from).alarms[0];
  assert.deepEqual([custom.time, custom.custom], ['04:10', true]);
  assert.equal(S.plan([shift()], { ...settings, enabled: false }, {}, from).alarms[0].off, true);
});
test('a Kathmandu-zone shift is computed in Kathmandu time', () => {
  const a = S.plan([shift({ zone: 'Asia/Kathmandu' })], settings, {}, from).alarms[0];
  assert.equal(a.time, '04:30');
  assert.equal(iso(a.at), '2026-10-16T22:45:00.000Z');
});
test('shift alarms ring once, on their own date only', () => {
  const plan = S.plan([shift()], settings, {}, from).alarms[0];
  const alarm = { id: plan.id, label: plan.label, time: plan.time, zone: plan.zone, days: [], date: plan.date, enabled: true, snooze: 10, sound: 'chime', anchor: from, snoozeUntil: null, missedAt: null };
  assert.equal(A.valid({ ...alarm, id: 'x1' }), true);
  assert.equal(A.valid(alarm), false, 'shift: ids are reserved for derived alarms');
  assert.equal(A.evaluate(alarm, plan.at - 1000), null);
  assert.deepEqual(A.evaluate(alarm, plan.at + 1000), { type: 'ring', at: plan.at });
  assert.equal(A.evaluate({ ...alarm, anchor: plan.at }, plan.at + 864e5 + 1000), null, 'no repeat the next day');
});
test('iCalendar roster: Dubai TZID, UTC, floating, all-day, unsupported zone, repeat warning', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'UID:a@roster', 'SUMMARY:Morning Shift', 'DTSTART;TZID=Asia/Dubai:20261017T060000', 'DTEND;TZID=Asia/Dubai:20261017T150000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b@roster', 'SUMMARY:Night shift', 'DTSTART:20261018T180000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c@roster', 'SUMMARY:Evening', 'DTSTART:20261019T140000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:d@roster', 'SUMMARY:Day Off', 'DTSTART;VALUE=DATE:20261020', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:e@roster', 'SUMMARY:Shift', 'DTSTART;VALUE=DATE:20261021', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:f@roster', 'SUMMARY:Morning', 'DTSTART;TZID=Europe/London:20261022T060000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:g@roster', 'SUMMARY:Early', 'DTSTART;TZID=Asia/Dubai:20261023T060000', 'RRULE:FREQ=WEEKLY', 'END:VEVENT',
    'END:VCALENDAR'].join('\r\n');
  const { shifts, issues } = S.parseICS(ics);
  const byId = Object.fromEntries(shifts.map(s => [s.id.split('|')[0], s]));
  assert.deepEqual([byId['a@roster'].type, byId['a@roster'].date, byId['a@roster'].start, byId['a@roster'].end], ['morning', '2026-10-17', '06:00', '15:00']);
  assert.deepEqual([byId['b@roster'].type, byId['b@roster'].date, byId['b@roster'].start], ['night', '2026-10-18', '22:00']);
  assert.deepEqual([byId['c@roster'].type, byId['c@roster'].start], ['evening', '14:00']);
  assert.deepEqual([byId['d@roster'].type, byId['d@roster'].start], ['off', null]);
  assert.equal(byId['e@roster'].start, null);
  assert.equal(byId['f@roster'], undefined);
  assert.equal(shifts.every(S.validShift), true);
  assert.equal(issues.some(i => /no start time/.test(i)), true);
  assert.equal(issues.some(i => /Europe\/London/.test(i)), true);
  assert.equal(issues.some(i => /Repeating/.test(i)), true);
});
test('re-import replaces roster shifts on those dates and keeps manual shifts and valid overrides', () => {
  const old = [shift({ id: 'r1', source: 'ics' }), shift({ id: 'm1', date: '2026-10-20', source: 'manual' })];
  const incoming = [shift({ id: 'r1', source: 'ics', start: '07:00' })];
  const { shifts, overrides } = S.merge(old, incoming, { r1: { time: '05:00' }, m1: { off: true } });
  assert.equal(shifts.find(s => s.id === 'r1').start, '07:00');
  assert.ok(shifts.find(s => s.id === 'm1'));
  assert.equal(overrides.r1, undefined, 'custom time dropped because the start changed');
  assert.deepEqual(overrides.m1, { off: true });
  const same = S.merge(old, [shift({ id: 'r1', source: 'ics' })], { r1: { time: '05:00' } });
  assert.deepEqual(same.overrides.r1, { time: '05:00' }, 'override preserved when the shift is unchanged');
});
test('a custom time for a shift just after midnight stays on the shift date', () => {
  const a = S.plan([shift({ type: 'night', date: '2026-10-18', start: '00:30' })], settings, { s1: { time: '00:15' } }, from).alarms[0];
  assert.deepEqual([a.date, a.time], ['2026-10-18', '00:15']);
});
test('roster: recurrence occurrences get distinct ids, cancelled events and hyphenated words are handled', () => {
  const ics = ['BEGIN:VEVENT', 'UID:series1@x', 'SUMMARY:Morning', 'DTSTART;TZID=Asia/Dubai:20261017T060000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:series1@x', 'SUMMARY:Morning', 'DTSTART;TZID=Asia/Dubai:20261018T060000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c@x', 'SUMMARY:Morning', 'STATUS:CANCELLED', 'DTSTART;TZID=Asia/Dubai:20261019T060000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:k@x', 'SUMMARY:Kick-off briefing', 'DTSTART;TZID=Asia/Dubai:20261020T090000', 'END:VEVENT'].join('\r\n');
  const { shifts, issues } = S.parseICS(ics);
  assert.equal(new Set(shifts.map(s => s.id)).size, 3);
  assert.equal(shifts.some(s => s.date === '2026-10-19'), false);
  assert.equal(issues.some(i => /cancelled/.test(i)), true);
  assert.equal(shifts.find(s => s.date === '2026-10-20').type, 'shift');
  assert.equal(S.classify('Off-site training'), 'shift');
  assert.equal(S.classify('Day Off'), 'off');
});
test('validation', () => {
  assert.equal(S.validShift(shift()), true);
  assert.equal(S.validShift(shift({ type: 'lunch' })), false);
  assert.equal(S.validShift(shift({ start: '6:00' })), false);
  assert.equal(S.validShift(shift({ date: '9999-99-99' })), false, 'impossible dates are rejected');
  assert.equal(S.parseICS('BEGIN:VEVENT\r\nUID:z\r\nSUMMARY:Off\r\nDTSTART;VALUE=DATE:99999999\r\nEND:VEVENT').shifts.length, 0);
  assert.equal(S.parseICS('BEGIN:VEVENT\r\nUID:z\r\nSUMMARY:Morning\r\nDTSTART;TZID=constructor:20261017T060000\r\nEND:VEVENT').shifts.length, 0);
  assert.equal(S.validSettings(settings), true);
  assert.equal(S.validSettings({ ...settings, prep: -5 }), false);
});
