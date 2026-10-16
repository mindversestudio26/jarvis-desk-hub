/* Dev-only regression runner for JANGE 3.1 features: alarms, shift alarms,
   daily quote, location weather and the welcome screen. Same setup as
   tests/browser.cjs (Playwright installed separately, loopback server). */
const { chromium, webkit } = require(process.env.JARVIS_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { QUOTES, forDay } = require('../quotes.js');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.JARVIS_TEST_OUTPUT || path.join(root, 'test-results'));
fs.mkdirSync(out, { recursive: true });
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
  if (file.includes('..') || file.startsWith('.git')) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(fs.readFileSync(path.join(root, file))); }
  catch { res.writeHead(404).end(); }
});
const fixture = {
  current: { temperature_2m: 31, relative_humidity_2m: 45, apparent_temperature: 34.6, is_day: 1, weather_code: 0, wind_speed_10m: 8, wind_direction_10m: 300, time: '2026-10-16T22:15' },
  daily: { time: ['2026-10-16'], temperature_2m_max: [36.2], temperature_2m_min: [26.8], sunrise: ['2026-10-16T06:14'], sunset: ['2026-10-16T17:48'], uv_index_max: [7.4] },
};
const results = [];
const text = (page, sel) => page.locator(sel).evaluate(e => e.textContent.trim());
async function until(fn, label) {
  for (let n = 0; n < 100; n++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw Error('Timed out waiting: ' + (label || 'expected state'));
}
async function open(browser, baseURL, { time, motion = 'reduce', geo = null, setup, roster = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1080, height: 810 }, timezoneId: 'America/New_York', reducedMotion: motion, serviceWorkers: 'block', ...(geo ? { geolocation: geo, permissions: ['geolocation'] } : {}) });
  const calls = [];
  // Tests start from an empty roster unless they ask for the owner's bundled one.
  if (!roster) await context.route('**/roster.js', r => r.fulfill({ contentType: 'application/javascript', body: '/* no bundled roster in this test */' }));
  await context.route('https://api.open-meteo.com/**', r => { calls.push(r.request().url()); return r.fulfill({ json: fixture }); });
  await context.route('https://api.bigdatacloud.net/**', r => { calls.push(r.request().url()); return r.fulfill({ json: { city: 'Kathmandu', locality: 'Thamel', countryName: 'Nepal' } }); });
  await context.route('https://geocoding-api.open-meteo.com/**', r => { calls.push(r.request().url()); return r.fulfill({ json: { results: [{ name: 'Kathmandu', admin1: 'Bagmati Province', country: 'Nepal', latitude: 27.70169, longitude: 85.3206 }] } }); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (setup) await page.addInitScript(setup);
  if (time) await page.clock.install({ time: new Date(Date.parse(time) - 5000) });
  await page.goto(baseURL);
  if (time) { await page.clock.pauseAt(new Date(time)); }
  return { context, page, calls, errors };
}
const radio = (page, name, value) => page.locator(`input[name="${name}"][value="${value}"]`).check();
const ringing = page => page.evaluate(() => document.querySelector('#alarm-ring').open);

async function alarmTest(engine, name, baseURL) {
  const browser = await engine.launch();
  try {
    // Friday 16 Oct 2026, 05:00 Dubai.
    const { context, page, errors } = await open(browser, baseURL, { time: '2026-10-16T01:00:00Z' });
    await page.locator('#alarms-open').click();
    assert.match(await text(page, '.alarm-limits'), /not a guaranteed wake-up/);
    if (name === 'chromium') await until(async () => (await text(page, '#sound-status')) === 'Sound ready', 'audio unlocked by the tap');
    await page.locator('#alarm-new').click();
    await page.locator('#alarm-time').fill('05:10');
    await page.locator('#alarm-label').fill('Gym');
    await page.getByRole('button', { name: 'Save alarm' }).click();
    assert.match(await text(page, '#alarm-list'), /Gym/);
    assert.match(await text(page, '#alarm-list'), /Once · next Fri 05:10, in 10 min/);
    assert.match(await text(page, '#next-alarm-dubai'), /Alarm Fri 05:10/);
    assert.equal(await text(page, '#alarm-count'), '1');
    await page.getByRole('button', { name: 'Close alarms' }).click();

    // Rings at 05:10 Dubai, snooze, rings again, dismiss.
    await page.clock.runFor(10 * 60 * 1000 + 1500);
    await until(() => ringing(page), 'alarm rings');
    assert.equal(await text(page, '#ring-label'), 'Gym');
    assert.equal(await text(page, '#ring-time'), '05:10');
    assert.equal(await page.locator('#hud').getAttribute('data-alarm'), '');
    await page.screenshot({ path: path.join(out, name + '-alarm-ring.png') });
    await page.locator('#ring-snooze').click();
    assert.equal(await ringing(page), false);
    assert.match(await text(page, '#next-alarm-dubai'), /Snoozed · Fri 05:20/);
    await page.clock.runFor(10 * 60 * 1000 + 1500);
    await until(() => ringing(page), 'snoozed alarm rings again');
    assert.match(await text(page, '#ring-note'), /Snoozed alarm/);
    await page.locator('#ring-dismiss').click();
    assert.equal(await ringing(page), false);

    // Repeating Kathmandu weekday alarm: 07:00 Kathmandu = 05:15 Dubai = 01:15Z.
    await page.locator('#alarms-open').click();
    await page.locator('#alarm-new').click();
    await page.locator('#alarm-time').fill('07:00');
    await radio(page, 'alarm-zone', 'Asia/Kathmandu');
    await page.locator('[data-preset="weekdays"]').click();
    await page.locator('#alarm-label').fill('Call Kathmandu');
    await page.getByRole('button', { name: 'Save alarm' }).click();
    assert.match(await text(page, '#alarm-list'), /Weekdays · next Sat 07:00|Weekdays · next Mon 07:00/);
    // It is already 07:21 in Kathmandu on Friday, so the next weekday is Monday.
    assert.match(await text(page, '#alarm-list'), /Weekdays · next Mon 07:00/);
    assert.match(await text(page, '#next-alarm-kathmandu'), /Alarm Mon 07:00/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Add alarm Call Kathmandu to Calendar' }).click()]);
    const icsPath = path.join(out, name + '-alarm.ics');
    await download.saveAs(icsPath);
    const ics = fs.readFileSync(icsPath, 'utf8');
    assert.match(ics, /DTSTART;TZID=Asia\/Kathmandu:20261019T070000/);
    assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR/);
    assert.match(ics, /TRIGGER:PT0M/);

    // A one-time alarm due while the page is hidden is recorded as missed, not rung late.
    await page.locator('#alarm-new').click();
    await page.locator('#alarm-time').fill('05:40');
    await page.locator('#alarm-label').fill('Medicine');
    await page.getByRole('button', { name: 'Save alarm' }).click();
    await page.getByRole('button', { name: 'Close alarms' }).click();
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.runFor(30 * 60 * 1000);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await ringing(page), false, 'A 20-minute-late alarm does not ring');
    await page.locator('#alarms-open').click();
    assert.match(await text(page, '#alarm-list'), /Missed Fri 05:40/);

    // Reload: everything persists and nothing already handled rings again.
    await page.reload();
    await page.clock.runFor(1500);
    assert.equal(await ringing(page), false);
    await page.locator('#alarms-open').click();
    assert.equal(await page.locator('.alarm-item').count(), 3);
    assert.equal(await page.locator('.alarm-item .switch[aria-checked="true"]').count(), 1, 'Only the repeating alarm stays on');
    assert.deepEqual(errors, []);
    results.push({ engine: name, suite: 'alarms', result: 'PASS', checks: 'create, ring at zone time, snooze, re-ring, dismiss, Kathmandu weekday repeat, calendar export (TZID + RRULE + alert), missed after background, reload persistence' + (name === 'chromium' ? ', audio unlock' : '') });
    await context.close();
  } finally { await browser.close(); }
}

