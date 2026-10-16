'use strict';
/* Jarvis 3.0. Every value on screen comes from the device clock, local storage,
   Open-Meteo or the authenticated read-only companion. Nothing is simulated. */
const $ = id => document.getElementById(id);
const root = document.documentElement;
const hud = $('hud');
const STORE = 'jarvis.desk.v2';
const PREFS = 'jarvis.prefs.v1';
const WEATHER_CACHE = 'jarvis.weather.v1';
const dubai = (d, options) => new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Dubai', ...options}).format(d);
const dayKey = d => JarvisTime.snapshot(d).dubai.day;
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const pad = n => String(n).padStart(2, '0');
const hhmm = minutes => pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);

/* ------------------------------------------------------------------ storage (schema unchanged since 2.0) */
let state = {tasks:[], events:[]}, storageBroken = false;
function validData(v) {
  return v && Array.isArray(v.tasks) && v.tasks.length<=2000 && v.tasks.every(t=>t && typeof t.id==='string' && t.id.length<=100 && typeof t.text==='string' && t.text.length<=180 && typeof t.done==='boolean') && Array.isArray(v.events) && v.events.length<=2000 && v.events.every(e=>e && typeof e.id==='string' && e.id.length<=100 && typeof e.text==='string' && e.text.length<=120 && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time));
}
function notice(text) {
  const inDialog = document.querySelector('dialog[open] [data-notice]');
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

let prefs = {motion:'full', clock:'24'};
try {
  const p = JSON.parse(localStorage.getItem(PREFS));
  if (p && (p.motion === 'full' || p.motion === 'calm')) prefs.motion = p.motion;
  if (p && (p.clock === '24' || p.clock === '12')) prefs.clock = p.clock;
} catch {}
function applyPrefs() {
  root.classList.toggle('calm', prefs.motion === 'calm');
  for (const key of ['motion', 'clock']) document.querySelectorAll(`input[name="${key}"]`).forEach(r => { r.checked = r.value === prefs[key]; });
}
document.querySelectorAll('input[name="motion"], input[name="clock"]').forEach(r => r.addEventListener('change', () => {
  if (!r.checked) return;
  prefs[r.name] = r.value;
  try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {}
  applyPrefs();
  if (r.name === 'clock') tick();
}));
applyPrefs();

/* ------------------------------------------------------------------ live system state */
const sys = {net: navigator.onLine, wx: 'loading', wxAt: null, cache: 'pending', pc: 'off', pcAt: null};
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
  row('sys-pc', {off:'off', linking:'busy', online:'ok', unreachable:'warn'}[sys.pc],
    {off:'Not paired', linking:'Linking', unreachable:'Unreachable', online:'Linked · ' + (sys.pcAt || '')}[sys.pc]);
  row('sys-store', storageBroken ? 'warn' : 'ok', storageBroken ? 'Unavailable' : state.tasks.length + ' tasks · ' + state.events.length + ' events');
  let title, detail;
  if (storageBroken) { title = 'Attention'; detail = 'Local storage unavailable'; }
  else if (!sys.net) { title = 'Offline'; detail = 'Local mode · data on this iPad'; }
  else { title = 'Online'; detail = sys.pc === 'online' ? 'PC linked · read-only' : wx === 'live' ? 'Weather feed live' : wx === 'loading' ? 'Acquiring weather' : 'Weather feed degraded'; }
  $('core-state').textContent = title;
  $('core-detail').textContent = detail;
  updateCoreLabel();
}
function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const ripple = () => restart($('ripple'), 'go');

/* ------------------------------------------------------------------ clocks and dial */
const DAYLIGHT_C = 2 * Math.PI * 200, PROGRESS_C = 2 * Math.PI * 192, FOCUS_C = 2 * Math.PI * 140;
const dialAngle = minutes => (minutes / 1440 * 360 + 180) % 360; // noon at the top, clockwise
const rotate = (el, angle) => el.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 240 240)');
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
  $('greeting').textContent = d.hour < 5 ? 'Late night' : d.hour < 12 ? 'Good morning' : d.hour < 18 ? 'Good afternoon' : 'Good evening';
  const now = new Date(d.iso);
  $('today-line').textContent = dubai(now, {weekday:'short', day:'numeric', month:'short', year:'numeric'});
  $('week-line').textContent = 'Week ' + isoWeek(d.day) + ' · Day ' + dayOfYear(d.day);
  renderPeek();
}

