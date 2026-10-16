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

  const api = { TYPES, WORKING, DEFAULTS, validShift, validSettings, plan, parseICS, merge, classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JangeShifts = api;
})(typeof window === 'undefined' ? globalThis : window);