async function shiftTest(engine, name, baseURL) {
  const browser = await engine.launch();
  try {
    // Friday 16 Oct 2026, 14:00 Dubai.
    const { context, page, errors } = await open(browser, baseURL, { time: '2026-10-16T10:00:00Z' });
    await page.locator('#alarms-open').click();
    await page.locator('#tab-shifts').click();
    assert.match(await text(page, '#shift-empty'), /No shifts yet/);
    const addShift = async (date, type, start, end, mode = 'auto', custom) => {
      await page.locator('#shift-new').click();
      await page.locator('#shift-date').fill(date);
      await radio(page, 'shift-type', type);
      await page.locator('#shift-start').fill(start || '');
      await page.locator('#shift-end').fill(end || '');
      await radio(page, 'shift-alarm', mode);
      if (custom) await page.locator('#shift-alarm-time').fill(custom);
      await page.getByRole('button', { name: 'Save shift' }).click();
    };
    await addShift('2026-10-17', 'morning', '06:00', '15:00');
    assert.match(await text(page, '#shift-next'), /Next shift alarm Sat 04:30 Dubai, in 14 h 30 min · Morning shift 06:00/);
    assert.match(await text(page, '#shift-list'), /Alarm 04:30 Dubai · 06:15 Kathmandu/);
    assert.match(await text(page, '#next-alarm-dubai'), /Alarm Sat 04:30 · in 14 h 30 min · Morning shift 06:00/);
    // A working shift without a start time is refused, never guessed.
    await page.locator('#shift-new').click();
    await page.locator('#shift-date').fill('2026-10-20');
    await radio(page, 'shift-type', 'shift');
    await page.getByRole('button', { name: 'Save shift' }).click();
    assert.match(await text(page, '.shift-notice'), /does not guess/);
    await page.locator('#shift-cancel').click();
    await addShift('2026-10-18', 'off');
    assert.equal(await page.locator('.shift-item').count(), 2);
    // Roster import: night shift with a UID, an all-day shift without a time.
    const roster = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:n1@roster', 'SUMMARY:Night Shift', 'DTSTART;TZID=Asia/Dubai:20261018T220000', 'DTEND;TZID=Asia/Dubai:20261019T070000', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:x1@roster', 'SUMMARY:Shift', 'DTSTART;VALUE=DATE:20261021', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    await page.locator('#roster-file').setInputFiles({ name: 'roster.ics', mimeType: 'text/calendar', buffer: Buffer.from(roster) });
    await until(async () => !(await page.locator('#shift-issues').isHidden()), 'import report');
    assert.match(await text(page, '#shift-issues'), /Imported 2 roster entries/);
    assert.match(await text(page, '#shift-issues'), /no start time/);
    assert.match(await text(page, '#shift-list'), /Night shift/);
    // Turn the night shift alarm off, re-import the same roster: the override survives.
    await page.getByRole('button', { name: /Edit shift on Sun,? 18 Oct/ }).last().click();
    await radio(page, 'shift-alarm', 'off');
    await page.getByRole('button', { name: 'Save shift' }).click();
    await page.locator('#roster-file').setInputFiles({ name: 'roster.ics', mimeType: 'text/calendar', buffer: Buffer.from(roster) });
    await until(async () => /Alarm off for this shift/.test(await text(page, '#shift-list')), 'override kept after re-import');
    // Commute change recalculates; a custom time on the morning shift is kept.
    await page.locator('#shift-commute').fill('45');
    await page.locator('#shift-commute').dispatchEvent('change');
    assert.match(await text(page, '#shift-list'), /Alarm 04:15 Dubai/);
    await page.getByRole('button', { name: /Edit shift on Sat,? 17 Oct/ }).click();
    await radio(page, 'shift-alarm', 'custom');
    await page.locator('#shift-alarm-time').fill('04:00');
    await page.getByRole('button', { name: 'Save shift' }).click();
    assert.match(await text(page, '#shift-list'), /Alarm 04:00 Dubai · 05:45 Kathmandu · custom/);
    // A manual alarm at the same moment covers the shift alarm: one ring, not two.
    await page.locator('#tab-alarms').click();
    await page.locator('#alarm-new').click();
    await page.locator('#alarm-time').fill('04:00');
    await page.locator('#alarm-label').fill('Wake for work');
    await page.getByRole('button', { name: 'Save alarm' }).click();
    await page.locator('#tab-shifts').click();
    assert.match(await text(page, '#shift-list'), /Covered by a manual alarm/);
    await page.getByRole('button', { name: 'Close alarms' }).click();
    await page.reload();
    // Saturday 04:00 Dubai.
    await page.clock.pauseAt(new Date('2026-10-16T23:59:58Z')); // jump, then run the last seconds
    await page.clock.runFor(4000);
    await until(() => ringing(page), 'alarm at 04:00 Saturday');
    assert.equal(await text(page, '#ring-label'), 'Wake for work');
    await page.locator('#ring-dismiss').click();
    await page.clock.runFor(90 * 1000);
    assert.equal(await ringing(page), false, 'The covered shift alarm does not ring a second time');
    // Remove the manual alarm; the next shift alarm (Sunday night shift) is off, so none is due.
    await page.locator('#alarms-open').click();
    await page.locator('#tab-shifts').click();
    assert.match(await text(page, '#shift-next'), /No upcoming shift alarm|has no start time|have no start time/);
    assert.deepEqual(errors, []);
    results.push({ engine: name, suite: 'shifts', result: 'PASS', checks: 'calculated alarm (start − prep − commute), Dubai + Kathmandu display, next alarm with shift, no guessing missing start, day off, roster .ics import report, override kept on re-import, commute recalculation, custom time, duplicate covered by manual alarm (single ring), persistence across reload' });
    await context.close();
  } finally { await browser.close(); }
}

