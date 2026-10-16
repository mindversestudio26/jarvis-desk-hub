# JANGE · जङ्गे — personal desk assistant (3.1)

JANGE is a dependency-free static desk interface for an iPad 7th Generation, designed as a fixed 1080 × 810 CSS-pixel landscape canvas. It is named after the family's German Shepherd; its emblem honours him through the breed (see [brand/README.md](brand/README.md)). The repository, URL, storage keys and cache names keep their original `jarvis` identifiers so existing installs and data carry over. No build step, account, API key or paid service is required.

## Install on iPad

1. Open https://mindversestudio26.github.io/jarvis-desk-hub/ in **Safari**.
2. Tap **Share → Add to Home Screen → Add**. If an older "Jarvis" icon exists, remove it and add JANGE again to get the new name and icon.
3. Open **JANGE** while online. Wait for the **Offline app ready** chip under the wordmark.
4. Rotate to landscape. If rotation is locked, unlock it in Control Center.
5. Enable **Settings → General → Date & Time → Set Automatically**. Both clocks use the device clock: `Asia/Dubai` (UTC+04:00) and `Asia/Kathmandu` (UTC+05:45), whatever the iPad's own zone or location.
6. For a desk display: Settings → Display & Brightness → Auto-Lock → Never, or turn on **Keep the screen awake** in JANGE settings. Tap the screen once after opening JANGE so alarm sound is allowed.

## Features

- **Split-flap clocks** for Dubai and Kathmandu in the crown band, always visible: matte graphite tiles with a split, brass hinge pins and shaded 3D leaves. A digit flips only when it changes (minutes first), snaps to the right time after Safari resumes, and supports 24- or 12-hour display. Each clock shows its next alarm (with the shift it belongs to).
- **JANGE core**: a watch-like 24-hour dial (noon at the top) with Dubai/Kathmandu markers, alarm markers, the daylight arc for the weather location, a seconds needle and a focus ring; the German Shepherd emblem is the assistant avatar and its state follows real conditions only (online, acquiring data, offline, PC link unavailable). Tap the core for focus tasks.
- **Daily quote** under the core: one documented quotation per Dubai day with its author and Nepali meaning, from an offline collection of 60 with recorded sources; it changes at Dubai midnight and does not repeat for 60 days.
- **Weather where you are**: Open-Meteo weather for the iPad's location when you allow it (rounded to about 5 km, read on open/foreground only, never tracked), a chosen city otherwise, Sharjah by default. Temperature, feels-like, humidity, wind, high/low, sunrise/sunset, UV; saved readings are labelled when offline.
- **Alarms** (supplementary, not a guaranteed wake-up): once, daily, weekdays, weekends or custom days in Dubai or Kathmandu time; synthesised chimes, full-screen ringing with Snooze and Dismiss, missed-alarm reporting, reload/foreground recovery, Add to Calendar (.ics) for important ones. They ring only while JANGE is open in front with the screen on — keep important alarms on your iPhone.
- **Shift-aware alarms**: enter shifts or import the roster calendar (.ics); each working shift gets an alarm at start − preparation − commute, days off/holidays/travel never ring, missing start times are never guessed, duplicates collapse, per-shift overrides survive re-imports.
- **Workstation (Windows PC)**: Connected / Warming up / Authentication required / Unreachable / Not paired; CPU, GPU and RAM gauges, temperature and uptime only from real companion samples ("N/A", "No sensor", "Not reported" otherwise); Lock, Sleep, Restart, Shut down and Launch shown but disabled until a secure control backend exists.
- Focus tasks, a local calendar (Dubai time) with a today peek, your roster in large type (today — including days off and holidays — tomorrow and the next shift) and a week strip, live system checks, and a command dock (Focus, Calendar, Alarms, Google Calendar, Outlook, GitHub, YouTube, Backup, Settings).
- Motion: **Cinematic** or **Calm**; iPad **Reduce Motion** removes all animation including the welcome and flips.
- Installable offline app shell: clocks, quote, tasks, calendar, alarms and shifts work without internet or the PC.

