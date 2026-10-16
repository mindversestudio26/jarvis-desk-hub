/* Dev-only regression runner. Install Playwright separately; no frontend dependency. */
const { chromium, webkit } = require(process.env.JARVIS_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.JARVIS_TEST_OUTPUT || path.join(root, 'test-results'));
fs.mkdirSync(out, { recursive: true });
const BASELINES = { '9ddff13': 'Jarvis 2.0', '4d91835': 'Jarvis 3.0' }; // builds already installed on devices
const fixture = {
  current: { temperature_2m: 31, relative_humidity_2m: 45, apparent_temperature: 34.6, is_day: 1, weather_code: 0, wind_speed_10m: 8, wind_direction_10m: 300, time: '2026-10-16T22:15' },
  daily: { time: ['2026-10-16'], temperature_2m_max: [36.2], temperature_2m_min: [26.8], sunrise: ['2026-10-16T06:14'], sunset: ['2026-10-16T17:48'], uv_index_max: [7.4] },
};
const oldData = { tasks: [{ id: 'existing-task', text: 'Preserve my existing task', done: false }], events: [{ id: 'existing-event', date: '2026-10-16', time: '09:00', text: 'Preserve my existing event' }] };
const PC = 'https://jarvis-fixture.example.ts.net';
const results = [];
let serveBaseline = null;
let rosterOverride = null; // a newer roster.js, as if only that file had been deployed
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.ics': 'text/calendar' };
const server = http.createServer((req, res) => {
  const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
  if (file.includes('..') || file.startsWith('.git')) { res.writeHead(403).end(); return; }
  try {
    const data = file === 'roster.js' && rosterOverride ? Buffer.from(rosterOverride) : serveBaseline
      ? execFileSync('git', ['show', serveBaseline + ':' + file], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      : fs.readFileSync(path.join(root, file));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
});
async function until(fn) {
  for (let n = 0; n < 100; n++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw Error('Timed out waiting for expected state');
}
const text = (page, sel) => page.locator(sel).evaluate(e => e.textContent.trim());

async function checkBrowser(engine, name, baseURL) {
  const browser = await engine.launch({ headless: true, ...(name === 'chromium' && process.env.JARVIS_CHROME_CHANNEL ? { channel: process.env.JARVIS_CHROME_CHANNEL } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1080, height: 810 }, timezoneId: 'America/New_York', reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: fixture }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Playwright's screenshot helper injects a <style> that the CSP correctly refuses;
    // ignore only that message, and only once screenshots have started.
    let screenshotsStarted = false;
    page.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text()) && !(screenshotsStarted && /apply a stylesheet/.test(m.text()))) errors.push(m.text()); });
    // Start early and pause at the boundary, so remote load latency (JARVIS_BASE_URL)
    // cannot move the first reading past the minute.
    await page.clock.install({ time: new Date('2026-10-16T18:14:44Z') });
    await page.addInitScript(data => {
      if (!localStorage.getItem('jarvis.desk.v2')) localStorage.setItem('jarvis.desk.v2', JSON.stringify(data));
    }, oldData);
    await page.goto(baseURL);
    await until(async () => await page.locator('#temperature').innerText() === '31°');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.brand-mark img, .core-avatar img')].map(i => i.complete && i.naturalWidth > 0)), [true, true], 'Emblem images decode');
    await page.clock.pauseAt(new Date('2026-10-16T18:14:59Z'));

    // Clocks: one instant, two zones, quarter-hour offset, rollover, hidden pause and resume.
    assert.equal(await page.locator('#clock').innerText(), '22:14');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '23:59');
    await page.clock.runFor(1200);
    assert.equal(await page.locator('#clock').innerText(), '22:15');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '00:00');
    assert.match(await page.locator('#kathmandu-date').innerText(), /17 October 2026/);
    assert.match(await page.locator('#date').innerText(), /16 October 2026/);
    assert.equal(await page.locator('#seconds').innerText(), await page.locator('#kathmandu-seconds').innerText());
    // Dial markers: 22:15 Dubai and 00:00 Kathmandu on a noon-at-top 24-hour ring.
    assert.equal(await page.locator('#marker-dxb').getAttribute('transform'), 'rotate(153.75 240 240)');
    assert.equal(await page.locator('#marker-ktm').getAttribute('transform'), 'rotate(180.00 240 240)');
    await page.clock.setSystemTime(new Date('2026-10-31T19:59:59Z'));
    await page.evaluate(() => dispatchEvent(new Event('pageshow')));
    await page.clock.runFor(1200);
    assert.equal(await page.locator('#clock').innerText(), '00:00');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '01:45');
    assert.match(await page.locator('#date').innerText(), /1 November 2026/);
    assert.equal(await text(page, '#month-label'), 'November 2026');
    assert.equal(await text(page, '.calendar .today'), '1');
    assert.match(await text(page, '#week-line'), /Week 44 · Day 305/);
    await page.clock.setSystemTime(new Date('2026-10-16T10:00:07Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(await page.locator('#clock').innerText(), '14:00');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '15:45');
    assert.equal(await page.locator('#seconds').innerText(), '07');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:true}); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-hidden')), true, 'Hidden page pauses animation');
    await page.clock.setSystemTime(new Date('2026-10-16T11:23:09Z'));
    await page.clock.runFor(1000);
    assert.equal(await page.locator('#clock').innerText(), '14:00', 'Hidden clock timer is paused');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:false}); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#clock').innerText(), '15:23');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '17:08');
    assert.equal(await page.locator('#seconds').innerText(), await page.locator('#kathmandu-seconds').innerText());
    await page.clock.resume();

    // Weather, including the extended daily fields and the daylight arc.
    assert.equal(await page.locator('#sunrise').innerText(), '06:14');
    assert.equal(await page.locator('#sunset').innerText(), '17:48');
    assert.equal(await page.locator('#hilo').innerText(), '36° / 27°');
    assert.equal(await page.locator('#weather-icon').getAttribute('href'), '#wx-clear');
    assert.notEqual(await page.locator('#daylight').getAttribute('stroke-dasharray'), '0 1256.64');

    // Core reflects real local state: first open task, completion ring, task badge.
    assert.equal(await page.locator('#core-focus').innerText(), 'Preserve my existing task');
    assert.equal(await page.locator('#core-progress').innerText(), '0 / 1 COMPLETE');
    assert.equal(await page.locator('#core-state').innerText(), 'ONLINE');
    assert.equal(await page.locator('#task-count').innerText(), '1');

    // Tasks: safe rendering, completion, persistence.
    await page.locator('#core').click();
    assert.match(await page.locator('#tasks').innerText(), /Preserve my existing task/);
    const attack = '<img src=x onerror=alert(1)>';
    await page.locator('#task-input').fill(attack);
    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    assert.equal(await page.locator('.task-row img').count(), 0);
    await page.locator('.task-row input').first().check();
    assert.equal(await page.locator('#core-focus').evaluate(e => e.textContent), attack, 'Next open task moves into the core as text');
    assert.equal(await text(page, '#core-progress'), '1 / 2 complete');
    await page.getByRole('button', { name: 'Close focus tasks', exact: true }).click();
    await page.reload();
    assert.equal(await page.locator('.task-row input').first().isChecked(), true);

    // Calendar and today peek persistence.
    await page.locator('#agenda-open').click();
    assert.match(await page.locator('#events').innerText(), /Preserve my existing event/);
    await page.locator('#event-time').fill('23:00');
    await page.locator('#event-input').fill('Jarvis 3 calendar regression');
    await page.getByRole('button', { name: 'Add event', exact: true }).click();
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    assert.equal(await text(page, '#month-label'), 'November 2026');
    await page.getByRole('button', { name: 'Previous month', exact: true }).click();
    await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
    await page.reload();
    assert.match(await text(page, '#today-events'), /Jarvis 3 calendar regression/);
    assert.equal(await page.locator('#week-strip .wd.today.ev').count(), 1);
    await page.locator('#calendar-open').click();
    assert.match(await page.locator('#events').innerText(), /Jarvis 3 calendar regression/);
    await page.getByRole('button', { name: 'Close calendar', exact: true }).click();

    // Backup format unchanged (version 2), merge restore, malformed import.
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadPromise;
    const backupPath = path.join(out, name + '-backup.json');
    await download.saveAs(backupPath);
    const backup = JSON.parse(fs.readFileSync(backupPath));
    assert.equal(backup.version, 2);
    assert.deepEqual(Object.keys(backup).sort(), ['alarms', 'events', 'exported', 'shiftPlan', 'tasks', 'version']);
    assert.equal(backup.tasks.length, 2);
    assert.equal(backup.events.length, 2);
    await page.locator('#settings-open').click();
    const restore = { version: 2, tasks: [{ id: 'restored', text: 'Old-format backup', done: false }], events: [] };
    await page.locator('#import-file').setInputFiles({ name: 'v1-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(restore)) });
    await until(async () => (await text(page, '#tasks')).includes('Old-format backup'));
    assert.equal(await page.locator('.task-row').count(), 3);
    assert.match(await page.locator('#data-result').innerText(), /Backup restored/);
    await page.locator('#import-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"tasks":{},"events":[]}') });
    await until(async () => (await page.locator('#notice').textContent()).includes('Invalid backup'));

    // Motion preference lives in its own key and survives reload.
    await page.locator('input[name="motion"][value="calm"]').check();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('calm')), true);

    // Companion security boundary and honest telemetry.
    await page.locator('#agent-url').fill('https://evil.example');
    await page.locator('#agent-token').fill('a'.repeat(40));
    await page.locator('#connect-form .primary').click();
    assert.match(await page.locator('#connect-result').innerText(), /Use a Tailscale/);
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    for (const id of ['cpu', 'gpu', 'ram', 'temp', 'uptime']) assert.equal(await page.locator('#' + id).innerText(), '—');
    assert.equal(await page.locator('.pc-controls button:disabled').count(), 5, 'Lock, Sleep, Restart, Shut down, Launch stay disabled');
    assert.equal(await page.locator('#hud').getAttribute('data-pc'), 'off');
    if (name === 'chromium') {
      let sample = { protocol: 1, cpu_percent: 37.4, ram_percent: 61.2, gpu_percent: null, temperature_c: null, control_enabled: false };
      await context.route(PC + '/**', async route => {
        if (!sample) return route.abort();
        const now = await page.evaluate(() => Date.now()); // the page runs on the installed fake clock
        return route.fulfill({ json: { ...sample, sampled_at: new Date(now).toISOString() }, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      await page.locator('#connect-open').click();
      await page.locator('#agent-url').fill(PC);
      await page.locator('#agent-token').fill('fixture_token_for_tests_only_000000000');
      await page.locator('#connect-form .primary').click();
      await until(async () => await page.locator('#hud').getAttribute('data-pc') === 'online');
      assert.equal(await page.locator('#agent-token').inputValue(), '', 'Token cleared from the form');
      await page.getByRole('button', { name: 'Close settings', exact: true }).click();
      assert.equal(await page.locator('#cpu').innerText(), '37%');
      assert.equal(await page.locator('#ram').innerText(), '61%');
      assert.equal(await page.locator('#gpu').innerText(), 'N/A', 'Null GPU is shown as unavailable, never estimated');
      assert.equal(await page.locator('#temp').innerText(), 'No sensor');
      assert.equal(await page.locator('#uptime').innerText(), 'Not reported');
      assert.equal(await text(page, '#pc-status'), 'Connected');
      assert.equal(await page.locator('#core-detail').innerText(), 'PC linked · read-only');
      assert.equal(await page.locator('#cpu-spark').getAttribute('points'), '200.0,19.8');
      // The Windows companion's NVIDIA reading: GPU load, the GPU's temperature labelled as such, uptime.
      sample = { ...sample, gpu_percent: 29, temperature_c: 42, temperature_source: 'gpu', uptime_seconds: 17024 };
      await page.evaluate(() => pollPC());
      await until(async () => await page.locator('#temp').innerText() === '42°C · GPU');
      assert.equal(await page.locator('#gpu').innerText(), '29%');
      assert.equal(await page.locator('#uptime').innerText(), '4 h 43 min');
      const tempBox = await page.locator('#temp').evaluate(e => [e.scrollWidth, e.clientWidth]);
      assert(tempBox[0] <= tempBox[1], 'GPU temperature label fits its slot');
      sample = { ...sample, temperature_source: 'chipset<b>' };
      await page.evaluate(() => pollPC());
      await until(async () => await page.locator('#temp').innerText() === '42°C'); // an unknown source is not shown
      // 503: companion reached but has no sample yet.
      let status = 503;
      await context.unroute(PC + '/**');
      await context.route(PC + '/**', route => status ? route.fulfill({ status, json: {}, headers: { 'Access-Control-Allow-Origin': '*' } }) : route.abort());
      await page.evaluate(() => pollPC());
      await until(async () => await page.locator('#hud').getAttribute('data-pc') === 'warming');
      // 401: token rejected, polling stops until re-paired.
      status = 401;
      await page.evaluate(() => pollPC());
      await until(async () => await page.locator('#hud').getAttribute('data-pc') === 'auth');
      assert.equal(await text(page, '#pc-status'), 'Authentication required');
      status = 0;
      await page.evaluate(() => pollPC());
      await new Promise(r => setTimeout(r, 300));
      assert.equal(await page.locator('#hud').getAttribute('data-pc'), 'auth', 'No polling after a rejected token');
      // Re-pair, then the PC disappears: unreachable, telemetry cleared.
      await page.locator('#connect-open').click();
      await page.locator('#agent-url').fill(PC);
      await page.locator('#agent-token').fill('fixture_token_for_tests_only_000000000');
      await page.locator('#connect-form .primary').click();
      await page.getByRole('button', { name: 'Close settings', exact: true }).click();
      await until(async () => await page.locator('#hud').getAttribute('data-pc') === 'unreachable');
      for (const id of ['cpu', 'ram']) assert.equal(await page.locator('#' + id).innerText(), '—', 'No stale telemetry after failure');
      assert.equal(await page.locator('#cpu-spark').getAttribute('points'), '');
      await page.locator('#connect-open').click();
      await page.locator('#disconnect').click();
      await page.getByRole('button', { name: 'Close settings', exact: true }).click();
      assert.equal(await page.locator('#hud').getAttribute('data-pc'), 'off');
    }

    // Weather failure keeps the saved reading, clearly labelled.
    await until(async () => (await page.locator('#temperature').innerText()) === '31°' && await page.locator('#weather-retry').isEnabled());
    await context.unroute('https://api.open-meteo.com/**');
    await context.route('https://api.open-meteo.com/**', route => route.abort());
    await page.locator('#weather-retry').click();
    await until(async () => (await page.locator('#weather-description').innerText()).includes('last saved'));
    assert.equal(await page.locator('#hud').getAttribute('data-wx'), 'saved');

    // Offline state is visible in the core without touching data.
    await page.evaluate(() => dispatchEvent(new Event('offline')));
    // The browser still reports online, so the handler sets offline directly from the event.
    assert.equal(await page.locator('#core-state').innerText(), 'OFFLINE');
    assert.match(await page.locator('#network').innerText(), /Offline/i);
    await page.evaluate(() => dispatchEvent(new Event('online')));

    if (name === 'chromium') {
      const offlineContext = await browser.newContext({ viewport: {width:1080,height:810}, storageState: await context.storageState(), reducedMotion:'reduce' });
      await offlineContext.route('https://api.open-meteo.com/**', route => route.fulfill({ json: fixture }));
      const offlinePage = await offlineContext.newPage();
      await offlinePage.goto(baseURL);
      await offlinePage.waitForFunction(() => document.querySelector('#offline-ready').textContent === 'Offline app ready');
      await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller);
      // A roster update deployed on its own (same shell, same cache name) reaches the installed app.
      const rosterOf = () => offlinePage.evaluate(() => { const s = JSON.parse(localStorage.getItem('jarvis.shifts.v1')); return [s.roster, s.shifts.some(x => x.date === '2026-12-12')]; });
      assert.deepEqual(await rosterOf(), ['2026-10-16', false]);
      rosterOverride = fs.readFileSync(path.join(root, 'roster.js'), 'utf8').replace("version: '2026-10-16'", "version: 'test-v2'").replace("'2026-12-04', '2026-12-05',", "'2026-12-04', '2026-12-05', '2026-12-12',");
      await offlinePage.reload();
      await offlinePage.waitForFunction(() => JSON.parse(localStorage.getItem('jarvis.shifts.v1')).roster === 'test-v2');
      assert.deepEqual(await rosterOf(), ['test-v2', true], 'the new roster version was fetched and applied without a new shell');
      rosterOverride = null;
      await offlineContext.setOffline(true);
      await offlinePage.reload();
      assert.equal(await offlinePage.locator('.task-row').count(), 3);
      assert.match(await offlinePage.locator('#network').innerText(), /Offline/i);
      assert.equal(await offlinePage.locator('#core-state').innerText(), 'OFFLINE');
      await offlinePage.waitForFunction(() => document.fonts.check('12px Michroma')); // display font served offline
      assert.equal(await offlinePage.locator('#kathmandu-clock').count(), 1);
      await offlineContext.close();
    }

    const sizes = [];
    screenshotsStarted = true;
    for (const [width, height] of [[1080,810], [1080,740], [1024,768], [810,1080], [375,812]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#calendar-open').click();
      const geometry = await page.evaluate(() => {
        const box = s => [...document.querySelectorAll(s)].map(e => e.getBoundingClientRect()).map(r => ({ width: r.width, height: r.height }));
        return {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          calendar: box('.calendar button'),
          targets: box('.dock-btn, #weather-retry, #locate, #connect-open, #agenda-open, #core, dialog[open] .close'),
          motion: getComputedStyle(document.querySelector('.ring-a')).animationName,
        };
      });
      assert(geometry.width <= width, 'No horizontal overflow at ' + width);
      assert(geometry.calendar.every(r => r.width >= 44 && r.height >= 44), 'Calendar targets >=44px at ' + width);
      assert(geometry.targets.every(r => r.width >= 44 && r.height >= 44), 'Touch targets >=44px at ' + width);
      assert.equal(geometry.motion, 'none');
      await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
      const deskHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      if (width >= 1024) assert(deskHeight <= height, `Landscape desk fits ${width}x${height} without scrolling (${deskHeight})`);
      sizes.push({ width, height, contentHeight: deskHeight });
      await page.screenshot({ path: path.join(out, name + '-' + width + 'x' + height + '.png'), fullPage: true });
    }
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('calm')), true, 'Calm motion preference persisted');
    assert.deepEqual(errors, []);
    results.push({ engine: name, result: 'PASS', scenarios: 'clocks, dial markers, midnight, resume, hidden pause, weather daily fields, core focus, persistence, backup restore, motion preference, tailnet-only pairing, ' + (name === 'chromium' ? 'mocked companion connected/warming/auth-required/unreachable/disconnect, ' : '') + 'saved weather, offline core state, responsive, touch targets, reduced motion', offline: name === 'chromium' ? 'PASS: service-worker offline reload' : 'Not verified: Windows WebKit offline reload produced an internal engine error; physical Safari check required', sizes });
    await context.close();
  } finally { await browser.close(); }
}

