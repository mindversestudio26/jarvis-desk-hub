# Windows controls: implementation and activation

Controls are opt-in. The installed companion and live website are not changed by checking out this branch. The monitoring credential, Tailscale Serve configuration, tailnet access rules, power-on solution and existing startup settings remain unchanged.

## Activation (owner approval required)

Use a normal, non-elevated Windows PowerShell session under the Windows user who owns the companion. No administrator installation is needed. Close any elevated terminal before enabling controls.

1. Review a local JSON allowlist. `companion/windows/apps.example.json` is an example containing Notepad; use `[]` to enable power/session actions without application launch. Each approved entry has `id`, `label`, and an absolute local `.exe` `path`. No arguments, URLs, shell interpreters, network paths or client-supplied executable paths are accepted.
2. From this checkout run:

   ```powershell
   & .\companion\windows\install-controls.ps1 -Enable -AllowlistPath 'C:\path\to\approved-apps.json'
   ```

   This stages and validates the update, creates a separate DPAPI-encrypted control credential if absent, and restarts the existing companion on the same loopback port. It does not rotate the monitoring credential. Private backup files support rollback. No new scheduled task, firewall rule, Tailscale ACL or Serve change is needed.
3. Merge the validated branch into the existing GitHub Pages publishing branch after approval. The service-worker update adds `controls.js` and `controls.css`; existing local tasks, alarms, shifts and preferences retain their keys.
4. Retrieve the control key privately using the installed `share-token.ps1 -Kind Control -Via Window` (or the existing private Taildrop option). Never put it in Git, screenshots, issues or chat. Pair monitoring as before, open **PC → Authorize controls**, enter the separate control key, and confirm the requested action. Launch offers only the configured application labels.
5. Verify from the physical iPad. Initially test authorization and Cancel. Real Lock/Launch and especially Sleep/Restart/Shutdown need an owner-supervised test after saving work. The automated tests do not perform these Windows operations.

Disable controls with `install-controls.ps1 -Disable` from the checkout or installed companion directory. This restarts in monitoring-only mode and retains both encrypted credentials. There is no unattended credential synchronization or iPad background control.

## Protocol and security boundary

The existing `GET /v1/status` remains authenticated with the read-only credential. Control requests require a distinct bearer credential:

- `GET /v1/control`: allowed actions and app IDs/labels, never executable paths.
- `POST /v1/control/challenge`: exact JSON `{action, app_id, request_id}`. `app_id` is empty except for launch. Returns a random one-use challenge bound to that action, app and request ID, valid for 15 seconds.
- `POST /v1/control/execute`: exact JSON `{challenge, request_id}`. Atomic consumption returns HTTP 202 and a queued result. It never retries execution.
- `GET /v1/control/result/<request_id>`: queued, executing, accepted_by_windows or failed. Accepted means Windows accepted the request, not proof that a power transition completed.

The companion binds only to loopback, checks loopback callers, exact Origin and Host, rejects duplicate authorization/origin/host headers and malformed or oversized JSON, and permits only the expected preflight headers/methods. Controls are off by default. Requests, intents and execution have bounded rate limits; only one operation is in flight. Results/request IDs are retained in memory for ten minutes. Restart invalidates all outstanding challenges. Write operations are not accepted with the monitoring token.

The frontend keeps the control credential only in memory, clears it on backgrounding, disconnect, pairing changes or expiry (15 minutes), and never adds it to backup or local storage. Confirmation expires after 15 seconds. If an execution response is lost, the outcome is explicitly unknown and the command is not automatically resent.

Windows operations use fixed native APIs or a fixed shutdown executable; no arbitrary shell command is exposed. Restart/shutdown use `/t 0` without `/f`, avoiding the implicit force-close behavior of a positive timeout. Windows may refuse an operation due to permissions or applications requiring attention. Sleep temporarily enables only a privilege already assigned to the current process, then restores its prior state. Elevated control startup is rejected. Launch rechecks the fixed path at execution and passes no arguments or credentials to the child.

This protects the network/API boundary; it does not protect against malware already running as the same Windows user, a compromised allowed application, a stolen bearer credential, or malicious code on the same allowed GitHub Pages origin. A bearer holder can request new challenges. No control credential is embedded in the public site.

## Verification

`python -m unittest discover -s companion -v` exercises the control state machine, real HTTP authorization/validation, concurrency, replay, expiry, rate limits, allowlist policy and mocked Windows adapters. `node tests/controls.cjs` runs Chromium and WebKit against an isolated real HTTP companion with an injected harmless executor. It checks separate authorization, confirmations, cancellation, duplicate clicks, allowlisted launch, lost-response handling and disconnect clearing. No real Windows action runs in these tests.

Existing unit, browser, console and read-only integration suites cover monitoring, clocks, calendar, local persistence, offline/update behavior and layout. Physical iPad Safari, real private HTTPS control commands and actual power transitions remain activation-time checks. Windows WebKit is useful compatibility evidence, not a physical iPad performance measurement.

## Implementation references

- [Microsoft LockWorkStation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-lockworkstation): asynchronous request and interactive-desktop limitation.
- [Microsoft SetSuspendState](https://learn.microsoft.com/en-us/windows/win32/api/powrprof/nf-powrprof-setsuspendstate): sleep and privilege requirements.
- [Microsoft shutdown](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/shutdown): timeout/force semantics.
- [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve): existing private HTTPS reverse proxy; Funnel is not used.
- Local system-design-primer reference: bounded asynchronous work and explicit completion states, without adding a queue dependency.

## Validation record (2026-10-17)

- 55 Python tests passed (monitoring, control protocol/security and mocked Windows native APIs).
- 52 JavaScript unit tests passed.
- Chromium and WebKit control integration passed against real HTTP with a harmless executor: separate credential, cancel, double-click, launch allowlist, lost response/no retry, background cancellation and disconnect.
- Existing browser regression: 7 groups passed, including three service-worker migration baselines and Chromium offline reload.
- Existing console regression: both engines passed at five viewport sizes; 1080 × 810 PC screenshots inspected. No landscape page overflow.
- Existing feature regression: 12 groups passed (alarms, shifts, quotes, location, welcome and bundled roster).
- Existing read-only integration passed with real CPU/RAM/GPU samples and auth/disconnect states.
- All 11 isolated installer mock scenarios passed, including failed initial stop, failed capability verification and rollback. PowerShell parsing passed. Actual installer execution and physical iPad control pairing remain pending approval.
- No credentials generated/read, live controls activated, tailnet rules changed, or real Windows actions performed for this implementation.

The changes add only small static frontend files and use the existing monitoring cadence; no extra permanent polling runs for controls. Result polling is bounded to five reads per command. No physical iPad frame-rate measurement was performed.