Storage is specific to this origin and Safari installation. Data from a different domain/private browsing session does not automatically transfer. The preliminary dashboard's `jarvis_tasks` array is migrated only when it exists on the same origin. Use **Back up ↓** regularly; clearing website data or Safari storage eviction can remove tasks, events and offline files. Backups include tasks, events, alarms and the shift plan; keep them private. Restore merges by item ID and replaces matching IDs with the backup item.

## PC companion

See [companion/README.md](companion/README.md). It reports actual CPU and RAM using `psutil`, plus NVIDIA GPU load and GPU temperature from `nvidia-smi` when present (otherwise null, shown as N/A / No sensor), and uptime. `companion/windows/` installs it for the current user with a DPAPI-encrypted token and publishes it to the tailnet with Tailscale Serve. No synthetic metrics or PC-control operations are implemented. Lock, sleep, shutdown and launch buttons are deliberately disabled.

No companion, scheduled task, firewall rule, Tailscale account or privileged control was installed/activated by this repository. The loopback service is not directly reachable from an iPad. A tailnet HTTPS reverse proxy is required. Read-only credentials are held only in page memory, so pairing is repeated on reload. Background Safari tabs may suspend polling; foregrounding immediately resumes it.

## Local preview and checks

```powershell
python -m http.server 4174 --bind 127.0.0.1
node --check app.js
node --test tests/clocks.test.cjs tests/alarms.test.cjs tests/shifts.test.cjs tests/quotes.test.cjs
node tests/browser.cjs
node tests/features.cjs
node tests/companion-integration.cjs
python -m pip install -r companion/requirements.txt
python -m unittest discover -s companion -v
```

Open `http://127.0.0.1:4174`. Service workers require HTTPS or localhost; opening the file directly does not provide full offline behavior. The companion tests use a temporary loopback port and fixture data, not control operations. Browser suites need Playwright installed separately (see tests/README.md); the companion integration test needs Python with psutil (`JARVIS_PYTHON`).

## GitHub Pages

Use a clean public repository. This repository contains only Jarvis source, documentation and the optional companion. Do not import Whiskyverse history, assets, secrets, private scan reports or backups. In repository **Settings → Pages**, choose **Deploy from a branch → main → /(root) → Save**. Pages publishes the static files; Python source is downloadable but never runs on Pages. There are no public PC-control endpoints.

Every release changing app shell files must change the `CACHE` version in `sw.js`. The worker pre-caches a complete shell before activation, leaves the existing version running while a tab is open, and activates after old clients close. Close all JANGE/Jarvis tabs and home-screen windows and reopen to apply an update. Rollback means reverting files in Git and publishing with a **new** cache version.

## Architecture and security decisions

- Static HTML/CSS/JavaScript keeps hosting and availability independent of Windows. No CDN runtime libraries, fonts, analytics or build-chain dependencies.
- Explicit text nodes for user content; validated imports and telemetry; strict CSP without inline scripts or eval.
- External weather is not stored by the service worker. Last known weather is stored separately with an explicit saved timestamp and the rounded place.
- Location: requested only after a tap, re-read on open/foreground; device coordinates are rounded to 0.05° (about 5 km) before any weather request or storage, and to 0.1° for the reverse-geocoding place name (BigDataCloud also sees the request IP, like any web request). Manual cities use public city coordinates. CSP `connect-src` allows exactly Open-Meteo (forecast and geocoding), BigDataCloud's client reverse geocoder and `*.ts.net`.
- Only `.ts.net` HTTPS origins can receive the read-only pairing token, and redirects are rejected. Actual trust still depends on pairing with your own tailnet host. Never paste your token into another website.
- Companion binds only `127.0.0.1`, checks exact Origin/Host, uses constant-time token comparison, denies write methods, limits authenticated reads and sends no-store responses. A bearer token sent on an Authorization header is not a browser cookie, so it is not attached to cross-site requests automatically.
- Tailscale ACLs should restrict the host's HTTPS service to the iPad. Never use Funnel or router port forwarding. Existing third-party or local malware is outside this app's trust boundary.
- No claim of independent accurate wall-clock synchronization: Dubai formatting uses the device's clock. No public interface can prove a PC is switched off.

