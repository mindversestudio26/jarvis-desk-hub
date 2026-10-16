# Jarvis Desk Hub

A dependency-free static dashboard for an iPad 7th Generation, designed around the 1080 × 810 CSS-pixel landscape viewport. No build step, account, API key or paid service is required for the dashboard.

## Install on iPad

1. Open https://mindversestudio26.github.io/jarvis-desk-hub/ in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Open the new **Jarvis** icon while online. Wait for **Offline app ready** in the footer.
4. Rotate to landscape. If rotation is locked, unlock it in Control Center.
5. Enable **Settings → General → Date & Time → Set Automatically** for an accurate device clock. Jarvis always formats time and dates in `Asia/Dubai` (UTC+4), independent of the iPad timezone.

The home-screen app runs without browser chrome. Safari controls orientation; the manifest's landscape preference is advisory. Portrait and phone layouts are also available.

## Features

- Dubai clock/date, computed from the device clock and refreshed on resume.
- Sharjah weather from Open-Meteo every 15 minutes, with 12-second timeout, refresh, error and explicitly labelled saved-weather states. Temperature is Celsius and wind is km/h.
- Add, complete and delete tasks; persistent local storage; JSON backup export and validated merge restore.
- Monthly calendar with Dubai-local events and time. These are local notes, not cloud calendar synchronization or notifications.
- Google Calendar, Outlook, GitHub and YouTube shortcuts.
- Installable offline app shell. Once cached, clock, tasks and local calendar work without the PC or internet. Weather needs internet for fresh data; external shortcuts need their own connection.
- Optional authenticated read-only PC connection with automatic retry every 10 seconds. A successful fresh response means online. An unsuccessful connection means **unreachable**, which cannot distinguish shutdown, sleep, network failure or bad credentials.

Storage is specific to this origin and Safari installation. Data from a different domain/private browsing session does not automatically transfer. The preliminary dashboard's `jarvis_tasks` array is migrated only when it exists on the same origin. Use **Back up ↓** regularly; clearing website data or Safari storage eviction can remove tasks, events and offline files. Backups include your task/event text; keep them private. Restore merges by item ID and replaces matching IDs with the backup item.

## PC companion

See [companion/README.md](companion/README.md). It reports actual CPU and RAM using `psutil`. GPU and temperature are null until a trusted sensor adapter is implemented; the dashboard displays `—`. No synthetic metrics or PC-control operations are implemented. Lock, sleep, shutdown and launch buttons are deliberately disabled.

No companion, scheduled task, firewall rule, Tailscale account or privileged control was installed/activated by this repository. The loopback service is not directly reachable from an iPad. A tailnet HTTPS reverse proxy is required. Read-only credentials are held only in page memory, so pairing is repeated on reload. Background Safari tabs may suspend polling; foregrounding immediately resumes it.

## Local preview and checks

```powershell
python -m http.server 4174 --bind 127.0.0.1
node --check app.js
node --check sw.js
python -m pip install -r companion/requirements.txt
python -m unittest discover -s companion -v
```

Open `http://127.0.0.1:4174`. Service workers require HTTPS or localhost; opening the file directly does not provide full offline behavior. The companion tests use a temporary loopback port and fixture data, not control operations.

## GitHub Pages

Use a clean public repository. This repository contains only Jarvis source, documentation and the optional companion. Do not import Whiskyverse history, assets, secrets, private scan reports or backups. In repository **Settings → Pages**, choose **Deploy from a branch → main → /(root) → Save**. Pages publishes the static files; Python source is downloadable but never runs on Pages. There are no public PC-control endpoints.

Every release changing app shell files must change the `CACHE` version in `sw.js`. The worker pre-caches a complete shell before activation, leaves the existing version running while a tab is open, and activates after old clients close. Close all Jarvis tabs/home-screen windows and reopen to apply an update. Rollback means reverting files in Git and publishing with a **new** cache version.

## Architecture and security decisions

- Static HTML/CSS/JavaScript keeps hosting and availability independent of Windows. No CDN runtime libraries, fonts, analytics or build-chain dependencies.
- Explicit text nodes for user content; validated imports and telemetry; strict CSP without inline scripts or eval.
- External weather is not stored by the service worker. Last known weather is stored separately with an explicit saved timestamp.
- Only `.ts.net` HTTPS origins can receive the read-only pairing token, and redirects are rejected. Actual trust still depends on pairing with your own tailnet host. Never paste your token into another website.
- Companion binds only `127.0.0.1`, checks exact Origin/Host, uses constant-time token comparison, denies write methods, limits authenticated reads and sends no-store responses. A bearer token sent on an Authorization header is not a browser cookie, so it is not attached to cross-site requests automatically.
- Tailscale ACLs should restrict the host's HTTPS service to the iPad. Never use Funnel or router port forwarding. Existing third-party or local malware is outside this app's trust boundary.
- No claim of independent accurate wall-clock synchronization: Dubai formatting uses the device's clock. No public interface can prove a PC is switched off.

Reference repositories consulted for concepts only: local `ai-resources/system-design-primer` (availability, failure isolation, cache-aside) and `ai-resources/public-apis` (API discovery). No unrelated code was copied. The initial assumption that an HTTPS public web app could safely call an HTTP LAN agent was rejected: mixed-content restrictions, private-network permissions and transport security make that unreliable on Safari. Private HTTPS through Tailscale is the supported integration design.

Sources: [Open-Meteo API documentation](https://open-meteo.com/en/docs) and [free non-commercial usage](https://open-meteo.com/en/pricing), [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), [psutil](https://pypi.org/project/psutil/7.2.2/).
