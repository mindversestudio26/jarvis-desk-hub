'use strict';
/* JANGE 3.1. Every value on screen comes from the device clock, local storage,
   Open-Meteo or the authenticated read-only companion. Nothing is simulated.
   Internal identifiers (storage keys, cache names, JarvisTime/JarvisAlarms)
   keep their original names so existing data and installs carry over. */
const $ = id => document.getElementById(id);
const root = document.documentElement;
const hud = $('hud');
const STORE = 'jarvis.desk.v2';
const PREFS = 'jarvis.prefs.v1';
const ALARMS = 'jarvis.alarms.v1';
const WEATHER_CACHE = 'jarvis.weather.v1';
const AL = JarvisAlarms, SH = JangeShifts, QT = JangeQuotes;
const SHIFTS = 'jarvis.shifts.v1';
const dubai = (d, options) => new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Dubai', ...options}).format(d);
const dayKey = d => JarvisTime.snapshot(d).dubai.day;
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const pad = n => String(n).padStart(2, '0');
const hhmm = minutes => pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/* ------------------------------------------------------------------ storage (schema unchanged since 2.0) */
let state = {tasks:[], events:[]}, storageBroken = false;
function validData(v) {
  return v && Array.isArray(v.tasks) && v.tasks.length<=2000 && v.tasks.every(t=>t && typeof t.id==='string' && t.id.length<=100 && typeof t.text==='string' && t.text.length<=180 && typeof t.done==='boolean') && Array.isArray(v.events) && v.events.length<=2000 && v.events.every(e=>e && typeof e.id==='string' && e.id.length<=100 && typeof e.text==='string' && e.text.length<=120 && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time));
}
function notice(text) {
  // The slot in the visible part of the open panel (tabs keep their own slots).
  const inDialog = [...document.querySelectorAll('dialog[open] [data-notice]')].find(n => !n.closest('[hidden]'));
  if (inDialog) inDialog.textContent = text;
  $('notice').textContent = text;
  $('notice').hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { $('notice').hidden = true; if (inDialog) inDialog.textContent = ''; }, 6500);
}
try {
  const raw = localStorage.getItem(STORE);
  if (raw) { const parsed = JSON.parse(raw); if (!validData(parsed)) throw Error('Invalid stored data'); state = parsed; }
  else {
    const old = JSON.parse(localStorage.getItem('jarvis_tasks') || '[]');
    if (Array.isArray(old)) state.tasks = old.filter(t=>typeof t==='string').slice(0,2000).map(text=>({id:uid(), text:text.slice(0,180), done:false}));
  }
} catch { storageBroken = true; }
function save() {
  if (storageBroken) { notice('Storage unavailable. Changes last only this session; use Backup.'); setSystems(); return; }
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch { storageBroken = true; notice('Could not save. Keep this page open and use Backup to preserve changes.'); }
  setSystems();
}

let alarms = [];
try {
  const raw = JSON.parse(localStorage.getItem(ALARMS));
  if (raw && Array.isArray(raw.alarms)) alarms = raw.alarms.filter(AL.valid).slice(0, 50);
} catch {}
function saveAlarms() {
  try { localStorage.setItem(ALARMS, JSON.stringify({version:1, alarms})); }
  catch { notice('Could not save alarms. Keep this page open and use Backup.'); }
}

/* Shift schedule: shifts, user settings, per-shift overrides and the ring
   state of each derived alarm. Maps use null prototypes; keys are shift ids. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const dict = () => Object.create(null);
const validOverride = o => !!o && typeof o === 'object' && Object.keys(o).length === 1 && (o.off === true || (typeof o.time === 'string' && TIME_RE.test(o.time)));
const validRuntime = r => !!r && typeof r === 'object' && AL.instant(r.anchor) && (r.snoozeUntil === null || AL.instant(r.snoozeUntil)) && (r.missedAt === null || AL.instant(r.missedAt));
const shiftFields = s => ({id:s.id, date:s.date, type:s.type, start:s.start, end:s.end, zone:s.zone, note:s.note, source:s.source});
function cleanMap(raw, valid, limit) {
  const out = dict();
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw).slice(0, limit)) if (typeof k === 'string' && k.length <= 210 && valid(v)) out[k] = {...v};
  return out;
}
let shiftStore = {settings:{...SH.DEFAULTS}, shifts:[], overrides:dict(), runtime:dict(), updated:Date.now()};
try {
  const raw = JSON.parse(localStorage.getItem(SHIFTS));
  if (raw && typeof raw === 'object') {
    if (SH.validSettings(raw.settings)) shiftStore.settings = {...raw.settings};
    if (Array.isArray(raw.shifts)) shiftStore.shifts = raw.shifts.filter(SH.validShift).slice(0, 1000).map(shiftFields);
    shiftStore.overrides = cleanMap(raw.overrides, validOverride, 1000);
    shiftStore.runtime = cleanMap(raw.runtime, validRuntime, 1000);
    if (AL.instant(raw.updated)) shiftStore.updated = raw.updated;
  }
} catch {}
function saveShifts() {
  try { localStorage.setItem(SHIFTS, JSON.stringify({version:1, ...shiftStore})); }
  catch { notice('Could not save the shift schedule. Keep this page open and use Backup.'); }
}

let prefs = {motion:'full', clock:'24', awake:false, locMode:'auto', city:null};
const round2 = v => Math.round(v * 100) / 100;
const round05 = v => Math.round(v * 20) / 20; // device location: about 5 km, enough for weather
const validPlace = p => !!p && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 80 && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180;
try {
  const p = JSON.parse(localStorage.getItem(PREFS));
  if (p && (p.motion === 'full' || p.motion === 'calm')) prefs.motion = p.motion;
  if (p && (p.clock === '24' || p.clock === '12')) prefs.clock = p.clock;
  if (p && typeof p.awake === 'boolean') prefs.awake = p.awake;
  if (p && (p.locMode === 'auto' || p.locMode === 'manual')) prefs.locMode = p.locMode;
  if (p && validPlace(p.city)) prefs.city = {name:p.city.name, lat:round2(p.city.lat), lon:round2(p.city.lon)};
} catch {}
function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} }
function applyPrefs() {
  root.classList.toggle('calm', prefs.motion === 'calm');
  for (const key of ['motion', 'clock']) document.querySelectorAll(`input[name="${key}"]`).forEach(r => { r.checked = r.value === prefs[key]; });
  document.querySelectorAll('input[name="loc-mode"]').forEach(r => { r.checked = r.value === prefs.locMode; });
}
document.querySelectorAll('input[name="motion"], input[name="clock"]').forEach(r => r.addEventListener('change', () => {
  if (!r.checked) return;
  prefs[r.name] = r.value;
  savePrefs();
  applyPrefs();
  if (r.name === 'clock') { tick(); renderAlarms(); }
}));
applyPrefs();

/* ------------------------------------------------------------------ live system state */
const sys = {net: navigator.onLine, wx: 'loading', wxAt: null, cache: 'pending', pc: 'off', pcAt: null, sound: 'locked', wake: 'off', loc: 'default'};
const busy = new Map();
let busyUntil = 0;
function setBusy(key, on) {
  if (on) busy.set(key, Date.now());
  else if (busy.has(key)) {
    // Keep the scan visible for at least one revolution per acquisition, so a
    // fast response still reads as one and an earlier key cannot cut a later one short.
    busyUntil = Math.max(busyUntil, busy.get(key) + 1800);
    busy.delete(key);
    setTimeout(() => { if (!busy.size && Date.now() >= busyUntil) hud.removeAttribute('data-busy'); }, Math.max(0, busyUntil - Date.now()));
  }
  if (busy.size) hud.setAttribute('data-busy', '');
}
function row(id, s, text) { const li = $(id); li.dataset.s = s; li.querySelector('b').textContent = text; }
function clockText(t) { return dubai(new Date(t), {hour:'2-digit', minute:'2-digit', hourCycle:'h23'}); }
function setSystems() {
  // Weather fetched earlier is only a saved reading once the network has gone.
  const wx = !sys.net && sys.wx === 'live' ? 'saved' : sys.wx;
  hud.dataset.net = sys.net ? 'online' : 'offline';
  hud.dataset.wx = wx;
  hud.dataset.pc = sys.pc;
  hud.dataset.store = storageBroken ? 'error' : 'ok';
  $('network').textContent = sys.net ? 'Online' : 'Offline mode';
  $('network').classList.toggle('warn', !sys.net);
  $('offline-ready').classList.toggle('pending', sys.cache === 'pending');
  $('offline-ready').classList.toggle('warn', sys.cache === 'error' || sys.cache === 'unsupported');
  row('sys-net', sys.net ? 'ok' : 'warn', sys.net ? 'Online' : 'Offline');
  row('sys-weather', {live:'ok', saved:'warn', none:'warn', loading:'busy'}[wx],
    wx === 'live' ? 'Live · ' + clockText(sys.wxAt) : wx === 'saved' ? 'Saved · ' + clockText(sys.wxAt) : wx === 'none' ? 'Unavailable' : 'Acquiring');
  row('sys-cache', {ready:'ok', pending:'busy', error:'warn', unsupported:'off'}[sys.cache],
    {ready:'Ready', pending:'Preparing', error:'Unavailable', unsupported:'Needs HTTPS'}[sys.cache]);
  row('sys-alarm', {ready:'ok', locked:'warn', unsupported:'off'}[sys.sound], {ready:'Ready', locked:'Tap to enable', unsupported:'Unsupported'}[sys.sound]);
  const count = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
  row('sys-store', storageBroken ? 'warn' : 'ok', storageBroken ? 'Unavailable' : count(state.tasks.length, 'task') + ' · ' + count(alarms.length, 'alarm') + ' · ' + count(shiftStore.shifts.length, 'shift'));
  let title, detail;
  if (storageBroken) { title = 'Attention'; detail = 'Local storage unavailable'; }
  else if (!sys.net) { title = 'Offline'; detail = 'Local mode · data on this iPad'; }
  else {
    title = 'Online';
    detail = sys.pc === 'online' ? 'PC linked · read-only'
      : sys.pc === 'auth' ? 'PC needs a new pairing token'
      : sys.pc === 'unreachable' ? 'PC link unavailable'
      : wx === 'live' ? 'Weather feed live' : wx === 'loading' ? 'Acquiring weather' : 'Weather feed degraded';
  }
  $('core-state').textContent = title;
  $('core-detail').textContent = detail;
  updateCoreLabel();
}
function restart(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
const ripple = () => restart($('ripple'), 'go');

/* ------------------------------------------------------------------ clocks and dial */
const DAYLIGHT_C = 2 * Math.PI * 200, PROGRESS_C = 2 * Math.PI * 193, FOCUS_C = 2 * Math.PI * 140;
const dialAngle = minutes => (minutes / 1440 * 360 + 180) % 360; // noon at the top, clockwise
const rotate = (node, angle) => node.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 240 240)');
function isoWeek(key) {
  const [y, m, d] = key.split('-').map(Number), date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
  const jan4 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((date - jan4) / 86400000 - 3 + (jan4.getUTCDay() + 6) % 7) / 7);
}
function dayOfYear(key) { const [y, m, d] = key.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000 + 1; }

