# Regression checks

No test tooling is shipped to the frontend. Node's built-in test runner covers the pure modules:

```powershell
node --test tests/clocks.test.cjs tests/alarms.test.cjs tests/shifts.test.cjs tests/quotes.test.cjs
```

- `clocks` (8): both midnights, the 1 h 45 min offset, New Year, leap day, seconds padding.
- `alarms` (16): Dubai/Kathmandu conversion (including the previous UTC day), once/weekday/weekend/custom repeats judged in the alarm zone, week wrap, grace vs missed, snooze (also missed when it ended while asleep), edit anchoring, validation, iCalendar export.
- `shifts` (11): start − preparation − commute, alarms moving to the previous day, off/holiday/travel never ring, no guessing a missing start, duplicates, overrides, Kathmandu-zone shifts, date-specific single ring, roster .ics parsing (TZID, UTC, floating, all-day, unsupported zone, repeating), re-import merge keeping overrides.
- `quotes` (4): every entry has text, author, Nepali meaning and source; no duplicates; no repeat within the collection; neighbouring days never share an author.

For browser tests, install official Playwright into a separate developer environment and install its Chromium and WebKit engines. Make its package available through `JARVIS_PLAYWRIGHT` (absolute package directory) or normal Node resolution. Set `JARVIS_CHROME_CHANNEL=chrome` to use installed Chrome; otherwise Playwright's Chromium is used.

```powershell
node tests/browser.cjs
```

The runner starts and stops its own loopback-only static server. Run from a complete Git checkout because the cache-upgrade tests read the installed 2.0 (`9ddff13`) and 3.0 (`4d91835`) files from Git. It writes fixture-only JSON backups, screenshots and results to ignored `test-results/`, or the directory in `JARVIS_TEST_OUTPUT`. `JARVIS_BASE_URL` optionally runs the functional/layout checks against a deployed URL; the old-worker upgrade scenario always uses the local server.

Both engines test 1080×810, 1080×740, 1024×768, 810×1080 and 375×812: no horizontal overflow, no vertical scrolling for the landscape desk at 1024 pixels wide and above, 44-pixel minimum touch targets (dock, core, calendar, refresh, pair, panel close), reduced motion, clocks and 24-hour dial markers across midnight/month rollover and background/resume, old task/event storage, core focus text and completion ring, task completion and safe rendering, today peek and week strip, month navigation, version-2 backup export/restore (no preference leakage), malformed imports, persisted motion preference, rejected non-tailnet companion addresses, unavailable metrics, disabled controls, weather daily fields, saved-weather failure and the offline core state. Chromium also pairs with a route-mocked companion (fixture token only) to verify live gauges, null sensors staying "—", unreachable clearing and disconnect.

The split-flap suite runs with motion enabled in both engines: 09:59 → 10:00 (all four Dubai tiles flip, one Kathmandu tile), Kathmandu midnight, Dubai midnight with date change, old lower halves held until the leaf lands, clean settle with no visible leaves, snap after two hours in the background, 12-hour mode with blank leading flap, AM/PM and persistence, and no flips under Reduce Motion.

Deterministic fixtures run in a worker-blocked context because Windows WebKit's worker network path bypasses Playwright route fixtures after reload. Chromium separately verifies worker-controlled offline navigation (including the self-hosted font) and a complete 2.0-to-3.0 cache upgrade without forced reload or data loss, reading the 2.0 weather cache. Windows WebKit's offline navigation simulator produced an internal engine error; it is explicitly unverified, not counted as a passing offline check. Windows WebKit also composites in software, so its frame rate is not an iPad proxy. Verify offline behavior and animation smoothness on the physical iPad.

`node tests/features.cjs` runs the 3.1 features in Chromium and WebKit with a controlled clock: the bundled roster on a fresh install (desk lines, 04:30 alarm, past alarm silent, applied once; the other tests block `roster.js` so they start empty), manual alarms (ring at the zone time, snooze, re-ring, dismiss, Kathmandu weekday repeat, calendar export, missed after background, reload persistence, audio unlock in Chromium), shift alarms (calculated time, both-zone display, no guessing, roster import report, override kept on re-import, commute recalculation, custom time, duplicate covered by a manual alarm with a single ring), the quote (three parts only, rollover at Dubai midnight), location (granted with rounded coordinates only, no prompt without a tap, refusal explained, manual city, persistence, offline saved reading) and the welcome (non-blocking, skipped under Reduce Motion).

`node tests/companion-integration.cjs` starts the unchanged `companion/agent.py` (Python with psutil via `JARVIS_PYTHON`) on loopback and checks the frontend against it: warming up, connected with real CPU/RAM, a wrong token giving Authentication required, and Unreachable after the companion stops. Playwright stands in for Tailscale Serve by forwarding the tailnet host to loopback with the exact allowed Origin; a random token is generated per run.

Companion unit tests remain separate:

```powershell
python -m pip install -r companion/requirements.txt
python -m unittest discover -s companion -v
```

Fixtures are test data only. The production app continues to display `—` for unavailable PC sensor readings and enables control operations only after separate companion activation and authorization.

## Three-screen console verification

`node tests/console.cjs` exercises Chromium and WebKit: hourly rollover and foreground recovery, remembered page, keyboard and swipe exclusions, BS/Gregorian date identity, calendar range and focus, six-row months, 44px targets and screenshots at 1080×810, 1080×740, 1024×768, portrait and phone widths. Screenshots and JSON results are written under ignored `test-results/`.

The browser suite upgrades installed 2.0, 3.0 and hourly-quote releases to the current service-worker cache, preserving data. The companion suite starts an isolated read-only instance with a random in-memory test token and proxies the test tailnet URL; it does not activate controls or reconfigure the deployed companion.

## Opt-in Windows controls

See docs/windows-controls.md. Run node tests/controls.cjs for Chromium/WebKit with an isolated real HTTP companion and harmless injected executor. Python discovery includes control security and mocked native-adapter tests. Never substitute a live Windows executor in these fixtures.