/* Split-flap tiles. A digit flips only when its own value changes; the static
   halves always hold settled glyphs, so an interrupted flip can never leave
   two numerals overlapping. */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function buildTile(el, order) {
  const part = cls => { const half = document.createElement('span'), glyph = document.createElement('span'); half.className = cls; glyph.className = 'glyph'; half.append(glyph); el.append(half); return glyph; };
  const tile = {el, value:null, timer:0, top:part('half top'), bottom:part('half bottom'), leafTop:part('leaf leaf-top'), leafBottom:part('leaf leaf-bottom')};
  el.style.setProperty('--d', order * 40 + 'ms'); // minutes digit drops first, like a real mechanism
  el.addEventListener('animationend', e => { if (e.animationName === 'leaf-land') settle(tile); });
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
  return [city, {tiles:tiles.map((el, i) => buildTile(el, tiles.length - 1 - i)), ampm:$('flip-' + city).querySelector('.fampm')}];
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
}
function startClock(snap) {
  clearTimeout(clockTimer);
  tick(snap);
  if (!document.hidden) clockTimer = setTimeout(startClock, 1000 - Date.now() % 1000 + 5);
}

/* ------------------------------------------------------------------ focus tasks */
function updateCoreLabel() {
  const first = state.tasks.find(t => !t.done);
  $('core').setAttribute('aria-label', 'Open focus tasks. Status ' + $('core-state').textContent + ', ' + $('core-detail').textContent + '. ' + (first ? 'Current focus: ' + first.text : 'No open tasks') + '.');
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
    const row = document.createElement('div'), label = document.createElement('label'), check = document.createElement('input'), text = document.createElement('span'), del = document.createElement('button');
    row.className = 'task-row' + (t.done ? ' done' : '') + (t === lead ? ' lead' : '');
    check.type = 'checkbox'; check.checked = t.done; text.textContent = t.text;
    check.onchange = () => { t.done = check.checked; save(); renderTasks(); if (t.done) ripple(); };
    del.type = 'button'; del.className = 'delete'; del.textContent = '×'; del.setAttribute('aria-label', 'Delete task ' + t.text);
    del.onclick = () => { state.tasks = state.tasks.filter(x => x.id !== t.id); save(); renderTasks(); };
    label.append(check, text); row.append(label, del); $('tasks').append(row);
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
  for (let i = 0; i < offset; i++) $('calendar').append(document.createElement('span'));
  for (let d = 1; d <= days; d++) {
    const key = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`, b = document.createElement('button');
    b.textContent = d; b.type = 'button';
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
  if (!events.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Nothing scheduled. A little breathing room.'; $('events').append(p); }
  events.forEach(e => {
    const row = document.createElement('div'), time = document.createElement('b'), title = document.createElement('span'), del = document.createElement('button');
    row.className = 'event-row'; time.textContent = e.time; title.textContent = e.text;
    del.type = 'button'; del.className = 'delete'; del.textContent = '×'; del.setAttribute('aria-label', 'Delete event ' + e.text);
    del.onclick = () => { state.events = state.events.filter(x => x.id !== e.id); save(); renderCalendar(); };
    row.append(time, title, del); $('events').append(row);
  });
}
function nextDay(key) { const d = new Date(Date.UTC(Number(key.slice(0,4)), Number(key.slice(5,7)) - 1, Number(key.slice(8,10)) + 1)); return d.toISOString().slice(0, 10); }
function renderPeek() {
  const now = JarvisTime.snapshot(new Date()).dubai, byTime = (a, b) => a.time.localeCompare(b.time);
  const today = state.events.filter(e => e.date === now.day).sort(byTime), tomorrowKey = nextDay(now.day);
  const upcoming = today.filter(e => e.time >= now.time), tomorrow = state.events.filter(e => e.date === tomorrowKey).sort(byTime);
  const list = $('today-events'), item = (e, cls) => {
    const row = document.createElement('span'), time = document.createElement('b'), title = document.createElement('span');
    row.className = 'peek-item' + (cls ? ' ' + cls : ''); time.textContent = e.time; title.textContent = e.text;
    row.append(time, title); list.append(row);
  };
  list.replaceChildren();
  if (!upcoming.length) {
    const p = document.createElement('span'); p.className = 'peek-empty';
    p.textContent = today.length ? 'Today’s events are complete.' : 'Nothing scheduled today.';
    list.append(p);
  }
  upcoming.slice(0, 4).forEach(e => item(e));
  const room = Math.max(0, 5 - Math.min(upcoming.length, 4) - (upcoming.length ? 0 : 1));
  if (tomorrow.length && room > 1) {
    const head = document.createElement('span'); head.className = 'peek-head'; head.textContent = 'Tomorrow · ' + dubai(new Date(tomorrowKey + 'T12:00:00+04:00'), {weekday:'long'});
    list.append(head);
    tomorrow.slice(0, room - 1).forEach(e => item(e, 'later'));
  }
  const strip = $('week-strip'), [y, m, d] = now.day.split('-').map(Number), monday = Date.UTC(y, m - 1, d) - ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) * 864e5;
  strip.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const key = new Date(monday + i * 864e5).toISOString().slice(0, 10), cell = document.createElement('span'), date = document.createElement('b');
    cell.className = 'wd' + (key === now.day ? ' today' : '') + (state.events.some(e => e.date === key) ? ' ev' : '');
    cell.textContent = 'MTWTFSS'[i]; date.textContent = Number(key.slice(8, 10));
    cell.append(date); strip.append(cell);
  }
  const hidden = Math.max(0, upcoming.length - 4);
  $('agenda-count').textContent = (today.length ? today.length + ' event' + (today.length === 1 ? '' : 's') + ' today' : 'No events today') + (hidden ? ' · ' + hidden + ' more' : '');
}
$('event-form').onsubmit = e => {
  e.preventDefault();
  const text = $('event-input').value.trim(), time = $('event-time').value;
  if (text && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && state.events.length < 2000) { state.events.push({id:uid(), text, date:selected, time}); save(); renderCalendar(); $('event-input').value = ''; }
};

/* ------------------------------------------------------------------ weather */
const weatherURL = 'https://api.open-meteo.com/v1/forecast?latitude=25.3463&longitude=55.4209&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=Asia%2FDubai&forecast_days=1';
let weatherTime = 0, weatherBusy = false, lastWeather = null;
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
  if (weatherBusy) return;
  weatherBusy = true;
  $('weather-retry').disabled = true;
  setBusy('weather', true);
  if (!lastWeather) { sys.wx = 'loading'; setSystems(); }
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(weatherURL, {signal:controller.signal, cache:'no-store'});
    if (!r.ok) throw Error();
    const body = await r.json();
    if (!validWeather(body.current)) throw Error();
    lastWeather = {current:body.current, daily:body.daily, fetched:Date.now()};
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
  }
}
try {
  const c = JSON.parse(localStorage.getItem(WEATHER_CACHE));
  if (c && validWeather(c.current) && Number.isFinite(c.fetched) && c.fetched <= Date.now()) { lastWeather = c; paintWeather(c, true); }
} catch {}
$('weather-retry').onclick = weather;

/* ------------------------------------------------------------------ PC companion (read-only) */
let agent = null, pcBusy = false, pcGeneration = 0, cpuHistory = [];
const GAUGE_C = 2 * Math.PI * 42;
function setGauge(id, value) {
  $(id).classList.toggle('live', value !== null);
  $(id).querySelector('.g-value').style.strokeDashoffset = String(value === null ? GAUGE_C : GAUGE_C * (1 - value / 100));
}
function drawSpark() {
  $('cpu-spark').setAttribute('points', cpuHistory.map((v, i) => ((i + 30 - cpuHistory.length) / 29 * 200).toFixed(1) + ',' + (31 - v / 100 * 30).toFixed(1)).join(' '));
  $('spark-label').textContent = cpuHistory.length ? 'CPU history · ' + cpuHistory.length + ' sample' + (cpuHistory.length === 1 ? '' : 's') : 'CPU history · no samples';
}
function resetMetrics() {
  for (const id of ['cpu','gpu','ram','temp']) $(id).textContent = '—';
  setGauge('gauge-cpu', null); setGauge('gauge-ram', null);
  cpuHistory = []; drawSpark();
}
function pcStatus(next, message) {
  sys.pc = next;
  $('pc-status').textContent = {off:'Not paired', linking:'Linking', online:'Online', unreachable:'Unreachable'}[next];
  $('pc-status').className = 'status-chip ' + {off:'off', linking:'busy', online:'on', unreachable:'warn'}[next];
  $('pc-message').textContent = message;
  $('connect-open').lastChild.textContent = next === 'off' ? 'Pair' : 'Manage';
  if (next !== 'online') $('pc-sampled').textContent = next === 'linking' ? 'Waiting for first sample' : 'No telemetry';
  setBusy('pc', next === 'linking');
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
  pcStatus('off', 'Monitoring disconnected. Your desk remains available.');
  $('connect-result').textContent = 'Disconnected; pairing token cleared.';
};
async function pollPC() {
  if (!agent || pcBusy || document.hidden) return;
  pcBusy = true;
  const generation = pcGeneration, connection = agent, controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const r = await fetch(connection.url + '/v1/status', {headers:{Authorization:'Bearer ' + connection.token}, signal:controller.signal, cache:'no-store', credentials:'omit', redirect:'error'});
    if (!r.ok) throw Error();
    const data = await r.json();
    if (generation !== pcGeneration) return;
    const age = Date.now() - Date.parse(data.sampled_at);
    if (!Number.isFinite(age) || age > 30000 || age < -5000 || data.protocol !== 1) throw Error();
    const metric = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
    const cpu = metric(data.cpu_percent, 100), ram = metric(data.ram_percent, 100), gpu = metric(data.gpu_percent, 100), temp = metric(data.temperature_c, 130);
    $('cpu').textContent = cpu === null ? '—' : Math.round(cpu) + '%';
    $('ram').textContent = ram === null ? '—' : Math.round(ram) + '%';
    $('gpu').textContent = gpu === null ? '—' : Math.round(gpu) + '%';
    $('temp').textContent = temp === null ? '—' : Math.round(temp) + '°C';
    setGauge('gauge-cpu', cpu); setGauge('gauge-ram', ram);
    if (cpu !== null) { cpuHistory.push(cpu); if (cpuHistory.length > 30) cpuHistory.shift(); drawSpark(); }
    sys.pcAt = dubai(new Date(data.sampled_at), {hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'});
    $('pc-sampled').textContent = 'Sampled ' + sys.pcAt;
    pcStatus('online', 'Authenticated read-only monitoring. Controls stay disabled.');
    restart(document.querySelector('.link-pc'), 'flash');
    $('connect-result').textContent = 'Connected. Monitoring only; controls remain disabled.';
  } catch {
    if (generation === pcGeneration) {
      resetMetrics();
      pcStatus('unreachable', 'PC may be off, asleep, or disconnected. Retrying every 10 seconds.');
      $('connect-result').textContent = 'Connection failed. Check companion, pairing token and Tailscale.';
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
$('settings-open').onclick = () => openPanel('settings');
$('connect-open').onclick = () => openPanel('settings');
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({...state, version:2, exported:new Date().toISOString()}, null, 2)], {type:'application/json'}), a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = 'jarvis-backup-' + dayKey(new Date()) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import-file').onchange = async e => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2000000) throw Error();
    const v = JSON.parse(await f.text());
    if (!validData(v)) throw Error();
    const merge = (a, b) => [...new Map([...a, ...b].map(x => [x.id, x])).values()];
    const next = {tasks:merge(state.tasks, v.tasks), events:merge(state.events, v.events)};
    if (!validData(next)) throw Error();
    state = next; storageBroken = false; save(); renderTasks(); renderCalendar();
    notice('Backup restored. Existing items were kept.');
  } catch { notice('Invalid backup. Choose a Jarvis JSON backup under 2 MB.'); }
  finally { e.target.value = ''; }
};

/* ------------------------------------------------------------------ lifecycle */
function resumeDesk(event) {
  // Returning from the background (or a back-forward cache restore) snaps the
  // tiles to the current time instead of replaying a stale flip.
  const resumed = !document.hidden && (root.classList.contains('is-hidden') || event?.persisted === true);
  root.classList.toggle('is-hidden', document.hidden);
  startClock(resumed);
  if (!document.hidden) { if (Date.now() - weatherTime > 900000) weather(); pollPC(); }
}
document.addEventListener('visibilitychange', resumeDesk);
addEventListener('pageshow', resumeDesk);
addEventListener('online', () => { sys.net = true; setSystems(); weather(); pollPC(); });
addEventListener('offline', () => { sys.net = false; setSystems(); });

renderTasks();
renderCalendar();
startClock();
setSystems();
if (storageBroken) notice('Saved data could not be read. Back up or restore your data in Settings.');
weather();
setInterval(() => { if (!document.hidden) weather(); }, 900000);
setTimeout(() => root.classList.remove('boot'), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1800);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(async registration => {
    await navigator.serviceWorker.ready;
    $('offline-ready').textContent = 'Offline app ready';
    sys.cache = 'ready'; setSystems();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) notice('A Jarvis update is ready. Close and reopen the app to install.'); });
    });
  }).catch(() => { $('offline-ready').textContent = 'Offline cache unavailable · retry online'; sys.cache = 'error'; setSystems(); });
} else { $('offline-ready').textContent = 'Offline mode needs HTTPS'; sys.cache = 'unsupported'; setSystems(); }