const hand = $('sec-hand');
let handAngle = null, handSecond = null;
function moveHand(second) {
  let snap = handAngle === null;
  if (!snap) {
    const delta = (second - handSecond + 60) % 60;
    if (!delta) return;
    if (delta > 2 || handAngle > 21600) snap = true; else handAngle += delta * 6;
  }
  if (snap) { handAngle = second * 6; hand.classList.add('snap'); }
  hand.style.transform = 'rotate(' + handAngle + 'deg)';
  handSecond = second;
  if (snap) { void hand.offsetWidth; requestAnimationFrame(() => hand.classList.remove('snap')); }
}

let lastMinute = '';
function minuteUpdate(cities) {
  const d = cities.dubai, dm = d.hour * 60 + d.minute, km = cities.kathmandu.hour * 60 + cities.kathmandu.minute;
  rotate($('marker-dxb'), dialAngle(dm));
  rotate($('marker-ktm'), dialAngle(km));
  $('day-progress').setAttribute('stroke-dasharray', (dm / 1440 * PROGRESS_C).toFixed(1) + ' ' + PROGRESS_C.toFixed(1));
  $('greeting').textContent = d.hour < 5 ? 'A quiet night' : d.hour < 12 ? 'Good morning' : d.hour < 18 ? 'Good afternoon' : 'Good evening';
  const now = new Date(d.iso);
  $('today-line').textContent = dubai(now, {weekday:'long', day:'numeric', month:'long'});
  $('week-line').textContent = 'Week ' + isoWeek(d.day) + ' · Day ' + dayOfYear(d.day);
  renderQuote(d.day);
  replan();
  renderPeek();
  renderAlarmSummaries();
}

// One documented quotation per Dubai day; it changes at Dubai midnight.
let quoteDay = '';
function renderQuote(day) {
  if (day === quoteDay) return;
  quoteDay = day;
  const q = QT.forDay(day);
  $('quote-text').textContent = '“' + q.q + '”';
  $('quote-author').textContent = q.a;
  $('quote-ne').textContent = q.ne;
}

/* Split-flap tiles. A digit flips only when its own value changes; the static
   halves always hold settled glyphs, so an interrupted flip can never leave
   two numerals overlapping. */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function buildTile(node, order) {
  const part = cls => { const half = el('span', cls), glyph = el('span', 'glyph'); half.append(glyph); node.append(half); return glyph; };
  const tile = {el:node, value:null, timer:0, top:part('half top'), bottom:part('half bottom'), leafTop:part('leaf leaf-top'), leafBottom:part('leaf leaf-bottom')};
  node.style.setProperty('--d', order * 40 + 'ms'); // minutes digit drops first, like a real mechanism
  node.addEventListener('animationend', e => { if (e.animationName === 'leaf-land') settle(tile); });
  return tile;
}
function settle(tile) {
  clearTimeout(tile.timer);
  tile.bottom.textContent = tile.value;
  tile.el.classList.remove('flipping');
}
function setTile(tile, value, animate) {
  if (value === tile.value) return;
  const previous = tile.value;
  tile.value = value;
  if (!animate || previous === null || reducedMotion.matches) {
    clearTimeout(tile.timer);
    tile.el.classList.remove('flipping');
    tile.top.textContent = tile.bottom.textContent = tile.leafTop.textContent = tile.leafBottom.textContent = value;
    return;
  }
  tile.leafTop.textContent = tile.bottom.textContent = previous;
  tile.top.textContent = tile.leafBottom.textContent = value;
  tile.el.classList.remove('flipping');
  void tile.el.offsetWidth;
  tile.el.classList.add('flipping');
  clearTimeout(tile.timer);
  tile.timer = setTimeout(() => settle(tile), 1400); // in case animationend is lost while suspended
}
const flips = Object.fromEntries(['dubai', 'kathmandu'].map(city => {
  const tiles = [...$('flip-' + city).querySelectorAll('.tile')];
  return [city, {tiles:tiles.map((node, i) => buildTile(node, tiles.length - 1 - i)), ampm:$('flip-' + city).querySelector('.fampm')}];
}));
function showClock(city, value, snap) {
  const twelve = prefs.clock === '12', hour = twelve ? value.hour % 12 || 12 : value.hour;
  const digits = (twelve && hour < 10 ? ' ' + hour : pad(hour)) + pad(value.minute);
  const flip = flips[city];
  flip.tiles.forEach((tile, i) => {
    if (snap && tile.el.classList.contains('flipping')) settle(tile);
    setTile(tile, digits[i].trim(), !snap);
  });
  flip.ampm.textContent = twelve ? (value.hour < 12 ? 'AM' : 'PM') : '';
  return twelve ? hour + ':' + pad(value.minute) + ' ' + flip.ampm.textContent : value.time;
}

let clockTimer;
function tick(snap) {
  const now = new Date();
  const cities = JarvisTime.snapshot(now);
  for (const [city, ids] of Object.entries({dubai:['clock','seconds','date'], kathmandu:['kathmandu-clock','kathmandu-seconds','kathmandu-date']})) {
    const value = cities[city];
    $(ids[0]).textContent = showClock(city, value, snap === true);
    $(ids[0]).dateTime = value.iso;
    $(ids[1]).textContent = value.seconds;
    if ($(ids[2]).textContent !== value.date) $(ids[2]).textContent = value.date;
  }
  moveHand(Number(cities.dubai.seconds));
  const key = cities.dubai.day;
  if (tick.lastDay && tick.lastDay !== key) {
    // Follow today only when the user had today selected; retain other selections.
    if (selected === tick.lastDay) {
      if (viewYear === Number(selected.slice(0,4)) && viewMonth === Number(selected.slice(5,7))-1) {
        viewYear = Number(key.slice(0,4)); viewMonth = Number(key.slice(5,7))-1;
      }
      selected = key;
    }
    renderCalendar();
  }
  tick.lastDay = key;
  const minuteKey = key + cities.dubai.time;
  if (minuteKey !== lastMinute) { lastMinute = minuteKey; minuteUpdate(cities); }
  checkAlarms(now.getTime());
}
function startClock(snap) {
  clearTimeout(clockTimer);
  tick(snap);
  if (!document.hidden) clockTimer = setTimeout(startClock, 1000 - Date.now() % 1000 + 5);
}

/* ------------------------------------------------------------------ focus tasks */
function updateCoreLabel() {
  const first = state.tasks.find(t => !t.done);
  $('core').setAttribute('aria-label', 'JANGE core. Open focus tasks. Status ' + $('core-state').textContent + ', ' + $('core-detail').textContent + '. ' + (first ? 'Current focus: ' + first.text : 'No open tasks') + '.');
}
function renderFocus() {
  const total = state.tasks.length, done = state.tasks.filter(t => t.done).length, first = state.tasks.find(t => !t.done);
  $('core-focus').textContent = first ? first.text : total ? 'All tasks complete' : 'No open tasks';
  $('core-progress').textContent = total ? done + ' / ' + total + ' complete' : 'Tap the core to add one';
  $('focus-ring').style.strokeDashoffset = String(total ? FOCUS_C * (1 - done / total) : FOCUS_C);
  $('task-count').textContent = total - done;
  $('task-count').classList.toggle('zero', total === done);
  updateCoreLabel();
}
function renderTasks() {
  $('tasks').replaceChildren();
  $('task-empty').hidden = state.tasks.length > 0;
  const lead = state.tasks.find(t => !t.done);
  state.tasks.forEach(t => {
    const line = el('div', 'task-row' + (t.done ? ' done' : '') + (t === lead ? ' lead' : '')), label = el('label'), check = el('input'), text = el('span', '', t.text), del = el('button', 'delete', '×');
    check.type = 'checkbox'; check.checked = t.done;
    check.onchange = () => { t.done = check.checked; save(); renderTasks(); if (t.done) ripple(); };
    del.type = 'button'; del.setAttribute('aria-label', 'Delete task ' + t.text);
    del.onclick = () => { state.tasks = state.tasks.filter(x => x.id !== t.id); save(); renderTasks(); };
    label.append(check, text); line.append(label, del); $('tasks').append(line);
  });
  renderFocus();
}
$('task-form').onsubmit = e => {
  e.preventDefault();
  const text = $('task-input').value.trim();
  if (text && state.tasks.length < 2000) { state.tasks.push({id:uid(), text, done:false}); save(); renderTasks(); $('task-input').value = ''; ripple(); }
};

