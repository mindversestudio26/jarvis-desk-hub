/* Frontend ↔ real read-only companion, end to end on this machine.
   Starts companion/agent.py unchanged (needs Python with psutil: set
   JARVIS_PYTHON), serves the app on loopback, and lets Playwright stand in for
   Tailscale Serve: requests to the tailnet host are forwarded to the loopback
   companion with the exact allowed Origin. A random token is generated per run
   and never printed. */
const { chromium } = require(process.env.JARVIS_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ORIGIN = 'https://mindversestudio26.github.io';
const HOST = 'jange-test-pc.example.ts.net';
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
async function until(fn, label) { for (let n = 0; n < 150; n++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('Timed out: ' + label); }

(async () => {
  const python = process.env.JARVIS_PYTHON || 'python';
  const token = crypto.randomBytes(32).toString('base64url');
  const port = await freePort();
  const companion = spawn(python, ['agent.py', '--port', String(port), '--origin', ORIGIN, '--host', HOST], { cwd: path.join(root, 'companion'), env: { ...process.env, JARVIS_READ_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
  const server = http.createServer((req, res) => {
    const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (file.includes('..') || file.startsWith('.git')) { res.writeHead(403).end(); return; }
    try { res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(path.join(root, file))); } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const steps = [];
  try {
    await until(() => new Promise(r => net.connect(port, '127.0.0.1').on('connect', function () { this.end(); r(true); }).on('error', () => r(false))), 'companion listening');
    const context = await browser.newContext({ viewport: { width: 1080, height: 810 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('https://api.open-meteo.com/**', r => r.abort());
    let companionUp = true;
    await context.route('https://' + HOST + '/**', async route => {
      const req = route.request();
      if (!companionUp) return route.abort();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET' } });
      try {
        const res = await route.fetch({ url: 'http://127.0.0.1:' + port + new URL(req.url()).pathname, headers: { Authorization: req.headers()['authorization'] || '', Origin: ORIGIN } });
        await route.fulfill({ status: res.status(), body: await res.body(), headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch { await route.abort(); }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    const pair = async t => {
      await page.locator('#connect-open').click();
      await page.locator('#agent-url').fill('https://' + HOST);
      await page.locator('#agent-token').fill(t);
      await page.locator('#connect-form .primary').click();
      await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    };
    const state = () => page.locator('#hud').getAttribute('data-pc');
    await pair(token);
    // The companion samples for one second before its first reading (503 → warming).
    await until(async () => ['warming', 'online'].includes(await state()), 'first response');
    steps.push('first response: ' + await state());
    await new Promise(r => setTimeout(r, 1600)); // past the first sample and the 0.5 s rate limit
    await page.evaluate(() => pollPC());
    await until(async () => (await state()) === 'online', 'connected');
    const read = id => page.locator('#' + id).evaluate(e => e.textContent.trim());
    const cpu = await read('cpu'), ram = await read('ram');
    assert.match(cpu, /^\d{1,3}%$/, 'real CPU percentage');
    assert.match(ram, /^\d{1,3}%$/, 'real RAM percentage');
    // GPU and temperature come from nvidia-smi when this PC has an NVIDIA GPU, otherwise they stay unavailable.
    const gpu = await read('gpu'), temp = await read('temp'), uptime = await read('uptime');
    if (gpu === 'N/A') assert.equal(temp, 'No sensor', 'no GPU reading, so no temperature is estimated');
    else { assert.match(gpu, /^\d{1,3}%$/, 'real GPU percentage'); assert.match(temp, /^\d{1,3}°C · GPU$/, 'GPU temperature, labelled'); }
    assert.match(uptime, /^\d+ (d \d+ h|h \d+ min|min)$/, 'real uptime');
    assert.equal(await read('pc-status'), 'Connected');
    steps.push('connected with real telemetry (CPU ' + cpu + ', RAM ' + ram + ', GPU ' + gpu + ', temp ' + temp + ', uptime ' + uptime + ')');
    // Wrong token: the companion answers 401, the panel says so and stops polling.
    await pair(crypto.randomBytes(32).toString('base64url'));
    await until(async () => (await state()) === 'auth', 'authentication required');
    assert.equal(await read('pc-status'), 'Authentication required');
    for (const id of ['cpu', 'ram']) assert.equal(await read(id), '—');
    steps.push('wrong token → 401 → Authentication required, telemetry cleared');
    // Companion stops: unreachable.
    await pair(token);
    await new Promise(r => setTimeout(r, 600));
    companionUp = false;
    companion.kill();
    await page.evaluate(() => pollPC());
    await until(async () => (await state()) === 'unreachable', 'unreachable');
    assert.equal(await read('cpu'), '—');
    steps.push('companion stopped → Unreachable, telemetry cleared');
    assert.equal(await page.locator('.pc-controls button:disabled').count(), 5);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', companion: 'companion/agent.py (unchanged), psutil', steps }, null, 2));
  } finally {
    companion.kill();
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