Reference repositories consulted for concepts only: local `ai-resources/system-design-primer` (availability, failure isolation, cache-aside), `ai-resources/public-apis` (API discovery), `ai-resources/penpot` (design tokens; switch, segmented, notification accessibility patterns) and the ui-ux-pro-max skill data (dark luxury palettes, alarm and toggle guidelines). No unrelated code was copied. The initial assumption that an HTTPS public web app could safely call an HTTP LAN agent was rejected: mixed-content restrictions, private-network permissions and transport security make that unreliable on Safari. Private HTTPS through Tailscale is the supported integration design.

Sources: [Open-Meteo API documentation](https://open-meteo.com/en/docs) and [free non-commercial usage](https://open-meteo.com/en/pricing), [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), [psutil](https://pypi.org/project/psutil/7.2.2/), [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api), [BigDataCloud reverse geocoding (client)](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api), [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).


## JANGE 3.1 verification and updates

Unchanged: the `jarvis.desk.v2` key and schema, the legacy `jarvis_tasks` migration, `jarvis.weather.v1` (now also storing the rounded place), the version-2 backup format (3.1 adds optional `alarms` and `shiftPlan`; older backups restore unchanged). New keys: `jarvis.alarms.v1`, `jarvis.shifts.v1`; preferences (motion, clock format, wake lock, weather location) stay in `jarvis.prefs.v1` and are not backed up. The shell cache is `jarvis-desk-v3.2.0`; it adds `alarms.js`, `shifts.js`, `quotes.js`, Cormorant Garamond and the new icons. Close every JANGE/Jarvis window and reopen online to activate 3.2; do not clear website data.

Design notes: [docs/jange-3.1-design.md](docs/jange-3.1-design.md) (alarms, shifts and the future backend contract, quote sourcing, location privacy, PC states) and [brand/README.md](brand/README.md). Tests: [tests/README.md](tests/README.md).

Not verifiable from this PC: animation smoothness and Safari behaviour on the physical iPad 7 (Windows WebKit composites in software and its offline simulator fails), real Web Audio output on iPadOS, the iPadOS geolocation prompt, and home-screen icon rendering on the device.
## Jarvis 3.0 verification and updates

The `jarvis.desk.v2` storage key, task/event schema, legacy `jarvis_tasks` migration, `jarvis.weather.v1` cache and version-2 JSON backup format are unchanged. Display preferences (motion, 12/24-hour) live in a separate `jarvis.prefs.v1` key and are not part of backups. No data-clearing migration is performed. The shell cache is `jarvis-desk-v3.0.0` and adds the self-hosted Michroma display font (SIL Open Font License, `fonts/OFL.txt`). Existing open windows stay on the old complete shell until closed. Close all Jarvis Safari tabs and the home-screen app, then reopen online to activate 3.0; do not clear website data.

See [3.0 design decisions](docs/jarvis-3-design.md) and [regression test instructions](tests/README.md). The landscape desk fits 1080 × 810, 1080 × 740 (Safari with toolbars) and 1024 × 768 without scrolling; on shorter screens the agenda list clips rather than the page scrolling. Portrait and phone layouts scroll.

Windows Playwright WebKit reports an internal engine error for simulated service-worker offline navigation, and it composites in software, so its frame rate is not representative of an iPad. Chromium verifies offline reload and the upgrade from the installed 2.0 build (`9ddff13`); both Chromium and WebKit verify clocks, split-flap transitions, rollover/resume, persistence, backup restore, weather states, touch targets and layout. Physical iPadOS 18.7.3 frame rate, Safari offline behaviour and private companion pairing remain device checks.
