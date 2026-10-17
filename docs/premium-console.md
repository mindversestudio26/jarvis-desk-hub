# IMANE 3.3 — premium three-screen console

## Assessment and design choices

The old single-screen layout gave the decorative central dial more area than time, weather and planning. Small peripheral labels competed for attention. The new console separates Home, Windows and Planner while retaining the existing application, dialogs, domain engines and all stored-data schemas.

Material rules: matte graphite frame, recessed black clock/quote displays, a single upper-left light direction, thin champagne edges, subdued teal for verified state, and inset feedback on presses. Existing gold Shepherd assets are reused. No image regeneration, WebGL, backdrop blur or new runtime package is introduced.

Home has two large mechanical clocks, two contextual instruments and a bilingual quote plaque. The secondary agenda scrolls within its allotted space if populated. The familiar dock stays reachable. Portrait and phone sizes flow vertically rather than shrink controls. Planner Dual means a BS month with Gregorian correspondence on each date; Gregorian mode navigates Gregorian months. Events retain their existing Dubai time convention and ISO keys; shifts retain their own zones.

## Research and adaptation

- Read-only inspection of ScanMadira `lib/core/widgets/materials.dart` and `glass.dart`: adapted static fine texture, raised/inset surface separation, contact shadows and pressed feedback. No ScanMadira files or code were changed/copied.
- Local Penpot `frontend/resources/styles/common/refactor/design-tokens.scss`: consistent semantic surface and state colours.
- [Home Assistant views](https://www.home-assistant.io/dashboards/views/): separate purposeful views; rejected a dense widget wall.
- [DAKboard](https://dakboard.com/site): glanceable time/weather/agenda hierarchy; no service dependency.
- [Touch Portal](https://www.touch-portal.com/): distinct action deck with clear availability; no unsupported remote-control claims.
- [Grafana dashboard practice](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/): signal-appropriate cadence and genuine sample history; no simulated telemetry.
- Calendar source, licence, pinned revision and independent date anchors are documented in [calendar-sources.md](calendar-sources.md).

## Architecture and maintenance

`console.js` loads after `app.js` and moves its existing DOM nodes without cloning IDs. Its deliberate integration boundary is the existing state, shiftStore, selected/viewYear/viewMonth and renderCalendar/openPanel functions. Existing dialog handlers remain the only persistence editors. `JangeConsole.refresh()` refreshes summaries; identical calendar content is not rebuilt, preserving focus. Navigation adds only `jange.console.page.v1`, which stores a page name. No existing schema is migrated.

`vendor/bs-data.js` then `nepali-calendar.js` must load before `console.js`. All are precached. BS support is explicitly limited to 2000–2083 (1943-04-14 through 2027-04-13 AD); out-of-range dates are not guessed. No holiday/festival dataset is bundled.

Quotes use `forHour(DubaiISODate, DubaiHour)`, a deterministic 60-entry cycle. The existing clock lifecycle selects the correct entry after wake. The old `forDay()` API is retained for compatibility. Quotes have recorded sources in `quotes.js`.

The deployed companion remains read-only. The five PC controls are visibly unavailable and disabled. Neither the PC power-on solution, token, tailnet rules, backend nor installed companion is modified.

## Performance budget and limits

No continuous decorative animation; only changed flip digits, brief page transitions and hourly quote fades animate. Transitions use transform/opacity and respect reduced motion and Calm mode. Hidden pages are inert; the console minute timer stops when hidden. Existing clock/weather/PC cadences remain intact. The calendar data is local and has no network activity.

Budget: no new framework, no WebGL/canvas rendering loop, no new image download, added uncompressed shell source under 60 KB, 44 px active controls at tested widths. Calendar DOM is rebuilt only when date, selection, mode or planner data changes. Large user text can flow/scroll rather than be silently truncated.

Desktop Chromium and Windows WebKit are compatibility evidence, not measurements of iPad A10 battery use or real iPad frame rate. Physical iPad Safari pairing, battery endurance and background suspension still require device observation. Safari web alarms remain supplementary and cannot be guaranteed while backgrounded or closed.

## Release authorization

The original brief requested development-only publication. The owner subsequently explicitly asked to deploy tested work in progress to the live site. Release 660c924 delivered hourly quotes first; the three-screen release follows after regression and adversarial review. Tailnet access rules remain unchanged.

## Recorded verification (2026-10-17)

- Pure Node tests: 52 passed, including exhaustive BS round trips and independent fixed anchors.
- Chromium and WebKit browser regressions: 7 groups passed (two general, two split-flap, three Chromium cache-upgrade baselines).
- Feature suite: 12 engine/suite combinations passed (alarms, shifts, hourly midnight quote, location, welcome, bundled roster).
- Console suite: both engines passed; five sizes × three pages, six-row calendar, focus retention, range limit, hourly reload/wake, date identity, remembered navigation and swipe exclusions.
- Isolated real read-only companion: CPU/RAM/GPU/temperature/uptime, bad-token rejection and disconnect clearing passed. No real lock or power operations were invoked.
- Sample desktop Chromium idle observation: 0 running animations, 1.9 MB JS heap, 12 ms task work over 10 s, 42,810 bytes added shell source at the time of measurement. This is not an iPad frame-rate/battery benchmark.
- Windows WebKit offline reload remains unverified because of the previously observed internal engine issue; Chromium offline and three cache-upgrade paths passed. Physical iPad testing remains an owner-device check.

## Independent review

The code reviewer used adversarial perspectives for failure handling, maintainability and security. The remaining medium issue was focus loss when a selected calendar date was replaced while its agenda dialog was open. The console now records that date and restores focus to the replacement on close; a Chromium/WebKit regression selects a different date and verifies restoration. Calendar refresh caching, own-zone shift filtering, range boundaries and Calm mode were also corrected before release.

A separate security review found no new injection sinks, credential persistence, control activation, CSP relaxation or tailnet authentication changes. The frontend continues to use textContent for saved user content. These findings do not constitute a new backend or physical-device audit.

## Tactile instruments update — 17 October 2026

Published incrementally at the owner's request. First milestone adds local SVG UAE/Nepal flags, a seconds subdial driven by the existing clock tick, and a Nepali-only date inside the Kathmandu clock (the existing Gregorian update target remains hidden for compatibility).

The second milestone restores the original live IMANE core between weather and shifts. The original task interaction, status and data targets remain intact. Static graphite gradients, champagne bevels, recessed clock faces, raised dock keys and pressed calendar cells provide physical depth without animated blur or WebGL. Core rings pause outside Home and when hidden; Calm and Reduce Motion stop decorative motion, including the busy avatar pulse.

Touch navigation follows horizontal drags using one CSSOM transform per animation frame, direction locking, distance/velocity completion and a spring-back on cancellation. Buttons, controls, dialogs, calendar and nested scroll containers are excluded. Multitouch, backgrounding and navigation reset the gesture; trailing clicks are suppressed. Vertical scrolling and keyboard navigation remain available.

Verification: Chromium and WebKit console layouts across five sizes, dedicated swipe/motion/CSP checks, existing browser clock/persistence/offline update regressions and harmless control integration. Screenshots inspected at 1080 × 810. Physical iPad feel/frame rate still requires on-device use. Windows companion, credentials and Tailscale rules are unchanged by this visual update.
