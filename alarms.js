/* Alarm scheduling: pure functions, no DOM. Times are wall-clock times in an
   IANA zone, converted to UTC instants through Intl, so an alarm set for
   06:30 Kathmandu rings at 06:30 Kathmandu whatever the iPad's own zone is. */
(function (root) {
  'use strict';
  const ZONES = { 'Asia/Dubai': 'Dubai', 'Asia/Kathmandu': 'Kathmandu' };
  const SNOOZE = [5, 10, 15];
  const SOUNDS = ['chime', 'soft', 'silent'];
  const GRACE_MS = 10 * 60 * 1000; // later than this counts as missed, not rung
  const formatters = new Map();
  const formatter = zone => formatters.get(zone) || formatters.set(zone, new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })).get(zone);
  // Timestamps outside 2000–2100 are rejected: Intl throws on absurd values.
  const MIN_T = Date.UTC(2000, 0, 1), MAX_T = Date.UTC(2100, 0, 1);
  const instant = v => Number.isFinite(v) && v >= MIN_T && v <= MAX_T;
  const realDate = s => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const [y, m, d] = s.split('-').map(Number), t = Date.UTC(y, m - 1, d); return instant(t) && new Date(t).toISOString().slice(0, 10) === s; };
  function localParts(ms, zone) {
    const p = Object.fromEntries(formatter(zone).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
  }
  function offsetMs(ms, zone) {
    const p = localParts(ms, zone);
    return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000;
  }
  // UTC instant of a wall-clock time in a zone. The second pass settles any
  // offset change (Dubai and Kathmandu have none today).
  function zonedInstant(zone, y, m, d, hh, mm) {
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    const first = guess - offsetMs(guess, zone);
    return guess - offsetMs(first, zone);
  }
  // ISO weekday: 1 = Monday … 7 = Sunday.
  const weekday = (y, m, d) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 + 1;

  // First occurrence strictly after `afterMs`, or null.
  function nextOccurrence(alarm, afterMs) {
    const [hh, mm] = alarm.time.split(':').map(Number);
    if (alarm.date) {
      // Date-specific alarm (used for shifts): exactly one occurrence.
      const [y, m, d] = alarm.date.split('-').map(Number), at = zonedInstant(alarm.zone, y, m, d, hh, mm);
      return at > afterMs ? at : null;
    }
    const start = localParts(afterMs, alarm.zone);
    for (let k = 0; k <= 8; k++) {
      const day = new Date(Date.UTC(start.y, start.m - 1, start.d + k));
      const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
      if (alarm.days.length && !alarm.days.includes(weekday(y, m, d))) continue;
      const at = zonedInstant(alarm.zone, y, m, d, hh, mm);
      if (at > afterMs) return at;
    }
    return null;
  }

  // What the clock tick should do for one alarm at `now`.
  // ring   — due within the grace window (or a snooze ended): show and sound it
  // missed — its time passed while Jarvis was not running: record, do not ring
  function evaluate(alarm, now) {
    if (alarm.snoozeUntil) {
      if (now < alarm.snoozeUntil) return null;
      return { type: now - alarm.snoozeUntil <= GRACE_MS ? 'ring' : 'missed', at: alarm.snoozeUntil, snoozed: true };
    }
    if (!alarm.enabled) return null;
    const due = nextOccurrence(alarm, alarm.anchor);
    if (due === null || now < due) return null;
    return now - due <= GRACE_MS ? { type: 'ring', at: due } : { type: 'missed', at: due };
  }

  const pad = n => String(n).padStart(2, '0');
  function repeatLabel(days) {
    const key = [...days].sort().join('');
    if (!days.length) return 'Once';
    if (key === '1234567') return 'Daily';
    if (key === '12345') return 'Weekdays';
    if (key === '67') return 'Weekends';
    return [...days].sort().map(n => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][n - 1]).join(' ');
  }

  function valid(a) {
    return !!a && typeof a.id === 'string' && /^[\w-]{1,100}$/.test(a.id)
      && typeof a.label === 'string' && a.label.length <= 60
      && typeof a.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)
      && Object.prototype.hasOwnProperty.call(ZONES, a.zone)
      && Array.isArray(a.days) && a.days.length <= 7 && a.days.every(n => Number.isInteger(n) && n >= 1 && n <= 7) && new Set(a.days).size === a.days.length
      && typeof a.enabled === 'boolean'
      && SNOOZE.includes(a.snooze) && SOUNDS.includes(a.sound)
      && instant(a.anchor)
      && (a.snoozeUntil === null || instant(a.snoozeUntil))
      && (a.missedAt === null || instant(a.missedAt))
      && (a.date === undefined || realDate(a.date));
  }

  // iCalendar export so an important alarm can also live in the iPad's own
  // Calendar, whose alerts fire even when Jarvis is closed.
  const TZ = { 'Asia/Dubai': ['+0400', 'GST'], 'Asia/Kathmandu': ['+0545', 'NPT'] };
  const icsText = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function toICS(alarm, now) {
    const first = nextOccurrence({ ...alarm, enabled: true }, now);
    const p = localParts(first, alarm.zone), stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const days = [...alarm.days].sort();
    const rule = !days.length ? null : days.length === 7 ? 'FREQ=DAILY' : 'FREQ=WEEKLY;BYDAY=' + days.map(n => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][n - 1]).join(',');
    const title = icsText(alarm.label || 'Jarvis alarm');
    const [offset, name] = TZ[alarm.zone];
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jarvis Desk Hub//Alarm 3.1//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', 'TZID:' + alarm.zone, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:' + offset, 'TZOFFSETTO:' + offset, 'TZNAME:' + name, 'END:STANDARD', 'END:VTIMEZONE',
      'BEGIN:VEVENT', 'UID:' + alarm.id + '@jarvis-desk-hub', 'DTSTAMP:' + stamp,
      'DTSTART;TZID=' + alarm.zone + ':' + p.y + pad(p.m) + pad(p.d) + 'T' + pad(p.hh) + pad(p.mm) + '00', 'DURATION:PT5M',
      ...(rule ? ['RRULE:' + rule] : []),
      'SUMMARY:' + title, 'DESCRIPTION:' + icsText('Jarvis alarm, ' + ZONES[alarm.zone] + ' time. Added to Calendar so the alert fires even when Jarvis is closed.'),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + title, 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
  }

  const api = { ZONES, SNOOZE, SOUNDS, GRACE_MS, instant, realDate, localParts, zonedInstant, weekday, nextOccurrence, evaluate, repeatLabel, valid, toICS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JarvisAlarms = api;
})(typeof window === 'undefined' ? globalThis : window);