async function quoteTest(engine, name, baseURL) {
  const browser = await engine.launch();
  try {
    const { context, page, errors } = await open(browser, baseURL, { time: '2026-10-16T19:59:50Z' });
    const before = forDay('2026-10-16'), after = forDay('2026-10-17');
    assert.equal(await text(page, '#quote-text'), '“' + before.q + '”');
    assert.equal(await text(page, '#quote-author'), before.a);
    assert.equal(await text(page, '#quote-ne'), before.ne);
    const visible = await page.locator('#daily-quote').evaluate(f => [...f.children].filter(c => getComputedStyle(c).position !== 'absolute').map(c => c.id));
    assert.deepEqual(visible, ['quote-text', 'quote-author', 'quote-ne'], 'Only quote, author and Nepali meaning are shown');
    await page.clock.runFor(15000);
    assert.equal(await text(page, '#quote-text'), '“' + after.q + '”', 'Changes at Dubai midnight');
    assert.notEqual(before.q, after.q);
    assert.equal(QUOTES.some(q => q.q === after.q), true);
    assert.deepEqual(errors, []);
    results.push({ engine: name, suite: 'quote', result: 'PASS', checks: 'quote/author/Nepali only, rollover at Dubai midnight' });
    await context.close();
  } finally { await browser.close(); }
}

