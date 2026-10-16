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
test('desk lines: today and tomorrow always, including days off and holidays, then the next shift', () => {
  const hols = ['16', '17', '18', '19', '20', '21', '22', '23'].map(d => shift({ id: 'h' + d, date: '2026-10-' + d, type: 'holiday', start: null, end: null, note: 'Holiday (HOLS)' }));
  const roster = [...hols,
    shift({ id: 'd', date: '2026-10-25', type: 'shift', start: '07:00', end: '19:00', note: 'Day shift 7am to 7pm' }),
    shift({ id: 'n', date: '2026-10-29', type: 'night', start: '19:00', end: '07:00', note: 'Night shift 7pm to 7am' }),
    shift({ id: 'o', date: '2026-11-08', type: 'off', start: '08:00', end: '13:00', note: 'Off 8am to 1pm' })];
  const at = dubai => Date.parse(dubai + '+04:00');
  const lines = when => S.deskLines(roster, at(when)).map(l => l.text);
  assert.deepEqual(lines('2026-10-16T09:00'), ['Today · Holiday until Fri 23 Oct', 'Tomorrow · Holiday', 'Next shift · Sun 25 Oct · Day shift 07:00–19:00'], 'tomorrow always has its own line');
  assert.deepEqual(lines('2026-10-23T09:00'), ['Today · Holiday', 'Tomorrow · No shift', 'Next shift · Sun 25 Oct · Day shift 07:00–19:00']);
  assert.deepEqual(lines('2026-10-24T20:00'), ['Today · No shift', 'Tomorrow · Day shift 07:00–19:00']);
  assert.deepEqual(lines('2026-10-25T05:00'), ['Today · Day shift 07:00–19:00', 'Tomorrow · No shift', 'Next shift · Thu 29 Oct · Night shift 19:00–07:00']);
  assert.deepEqual(S.deskLines(roster, at('2026-10-25T12:00')).map(l => l.kind), ['now', 'tomorrow', 'next']);
  assert.deepEqual(lines('2026-10-25T20:00'), ['Today · Day shift done', 'Tomorrow · No shift', 'Next shift · Thu 29 Oct · Night shift 19:00–07:00']);
  // A night shift runs past midnight: at 03:00 the next day you are still on it.
  assert.deepEqual(lines('2026-10-30T03:00'), ['On shift now · Night shift until 07:00', 'Tomorrow · No shift']);
  const twoNights = [...roster, shift({ id: 'n2', date: '2026-10-30', type: 'night', start: '19:00', end: '07:00', note: 'Night shift 7pm to 7am' })];
  assert.deepEqual(S.deskLines(twoNights, at('2026-10-30T03:00')).map(l => l.text),
    ['On shift now · Night shift until 07:00', 'Tonight · Night shift 19:00–07:00', 'Tomorrow · No shift'], 'tonight before tomorrow');
  assert.deepEqual(lines('2026-11-07T09:00'), ['Today · No shift', 'Tomorrow · Day off 08:00–13:00']);
  assert.deepEqual(lines('2026-11-08T09:00'), ['Today · Day off 08:00–13:00']);
  assert.deepEqual(lines('2026-11-09T09:00'), [], 'past the end of the roster nothing is guessed');
  assert.deepEqual(S.deskLines([], at('2026-10-16T09:00')), []);
  assert.equal(S.shiftName(shift({ type: 'shift', note: 'Kick-off briefing' })), 'Shift');
});
test('desk lines: unknown times are never guessed; Kathmandu shifts say NPT; duplicates collapse', () => {
  const at = dubai => Date.parse(dubai + '+04:00');
  const text = (roster, when) => S.deskLines(roster, at(when)).map(l => l.text);
  // A rostered shift with no start time is still a shift, never "No shift".
  const startless = [shift({ id: 'a', date: '2026-10-16', type: 'night', start: null, end: null, note: 'Night shift' }),
    shift({ id: 'b', date: '2026-10-17', type: 'night', start: null, end: null, note: 'Night shift' }),
    shift({ id: 'c', date: '2026-10-20', type: 'night', start: '19:00', end: '07:00', note: 'Night shift' })];
  assert.deepEqual(text(startless, '2026-10-16T09:00'), ['Today · Night shift (no time)', 'Tomorrow · Night shift (no time)', 'Next shift · Tue 20 Oct · Night shift 19:00–07:00']);
  // Before the roster starts nothing is claimed about the day.
  assert.deepEqual(text([shift({ id: 'f', date: '2026-11-01', type: 'night', start: '19:00', end: '07:00', note: 'Night shift' })], '2026-10-16T09:00'), ['Next shift · Sun 1 Nov · Night shift 19:00–07:00']);
  // No end time: no "until" and no invented "done".
  assert.deepEqual(text([shift({ id: 'e', date: '2026-10-16', type: 'shift', start: '07:00', end: null, note: 'Day shift' })], '2026-10-16T20:00'), ['Today · Day shift 07:00']);
  const npt = [shift({ id: 'k', date: '2026-10-16', type: 'shift', start: '07:00', end: '19:00', zone: 'Asia/Kathmandu', note: 'Day shift' })];
  assert.deepEqual(text(npt, '2026-10-16T12:00'), ['On shift now · Day shift until 19:00 NPT']);
  const dup = [shift({ id: 'x1', date: '2026-10-16', type: 'shift', start: '19:00', end: '23:00' }), shift({ id: 'x2', date: '2026-10-16', type: 'shift', start: '19:00', end: '23:00' })];
  assert.deepEqual(text(dup, '2026-10-16T09:00'), ['Today · Shift 19:00–23:00']);
});
test('bundled roster: valid entries with import-compatible ids, nothing guessed', () => {
  const roster = require('../roster.js');
  const shifts = S.fromRoster(roster);
  const total = roster.day.length + roster.night.length + roster.off.length;
  assert.equal(shifts.length, total, 'every roster date is a valid shift');
  assert.equal(new Set(shifts.map(s => s.date)).size, total, 'no date is listed twice');
  assert.ok(shifts.every(S.validShift));
  const d = shifts.find(s => s.date === '2026-10-25');
  assert.deepEqual([d.id, d.type, d.start, d.end, d.zone], ['ddf-day-20261025@jange-roster|2026-10-25', 'shift', '07:00', '19:00', 'Asia/Dubai']);
  const n = shifts.find(s => s.date === '2026-10-29');
  assert.deepEqual([n.type, n.start, n.end], ['night', '19:00', '07:00']);
  assert.equal(shifts.some(s => s.type === 'holiday'), false, 'the public roster carries no holidays');
  // Same ids as a calendar import of the same roster, so applying both never duplicates.
  const ics = ['BEGIN:VEVENT', 'UID:ddf-day-20261025@jange-roster', 'DTSTART;TZID=Asia/Dubai:20261025T070000', 'DTEND;TZID=Asia/Dubai:20261025T190000', 'SUMMARY:Day shift 7am to 7pm', 'END:VEVENT'].join('\r\n');
  assert.equal(S.parseICS(ics).shifts[0].id, d.id);
  const merged = S.merge(S.parseICS(ics).shifts, shifts, {}).shifts;
  assert.equal(merged.filter(s => s.date === '2026-10-25').length, 1);
  // Alarm timing: 2 h 30 min before each start.
  const { alarms } = S.plan(shifts, { ...settings, prep: roster.alarm.prep, commute: roster.alarm.commute }, {}, Date.parse('2026-10-24T12:00:00Z'), 10);
  assert.deepEqual(alarms.slice(0, 3).map(a => a.date + ' ' + a.time), ['2026-10-25 04:30', '2026-10-26 04:30', '2026-10-29 16:30']);
  assert.ok(S.validSettings({ ...settings, ...roster.alarm }));
  // Malformed input is skipped, never guessed.
  assert.deepEqual(S.fromRoster(null), []);
  assert.deepEqual(S.fromRoster({ version: 'x', zone: 'Europe/Paris', day: ['2026-10-25'] }), []);
  assert.deepEqual(S.fromRoster({ version: 'x', zone: 'Asia/Dubai', day: ['2026-02-30', 'soon'] }), []);
});
test('roster versions: a dropped date loses its shift; holidays, iPad shifts and other dates stay', () => {
  const v1 = { version: 'v1', zone: 'Asia/Dubai', day: ['2026-11-10', '2026-11-11'], night: ['2026-11-14'], off: [] };
  const v2 = { version: 'v2', zone: 'Asia/Dubai', day: ['2026-11-11'], night: ['2026-11-10', '2026-11-14'], off: [] }; // 10 Nov becomes a night
  const hols = shift({ id: 'ddf-hols-20261112@jange-roster|2026-11-12', date: '2026-11-12', type: 'holiday', start: null, end: null, source: 'ics' });
  const mine = shift({ id: 'manual-1', date: '2026-11-13', type: 'shift', start: '10:00', end: '14:00' });
  const before = shift({ id: 'ddf-day-20261001@jange-roster|2026-10-01', date: '2026-10-01', type: 'shift', start: '07:00', end: '19:00', source: 'ics' });
  const first = S.rosterMerge([hols, mine, before], {}, v1);
  const overrides = { 'ddf-day-20261110@jange-roster|2026-11-10': { off: true } };
  const second = S.rosterMerge(first.shifts, overrides, v2);
  const on = d => second.shifts.filter(s => s.date === d).map(s => s.type);
  assert.deepEqual(on('2026-11-10'), ['night'], 'the day shift dropped from v2 is gone, the new night is there');
  assert.deepEqual(second.removed, ['ddf-day-20261110@jange-roster|2026-11-10']);
  assert.equal(second.overrides['ddf-day-20261110@jange-roster|2026-11-10'], undefined, 'its override goes with it');
  assert.deepEqual(on('2026-11-12'), ['holiday'], 'imported holidays are never removed');
  assert.deepEqual(on('2026-11-13'), ['shift'], 'shifts added on the iPad stay');
  assert.deepEqual(on('2026-10-01'), ['shift'], 'roster shifts outside the new version\'s dates stay');
  assert.equal(S.rosterMerge([], {}, { version: 'x', zone: 'Asia/Dubai' }), null);
});