/* ------------------------------------------------------------------ calendar */
let selected = dayKey(new Date());
let viewYear = Number(selected.slice(0,4)), viewMonth = Number(selected.slice(5,7))-1;
const longDay = key => dubai(new Date(key + 'T12:00:00+04:00'), {weekday:'long', day:'numeric', month:'long'});
function renderCalendar() {
  $('month-label').textContent = new Intl.DateTimeFormat('en-GB', {month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(Date.UTC(viewYear, viewMonth, 1)));
  $('calendar').replaceChildren();
  const offset = (new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay() + 6) % 7, days = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate(), today = dayKey(new Date());
  for (let i = 0; i < offset; i++) $('calendar').append(el('span'));
  for (let d = 1; d <= days; d++) {
    const key = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`, b = el('button', '', d);
    b.type = 'button';
    b.classList.toggle('today', key === today);
    b.classList.toggle('selected', key === selected);
    b.classList.toggle('has-event', state.events.some(e => e.date === key));
    b.setAttribute('aria-label', dubai(new Date(key + 'T12:00:00+04:00'), {day:'numeric', month:'long', year:'numeric'}));
    b.setAttribute('aria-pressed', String(key === selected));
    b.onclick = () => { selected = key; renderCalendar(); };
    $('calendar').append(b);
  }
  renderEvents();
  renderPeek();
}
function shiftMonth(n) { const d = new Date(Date.UTC(viewYear, viewMonth + n, 1)); viewYear = d.getUTCFullYear(); viewMonth = d.getUTCMonth(); renderCalendar(); }
function showToday() { selected = dayKey(new Date()); viewYear = Number(selected.slice(0,4)); viewMonth = Number(selected.slice(5,7))-1; renderCalendar(); }
$('month-prev').onclick = () => shiftMonth(-1);
$('month-next').onclick = () => shiftMonth(1);
$('month-today').onclick = showToday;
function renderEvents() {
  $('events').replaceChildren();
  const events = state.events.filter(e => e.date === selected).sort((a, b) => a.time.localeCompare(b.time));
  $('agenda-title').textContent = longDay(selected);
  if (!events.length) $('events').append(el('p', 'empty', 'Nothing scheduled. A little breathing room.'));
  events.forEach(e => {
    const line = el('div', 'event-row'), del = el('button', 'delete', '×');
    del.type = 'button'; del.setAttribute('aria-label', 'Delete event ' + e.text);
    del.onclick = () => { state.events = state.events.filter(x => x.id !== e.id); save(); renderCalendar(); };
    line.append(el('b', '', e.time), el('span', '', e.text), del); $('events').append(line);
  });
}
function nextDay(key, n = 1) { const d = new Date(Date.UTC(Number(key.slice(0,4)), Number(key.slice(5,7)) - 1, Number(key.slice(8,10)) + n)); return d.toISOString().slice(0, 10); }
function upcomingEvents(now) {
  const byTime = (a, b) => a.time.localeCompare(b.time), tomorrowKey = nextDay(now.day);
  const today = state.events.filter(e => e.date === now.day).sort(byTime);
  return {today, tomorrowKey, upcoming:today.filter(e => e.time >= now.time), tomorrow:state.events.filter(e => e.date === tomorrowKey).sort(byTime)};
}
function renderPeek() {
  const now = JarvisTime.snapshot(new Date()).dubai, {today, tomorrowKey, upcoming, tomorrow} = upcomingEvents(now);
  const list = $('today-events'), item = (e, cls) => { const line = el('span', 'peek-item' + (cls ? ' ' + cls : '')); line.append(el('b', '', e.time), el('span', '', e.text)); list.append(line); };
  list.replaceChildren();
  const todayShift = shiftStore.shifts.find(s => s.date === now.day), tomorrowShift = shiftStore.shifts.find(s => s.date === tomorrowKey), sh = todayShift || tomorrowShift;
  if (sh) list.append(el('span', 'peek-shift', (todayShift ? 'Today · ' : 'Tomorrow · ') + SH.TYPES[sh.type] + (sh.start ? ' ' + sh.start + (sh.end ? '–' + sh.end : '') : '')));
  if (!upcoming.length) list.append(el('span', 'peek-empty', today.length ? 'Today’s events are complete.' : 'Nothing scheduled today.'));
  upcoming.slice(0, 4).forEach(e => item(e));
  const room = Math.max(0, 5 - Math.min(upcoming.length, 4) - (upcoming.length ? 0 : 1));
  if (tomorrow.length && room > 1) {
    list.append(el('span', 'peek-head', 'Tomorrow · ' + dubai(new Date(tomorrowKey + 'T12:00:00+04:00'), {weekday:'long'})));
    tomorrow.slice(0, room - 1).forEach(e => item(e, 'later'));
  }
  const strip = $('week-strip'), [y, m, d] = now.day.split('-').map(Number), monday = Date.UTC(y, m - 1, d) - ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) * 864e5;
  strip.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const key = new Date(monday + i * 864e5).toISOString().slice(0, 10), cell = el('span', 'wd' + (key === now.day ? ' today' : '') + (state.events.some(e => e.date === key) ? ' ev' : ''), 'MTWTFSS'[i]);
    cell.append(el('b', '', Number(key.slice(8, 10)))); strip.append(cell);
  }
  const hidden = Math.max(0, upcoming.length - 4);
  $('agenda-count').textContent = (today.length ? today.length + ' event' + (today.length === 1 ? '' : 's') + ' today' : 'No events today') + (hidden ? ' · ' + hidden + ' more' : '');
}
$('event-form').onsubmit = e => {
  e.preventDefault();
  const text = $('event-input').value.trim(), time = $('event-time').value;
  if (text && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && state.events.length < 2000) { state.events.push({id:uid(), text, date:selected, time}); save(); renderCalendar(); $('event-input').value = ''; }
};

/* ------------------------------------------------------------------ alarms */
const ZONE_NAME = {'Asia/Dubai':'Dubai', 'Asia/Kathmandu':'Kathmandu'};
const ZONE_CODE = {'Asia/Dubai':'dxb', 'Asia/Kathmandu':'ktm'};
function displayTime(t) {
  if (prefs.clock !== '12') return t;
  const [h, m] = t.split(':').map(Number);
  return (h % 12 || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM');
}
function relative(ms) {
  const min = Math.ceil(ms / 60000);
  if (min <= 1) return 'in under a minute';
  if (min < 60) return 'in ' + min + ' min';
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return 'in ' + h + ' h' + (m ? ' ' + m + ' min' : '');
  return 'in ' + Math.floor(h / 24) + ' d ' + (h % 24) + ' h';
}
const whenText = (at, zone) => new Intl.DateTimeFormat('en-GB', {timeZone:zone, weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:prefs.clock === '12' ? 'h12' : 'h23'}).format(new Date(at));
function nextRing(a, now) {
  if (a.snoozeUntil) return a.snoozeUntil;
  return a.enabled ? AL.nextOccurrence(a, Math.max(a.anchor, now)) : null;
}
/* Shift alarms are derived, date-specific alarms; their ring state is kept per
   shift so a reload never rings one twice. A shift alarm within a minute of a
   manual alarm is covered by it (no double ring). */
let shiftAlarms = [], shiftMissing = [];
function replan() {
  const now = Date.now(), plan = SH.plan(shiftStore.shifts, shiftStore.settings, shiftStore.overrides, now, 21);
  let handled = false;
  shiftMissing = plan.missing;
  shiftAlarms = plan.alarms.map(p => {
    const r = shiftStore.runtime[p.id] || {anchor:shiftStore.updated, snoozeUntil:null, missedAt:null};
    return {id:p.id, label:p.label, time:p.time, zone:p.zone, days:[], date:p.date, enabled:!p.off, snooze:shiftStore.settings.snooze, sound:shiftStore.settings.sound, anchor:r.anchor, snoozeUntil:r.snoozeUntil, missedAt:r.missedAt, plan:p, covered:false};
  });
  const live = new Set(shiftStore.shifts.map(s => 'shift:' + s.id));
  for (const k of Object.keys(shiftStore.runtime)) if (!live.has(k)) delete shiftStore.runtime[k];
  for (const a of shiftAlarms) {
    // Covered if a manual alarm will ring then, or already rang (its anchor) at that moment.
    a.covered = alarms.some(m => { const at = nextRing(m, now - AL.GRACE_MS); return (at !== null && Math.abs(at - a.plan.at) <= 60000) || Math.abs(m.anchor - a.plan.at) <= 60000; });
    if (a.covered) {
      a.enabled = false;
      // Once its moment has passed it is handled for good, even if the manual alarm is later edited.
      if (a.plan.at <= now && a.anchor < a.plan.at) { a.anchor = a.plan.at; shiftStore.runtime[a.id] = {anchor:a.plan.at, snoozeUntil:null, missedAt:null}; handled = true; }
    }
  }
  if (handled) saveShifts();
}
const allAlarms = () => [...alarms, ...shiftAlarms];
function persistAlarm(a) {
  if (a.id.startsWith('shift:')) { shiftStore.runtime[a.id] = {anchor:a.anchor, snoozeUntil:a.snoozeUntil, missedAt:a.missedAt}; saveShifts(); }
  else saveAlarms();
}
function soonestAlarm(now, zone) {
  let best = null;
  for (const a of allAlarms()) {
    if (zone && a.zone !== zone) continue;
    const at = nextRing(a, now);
    if (at !== null && (!best || at < best.at)) best = {alarm:a, at};
  }
  return best;
}
function renderAlarmSummaries() {
  const now = Date.now();
  for (const [zone, id] of [['Asia/Dubai', 'next-alarm-dubai'], ['Asia/Kathmandu', 'next-alarm-kathmandu']]) {
    const next = soonestAlarm(now, zone);
    $(id).hidden = !next;
    if (next) $(id).textContent = (next.alarm.snoozeUntil ? 'Snoozed · ' : 'Alarm ') + whenText(next.at, zone) + ' · ' + relative(next.at - now) + (next.alarm.plan ? ' · ' + next.alarm.plan.label : '');
  }
  const marks = $('alarm-marks');
  marks.replaceChildren();
  allAlarms().filter(a => (a.enabled || a.snoozeUntil) && (!a.date || nextRing(a, now) !== null && nextRing(a, now) - now < 864e5)).slice(0, 16).forEach(a => {
    const [h, m] = (a.snoozeUntil ? new Intl.DateTimeFormat('en-GB', {timeZone:a.zone, hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(new Date(a.snoozeUntil)) : a.time).split(':').map(Number);
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    mark.setAttribute('d', 'M240 34l4.5 5.5-4.5 5.5-4.5-5.5z');
    mark.setAttribute('class', ZONE_CODE[a.zone]);
    rotate(mark, dialAngle(h * 60 + m));
    marks.append(mark);
  });
  const enabled = alarms.filter(a => a.enabled).length + shiftAlarms.filter(a => a.enabled && nextRing(a, now) !== null).length;
  $('alarm-count').textContent = enabled;
  $('alarm-count').classList.toggle('zero', !enabled);
}
function renderAlarms() {
  const list = $('alarm-list'), now = Date.now();
  list.replaceChildren();
  $('alarm-empty').hidden = alarms.length > 0;
  [...alarms].sort((a, b) => a.time.localeCompare(b.time)).forEach(a => {
    const item = el('li', 'alarm-item' + (a.enabled || a.snoozeUntil ? '' : ' off'));
    const time = el('div', 'ai-time'); time.append(el('b', '', displayTime(a.time)), el('span', 'ai-zone ' + ZONE_CODE[a.zone], ZONE_NAME[a.zone]));
    const info = el('div', 'ai-info'), at = nextRing(a, now);
    info.append(el('span', 'ai-label', a.label || 'Alarm'));
    info.append(el('span', 'ai-meta', AL.repeatLabel(a.days) + ' · ' + (a.snoozeUntil ? 'snoozed until ' + whenText(a.snoozeUntil, a.zone) : at !== null ? 'next ' + whenText(at, a.zone) + ', ' + relative(at - now) : 'off')));
    if (a.missedAt) info.append(el('span', 'ai-missed', 'Missed ' + whenText(a.missedAt, a.zone) + ': JANGE was closed, in the background or the iPad was asleep'));
    const toggle = el('button', 'switch');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    const on = a.enabled || !!a.snoozeUntil;
    toggle.setAttribute('aria-checked', String(on));
    toggle.setAttribute('aria-label', (a.label || 'Alarm') + ' at ' + displayTime(a.time) + ' ' + ZONE_NAME[a.zone] + ' time');
    toggle.onclick = () => {
      if (on) { a.enabled = false; a.snoozeUntil = null; } // off also cancels a pending snooze
      else { a.enabled = true; a.anchor = Date.now(); a.missedAt = null; }
      saveAlarms(); replan(); renderAlarms(); renderShifts();
    };
    const actions = el('div', 'ai-actions'), edit = el('button', 'text-btn', 'Edit'), cal = el('button', 'text-btn', 'Add to Calendar'), del = el('button', 'text-btn danger', 'Delete');
    [edit, cal, del].forEach(b => { b.type = 'button'; });
    edit.setAttribute('aria-label', 'Edit alarm ' + (a.label || displayTime(a.time)));
    cal.setAttribute('aria-label', 'Add alarm ' + (a.label || displayTime(a.time)) + ' to Calendar');
    del.setAttribute('aria-label', 'Delete alarm ' + (a.label || displayTime(a.time)));
    edit.onclick = () => openEditor(a);
    cal.onclick = () => exportICS(a);
    del.onclick = () => deleteAlarm(a);
    actions.append(edit, cal, del);
    item.append(time, info, toggle, actions);
    list.append(item);
  });
  renderAlarmSummaries();
}
function deleteAlarm(a) {
  const index = alarms.indexOf(a);
  alarms = alarms.filter(x => x !== a);
  if (ringing?.alarm === a) stopRinging();
  saveAlarms(); replan(); renderAlarms(); setSystems();
  // Undo instead of a confirmation prompt.
  const box = document.querySelector('.alarm-notice'), undo = el('button', '', 'Undo');
  undo.type = 'button';
  undo.onclick = () => { if (!alarms.includes(a)) alarms.splice(Math.min(index, alarms.length), 0, a); saveAlarms(); replan(); renderAlarms(); setSystems(); box.replaceChildren(); };
  box.replaceChildren(el('span', '', 'Alarm deleted.'), undo);
  clearTimeout(deleteAlarm.timer);
  deleteAlarm.timer = setTimeout(() => box.replaceChildren(), 8000);
}
function exportICS(a) {
  const blob = new Blob([AL.toICS(a, Date.now())], {type:'text/calendar'}), link = document.createElement('a'), url = URL.createObjectURL(blob);
  link.href = url;
  link.download = 'jange-alarm-' + ((a.label || 'alarm').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'alarm') + '.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Calendar file saved. Open it on the iPad to add this alarm and its alert to Calendar.');
}

let editing = null, formDays = new Set();
const PRESETS = {once:[], daily:[1,2,3,4,5,6,7], weekdays:[1,2,3,4,5], weekends:[6,7]};
function renderDayChips() {
  document.querySelectorAll('.day').forEach(b => b.setAttribute('aria-pressed', String(formDays.has(Number(b.dataset.day)))));
  const key = [...formDays].sort().join(',');
  document.querySelectorAll('.repeat-presets button').forEach(b => b.setAttribute('aria-pressed', String(PRESETS[b.dataset.preset].join(',') === key)));
  $('alarm-repeat-summary').textContent = AL.repeatLabel([...formDays]) === 'Once' ? 'Once · rings at the next occurrence, then turns off' : 'Repeats ' + AL.repeatLabel([...formDays]).toLowerCase();
}
document.querySelectorAll('.day').forEach(b => b.onclick = () => { const d = Number(b.dataset.day); formDays.has(d) ? formDays.delete(d) : formDays.add(d); renderDayChips(); });
document.querySelectorAll('.repeat-presets button').forEach(b => b.onclick = () => { formDays = new Set(PRESETS[b.dataset.preset]); renderDayChips(); });
function setRadio(name, value) { document.querySelectorAll(`input[name="${name}"]`).forEach(r => { r.checked = r.value === String(value); }); }
function openEditor(a) {
  editing = a ? a.id : null;
  $('alarm-form-title').textContent = a ? 'Edit alarm' : 'New alarm';
  $('alarm-time').value = a ? a.time : '07:00';
  $('alarm-label').value = a ? a.label : '';
  setRadio('alarm-zone', a ? a.zone : 'Asia/Dubai');
  setRadio('alarm-snooze', a ? a.snooze : 10);
  setRadio('alarm-sound', a ? a.sound : 'chime');
  formDays = new Set(a ? a.days : []);
  renderDayChips();
  $('alarm-list-view').hidden = true;
  $('alarm-form').hidden = false;
}
function closeEditor() { editing = null; $('alarm-form').hidden = true; $('alarm-list-view').hidden = false; }
$('alarm-new').onclick = () => { if (alarms.length >= 50) notice('Up to 50 alarms can be stored.'); else openEditor(null); };
$('alarm-cancel').onclick = closeEditor;
$('alarm-form').onsubmit = e => {
  e.preventDefault();
  const radio = name => document.querySelector(`input[name="${name}"]:checked`)?.value;
  const now = Date.now();
  const next = {id:editing || uid(), label:$('alarm-label').value.trim().slice(0, 60), time:$('alarm-time').value, zone:radio('alarm-zone'), days:[...formDays].sort(), enabled:true, snooze:Number(radio('alarm-snooze')), sound:radio('alarm-sound'), anchor:now, snoozeUntil:null, missedAt:null};
  if (!AL.valid(next)) { notice('Choose a valid time for the alarm.'); return; }
  const index = alarms.findIndex(a => a.id === next.id);
  if (index >= 0) alarms[index] = next; else alarms.push(next);
  saveAlarms();
  closeEditor();
  replan();
  renderAlarms();
  setSystems();
  const at = AL.nextOccurrence(next, now);
  notice('Alarm set for ' + whenText(at, next.zone) + ' ' + ZONE_NAME[next.zone] + ' time, ' + relative(at - now) + '.');
};

/* Sound. iPadOS only lets a page play audio after a tap, so the first tap
   anywhere unlocks a Web Audio context; chimes are synthesised, no files. */
const sound = {ctx:null, master:null, timer:0};
const AudioCtx = window.AudioContext || window.webkitAudioContext;
function renderSound() {
  sys.sound = !AudioCtx ? 'unsupported' : sound.ctx && sound.ctx.state === 'running' ? 'ready' : 'locked';
  const chip = $('sound-status');
  chip.textContent = {ready:'Sound ready', locked:'Sound locked · tap once', unsupported:'No audio support'}[sys.sound];
  chip.className = 'status-chip ' + {ready:'on', locked:'warn', unsupported:'off'}[sys.sound];
  setSystems();
}
function unlockAudio() {
  if (!AudioCtx) { renderSound(); return; }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  if (!sound.ctx) {
    try { sound.ctx = new AudioCtx(); } catch { renderSound(); return; }
    sound.ctx.onstatechange = renderSound;
  }
  if (sound.ctx.state !== 'running') sound.ctx.resume().catch(() => {});
  try { const s = sound.ctx.createBufferSource(); s.buffer = sound.ctx.createBuffer(1, 1, 22050); s.connect(sound.ctx.destination); s.start(0); } catch {}
  setTimeout(renderSound, 60);
}
addEventListener('pointerdown', unlockAudio, {passive:true});
addEventListener('keydown', unlockAudio);
function strike(t, freq, level) {
  for (const [ratio, amp, decay] of [[1, 1, 2.4], [2.76, .32, 1.2], [5.4, .1, .55]]) {
    const o = sound.ctx.createOscillator(), g = sound.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * ratio;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(level * amp, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + decay);
    o.connect(g); g.connect(sound.master);
    o.start(t); o.stop(t + decay + .05);
  }
}
function chime(kind) {
  const t = sound.ctx.currentTime + .05;
  if (kind === 'soft') strike(t, 392, .5);
  else { strike(t, 784, .55); strike(t + .3, 1046.5, .45); strike(t + .6, 1318.5, .4); }
}
function startSound(kind, repeat) {
  stopSound();
  if (kind === 'silent' || !sound.ctx || sound.ctx.state !== 'running') return false;
  sound.master = sound.ctx.createGain();
  sound.master.connect(sound.ctx.destination);
  const t0 = sound.ctx.currentTime;
  sound.master.gain.setValueAtTime(.2, t0);
  if (repeat) sound.master.gain.linearRampToValueAtTime(.9, t0 + 45); // gentle crescendo
  chime(kind);
  if (repeat) sound.timer = setInterval(() => chime(kind), kind === 'soft' ? 2600 : 3000);
  return true;
}
function stopSound() {
  clearInterval(sound.timer); sound.timer = 0;
  if (sound.master) { try { sound.master.disconnect(); } catch {} sound.master = null; }
}
$('sound-test').onclick = () => {
  unlockAudio();
  setTimeout(() => notice(startSound('chime', false) ? 'Playing the alarm chime.' : 'Sound is still locked. Tap the screen once, then try again.'), 120);
};

let ringing = null;
const ringQueue = [];
const oneTime = a => !a.days.length && !a.date; // date-specific shift alarms end by themselves
function checkAlarms(now) {
  const changed = new Set();
  for (const a of allAlarms()) {
    if (ringing?.alarm.id === a.id || ringQueue.some(q => q.alarm.id === a.id)) continue;
    for (let guard = 0; guard < 12; guard++) {
      const due = AL.evaluate(a, now);
      if (!due) break;
      if (due.type === 'missed') {
        // Recorded honestly; a late alarm is not replayed as if it were on time.
        a.missedAt = due.at; a.snoozeUntil = null;
        if (!due.snoozed) a.anchor = due.at;
        if (oneTime(a)) a.enabled = false;
        changed.add(a);
        continue;
      }
      ringQueue.push({alarm:a, at:due.at, snoozed:!!due.snoozed, started:now});
      break;
    }
  }
  if (changed.size) { changed.forEach(persistAlarm); replan(); renderAlarms(); renderShifts(); }
  if (!ringing && ringQueue.length) startRinging(ringQueue.shift());
  if (ringing && now - ringing.started > AL.GRACE_MS) {
    // Ten minutes without an answer: stop, and record it as missed.
    const a = ringing.alarm;
    a.missedAt = ringing.at; a.snoozeUntil = null;
    if (!ringing.snoozed) a.anchor = ringing.at;
    if (oneTime(a)) a.enabled = false;
    stopRinging(); persistAlarm(a); replan(); renderAlarms(); renderShifts();
  }
}
function startRinging(entry) {
  ringing = entry;
  const a = entry.alarm;
  $('ring-time').textContent = displayTime(a.time);
  $('ring-zone').textContent = ZONE_NAME[a.zone];
  $('ring-label').textContent = a.label || 'Alarm';
  if (a.plan) $('ring-label').textContent = a.plan.label;
  $('ring-snooze').textContent = 'Snooze ' + a.snooze + ' min';
  const playing = startSound(a.sound, true);
  $('ring-note').textContent = (entry.snoozed ? 'Snoozed alarm. ' : '') + (a.sound === 'silent' ? 'Visual alarm.' : playing ? '' : sys.sound === 'unsupported' ? 'This browser cannot play sound; visual alarm only.' : 'Sound is locked until the screen is tapped once after opening JANGE.');
  hud.setAttribute('data-alarm', '');
  if (!$('alarm-ring').open) $('alarm-ring').showModal();
  $('ring-dismiss').focus();
}
function stopRinging() {
  stopSound();
  ringing = null;
  hud.removeAttribute('data-alarm');
  if ($('alarm-ring').open) $('alarm-ring').close();
  if (ringQueue.length) startRinging(ringQueue.shift());
}
$('ring-dismiss').onclick = () => {
  if (!ringing) return;
  const {alarm:a, at, snoozed} = ringing;
  if (!snoozed) a.anchor = at;
  a.snoozeUntil = null; a.missedAt = null;
  if (oneTime(a)) a.enabled = false;
  stopRinging(); persistAlarm(a); replan(); renderAlarms(); renderShifts();
};
$('ring-snooze').onclick = () => {
  if (!ringing) return;
  const {alarm:a, at, snoozed} = ringing;
  if (!snoozed) a.anchor = at;
  a.snoozeUntil = Date.now() + a.snooze * 60000; a.missedAt = null;
  if (oneTime(a)) a.enabled = false; // the snooze itself carries a one-time alarm
  stopRinging(); persistAlarm(a); replan(); renderAlarms(); renderShifts();
  notice('Snoozed until ' + whenText(a.snoozeUntil, a.zone) + ' ' + ZONE_NAME[a.zone] + ' time.');
};
$('alarm-ring').addEventListener('cancel', e => e.preventDefault()); // Escape must not silently dismiss

/* ------------------------------------------------------------------ shift schedule UI */
const longDate = key => { const d = new Date(key + 'T12:00:00+04:00'); return Number.isFinite(d.getTime()) ? dubai(d, {weekday:'short', day:'numeric', month:'short'}) : key; };
const zoneTime = (at, zone) => new Intl.DateTimeFormat('en-GB', {timeZone:zone, hour:'2-digit', minute:'2-digit', hourCycle:prefs.clock === '12' ? 'h12' : 'h23'}).format(new Date(at));
function shiftStatus(a, now) {
  if (!a) return '';
  if (a.covered) return 'Covered by a manual alarm at the same time';
  if (a.plan.off) return shiftStore.settings.enabled ? 'Alarm off for this shift' : 'Shift alarms are off';
  if (a.snoozeUntil) return 'Snoozed until ' + whenText(a.snoozeUntil, a.zone);
  if (a.missedAt) return 'Missed: JANGE was closed, in the background or the iPad was asleep';
  const at = nextRing(a, now);
  return at === null ? 'Done' : relative(at - now);
}
function renderShifts() {
  const cfg = shiftStore.settings, now = Date.now(), today = dayKey(new Date());
  $('shift-switch').setAttribute('aria-checked', String(cfg.enabled));
  if (document.activeElement !== $('shift-prep')) $('shift-prep').value = cfg.prep;
  if (document.activeElement !== $('shift-commute')) $('shift-commute').value = cfg.commute;
  setRadio('shift-snooze', cfg.snooze); setRadio('shift-sound', cfg.sound);
  const shown = shiftStore.shifts.filter(s => s.date >= nextDay(today, -1)).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))).slice(0, 40);
  $('shift-empty').hidden = shiftStore.shifts.length > 0;
  const list = $('shift-list');
  list.replaceChildren();
  shown.forEach(s => {
    const a = shiftAlarms.find(x => x.plan.shift.id === s.id), working = SH.WORKING.includes(s.type);
    const item = el('li', 'shift-item' + (working ? '' : ' rest'));
    const when = el('div', 'si-date'); when.append(el('b', '', longDate(s.date)), el('span', 'si-type ' + s.type, SH.TYPES[s.type]));
    const info = el('div', 'si-info');
    info.append(el('span', 'si-hours', s.start ? s.start + (s.end ? ' – ' + s.end : '') + ' ' + (s.zone === 'Asia/Dubai' ? 'Dubai' : 'Kathmandu') + (s.note ? ' · ' + s.note : '') : working ? 'No start time' : (s.note || 'No alarm')));
    if (working && !s.start) info.append(el('span', 'si-warn', 'No start time, so no alarm. Add the start time; JANGE never guesses it.'));
    if (a) {
      const other = a.zone === 'Asia/Dubai' ? 'Asia/Kathmandu' : 'Asia/Dubai';
      info.append(el('span', 'si-alarm', 'Alarm ' + zoneTime(a.plan.at, a.zone) + ' ' + (a.zone === 'Asia/Dubai' ? 'Dubai' : 'Kathmandu') + ' · ' + zoneTime(a.plan.at, other) + ' ' + (other === 'Asia/Dubai' ? 'Dubai' : 'Kathmandu') + (a.plan.custom ? ' · custom' : '')));
      info.append(el('span', 'si-status' + (a.missedAt ? ' warn' : ''), shiftStatus(a, now)));
    }
    const actions = el('div', 'ai-actions'), edit = el('button', 'text-btn', 'Edit'), del = el('button', 'text-btn danger', 'Delete');
    [edit, del].forEach(b => { b.type = 'button'; });
    edit.setAttribute('aria-label', 'Edit shift on ' + longDate(s.date));
    del.setAttribute('aria-label', 'Delete shift on ' + longDate(s.date));
    edit.onclick = () => openShiftEditor(s);
    del.onclick = () => deleteShift(s);
    actions.append(edit, del);
    item.append(when, info, actions);
    list.append(item);
  });
  const next = shiftAlarms.filter(a => a.enabled || a.snoozeUntil).map(a => ({a, at:nextRing(a, now)})).filter(x => x.at !== null).sort((x, y) => x.at - y.at)[0];
  $('shift-next').textContent = next
    ? 'Next shift alarm ' + whenText(next.at, next.a.zone) + ' ' + (next.a.zone === 'Asia/Dubai' ? 'Dubai' : 'Kathmandu') + ', ' + relative(next.at - now) + ' · ' + next.a.plan.label
    : shiftMissing.length ? shiftMissing.length + ' shift' + (shiftMissing.length === 1 ? ' has' : 's have') + ' no start time, so no alarm is set for ' + (shiftMissing.length === 1 ? 'it.' : 'them.') : 'No upcoming shift alarm.';
}
function deleteShift(s) {
  const override = shiftStore.overrides[s.id], runtime = shiftStore.runtime['shift:' + s.id];
  shiftStore.shifts = shiftStore.shifts.filter(x => x.id !== s.id);
  delete shiftStore.overrides[s.id]; delete shiftStore.runtime['shift:' + s.id];
  saveShifts(); replan(); renderShifts(); renderAlarmSummaries(); renderPeek(); setSystems();
  const box = document.querySelector('.shift-notice'), undo = el('button', '', 'Undo');
  undo.type = 'button';
  undo.onclick = () => {
    if (!shiftStore.shifts.some(x => x.id === s.id)) shiftStore.shifts.push(s);
    if (override) shiftStore.overrides[s.id] = override;
    if (runtime) shiftStore.runtime['shift:' + s.id] = runtime;
    saveShifts(); replan(); renderShifts(); renderAlarmSummaries(); renderPeek(); box.replaceChildren();
  };
  box.replaceChildren(el('span', '', 'Shift deleted.'), undo);
  clearTimeout(deleteShift.timer);
  deleteShift.timer = setTimeout(() => box.replaceChildren(), 8000);
}
let editingShift = null;
function openShiftEditor(s) {
  editingShift = s ? s.id : null;
  $('shift-form-title').textContent = s ? 'Edit shift' : 'Add shift';
  $('shift-date').value = s ? s.date : nextDay(dayKey(new Date()), 1);
  $('shift-note').value = s ? s.note : '';
  $('shift-start').value = s && s.start ? s.start : '';
  $('shift-end').value = s && s.end ? s.end : '';
  setRadio('shift-type', s ? s.type : 'morning');
  setRadio('shift-zone', s ? s.zone : 'Asia/Dubai');
  const o = s && shiftStore.overrides[s.id];
  setRadio('shift-alarm', o ? (o.off ? 'off' : 'custom') : 'auto');
  $('shift-alarm-time').value = o && o.time ? o.time : '';
  $('shift-form').hidden = false;
  $('shift-list').hidden = true;
}
function closeShiftEditor() { editingShift = null; $('shift-form').hidden = true; $('shift-list').hidden = false; }
$('shift-new').onclick = () => openShiftEditor(null);
$('shift-cancel').onclick = closeShiftEditor;
$('shift-form').onsubmit = e => {
  e.preventDefault();
  const radio = name => document.querySelector(`input[name="${name}"]:checked`)?.value;
  const type = radio('shift-type'), working = SH.WORKING.includes(type), start = $('shift-start').value || null, now = Date.now();
  if (working && !start) { notice('Enter the shift start time. JANGE does not guess shift times.'); return; }
  const before = shiftStore.shifts.find(x => x.id === editingShift);
  const next = {id:editingShift || 'm-' + uid(), date:$('shift-date').value, type, start:working ? start : null, end:working ? ($('shift-end').value || null) : null, zone:radio('shift-zone'), note:$('shift-note').value.trim().slice(0, 80), source:before ? before.source : 'manual'};
  if (!SH.validShift(next)) { notice('Choose a valid date and times for the shift.'); return; }
  if (shiftStore.shifts.some(x => x.id !== next.id && x.zone === next.zone && x.date === next.date && (x.start || x.type) === (next.start || next.type))) { notice('That shift is already in the schedule.'); return; }
  const mode = radio('shift-alarm'), custom = $('shift-alarm-time').value;
  if (mode === 'custom' && !TIME_RE.test(custom)) { notice('Choose the custom alarm time.'); return; }
  shiftStore.shifts = [...shiftStore.shifts.filter(x => x.id !== next.id), next];
  if (mode === 'off') shiftStore.overrides[next.id] = {off:true};
  else if (mode === 'custom') shiftStore.overrides[next.id] = {time:custom};
  else delete shiftStore.overrides[next.id];
  if (!before || before.start !== next.start || before.date !== next.date || before.zone !== next.zone || mode !== 'auto') shiftStore.runtime['shift:' + next.id] = {anchor:now, snoozeUntil:null, missedAt:null};
  saveShifts(); closeShiftEditor(); replan(); renderShifts(); renderAlarmSummaries(); renderPeek(); setSystems();
  const a = shiftAlarms.find(x => x.plan.shift.id === next.id);
  notice(a && a.enabled ? 'Shift saved. Alarm ' + whenText(a.plan.at, a.zone) + ', ' + relative(a.plan.at - now) + '.' : 'Shift saved.');
};
function settingsChanged() {
  // New lead times move every shift alarm; restart their windows so none rings instantly.
  const now = Date.now();
  for (const a of shiftAlarms) shiftStore.runtime[a.id] = {anchor:now, snoozeUntil:null, missedAt:null};
  saveShifts(); replan(); renderShifts(); renderAlarmSummaries();
}
$('shift-switch').onclick = () => { shiftStore.settings.enabled = !shiftStore.settings.enabled; settingsChanged(); };
for (const id of ['shift-prep', 'shift-commute']) $(id).addEventListener('change', () => {
  const v = Math.round(Number($(id).value));
  if (!Number.isFinite(v) || v < 0 || v > 240) { notice('Use 0–240 minutes.'); renderShifts(); return; }
  const key = id === 'shift-prep' ? 'prep' : 'commute';
  if (shiftStore.settings[key] === v) return; // blur repeats "change"; re-rendering then would swallow the next tap
  shiftStore.settings[key] = v;
  settingsChanged();
});
document.querySelectorAll('input[name="shift-snooze"], input[name="shift-sound"]').forEach(r => r.addEventListener('change', () => {
  if (!r.checked) return;
  if (r.name === 'shift-snooze') shiftStore.settings.snooze = Number(r.value); else shiftStore.settings.sound = r.value;
  saveShifts(); replan(); renderShifts();
}));
$('roster-file').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const box = $('shift-issues');
  try {
    if (f.size > 1000000) throw Error('That calendar file is larger than 1 MB.');
    const {shifts, issues} = SH.parseICS(await f.text());
    if (!shifts.length) throw Error('No shifts were found in that calendar file.');
    const now = Date.now(), previous = shiftStore.shifts;
    const merged = SH.merge(previous, shifts, shiftStore.overrides);
    shiftStore.shifts = merged.shifts.slice(0, 1000);
    shiftStore.overrides = cleanMap(merged.overrides, validOverride, 1000);
    const kept = new Set(shiftStore.shifts.map(s => s.id));
    for (const s of shifts) {
      if (!kept.has(s.id)) continue;
      const old = previous.find(x => x.id === s.id);
      if (!old || old.start !== s.start || old.date !== s.date) shiftStore.runtime['shift:' + s.id] = {anchor:now, snoozeUntil:null, missedAt:null};
    }
    saveShifts(); replan(); renderShifts(); renderAlarmSummaries(); renderPeek(); setSystems();
    box.replaceChildren(el('p', '', 'Imported ' + shifts.length + ' roster entr' + (shifts.length === 1 ? 'y' : 'ies') + '. Alarms were recalculated; your overrides were kept.'));
    issues.slice(0, 6).forEach(t => box.append(el('p', 'si-warn', t)));
  } catch (err) {
    box.replaceChildren(el('p', 'si-warn', err && err.message && !/JSON|Unexpected/.test(err.message) ? err.message : 'That file could not be read as a calendar.'));
  }
  box.hidden = false;
};
function showTab(which) {
  const shifts = which === 'shifts';
  $('tab-alarms').setAttribute('aria-selected', String(!shifts));
  $('tab-shifts').setAttribute('aria-selected', String(shifts));
  $('alarm-list-view').hidden = shifts;
  $('shift-view').hidden = !shifts;
  $('alarm-form').hidden = true;
  if (shifts) { closeShiftEditor(); renderShifts(); }
}
$('tab-alarms').onclick = () => showTab('alarms');
$('tab-shifts').onclick = () => showTab('shifts');

/* Screen wake lock, so a desk-mounted iPad can keep showing JANGE (and keep
   alarms able to ring) without Auto-Lock. */
let wakeLock = null, wakePending = false;
function renderWake() {
  const s = sys.wake, chip = $('wake-status');
  chip.textContent = {on:'Screen kept awake', off:'Screen may sleep', unsupported:'Wake lock unsupported', blocked:'Wake lock blocked', released:'Wake lock released'}[s];
  chip.className = 'status-chip ' + (s === 'on' ? 'on' : s === 'off' ? 'off' : 'warn');
  $('awake-switch').setAttribute('aria-checked', String(prefs.awake));
  $('awake-note').textContent = s === 'unsupported' || s === 'blocked'
    ? 'This browser did not grant a wake lock. For desk use set Settings → Display & Brightness → Auto-Lock → Never.'
    : 'Uses the browser’s Screen Wake Lock while JANGE is open and in front. Alarms still cannot ring while the iPad is locked.';
}
async function applyWake() {
  const supported = 'wakeLock' in navigator;
  if (!prefs.awake || !supported) {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    sys.wake = prefs.awake && !supported ? 'unsupported' : 'off';
    renderWake();
    return;
  }
  if (document.hidden || wakeLock || wakePending) { renderWake(); return; }
  wakePending = true;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    sys.wake = 'on';
    wakeLock.addEventListener('release', () => { wakeLock = null; sys.wake = prefs.awake ? 'released' : 'off'; renderWake(); });
  } catch { sys.wake = 'blocked'; }
  finally { wakePending = false; }
  renderWake();
}
$('awake-switch').onclick = () => { prefs.awake = !prefs.awake; savePrefs(); applyWake(); };

/* ------------------------------------------------------------------ weather */
/* Weather follows the iPad's location when allowed, otherwise a chosen city,
   otherwise Sharjah. Device coordinates are rounded to 0.05° (about 5 km) before
   they are sent anywhere or stored, and are only read on open/foreground. */
const DEFAULT_PLACE = {name:'Sharjah', lat:25.35, lon:55.42, source:'default'};
const CITY_PRESETS = {sharjah:{name:'Sharjah', lat:25.35, lon:55.42}, dubai:{name:'Dubai', lat:25.2, lon:55.27}, kathmandu:{name:'Kathmandu', lat:27.72, lon:85.32}};
let place = prefs.locMode === 'manual' && prefs.city ? {...prefs.city, source:'manual'} : {...DEFAULT_PLACE};
const weatherURL = p => 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=1';
let weatherTime = 0, weatherBusy = false, weatherQueued = false, lastWeather = null;
function describeWeather(code, isDay) {
  const night = isDay === 0;
  if (code === 0) return night ? ['night', 'Clear night'] : ['clear', 'Clear sky'];
  if (code <= 2) return night ? ['night', 'Mostly clear'] : ['partly', 'Partly cloudy'];
  if (code === 3) return ['cloud', 'Overcast'];
  if (code <= 48) return ['fog', 'Foggy'];
  if (code <= 57) return ['rain', 'Drizzle'];
  if (code <= 67) return ['rain', 'Rain'];
  if (code <= 77) return ['snow', 'Snow'];
  if (code <= 82) return ['rain', 'Rain showers'];
  if (code <= 86) return ['snow', 'Snow showers'];
  if (code <= 99) return ['storm', 'Thunderstorms'];
  return ['none', 'Conditions unavailable'];
}
function validWeather(c) { return c && ['temperature_2m','relative_humidity_2m','wind_speed_10m','weather_code'].every(k => typeof c[k] === 'number' && Number.isFinite(c[k])) && typeof c.time === 'string'; }
function readDaily(d) {
  if (!d || typeof d !== 'object') return {};
  const first = k => Array.isArray(d[k]) ? d[k][0] : undefined;
  const minutes = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v) ? Number(v.slice(11,13)) * 60 + Number(v.slice(14,16)) : null;
  return {max:num(first('temperature_2m_max')), min:num(first('temperature_2m_min')), uv:num(first('uv_index_max')), sunrise:minutes(first('sunrise')), sunset:minutes(first('sunset'))};
}
function paintWeather(data, cached) {
  const c = data.current, [icon, description] = describeWeather(c.weather_code, num(c.is_day)), d = readDaily(data.daily);
  $('wx-place').textContent = validPlace(data.place) ? data.place.name : 'Sharjah';
  $('weather-icon').setAttribute('href', '#wx-' + icon);
  $('temperature').textContent = Math.round(c.temperature_2m) + '°';
  $('feels').textContent = num(c.apparent_temperature) === null ? 'Feels like —' : 'Feels like ' + Math.round(c.apparent_temperature) + '°';
  $('humidity').textContent = Math.round(c.relative_humidity_2m) + '%';
  $('wind').textContent = Math.round(c.wind_speed_10m) + ' km/h';
  const dir = num(c.wind_direction_10m);
  $('wind-dir').classList.toggle('on', dir !== null);
  if (dir !== null) $('wind-dir').style.transform = 'rotate(' + Math.round(dir + 180) + 'deg)';
  $('hilo').textContent = d.max != null && d.min != null ? Math.round(d.max) + '° / ' + Math.round(d.min) + '°' : '—';
  $('uv').textContent = d.uv != null ? String(Math.round(d.uv)) : '—';
  const sun = d.sunrise != null && d.sunset != null && d.sunset > d.sunrise;
  $('sunrise').textContent = sun ? hhmm(d.sunrise) : '—';
  $('sunset').textContent = sun ? hhmm(d.sunset) : '—';
  if (sun) {
    rotate($('daylight'), dialAngle(d.sunrise) - 90);
    $('daylight').setAttribute('stroke-dasharray', ((d.sunset - d.sunrise) / 1440 * DAYLIGHT_C).toFixed(1) + ' ' + DAYLIGHT_C.toFixed(1));
  }
  $('weather-description').textContent = cached ? 'Weather unavailable · last saved: ' + description : description;
  $('weather-updated').textContent = (cached ? 'Saved ' : 'Updated ') + dubai(new Date(data.fetched), {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
  sys.wx = cached ? 'saved' : 'live';
  sys.wxAt = data.fetched;
  setSystems();
}
async function weather() {
  if (weatherBusy) { weatherQueued = true; return; }
  weatherBusy = true;
  $('weather-retry').disabled = true;
  setBusy('weather', true);
  if (!lastWeather) { sys.wx = 'loading'; setSystems(); }
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const target = {...place};
    const r = await fetch(weatherURL(target), {signal:controller.signal, cache:'no-store', credentials:'omit'});
    if (!r.ok) throw Error();
    const body = await r.json();
    if (!validWeather(body.current)) throw Error();
    lastWeather = {current:body.current, daily:body.daily, fetched:Date.now(), place:{name:target.name, lat:target.lat, lon:target.lon, source:target.source}};
    weatherTime = Date.now();
    paintWeather(lastWeather, false);
    restart(document.querySelector('.link-env'), 'flash');
    try { localStorage.setItem(WEATHER_CACHE, JSON.stringify(lastWeather)); } catch {}
  } catch {
    if (lastWeather) paintWeather(lastWeather, true);
    else {
      $('temperature').textContent = '—';
      $('weather-description').textContent = 'Weather unavailable. Check internet, then refresh.';
      $('weather-updated').textContent = 'No saved weather';
      sys.wx = 'none';
      setSystems();
    }
  } finally {
    clearTimeout(timeout);
    weatherBusy = false;
    $('weather-retry').disabled = false;
    setBusy('weather', false);
    if (weatherQueued) { weatherQueued = false; weather(); }
  }
}
function renderLoc() {
  const note = $('loc-note'), name = place.name;
  const text = {
    prompt:'Showing ' + name + '. Tap the location button to use where you are.',
    denied:'Location access is off for this site. Showing ' + name + '; choose a city in Settings or allow location for this site in Safari settings.',
    unavailable:'Location is unavailable right now. Showing ' + name + '.',
    locating:'Finding your location…',
  }[sys.loc];
  note.hidden = !text;
  if (text) note.textContent = text;
  $('loc-status').textContent = prefs.locMode === 'manual' ? 'Weather is shown for ' + name + '. Switch to Current location to follow the iPad.' : sys.loc === 'device' ? 'Following this iPad: ' + name + ' (rounded to about 5 km). Checked when JANGE opens or comes back, never in the background.' : 'Uses the iPad’s location only when you allow it, rounded to about 5 km. JANGE checks it when opened or brought back, never in the background.';
}
function setPlace(next) {
  const old = lastWeather && lastWeather.place;
  const moved = !validPlace(old) || Math.abs(old.lat - next.lat) > .001 || Math.abs(old.lon - next.lon) > .001 || old.name !== next.name;
  place = next;
  $('wx-place').textContent = next.name;
  if (moved || Date.now() - weatherTime > 900000) weather();
}
async function reverseName(lat, lon) {
  if (!navigator.onLine) return null;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try {
    // The place name only needs city precision: send 0.1° (about 11 km).
    const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + (Math.round(lat * 10) / 10) + '&longitude=' + (Math.round(lon * 10) / 10) + '&localityLanguage=en', {signal:controller.signal, cache:'no-store', credentials:'omit'});
    if (!r.ok) return null;
    const j = await r.json();
    const name = [j && j.city, j && j.locality, j && j.principalSubdivision].find(v => typeof v === 'string' && v.trim());
    return name ? name.trim().slice(0, 60) : null;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}
// Never prompts on its own: the first request comes from a tap on the locate button.
async function refreshLocation(userInitiated) {
  if (prefs.locMode === 'manual' && prefs.city) { sys.loc = 'manual'; renderLoc(); setPlace({...prefs.city, source:'manual'}); return; }
  if (!('geolocation' in navigator)) { sys.loc = 'unavailable'; renderLoc(); setPlace(place); return; }
  let permission = 'prompt';
  try { permission = (await navigator.permissions.query({name:'geolocation'})).state; } catch {}
  if (permission === 'denied') { sys.loc = 'denied'; renderLoc(); setPlace(place); return; }
  if (permission !== 'granted' && !userInitiated) { sys.loc = place.source === 'device' ? 'device' : 'prompt'; renderLoc(); setPlace(place); return; }
  sys.loc = 'locating'; renderLoc();
  navigator.geolocation.getCurrentPosition(async pos => {
    if (prefs.locMode === 'manual') return; // a city was chosen meanwhile
    const lat = round05(pos.coords.latitude), lon = round05(pos.coords.longitude);
    const near = place.source === 'device' && Math.abs(place.lat - lat) < .05 && Math.abs(place.lon - lon) < .05;
    const name = near ? place.name : (await reverseName(lat, lon)) || 'Current location';
    if (prefs.locMode === 'manual') return;
    sys.loc = 'device';
    setPlace({name, lat, lon, source:'device'});
    renderLoc();
  }, err => { sys.loc = err && err.code === 1 ? 'denied' : 'unavailable'; renderLoc(); setPlace(place); }, {enableHighAccuracy:false, timeout:12000, maximumAge:15 * 60000});
}
$('locate').onclick = () => {
  prefs.locMode = 'auto'; savePrefs(); applyPrefs();
  refreshLocation(true);
};
document.querySelectorAll('input[name="loc-mode"]').forEach(r => r.addEventListener('change', () => {
  if (!r.checked) return;
  if (r.value === 'manual' && !prefs.city) { $('city-input').focus(); notice('Search for a city or pick one below.'); applyPrefs(); return; }
  prefs.locMode = r.value; savePrefs();
  refreshLocation(r.value === 'auto');
}));
function chooseCity(c) {
  prefs.locMode = 'manual'; prefs.city = {name:c.name, lat:round2(c.lat), lon:round2(c.lon)}; savePrefs(); applyPrefs();
  $('city-results').replaceChildren();
  refreshLocation(false);
  notice('Weather location set to ' + c.name + '.');
}
document.querySelectorAll('[data-city]').forEach(b => b.onclick = () => chooseCity(CITY_PRESETS[b.dataset.city]));
$('city-form').onsubmit = async e => {
  e.preventDefault();
  const q = $('city-input').value.trim(), list = $('city-results');
  if (q.length < 2) return;
  list.replaceChildren(el('li', 'muted', 'Searching…'));
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=6&language=en&format=json', {signal:controller.signal, cache:'no-store', credentials:'omit'});
    if (!r.ok) throw Error();
    const j = await r.json(), results = Array.isArray(j.results) ? j.results : [];
    list.replaceChildren();
    results.filter(x => x && typeof x.name === 'string' && Number.isFinite(x.latitude) && Math.abs(x.latitude) <= 90 && Number.isFinite(x.longitude) && Math.abs(x.longitude) <= 180).slice(0, 6).forEach(x => {
      const b = el('button', 'city-pick', [x.name, x.admin1, x.country].filter(v => typeof v === 'string' && v).join(', ').slice(0, 90));
      b.type = 'button';
      b.onclick = () => chooseCity({name:x.name.slice(0, 60), lat:x.latitude, lon:x.longitude});
      const li = el('li'); li.append(b); list.append(li);
    });
    if (!list.children.length) list.append(el('li', 'muted', 'No matching city.'));
  } catch { list.replaceChildren(el('li', 'muted', 'City search needs a connection. Sharjah, Dubai and Kathmandu work offline.')); }
  finally { clearTimeout(timeout); }
};
try {
  const c = JSON.parse(localStorage.getItem(WEATHER_CACHE));
  if (c && validWeather(c.current) && Number.isFinite(c.fetched) && c.fetched <= Date.now()) {
    c.place = validPlace(c.place) ? {name:c.place.name, lat:round2(c.place.lat), lon:round2(c.place.lon), source:['device', 'manual', 'default'].includes(c.place.source) ? c.place.source : 'default'} : {...DEFAULT_PLACE};
    lastWeather = c;
    if (prefs.locMode !== 'manual' && c.place.source === 'device') place = {...c.place};
    paintWeather(c, true);
  }
} catch {}
$('weather-retry').onclick = weather;

/* ------------------------------------------------------------------ PC companion (read-only) */
let agent = null, pcBusy = false, pcGeneration = 0, cpuHistory = [], lastSample = 0;
// Readings older than 30 s are cleared whatever the companion answers.
function expireTelemetry() { if (Date.now() - lastSample > 30000) resetMetrics(); }
const GAUGE_C = 2 * Math.PI * 42;
const PC_STATE = {
  off:['Not paired', 'off'], linking:['Linking', 'busy'], warming:['Warming up', 'busy'],
  online:['Connected', 'on'], unreachable:['Unreachable', 'warn'], auth:['Authentication required', 'warn'],
};
function setGauge(id, value) {
  $(id).classList.toggle('live', value !== null);
  $(id).querySelector('.g-value').style.strokeDashoffset = String(value === null ? GAUGE_C : GAUGE_C * (1 - value / 100));
}
function drawSpark() {
  $('cpu-spark').setAttribute('points', cpuHistory.map((v, i) => ((i + 30 - cpuHistory.length) / 29 * 200).toFixed(1) + ',' + (31 - v / 100 * 30).toFixed(1)).join(' '));
  $('spark-label').textContent = cpuHistory.length ? 'CPU history · ' + cpuHistory.length + ' sample' + (cpuHistory.length === 1 ? '' : 's') : 'CPU history · no samples';
}
function stat(id, text, unavailable) { $(id).textContent = text; $(id).classList.toggle('na', !!unavailable); }
function formatUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? d + ' d ' + h + ' h' : h ? h + ' h ' + m + ' min' : m + ' min';
}
function resetMetrics() {
  for (const id of ['cpu','gpu','ram']) $(id).textContent = '—';
  stat('temp', '—'); stat('uptime', '—'); stat('pc-sampled', '—');
  setGauge('gauge-cpu', null); setGauge('gauge-gpu', null); setGauge('gauge-ram', null);
  cpuHistory = []; drawSpark();
}
function pcStatus(next, message) {
  sys.pc = next;
  const [label, cls] = PC_STATE[next];
  $('pc-status').textContent = label;
  $('pc-status').className = 'status-chip ' + cls;
  $('pc-message').textContent = message;
  $('connect-open').lastChild.textContent = next === 'off' ? 'Pair' : 'Manage';
  $('pc-host').textContent = agent ? new URL(agent.url).hostname : 'No companion paired';
  $('pc-secure-text').textContent = next === 'online' ? 'Tailscale HTTPS · token verified' : 'Tailscale HTTPS · read-only token';
  setBusy('pc', next === 'linking' || next === 'warming');
  setSystems();
}
$('connect-form').onsubmit = e => {
  e.preventDefault();
  try {
    const u = new URL($('agent-url').value);
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.ts.net') || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) throw Error();
    const token = $('agent-token').value;
    if (token.length < 32 || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) throw Error();
    pcGeneration++;
    agent = {url:u.origin, token};
    $('agent-token').value = '';
    $('connect-result').textContent = 'Connecting securely…';
    resetMetrics();
    pcStatus('linking', 'Connecting securely to the read-only companion…');
    pollPC();
  } catch { $('connect-result').textContent = 'Use a Tailscale HTTPS host and a valid pairing token (32–256 characters).'; }
};
$('disconnect').onclick = () => {
  pcGeneration++;
  agent = null;
  $('agent-token').value = '';
  resetMetrics();
  pcStatus('off', 'Disconnected. Pair again for live telemetry.');
  $('connect-result').textContent = 'Disconnected; pairing token cleared.';
};
async function pollPC() {
  if (!agent || agent.rejected || pcBusy || document.hidden) return;
  pcBusy = true;
  const generation = pcGeneration, connection = agent, controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const r = await fetch(connection.url + '/v1/status', {headers:{Authorization:'Bearer ' + connection.token}, signal:controller.signal, cache:'no-store', credentials:'omit', redirect:'error'});
    if (generation !== pcGeneration) return;
    if (r.status === 401) {
      // The companion answered but refused the token: stop polling until re-paired.
      connection.rejected = true;
      connection.token = ''; // no further use for a refused token
      resetMetrics();
      pcStatus('auth', 'Token rejected. Pair again with the current read-only token.');
      $('connect-result').textContent = 'Authentication required: the companion rejected this token.';
      return;
    }
    if (r.status === 503) { resetMetrics(); pcStatus('warming', 'Companion reached; waiting for its first sample.'); return; }
    if (r.status === 429) { expireTelemetry(); return; } // polled too soon; keep a still-fresh reading
    if (!r.ok) throw Error();
    const data = await r.json();
    if (generation !== pcGeneration) return;
    const age = Date.now() - Date.parse(data.sampled_at);
    if (!Number.isFinite(age) || age > 30000 || age < -5000 || data.protocol !== 1) throw Error();
    const metric = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
    const cpu = metric(data.cpu_percent, 100), ram = metric(data.ram_percent, 100), gpu = metric(data.gpu_percent, 100), temp = metric(data.temperature_c, 130), uptime = metric(data.uptime_seconds, 3e8);
    $('cpu').textContent = cpu === null ? '—' : Math.round(cpu) + '%';
    $('ram').textContent = ram === null ? '—' : Math.round(ram) + '%';
    $('gpu').textContent = gpu === null ? 'N/A' : Math.round(gpu) + '%';
    stat('temp', temp === null ? 'No sensor' : Math.round(temp) + '°C', temp === null);
    stat('uptime', uptime === null ? 'Not reported' : formatUptime(uptime), uptime === null);
    setGauge('gauge-cpu', cpu); setGauge('gauge-gpu', gpu); setGauge('gauge-ram', ram);
    if (cpu !== null) { cpuHistory.push(cpu); if (cpuHistory.length > 30) cpuHistory.shift(); drawSpark(); }
    lastSample = Date.now();
    sys.pcAt = dubai(new Date(data.sampled_at), {hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'});
    stat('pc-sampled', sys.pcAt);
    pcStatus('online', 'Authenticated, read-only monitoring.');
    restart(document.querySelector('.link-pc'), 'flash');
    $('connect-result').textContent = 'Connected. Monitoring only; controls remain disabled.';
  } catch {
    if (generation === pcGeneration) {
      resetMetrics();
      pcStatus('unreachable', 'PC off, asleep or off the tailnet. Retrying every 10 s.');
      $('connect-result').textContent = 'Connection failed. Check the companion, the pairing token and Tailscale.';
    }
  } finally { clearTimeout(timeout); pcBusy = false; }
}
setInterval(pollPC, 10000);

/* ------------------------------------------------------------------ panels and commands */
function openPanel(id) { const d = $(id); if (!d.open) d.showModal(); }
document.querySelectorAll('dialog.panel').forEach(d => d.addEventListener('click', e => {
  // A tap on the dimmed backdrop lands on the dialog element itself, outside its box.
  if (e.target !== d) return;
  const r = d.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
}));
$('core').onclick = () => openPanel('tasks-dialog');
$('tasks-open').onclick = () => openPanel('tasks-dialog');
$('calendar-open').onclick = () => { renderCalendar(); openPanel('agenda-dialog'); };
$('agenda-open').onclick = () => { showToday(); openPanel('agenda-dialog'); };
$('alarms-open').onclick = () => { closeEditor(); showTab('alarms'); renderAlarms(); renderSound(); renderWake(); openPanel('alarms-dialog'); };
$('settings-open').onclick = () => openPanel('settings');
$('connect-open').onclick = () => openPanel('settings');
$('export').onclick = () => {
  const shiftPlan = {settings:shiftStore.settings, shifts:shiftStore.shifts, overrides:shiftStore.overrides};
  const blob = new Blob([JSON.stringify({...state, alarms, shiftPlan, version:2, exported:new Date().toISOString()}, null, 2)], {type:'application/json'}), link = document.createElement('a'), url = URL.createObjectURL(blob);
  link.href = url; link.download = 'jange-backup-' + dayKey(new Date()) + '.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import-file').onchange = async e => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2000000) throw Error();
    const v = JSON.parse(await f.text());
    if (!validData(v)) throw Error();
    // Alarms are optional so backups from 2.0 and 3.0 still restore.
    if (v.alarms !== undefined && !(Array.isArray(v.alarms) && v.alarms.length <= 50 && v.alarms.every(AL.valid))) throw Error();
    const sp = v.shiftPlan;
    if (sp !== undefined && !(sp && SH.validSettings(sp.settings) && Array.isArray(sp.shifts) && sp.shifts.length <= 1000 && sp.shifts.every(SH.validShift) && sp.overrides && typeof sp.overrides === 'object' && Object.values(sp.overrides).every(validOverride))) throw Error();
    const merge = (a, b) => [...new Map([...a, ...b].map(x => [x.id, x])).values()];
    const next = {tasks:merge(state.tasks, v.tasks), events:merge(state.events, v.events)};
    if (!validData(next)) throw Error();
    state = next; storageBroken = false; save();
    // Restored alarms start fresh: old ring state would show false misses or ring again.
    if (v.alarms) { const now = Date.now(); alarms = merge(alarms, v.alarms.map(a => ({...a, anchor:now, snoozeUntil:null, missedAt:null}))).slice(0, 50); saveAlarms(); }
    if (sp) {
      shiftStore.shifts = merge(shiftStore.shifts, sp.shifts.map(shiftFields)).slice(0, 1000);
      shiftStore.overrides = cleanMap({...shiftStore.overrides, ...sp.overrides}, validOverride, 1000);
      shiftStore.settings = {...sp.settings};
      shiftStore.updated = Date.now();
      saveShifts(); replan(); renderShifts();
    }
    renderTasks(); renderCalendar(); renderAlarms(); setSystems();
    notice('Backup restored. Existing items were kept.');
  } catch { notice('Invalid backup. Choose a JANGE (or Jarvis) JSON backup under 2 MB.'); }
  finally { e.target.value = ''; }
};

/* ------------------------------------------------------------------ lifecycle */
function resumeDesk(event) {
  // Returning from the background (or a back-forward cache restore) snaps the
  // tiles to the current time instead of replaying a stale flip; alarms due
  // while hidden are then judged as rung or missed.
  const resumed = !document.hidden && (root.classList.contains('is-hidden') || event?.persisted === true);
  root.classList.toggle('is-hidden', document.hidden);
  startClock(resumed);
  if (!document.hidden) { if (event?.type === 'visibilitychange' || event?.persisted) refreshLocation(false); pollPC(); applyWake(); replan(); renderAlarmSummaries(); }
}
document.addEventListener('visibilitychange', resumeDesk);
addEventListener('pageshow', resumeDesk);
addEventListener('online', () => { sys.net = true; setSystems(); weather(); pollPC(); });
addEventListener('offline', () => { sys.net = false; setSystems(); });

// Welcome: brief, non-blocking (it ignores taps) and skipped under Reduce Motion.
// Scheduled first, so nothing below can leave it on screen.
const welcome = $('welcome');
if (reducedMotion.matches || !welcome) { welcome?.remove(); root.classList.remove('boot', 'with-welcome'); }
else {
  setTimeout(() => welcome.classList.add('done'), 1700);
  setTimeout(() => { welcome.remove(); root.classList.remove('with-welcome'); }, 2300);
  setTimeout(() => root.classList.remove('boot'), 3200);
}

// One failing step must never stop the clocks or the service worker below.
for (const step of [replan, renderTasks, renderCalendar, renderAlarms, renderShifts, renderSound, renderLoc, startClock, setSystems, applyWake]) {
  try { step(); } catch (err) { console.error('JANGE startup step failed:', step.name, err); }
}
if (storageBroken) notice('Saved data could not be read. Back up or restore your data in Settings.');
refreshLocation(false);
setInterval(() => { if (!document.hidden) weather(); }, 900000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(async registration => {
    await navigator.serviceWorker.ready;
    $('offline-ready').textContent = 'Offline app ready';
    sys.cache = 'ready'; setSystems();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) notice('A JANGE update is ready. Close and reopen the app to install.'); });
    });
  }).catch(() => { $('offline-ready').textContent = 'Offline cache unavailable · retry online'; sys.cache = 'error'; setSystems(); });
} else { $('offline-ready').textContent = 'Offline mode needs HTTPS'; sys.cache = 'unsupported'; setSystems(); }