async function locationTest(engine, name, baseURL) {
  const browser = await engine.launch();
  try {
    // Permission granted: rounded coordinates only, city from reverse geocoding.
    let t = await open(browser, baseURL, { geo: { latitude: 27.717245, longitude: 85.323961 } });
    await until(async () => (await text(t.page, '#wx-place')) === 'Kathmandu', 'device location');
    const forecast = t.calls.find(u => u.startsWith('https://api.open-meteo.com/'));
    assert.match(forecast, /latitude=27\.7&longitude=85\.3&/); // device location rounded to 0.05°
    assert.ok(t.calls.every(u => !/27\.717|85\.323/.test(u)), 'Precise coordinates never leave the page');
    await until(async () => !!(await t.page.evaluate(() => localStorage.getItem('jarvis.weather.v1'))), 'weather cached');
    const stored = await t.page.evaluate(() => JSON.stringify(localStorage));
    assert.ok(!/27\.717|85\.323/.test(stored), 'Precise coordinates are not stored');
    assert.equal(await t.page.locator('#loc-note').isHidden(), true);
    // Offline: the saved reading keeps its place and is labelled.
    await t.context.route('https://api.open-meteo.com/**', r => r.abort());
    await t.page.locator('#weather-retry').click();
    await until(async () => /last saved/.test(await text(t.page, '#weather-description')), 'saved weather');
    assert.equal(await text(t.page, '#wx-place'), 'Kathmandu');
    await t.context.close();

    // No permission yet: no prompt on load, Sharjah shown with a hint; a tap asks, a refusal is explained.
    t = await open(browser, baseURL);
    await until(async () => /Tap the location button/.test(await text(t.page, '#loc-note')), 'prompt hint');
    assert.equal(await text(t.page, '#wx-place'), 'Sharjah');
    await t.page.locator('#locate').click();
    await until(async () => /Location access is off|Location is unavailable/.test(await text(t.page, '#loc-note')), 'denied explained');
    // Manual city.
    await t.page.locator('#settings-open').click();
    await t.page.locator('#city-input').fill('Kathmandu');
    await t.page.locator('#city-form button').click();
    await t.page.getByRole('button', { name: 'Kathmandu, Bagmati Province, Nepal' }).click();
    await until(async () => (await text(t.page, '#wx-place')) === 'Kathmandu', 'manual city');
    assert.ok(t.calls.some(u => /latitude=27\.7&longitude=85\.32&/.test(u)));
    assert.equal(await t.page.locator('input[name="loc-mode"][value="manual"]').isChecked(), true);
    await t.page.reload();
    await until(async () => (await text(t.page, '#wx-place')) === 'Kathmandu', 'manual city persists');
    assert.deepEqual(t.errors, []);
    results.push({ engine: name, suite: 'location', result: 'PASS', checks: 'granted → rounded coords + city name, nothing precise stored or sent, offline saved reading keeps place, no prompt without a tap, refusal explained, manual city search, persistence' });
    await t.context.close();
  } finally { await browser.close(); }
}

