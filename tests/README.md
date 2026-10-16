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

The runner starts and stops its own loopback-only static server. Run from a complete Git checkout because the cache-upgrade test reads the installed 2.0 files (`9ddff13`) from Git. It writes fixture-only JSON backups, screenshots and results to ignored `test-results/`, or the directory in `JARVIS_TEST_OUTPUT`. `JARVIS_BASE_URL` optionally runs the functional/layout checks against a deployed URL; the old-worker upgrade scenario always uses the local server.

Both engines test 1080×810, 1080×740, 1024×768, 810×1080 and 375×812: no horizontal overflow, no vertical scrolling for the landscape desk at 1024 pixels wide and above, 44-pixel minimum touch targets (dock, core, calendar, refresh, pair, panel close), reduced motion, clocks and 24-hour dial markers across midnight/month rollover and background/resume, old task/event storage, core focus text and completion ring, task completion and safe rendering, today peek and week strip, month navigation, version-2 backup export/restore (no preference leakage), malformed imports, persisted motion preference, rejected non-tailnet companion addresses, unavailable metrics, disabled controls, weather daily fields, saved-weather failure and the offline core state. Chromium also pairs with a route-mocked companion (fixture token only) to verify live gauges, null sensors staying "—", unreachable clearing and disconnect.

The split-flap suite runs with motion enabled in both engines: 09:59 → 10:00 (all four Dubai tiles flip, one Kathmandu tile), Kathmandu midnight, Dubai midnight with date change, old lower halves held until the leaf lands, clean settle with no visible leaves, snap after two hours in the background, 12-hour mode with blank leading flap, AM/PM and persistence, and no flips under Reduce Motion.

Deterministic fixtures run in a worker-blocked context because Windows WebKit's worker network path bypasses Playwright route fixtures after reload. Chromium separately verifies worker-controlled offline navigation (including the self-hosted font) and a complete 2.0-to-3.0 cache upgrade without forced reload or data loss, reading the 2.0 weather cache. Windows WebKit's offline navigation simulator produced an internal engine error; it is explicitly unverified, not counted as a passing offline check. Windows WebKit also composites in software, so its frame rate is not an iPad proxy. Verify offline behavior and animation smoothness on the physical iPad.

Companion tests remain separate:

```powershell
python -m pip install -r companion/requirements.txt
python -m unittest discover -s companion -v
```

Fixtures are test data only. The production app continues to display `—` for unavailable PC sensor readings and has no active control operations.
