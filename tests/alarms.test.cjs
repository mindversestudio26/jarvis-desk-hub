const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../alarms.js');

const base = { id: 'a', label: 'Wake', snooze: 10, sound: 'chime', enabled: true, snoozeUntil: null, missedAt: null };
const alarm = over => ({ ...base, time: '06:30', zone: 'Asia/Dubai', days: [], anchor: Date.parse('2026-10-16T00:00:00Z'), ...over });
const iso = ms => new Date(ms).toISOString();

test('Dubai time converts to the right UTC instant', () => {
  assert.equal(iso(A.zonedInstant('Asia/Dubai', 2026, 10, 16, 6, 30)), '2026-10-16T02:30:00.000Z');
});
test('Kathmandu quarter-hour offset, including the previous UTC day', () => {
  assert.equal(iso(A.zonedInstant('Asia/Kathmandu', 2026, 10, 17, 4, 0)), '2026-10-16T22:15:00.000Z');
});
test('one-time alarm later today rings today, earlier today rings tomorrow', () => {
  const now = Date.parse('2026-10-16T01:00:00Z'); // 05:00 Dubai
  assert.equal(iso(A.nextOccurrence(alarm({}), now)), '2026-10-16T02:30:00.000Z');
  const late = Date.parse('2026-10-16T03:00:00Z'); // 07:00 Dubai
  assert.equal(iso(A.nextOccurrence(alarm({}), late)), '2026-10-17T02:30:00.000Z');
});
test('weekday alarm on Friday evening skips the weekend', () => {
  const fri = Date.parse('2026-10-16T16:00:00Z'); // Friday 20:00 Dubai
  assert.equal(iso(A.nextOccurrence(alarm({ days: [1, 2, 3, 4, 5] }), fri)), '2026-10-19T02:30:00.000Z');
});
test('specific days wrap from Sunday to the next week', () => {
  const sun = Date.parse('2026-10-18T10:00:00Z'); // Sunday 14:00 Dubai
  assert.equal(iso(A.nextOccurrence(alarm({ days: [3] }), sun)), '2026-10-21T02:30:00.000Z');
});
test('repeat days are judged in the alarm zone, not UTC', () => {
  // Saturday 04:00 Kathmandu is still Friday in UTC.
  const k = alarm({ zone: 'Asia/Kathmandu', time: '04:00', days: [6] });
  assert.equal(iso(A.nextOccurrence(k, Date.parse('2026-10-16T12:00:00Z'))), '2026-10-16T22:15:00.000Z');
});
test('Kathmandu alarm across midnight and month end', () => {
  const k = alarm({ zone: 'Asia/Kathmandu', time: '00:00', days: [1, 2, 3, 4, 5, 6, 7] });
  assert.equal(iso(A.nextOccurrence(k, Date.parse('2026-10-31T18:14:00Z'))), '2026-10-31T18:15:00.000Z');
});
test('evaluate: not yet, ring within grace, missed after grace', () => {
  const a = alarm({ anchor: Date.parse('2026-10-16T01:00:00Z') });
  const due = Date.parse('2026-10-16T02:30:00Z');
  assert.equal(A.evaluate(a, due - 1), null);
  assert.deepEqual(A.evaluate(a, due + 1000), { type: 'ring', at: due });
  assert.deepEqual(A.evaluate(a, due + A.GRACE_MS + 1), { type: 'missed', at: due });
});
test('anchor after an occurrence prevents a second ring for it', () => {
  const due = Date.parse('2026-10-16T02:30:00Z');
  assert.equal(A.evaluate(alarm({ anchor: due }), due + 5000), null);
});
test('editing to an earlier time today does not ring immediately', () => {
  const now = Date.parse('2026-10-16T05:00:00Z'); // 09:00 Dubai, alarm 06:30
  assert.equal(A.evaluate(alarm({ anchor: now }), now + 1000), null);
});
test('snooze rings when it ends even if the one-time alarm is now disabled', () => {
  const a = alarm({ enabled: false, snoozeUntil: 1000 });
  assert.equal(A.evaluate(a, 999), null);
  assert.deepEqual(A.evaluate(a, 1000), { type: 'ring', at: 1000, snoozed: true });
});
test('a snooze that ended while Jarvis was asleep is missed, not rung late', () => {
  const a = alarm({ snoozeUntil: 1000 });
  assert.deepEqual(A.evaluate(a, 1000 + A.GRACE_MS + 1), { type: 'missed', at: 1000, snoozed: true });
});
test('disabled alarms never ring', () => {
  assert.equal(A.evaluate(alarm({ enabled: false }), Date.parse('2026-10-16T02:31:00Z')), null);
});
test('repeat labels', () => {
  assert.equal(A.repeatLabel([]), 'Once');
  assert.equal(A.repeatLabel([7, 1, 2, 3, 4, 5, 6]), 'Daily');
  assert.equal(A.repeatLabel([5, 1, 2, 3, 4]), 'Weekdays');
  assert.equal(A.repeatLabel([6, 7]), 'Weekends');
  assert.equal(A.repeatLabel([3, 1]), 'Mon Wed');
});
test('validation rejects unknown zones, bad times and duplicate days', () => {
  assert.equal(A.valid(alarm({})), true);
  assert.equal(A.valid(alarm({ zone: 'Europe/London' })), false);
  assert.equal(A.valid(alarm({ time: '24:00' })), false);
  assert.equal(A.valid(alarm({ days: [1, 1] })), false);
  assert.equal(A.valid(alarm({ label: 'x'.repeat(61) })), false);
  assert.equal(A.valid(alarm({ snooze: 7 })), false);
  assert.equal(A.valid(alarm({ anchor: 1e20 })), false, 'absurd timestamps would crash Intl');
  assert.equal(A.valid(alarm({ id: 'a\r\nX-INJECT:1' })), false);
  assert.equal(A.valid(alarm({ date: '2026-02-30' })), false);
});
test('iCalendar export: zone, first date, weekly rule, alert, escaping', () => {
  const ics = A.toICS(alarm({ label: 'Gym, then; work', days: [1, 3, 5] }), Date.parse('2026-10-16T16:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nTZID:Asia\/Dubai\r\n/);
  assert.match(ics, /\r\nTZOFFSETTO:\+0400\r\n/);
  assert.match(ics, /\r\nDTSTART;TZID=Asia\/Dubai:20261019T063000\r\n/);
  assert.match(ics, /\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR\r\n/);
  assert.match(ics, /\r\nSUMMARY:Gym\\, then\\; work\r\n/);
  assert.match(ics, /\r\nTRIGGER:PT0M\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  const once = A.toICS(alarm({ zone: 'Asia/Kathmandu', time: '04:00' }), Date.parse('2026-10-16T12:00:00Z'));
  assert.doesNotMatch(once, /RRULE/);
  assert.match(once, /DTSTART;TZID=Asia\/Kathmandu:20261017T040000/);
  assert.match(once, /TZOFFSETTO:\+0545/);
  assert.match(A.toICS(alarm({ days: [1, 2, 3, 4, 5, 6, 7] }), 0), /RRULE:FREQ=DAILY\r\n/);
});
