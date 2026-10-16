/* Shift-aware alarms: pure functions, no DOM.
   A shift is { id, date: 'YYYY-MM-DD', type, start: 'HH:MM' | null, end, zone, note, source }.
   Working shifts (morning, evening, night, shift) get one derived alarm at
   start − (preparation + commute). Days off, holidays and travel never ring.
   A working shift without a start time is reported as missing; no time is
   ever guessed. Times are wall-clock times in the shift's IANA zone. */
(function (root) {
  'use strict';
  const A = typeof module !== 'undefined' && module.exports ? require('./alarms.js') : root.JarvisAlarms;
  const TYPES = { morning: 'Morning shift', evening: 'Evening shift', night: 'Night shift', shift: 'Shift', off: 'Day off', holiday: 'Holiday', travel: 'Travel' };
  const WORKING = ['morning', 'evening', 'night', 'shift'];
  const ZONES = A.ZONES;
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  function validShift(s) {
    return !!s && typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 200
      && typeof s.date === 'string' && DATE.test(s.date) && A.realDate(s.date)
      && Object.prototype.hasOwnProperty.call(TYPES, s.type)
      && (s.start === null || (typeof s.start === 'string' && TIME.test(s.start)))
      && (s.end === null || (typeof s.end === 'string' && TIME.test(s.end)))
      && Object.prototype.hasOwnProperty.call(ZONES, s.zone)
      && typeof s.note === 'string' && s.note.length <= 80
      && (s.source === 'manual' || s.source === 'ics');
  }
  function validSettings(c) {
    return !!c && typeof c.enabled === 'boolean'
      && Number.isInteger(c.prep) && c.prep >= 0 && c.prep <= 240
      && Number.isInteger(c.commute) && c.commute >= 0 && c.commute <= 240
      && A.SNOOZE.includes(c.snooze) && A.SOUNDS.includes(c.sound);
  }
  const DEFAULTS = { enabled: true, prep: 60, commute: 30, snooze: 10, sound: 'chime' };

  const pad = n => String(n).padStart(2, '0');
  const startInstant = s => { const [y, m, d] = s.date.split('-').map(Number), [hh, mm] = s.start.split(':').map(Number); return A.zonedInstant(s.zone, y, m, d, hh, mm); };
  const localHHMM = (ms, zone) => { const p = A.localParts(ms, zone); return pad(p.hh) + ':' + pad(p.mm); };
  const localDate = (ms, zone) => { const p = A.localParts(ms, zone); return p.y + '-' + pad(p.m) + '-' + pad(p.d); };

  /* Derived alarms for shifts that start after `fromMs` (minus a day, so a
     night shift that has already begun still shows its state). Duplicate
     shifts (same zone, date and start) collapse into one. Overrides are keyed
     by shift id: { off: true } or { time: 'HH:MM' } (an explicit alarm time on
     the alarm's own date, which survives recalculation). */
  function plan(shifts, settings, overrides, fromMs, days) {
    const seen = new Set(), out = [], missing = [];
    const horizon = fromMs + (days || 14) * 864e5;
    for (const s of [...shifts].sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))) {
      if (!WORKING.includes(s.type)) continue;
      if (!s.start) { missing.push(s); continue; }
      const start = startInstant(s);
      if (start < fromMs - 864e5 || start > horizon) continue;
      const key = s.zone + '|' + s.date + '|' + s.start;
      if (seen.has(key)) continue;
      seen.add(key);
      const o = overrides && overrides[s.id] || {};
      let at = start - (settings.prep + settings.commute) * 60000;
      if (o.time && TIME.test(o.time)) {
        // Custom time on the shift's own date; if that is after the start, the day before.
        const [y, m, d] = s.date.split('-').map(Number), [hh, mm] = o.time.split(':').map(Number);
        at = A.zonedInstant(s.zone, y, m, d, hh, mm);
        if (at > start) at -= 864e5;
      }
      out.push({
        id: 'shift:' + s.id, shift: s, start, at, off: !!o.off || !settings.enabled, custom: !!o.time,
        time: localHHMM(at, s.zone), date: localDate(at, s.zone), zone: s.zone,
        label: (TYPES[s.type]) + ' ' + s.start + (s.note ? ' · ' + s.note : ''),
      });
    }
    return { alarms: out, missing };
  }

  /* Minimal iCalendar reader for roster exports: VEVENT with DTSTART (UTC "Z",
     TZID=Asia/Dubai|Asia/Kathmandu, floating = Dubai, or all-day VALUE=DATE),
     DTEND, SUMMARY and UID. Recurrence rules are reported, not expanded. */
  function unfold(text) { return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/); }
  function icsValue(v) { return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim(); }
  function parseDate(prop, value) {
    const tz = (/TZID=([^;:]+)/.exec(prop) || [])[1];
    if (/VALUE=DATE(?!-)/.test(prop) || /^\d{8}$/.test(value)) return { allDay: true, date: value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8) };
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
    if (!m) return null;
    const [, y, mo, d, hh, mi, , z] = m;
    if (z) return { utc: Date.UTC(+y, +mo - 1, +d, +hh, +mi) };
    const zone = tz && Object.prototype.hasOwnProperty.call(ZONES, tz) ? tz : tz ? null : 'Asia/Dubai';
    if (!zone) return { unsupportedZone: tz };
    return { utc: A.zonedInstant(zone, +y, +mo, +d, +hh, +mi), zone };
  }
  // Whole words only, and hyphenated words stay whole: "Kick-off" or
  // "Off-site" never turn a working event into a day off.
  function classify(summary) {
    const words = new Set(summary.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
    const has = (...w) => w.some(x => words.has(x));
    if (has('holiday', 'leave', 'vacation', 'ph')) return 'holiday';
    if (has('travel', 'flight', 'trip')) return 'travel';
    if (has('off', 'rdo') || /\brest day\b/.test(summary.toLowerCase())) return 'off';
    if (has('night', 'ns', 'graveyard')) return 'night';
    if (has('morning', 'early', 'am')) return 'morning';
    if (has('evening', 'afternoon', 'late', 'pm')) return 'evening';
    return 'shift';
  }
  function parseICS(text, zone = 'Asia/Dubai') {
    const lines = unfold(String(text || ''));
    const shifts = [], issues = [];
    let ev = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
      if (line === 'END:VEVENT') {
        if (ev) {
          const summary = ev.SUMMARY || '';
          let start = ev.DTSTART && parseDate(ev.DTSTART[0], ev.DTSTART[1]);
          if (start && start.utc !== undefined && !A.instant(start.utc)) start = null;
          const end = ev.DTEND && parseDate(ev.DTEND[0], ev.DTEND[1]);
          if (ev.RRULE) issues.push('Repeating event “' + summary + '” was read once; list each shift separately for exact alarms.');
          if (/^cancelled$/i.test(ev.STATUS || '')) issues.push('Skipped cancelled “' + summary + '”.');
          else if (!start) issues.push('Skipped “' + summary + '”: no readable start.');
          else if (start.unsupportedZone) issues.push('Skipped “' + summary + '”: time zone ' + start.unsupportedZone + ' is not supported.');
          else {
            let type = classify(summary);
            const shiftZone = start.zone || zone;
            const date = start.allDay ? start.date : localDate(start.utc, shiftZone);
            const startTime = start.allDay ? null : localHHMM(start.utc, shiftZone);
            const endTime = end && !end.allDay && !end.unsupportedZone ? localHHMM(end.utc, shiftZone) : null;
            if (start.allDay && WORKING.includes(type)) issues.push('“' + summary + '” on ' + date + ' has no start time; no alarm is set for it.');
            // A UID can repeat across a series' occurrences; the date keeps each one distinct.
            const id = ((ev.UID || summary) + '|' + date).slice(0, 200);
            const shift = { id, date, type, start: startTime, end: endTime, zone: shiftZone, note: summary.slice(0, 80), source: 'ics' };
            if (validShift(shift)) shifts.push(shift); else issues.push('Skipped “' + summary + '”: the date or time is not valid.');
          }
        }
        ev = null;
        continue;
      }
      if (!ev) continue;
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const prop = line.slice(0, colon), name = prop.split(';')[0].toUpperCase(), value = line.slice(colon + 1);
      if (name === 'DTSTART' || name === 'DTEND') ev[name] = [prop, value.trim()];
      else if (name === 'SUMMARY') ev.SUMMARY = icsValue(value);
      else if (name === 'UID') ev.UID = value.trim();
      else if (name === 'RRULE') ev.RRULE = value.trim();
      else if (name === 'STATUS') ev.STATUS = value.trim();
    }
    return { shifts, issues };
  }

  /* Merge an import: shifts from the same source on the imported dates are
     replaced (so a changed roster recalculates), manual shifts are kept, and
     exact duplicates collapse. Overrides stay keyed by id; a custom alarm time
     is dropped when its shift's start time changed. */
  function merge(existing, incoming, overrides) {
    const dates = new Set(incoming.map(s => s.date));
    const kept = existing.filter(s => !(s.source === 'ics' && dates.has(s.date)));
    const byKey = new Map();
    for (const s of [...kept, ...incoming]) byKey.set(s.zone + '|' + s.date + '|' + (s.start || s.type), s);
    const next = [...byKey.values()];
    const nextOverrides = Object.create(null);
    for (const s of next) {
      const o = overrides && overrides[s.id];
      if (!o) continue;
      const before = existing.find(x => x.id === s.id);
      nextOverrides[s.id] = before && before.start !== s.start ? (o.off ? { off: true } : null) : o;
      if (!nextOverrides[s.id]) delete nextOverrides[s.id];
    }
    return { shifts: next, overrides: nextOverrides };
  }

  /* The roster that ships with JANGE (roster.js) as shift entries. Ids match a
     calendar import of the same roster, so applying both never duplicates a
     shift. Anything malformed is skipped, never guessed. */
  const ROSTER_KINDS = {
    day: { type: 'shift', start: '07:00', end: '19:00', note: 'Day shift 7am to 7pm' },
    night: { type: 'night', start: '19:00', end: '07:00', note: 'Night shift 7pm to 7am' },
    off: { type: 'off', start: '08:00', end: '13:00', note: 'Off 8am to 1pm' },
  };
  function fromRoster(r) {
    if (!r || typeof r.version !== 'string' || !Object.prototype.hasOwnProperty.call(ZONES, r.zone)) return [];
    const out = [];
    for (const kind of Object.keys(ROSTER_KINDS)) {
      for (const date of Array.isArray(r[kind]) ? r[kind] : []) {
        const s = { id: 'ddf-' + kind + '-' + String(date).replace(/-/g, '') + '@jange-roster|' + date, date, zone: r.zone, source: 'ics', ...ROSTER_KINDS[kind] };
        if (validShift(s)) out.push(s);
      }
    }
    return out;
  }
  /* Apply a roster version. Its shifts replace the previous version's within the roster's
     dates, so a date dropped from the roster loses its shift and alarm. Everything else is
     kept: shifts added on the iPad, imported holidays (ddf-hols-…), calendar entries outside
     the roster's dates, and overrides of shifts that remain. */
  const ROSTER_ID = /^ddf-(day|night|off)-\d{8}@jange-roster\|/;
  function rosterMerge(existing, overrides, r) {
    const incoming = fromRoster(r);
    if (!incoming.length) return null;
    const ids = new Set(incoming.map(s => s.id)), dates = incoming.map(s => s.date).sort();
    const first = dates[0], last = dates[dates.length - 1];
    const stale = new Set(existing.filter(s => ROSTER_ID.test(s.id) && !ids.has(s.id) && s.date >= first && s.date <= last).map(s => s.id));
    const keptOverrides = Object.create(null);
    for (const [k, v] of Object.entries(overrides || {})) if (!stale.has(k)) keptOverrides[k] = v;
    return { ...merge(existing.filter(s => !stale.has(s.id)), incoming, keptOverrides), incoming, removed: [...stale] };
  }

  /* What the desk shows, so you always know your day: today (the shift you
     are on — a night shift runs past midnight — today's shift, a day off or
     holiday, or no shift), tomorrow, and the next working shift. */
  function shiftName(s) {
    const m = s.type === 'shift' && /^([a-z]+) shift\b/i.exec(s.note || '');
    return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' shift' : TYPES[s.type];
  }
  // Times are the shift's own; a Kathmandu shift says so on the Dubai desk.
  const zoneTag = s => s.zone === 'Asia/Dubai' ? '' : ' NPT';
  const hours = s => s.start ? ' ' + s.start + (s.end ? '–' + s.end : '') + zoneTag(s) : '';
  const addDay = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
  const dayLabel = d => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
  // No end time means the end is unknown: never invent one.
  function endInstant(s) {
    if (!s.end) return null;
    const start = startInstant(s), [y, m, d] = s.date.split('-').map(Number), [hh, mm] = s.end.split(':').map(Number);
    let end = A.zonedInstant(s.zone, y, m, d, hh, mm);
    while (end <= start) end += 864e5;
    return end;
  }
  function deskLines(shifts, nowMs, zone = 'Asia/Dubai') {
    if (!shifts.length) return [];
    const today = localDate(nowMs, zone), tomorrow = addDay(today, 1), yesterday = addDay(today, -1);
    const isWork = s => WORKING.includes(s.type);
    // Recent and future working shifts with a start, one per zone, date and start.
    const seen = new Set(), working = [];
    for (const s of shifts) {
      if (!isWork(s) || !s.start || s.date < yesterday || seen.has(s.zone + s.date + s.start)) continue;
      seen.add(s.zone + s.date + s.start);
      working.push({ s, at: startInstant(s), end: endInstant(s) });
    }
    working.sort((x, y) => x.at - y.at);
    const workOn = d => shifts.some(s => s.date === d && isWork(s));
    const noTime = d => shifts.find(s => s.date === d && isWork(s) && !s.start);
    // A day off or holiday, and how long it runs: "Holiday until Fri 23 Oct".
    const rest = d => {
      const r = shifts.find(s => s.date === d && !isWork(s));
      if (!r) return null;
      let last = d;
      while (!workOn(addDay(last, 1)) && shifts.some(s => s.date === addDay(last, 1) && s.type === r.type)) last = addDay(last, 1);
      const base = shiftName(r) + hours(r);
      return { last, base, text: base + (last !== d ? ' until ' + dayLabel(last) : '') };
    };
    // "No shift" only for a day inside the roster's range, never before it starts or after it ends.
    const rostered = d => shifts.some(s => s.date >= d) && shifts.some(s => s.date <= d);
    const lines = [], shown = new Set();
    const current = working.find(w => w.at <= nowMs && w.end !== null && nowMs < w.end);
    const todays = working.filter(w => w.s.date === today && w !== current);
    const later = todays.find(w => w.at > nowMs);
    const done = [...todays].reverse().find(w => w.end !== null && w.end <= nowMs);
    const started = todays.find(w => w.end === null && w.at <= nowMs);
    const todayRest = rest(today), todayNoTime = noTime(today);
    if (current) { shown.add(current.s); lines.push({ kind: 'now', text: 'On shift now · ' + shiftName(current.s) + ' until ' + current.s.end + zoneTag(current.s) }); }
    else if (later) { shown.add(later.s); lines.push({ kind: 'today', text: 'Today · ' + shiftName(later.s) + hours(later.s) }); }
    else if (started) lines.push({ kind: 'today', text: 'Today · ' + shiftName(started.s) + hours(started.s) });
    else if (done) lines.push({ kind: 'today', text: 'Today · ' + shiftName(done.s) + ' done' });
    else if (todayNoTime) lines.push({ kind: 'today', text: 'Today · ' + shiftName(todayNoTime) + ' (no time)' });
    else if (todayRest) lines.push({ kind: 'rest', text: 'Today · ' + todayRest.text });
    else if (rostered(today)) lines.push({ kind: 'today', text: 'Today · No shift' });
    const next = working.find(w => w.at > nowMs && !shown.has(w.s));
    const nextLine = () => {
      const when = next.s.date === today ? (next.s.start >= '17:00' ? 'Tonight · ' : 'Later today · ')
        : next.s.date === tomorrow ? 'Tomorrow · ' : 'Next shift · ' + dayLabel(next.s.date) + ' · ';
      lines.push({ kind: 'next', text: when + shiftName(next.s) + hours(next.s) });
    };
    if (next && next.s.date === today) nextLine(); // tonight comes before tomorrow
    // Tomorrow always gets its own line (a working shift tomorrow is the next-shift line below).
    if (!(next && next.s.date === tomorrow)) {
      const r = rest(tomorrow), nt = noTime(tomorrow);
      const continued = todayRest && todayRest.last >= tomorrow; // "Today · Holiday until …" already says how long
      if (nt) lines.push({ kind: 'tomorrow', text: 'Tomorrow · ' + shiftName(nt) + ' (no time)' });
      else if (r) lines.push({ kind: 'rest', text: 'Tomorrow · ' + (continued ? r.base : r.text) });
      else if (!workOn(tomorrow) && rostered(tomorrow)) lines.push({ kind: 'tomorrow', text: 'Tomorrow · No shift' });
    }
    if (next && next.s.date !== today) nextLine();
    return lines.slice(0, 3);
  }

  const api = { TYPES, WORKING, DEFAULTS, validShift, validSettings, plan, parseICS, merge, classify, deskLines, shiftName, fromRoster, rosterMerge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JangeShifts = api;
})(typeof window === 'undefined' ? globalThis : window);
