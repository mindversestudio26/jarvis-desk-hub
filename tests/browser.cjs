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
const fixture = { current: { temperature_2m: 31, relative_humidity_2m: 45, weather_code: 0, wind_speed_10m: 8, time: '2026-10-16T22:15' } };
const oldData = { tasks: [{ id: 'existing-task', text: 'Preserve my existing task', done: false }], events: [{ id: 'existing-event', date: '2026-10-16', time: '09:00', text: 'Preserve my existing event' }] };
const results = [];
let serveBaseline = false;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
  if (file.includes('..') || file.startsWith('.git')) { res.writeHead(403).end(); return; }
  try {
    const data = serveBaseline
      ? execFileSync('git', ['show', 'd0851b9:' + file], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      : fs.readFileSync(path.join(root, file));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
});
async function until(fn) {
  for (let n = 0; n < 100; n++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw Error('Timed out waiting for expected state');
}

async function checkBrowser(engine, name, baseURL) {
  const browser = await engine.launch({ headless: true, ...(name === 'chromium' && process.env.JARVIS_CHROME_CHANNEL ? { channel: process.env.JARVIS_CHROME_CHANNEL } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1080, height: 810 }, timezoneId: 'America/New_York', reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: fixture }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-10-16T18:14:59Z') });
    await page.addInitScript(data => {
      if (!localStorage.getItem('jarvis.desk.v2')) localStorage.setItem('jarvis.desk.v2', JSON.stringify(data));
    }, oldData);
    await page.goto(baseURL);
    await until(async () => await page.locator('#temperature').innerText() === '31°');
    assert.equal(await page.locator('#clock').innerText(), '22:14');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '23:59');
    await page.clock.runFor(1200);
    assert.equal(await page.locator('#clock').innerText(), '22:15');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '00:00');
    assert.match(await page.locator('#kathmandu-date').innerText(), /17 October 2026/);
    assert.match(await page.locator('#date').innerText(), /16 October 2026/);
    assert.equal(await page.locator('#seconds').innerText(), await page.locator('#kathmandu-seconds').innerText());
    await page.clock.setSystemTime(new Date('2026-10-31T19:59:59Z'));
    await page.evaluate(() => dispatchEvent(new Event('pageshow')));
    await page.clock.runFor(1200);
    assert.equal(await page.locator('#clock').innerText(), '00:00');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '01:45');
    assert.match(await page.locator('#date').innerText(), /1 November 2026/);
    assert.equal(await page.locator('#month-label').innerText(), 'November 2026');
    assert.equal(await page.locator('.calendar .today').innerText(), '1');
    await page.clock.setSystemTime(new Date('2026-10-16T10:00:07Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(await page.locator('#clock').innerText(), '14:00');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '15:45');
    assert.equal(await page.locator('#seconds').innerText(), '07');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:true}); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.setSystemTime(new Date('2026-10-16T11:23:09Z'));
    await page.clock.runFor(1000);
    assert.equal(await page.locator('#clock').innerText(), '14:00', 'Hidden clock timer is paused');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:false}); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#clock').innerText(), '15:23');
    assert.equal(await page.locator('#kathmandu-clock').innerText(), '17:08');
    assert.equal(await page.locator('#seconds').innerText(), await page.locator('#kathmandu-seconds').innerText());

    assert.match(await page.locator('#tasks').innerText(), /Preserve my existing task/);
    const attack = '<img src=x onerror=alert(1)>';
    await page.locator('#task-input').fill(attack);
    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    assert.equal(await page.locator('.task-row img').count(), 0);
    await page.locator('.task-row input').first().check();
    await page.reload();
    assert.equal(await page.locator('.task-row input').first().isChecked(), true);
    await page.locator('#agenda-open').click();
    assert.match(await page.locator('#events').innerText(), /Preserve my existing event/);
    await page.locator('#event-input').fill('Jarvis 2 calendar regression');
    await page.getByRole('button', { name: 'Add event', exact: true }).click();
    await page.getByRole('button', { name: 'Close day agenda', exact: true }).click();
    await page.reload();
    await page.locator('#agenda-open').click();
    assert.match(await page.locator('#events').innerText(), /Jarvis 2 calendar regression/);
    await page.getByRole('button', { name: 'Close day agenda', exact: true }).click();
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    assert.equal(await page.locator('#month-label').innerText(), 'November 2026');
    await page.getByRole('button', { name: 'Previous month', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadPromise;
    const backupPath = path.join(out, name + '-backup.json');
    await download.saveAs(backupPath);
    const backup = JSON.parse(fs.readFileSync(backupPath));
    assert.equal(backup.version, 2);
    assert.equal(backup.tasks.length, 2);
    assert.equal(backup.events.length, 2);
    await page.locator('#settings-open').click();
    const restore = { version: 2, tasks: [{ id: 'restored', text: 'Old-format backup', done: false }], events: [] };
    await page.locator('#import-file').setInputFiles({ name: 'v1-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(restore)) });
    await until(async () => (await page.locator('#tasks').innerText()).includes('Old-format backup'));
    assert.equal(await page.locator('.task-row').count(), 3);
    await page.locator('#import-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"tasks":{},"events":[]}') });
    await until(async () => (await page.locator('#notice').textContent()).includes('Invalid backup'));
    await page.locator('#agent-url').fill('https://evil.example');
    await page.locator('#agent-token').fill('a'.repeat(40));
    await page.locator('#connect-form .primary').click();
    assert.match(await page.locator('#connect-result').innerText(), /Use a Tailscale/);
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    for (const id of ['cpu', 'gpu', 'ram', 'temp']) assert.equal(await page.locator('#' + id).innerText(), '—');
    assert.equal(await page.locator('.pc-actions button:disabled').count(), 4);
    await until(async () => (await page.locator('#temperature').innerText()) === '31°' && await page.locator('#weather-retry').isEnabled());
    await context.unroute('https://api.open-meteo.com/**');
    await context.route('https://api.open-meteo.com/**', route => route.abort());
    await page.locator('#weather-retry').click();
    await until(async () => (await page.locator('#weather-description').innerText()).includes('last saved'));
    // A separate worker-enabled context avoids WebKit's service-worker routing
    // bypassing deterministic network fixtures after a reload.
    if (name === 'chromium') {
    const offlineContext = await browser.newContext({ viewport: {width:1080,height:810}, storageState: await context.storageState(), reducedMotion:'reduce' });
    const offlinePage = await offlineContext.newPage();
    await offlinePage.goto(baseURL);
    await offlinePage.waitForFunction(() => document.querySelector('#offline-ready').textContent === 'Offline app ready');
    await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller);
    await offlineContext.setOffline(true);
    await offlinePage.reload();
    assert.equal(await offlinePage.locator('.task-row').count(), 3);
    assert.match(await offlinePage.locator('#network').innerText(), /Offline/);
    assert.equal(await offlinePage.locator('#kathmandu-clock').count(), 1);
    await offlineContext.close();
    }
    const sizes = [];
    for (const [width, height] of [[1080,810], [1024,768], [810,1080], [375,812]]) {
      await page.setViewportSize({ width, height });
      const geometry = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        calendar: [...document.querySelectorAll('.calendar button')].map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })),
        settings: document.querySelector('#settings-open').getBoundingClientRect().toJSON(),
        motion: getComputedStyle(document.querySelector('.card')).animationName,
      }));
      assert(geometry.width <= width, 'No horizontal overflow at ' + width);
      assert(geometry.calendar.every(r => r.width >= 44 && r.height >= 44), 'Calendar targets >=44px at ' + width);
      assert(geometry.settings.width >= 44 && geometry.settings.height >= 44);
      assert.equal(geometry.motion, 'none');
      if (width === 1080) assert(geometry.height <= 810, 'Default landscape desk fits the screen');
      sizes.push({ width, height, contentHeight: geometry.height });
      await page.screenshot({ path: path.join(out, name + '-' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    results.push({ engine: name, result: 'PASS', scenarios: 'clocks, midnight, resume, persistence, backup restore, weather, security, responsive, reduced motion', offline: name === 'chromium' ? 'PASS: service-worker offline reload' : 'Not verified: Windows WebKit offline reload produced an internal engine error; physical Safari check required', sizes });
    await context.close();
  } finally { await browser.close(); }
}

async function upgradeTest(baseURL) {
  const browser = await chromium.launch({ headless: true, ...(process.env.JARVIS_CHROME_CHANNEL ? { channel: process.env.JARVIS_CHROME_CHANNEL } : {}) });
  try {
    const context = await browser.newContext();
    await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: fixture }));
    serveBaseline = true;
    let page = await context.newPage();
    await page.goto(baseURL);
    await page.evaluate(data => localStorage.setItem('jarvis.desk.v2', JSON.stringify(data)), oldData);
    await page.waitForFunction(() => document.querySelector('#offline-ready').textContent === 'Offline app ready');
    await page.reload();
    assert.equal(await page.locator('#kathmandu-clock').count(), 0);
    serveBaseline = false;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    assert.equal(await page.locator('#kathmandu-clock').count(), 0, 'Old open client not force-reloaded');
    await page.close();
    page = await context.newPage();
    await page.goto(baseURL);
    await page.waitForSelector('#kathmandu-clock');
    assert.match(await page.locator('#tasks').innerText(), /Preserve my existing task/);
    await page.locator('#agenda-open').click();
    assert.match(await page.locator('#events').innerText(), /Preserve my existing event/);
    await page.getByRole('button', { name: 'Close day agenda' }).click();
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#kathmandu-clock');
    assert.match(await page.locator('#tasks').innerText(), /Preserve my existing task/);
    const caches = await page.evaluate(async () => globalThis.caches.keys());
    assert(caches.includes('jarvis-desk-v2.0.0'));
    assert(!caches.includes('jarvis-desk-v1'));
    results.push({ engine: 'chromium', result: 'PASS', scenario: 'd0851b9 service-worker upgrade, preserved storage, no forced reload, offline v2, old cache cleanup' });
    await context.close();
  } finally { serveBaseline = false; await browser.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const localURL = 'http://127.0.0.1:' + server.address().port;
  const baseURL = process.env.JARVIS_BASE_URL || localURL;
  await checkBrowser(chromium, 'chromium', baseURL);
  await checkBrowser(webkit, 'webkit', baseURL);
  await upgradeTest(localURL);
  console.log(JSON.stringify({ result: 'PASS', baseURL, results }, null, 2));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ result: 'PASS', baseURL, results }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
