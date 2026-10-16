# Regression checks

No test tooling is shipped to the frontend. Node's built-in test runner verifies the pure clock projection:

```powershell
node --test tests/clocks.test.cjs
```

Eight deterministic cases cover both midnight boundaries, the 1-hour-45-minute offset, New Year, leap day and seconds padding.

For browser tests, install official Playwright into a separate developer environment and install its Chromium and WebKit engines. Make its package available through `JARVIS_PLAYWRIGHT` (absolute package directory) or normal Node resolution. Set `JARVIS_CHROME_CHANNEL=chrome` to use installed Chrome; otherwise Playwright's Chromium is used.

```powershell
node tests/browser.cjs
```

The runner starts and stops its own loopback-only static server. Run from a complete Git checkout because the cache-upgrade test reads the original `d0851b9` files from Git. It writes fixture-only JSON backups, screenshots and results to ignored `test-results/`, or the directory in `JARVIS_TEST_OUTPUT`. `JARVIS_BASE_URL` optionally runs the functional/layout checks against a deployed URL; the old-worker upgrade scenario always uses the local server.

Both engines test 1080×810, 1024×768, 810×1080 and 375×812, with no horizontal overflow, minimum 44-pixel calendar/settings targets, reduced motion, clocks across midnight/month rollover and background/resume, old task/event storage, task completion and safe rendering, local agenda persistence, month navigation, version-2 backup export/restore, malformed imports, rejected non-tailnet agent addresses, unavailable metrics, disabled controls, weather success and saved-weather failure.

Deterministic fixtures run in a worker-blocked context because Windows WebKit's worker network path bypasses Playwright route fixtures after reload. Chromium separately verifies worker-controlled offline navigation and complete baseline-to-2.0 cache upgrade without forced reload or data loss. Windows WebKit's offline navigation simulator produced an internal engine error; it is explicitly unverified, not counted as a passing offline check. Verify offline behavior on physical iPad Safari before relying on it exclusively.

Companion tests remain separate:

```powershell
python -m pip install -r companion/requirements.txt
python -m unittest discover -s companion -v
```

Fixtures are test data only. The production app continues to display `—` for unavailable PC sensor readings and has no active control operations.