// The owner's roster ships with JANGE: a fresh install shows it on the desk with no import,
// alarms come 2 h 30 min before each shift, an alarm already past never rings, and a reload
// never applies the roster twice.
async function bundledRosterTest(engine, name, baseURL) {
  const browser = await engine.launch();
  try {
    const t = await open(browser, baseURL, { time: '2026-10-25T01:00:00Z', roster: true }); // 05:00 in Dubai
    const desk = () => t.page.locator('.peek-shift').allInnerTexts();
    await until(async () => (await desk()).length > 0, 'roster on the desk');
    assert.deepEqual(await desk(), ['Today · Day shift 07:00–19:00', 'Tomorrow · Day shift 07:00–19:00']);
    assert.match(await t.page.locator('#next-alarm-dubai').innerText(), /04:30/, 'next alarm 2 h 30 min before the 07:00 start');
    assert.equal(await ringing(t.page), false, 'the 04:30 alarm, already past at first run, does not ring');
    const stored = () => t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.shifts.v1')));
    let s = await stored();
    assert.deepEqual([s.shifts.length, s.settings.prep, s.settings.commute, s.roster], [32, 120, 30, '2026-10-16']);
    assert.equal(s.shifts.some(x => x.type === 'holiday'), false);
    await t.page.reload();
    await until(async () => (await desk()).length > 0, 'roster after reload');
    s = await stored();
    assert.equal(s.shifts.length, 32, 'applied once, not duplicated');
    assert.deepEqual(t.errors, []);
    results.push({ engine: name, suite: 'bundled roster', result: 'PASS', checks: 'fresh install shows today/tomorrow shifts, alarm 04:30, past alarm silent, applied once' });
    await t.context.close();
  } finally { await browser.close(); }
}

async function welcomeTest(engine, name, baseURL) {
  const browser = await engine.launch();
  try {
    let t = await open(browser, baseURL, { motion: 'no-preference' });
    assert.equal(await t.page.locator('#welcome').count(), 1);
    assert.equal(await t.page.locator('#welcome').evaluate(e => getComputedStyle(e).pointerEvents), 'none', 'Welcome never blocks the desk');
    await t.page.waitForTimeout(500);
    await t.page.screenshot({ path: path.join(out, name + '-welcome.png') });
    await t.page.locator('#tasks-open').click({ force: true });
    assert.equal(await t.page.locator('#tasks-dialog').evaluate(d => d.open), true, 'Usable during the welcome');
    await until(async () => (await t.page.locator('#welcome').count()) === 0, 'welcome removed');
    await t.context.close();
    t = await open(browser, baseURL, { motion: 'reduce' });
    assert.equal(await t.page.locator('#welcome').count(), 0, 'Skipped under Reduce Motion');
    assert.deepEqual(t.errors, []);
    results.push({ engine: name, suite: 'welcome', result: 'PASS', checks: 'non-blocking, removed after ~2.3 s, skipped under Reduce Motion' });
    await t.context.close();
  } finally { await browser.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = process.env.JARVIS_BASE_URL || 'http://127.0.0.1:' + server.address().port;
  for (const [engine, name] of [[chromium, 'chromium'], [webkit, 'webkit']]) {
    await alarmTest(engine, name, baseURL);
    await shiftTest(engine, name, baseURL);
    await quoteTest(engine, name, baseURL);
    await locationTest(engine, name, baseURL);
    await welcomeTest(engine, name, baseURL);
    await bundledRosterTest(engine, name, baseURL);
  }
  const report = { result: 'PASS', baseURL, results };
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(out, 'features.json'), JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