// Split-flap behaviour with motion enabled: only changed digits flip, leaves
// settle with no overlapping numerals, resume snaps, 12-hour mode works.
async function flipTest(engine, name, baseURL) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1080, height: 810 }, timezoneId: 'America/New_York', reducedMotion: 'no-preference', serviceWorkers: 'block' });
    await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: fixture }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const read = () => page.evaluate(() => Object.fromEntries(['dubai', 'kathmandu'].map(city => {
      const tiles = [...document.querySelectorAll('#flip-' + city + ' .tile')];
      return [city, {
        shown: tiles.map(t => t.querySelector('.half.top .glyph').textContent || '_').join(''),
        lower: tiles.map(t => t.querySelector('.half.bottom .glyph').textContent || '_').join(''),
        flipping: tiles.map(t => t.classList.contains('flipping') ? 1 : 0).join(''),
        visibleLeaves: tiles.flatMap(t => [...t.querySelectorAll('.leaf')]).filter(l => getComputedStyle(l).visibility === 'visible').length,
      }];
    })));
    // Leaves land on animationend. Under the paused test clock the app's fallback timer cannot fire,
    // so wait for the flip to finish (up to 10 s) instead of a fixed 1.5 s that a slow frame overruns.
    const settled = async () => { await until(async () => { const r = await read(); return ['dubai', 'kathmandu'].every(c => !r[c].flipping.includes('1') && r[c].visibleLeaves === 0); }); return read(); };
    await page.clock.install({ time: new Date('2026-10-16T05:59:51Z') });
    await page.goto(baseURL);
    await page.waitForTimeout(1500);
    const cross = async iso => { await page.clock.pauseAt(new Date(Date.parse(iso) - 500)); await page.waitForTimeout(1500); const before = await read(); await page.clock.runFor(600); return [before, await read()]; };

    let [before, during] = await cross('2026-10-16T06:00:00Z');
    assert.equal(before.dubai.shown, '0959');
    assert.equal(before.kathmandu.shown, '1144');
    assert.equal(during.dubai.flipping, '1111', '09:59 → 10:00 flips every Dubai digit');
    assert.equal(during.kathmandu.flipping, '0001', '11:44 → 11:45 flips only the last Kathmandu digit');
    assert.equal(during.dubai.lower, '0959', 'Old lower halves stay until the new leaf lands');
    let after = await settled();
    assert.deepEqual([after.dubai.shown, after.dubai.lower, after.dubai.flipping, after.dubai.visibleLeaves], ['1000', '1000', '0000', 0]);
    assert.deepEqual([after.kathmandu.shown, after.kathmandu.lower, after.kathmandu.visibleLeaves], ['1145', '1145', 0]);
    await page.screenshot({ path: path.join(out, name + '-flip-1000.png'), clip: { x: 0, y: 50, width: 1080, height: 190 } });

    [, during] = await cross('2026-10-16T18:15:00Z');
    assert.equal(during.kathmandu.flipping, '1111', 'Kathmandu 23:59 → 00:00');
    assert.equal(during.dubai.flipping, '0001', 'Dubai 22:14 → 22:15');
    after = await settled();
    assert.equal(after.kathmandu.shown, '0000');
    assert.match(await page.locator('#kathmandu-date').textContent(), /17 October 2026/);
    assert.match(await page.locator('#date').textContent(), /16 October 2026/);

    [, during] = await cross('2026-10-16T20:00:00Z');
    assert.equal(during.dubai.flipping, '1111', 'Dubai 23:59 → 00:00');
    assert.equal(during.kathmandu.flipping, '0001', 'Kathmandu 01:44 → 01:45');
    after = await settled();
    assert.deepEqual([after.dubai.shown, after.kathmandu.shown], ['0000', '0145']);
    assert.match(await page.locator('#date').textContent(), /17 October 2026/);
    assert.equal(await page.locator('#clock').textContent(), '00:00');

    // Background for two hours, then resume: tiles snap, no stale flip replays.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.setSystemTime(new Date('2026-10-16T21:05:00Z'));
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    after = await read();
    assert.deepEqual([after.dubai.shown, after.dubai.lower, after.dubai.flipping], ['0105', '0105', '0000']);
    assert.deepEqual([after.kathmandu.shown, after.kathmandu.flipping], ['0250', '0000']);

    // 12-hour preference: blank leading tile, AM/PM marker, readable text alternative.
    await page.locator('#settings-open').click();
    await page.locator('input[name="clock"][value="12"]').check();
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    after = await settled();
    assert.deepEqual([after.dubai.shown, after.kathmandu.shown], ['_105', '_250']);
    assert.equal(await page.locator('#flip-dubai .fampm').textContent(), 'AM');
    assert.equal(await page.locator('#clock').textContent(), '1:05 AM');
    await page.reload();
    await page.waitForTimeout(500);
    assert.equal((await read()).dubai.shown, '_105', '12-hour preference persisted');
    await page.screenshot({ path: path.join(out, name + '-flip-12h.png'), clip: { x: 0, y: 50, width: 1080, height: 190 } });
    assert.deepEqual(errors, []);
    await context.close();

    // Reduce Motion: digits change in place, never flip.
    const calm = await browser.newContext({ viewport: { width: 1080, height: 810 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await calm.route('https://api.open-meteo.com/**', route => route.fulfill({ json: fixture }));
    const still = await calm.newPage();
    await still.clock.install({ time: new Date('2026-10-16T05:59:50Z') }); // wide margin: a slow cold load must not overrun pauseAt
    await still.goto(baseURL);
    await still.clock.pauseAt(new Date('2026-10-16T05:59:59.5Z'));
    await still.clock.runFor(600);
    assert.equal(await still.locator('#flip-dubai .tile.flipping').count(), 0);
    assert.equal(await still.locator('#flip-dubai .tile .half.top .glyph').first().textContent(), '1');
    await calm.close();
    results.push({ engine: name, result: 'PASS', scenario: 'split-flap: 09:59→10:00, Kathmandu and Dubai midnight with date change, independent digits, clean settle, resume snap, 12-hour + persistence, reduced motion' });
  } finally { await browser.close(); }
}

async function upgradeTest(baseURL, baseline) {
  const browser = await chromium.launch({ headless: true, ...(process.env.JARVIS_CHROME_CHANNEL ? { channel: process.env.JARVIS_CHROME_CHANNEL } : {}) });
  try {
    const context = await browser.newContext();
    await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { current: fixture.current } }));
    serveBaseline = baseline;
    let page = await context.newPage();
    await page.goto(baseURL);
    await page.evaluate(data => localStorage.setItem('jarvis.desk.v2', JSON.stringify(data)), oldData);
    await page.waitForFunction(() => document.querySelector('#offline-ready').textContent === 'Offline app ready');
    await page.reload();
    // The 2.0 weather cache (current only) must remain readable by 3.0.
    await page.waitForFunction(() => !!localStorage.getItem('jarvis.weather.v1'));
    assert.equal(await page.locator('#alarms-open').count(), 0);
    serveBaseline = null;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    assert.equal(await page.locator('#alarms-open').count(), 0, 'Old open client not force-reloaded');
    await page.close();
    // Let the browser finish activation after the old document detaches. No
    // document in this origin is opened while the waiting worker takes over.
    await new Promise(resolve => setTimeout(resolve, 1000));
    await context.unroute('https://api.open-meteo.com/**');
    await context.route('https://api.open-meteo.com/**', route => route.abort());
    page = await context.newPage();
    await page.goto(baseURL);
    await page.waitForSelector('#alarms-open');
    await until(async () => (await page.locator('#weather-description').innerText()).includes('last saved'));
    assert.equal(await page.locator('#temperature').innerText(), '31°', '2.0 weather cache shown as saved');
    assert.equal(await page.locator('#sunrise').innerText(), '—', 'Missing daily fields stay unavailable');
    assert.match(await text(page, '#tasks'), /Preserve my existing task/);
    await page.locator('#agenda-open').click();
    assert.match(await page.locator('#events').innerText(), /Preserve my existing event/);
    await page.getByRole('button', { name: 'Close calendar' }).click();
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#alarms-open');
    assert.match(await text(page, '#tasks'), /Preserve my existing task/);
    const caches = await page.evaluate(async () => globalThis.caches.keys());
    assert(caches.includes('jarvis-desk-v3.2.1'));
    assert.deepEqual(caches.filter(k => k.startsWith('jarvis-desk-')), ['jarvis-desk-v3.2.1'], 'Old shell caches removed');
    assert.equal(await page.title(), 'JANGE · जङ्गे');
    results.push({ engine: 'chromium', result: 'PASS', scenario: baseline + ' (' + BASELINES[baseline] + ') to 3.1 service-worker upgrade, preserved storage and weather cache, no forced reload, offline 3.1, old cache cleanup' });
    await context.close();
  } finally { serveBaseline = null; await browser.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const localURL = 'http://127.0.0.1:' + server.address().port;
  const baseURL = process.env.JARVIS_BASE_URL || localURL;
  await checkBrowser(chromium, 'chromium', baseURL);
  await checkBrowser(webkit, 'webkit', baseURL);
  await flipTest(chromium, 'chromium', baseURL);
  await flipTest(webkit, 'webkit', baseURL);
  for (const baseline of Object.keys(BASELINES)) await upgradeTest(localURL, baseline);
  console.log(JSON.stringify({ result: 'PASS', baseURL, results }, null, 2));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ result: 'PASS', baseURL, results }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
