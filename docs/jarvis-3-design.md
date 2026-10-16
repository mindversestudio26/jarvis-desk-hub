# Jarvis 3.0 — design critique and decisions

## Why 1.0 and 2.0 were rejected

Baseline inspected: `9ddff13` (2.0, live on GitHub Pages).

1. **Everything was a card.** Nine rounded rectangles of equal weight in a 3 × 3 grid. Equal treatment means no focal point; the eye has nowhere to land, which is exactly the look of a generic SaaS dashboard.
2. **No centre of gravity.** A command centre is radial: one subject, with information arranged around it. 2.0 had a reading order, not a spatial hierarchy.
3. **Static by policy.** 2.0 banned continuous motion outright. That removed jank risk but also any sense of a live system. The right constraint is *which* properties animate (transform, opacity on their own layers), not whether anything moves.
4. **Status was text, not state.** "Not connected", "Network available" and the saved-weather state were small pills; nothing about the interface itself changed when the system's state changed.
5. **Clocks were ordinary numbers in boxes**, even though the clocks are what the desk is glanced at most.

## Direction

A fixed landscape canvas, not a scrolling page: top bar, three columns (left wing, core, right wing) and a command dock.

- **Core (centre).** A 24-hour dial with noon at the top and Dubai and Kathmandu markers, so the 1 h 45 min offset is visible as an angle. The arcs show today's Sharjah daylight (from the weather feed) and Dubai day progress. A seconds bezel and a focus ring show completed/total tasks. The centre holds a status word derived only from real checks, plus the first open task. Tapping the core opens the tasks.
- **Wings.** Open "holographic" readouts: corner brackets, a light wash and an inner edge facing the core. They have no boxed borders, so the composition reads as callouts around the core rather than tiles. Left (context): Dubai clock, Sharjah weather, today's agenda and week strip. Right (machine): Kathmandu clock, workstation telemetry, live system checks. Bus lines join each wing to its link arc on the core.
- **Dock.** A tapered console for the eight commands. Tasks, calendar and settings open as modal panels, so the canvas never reflows.
- **Palette.** Near-black navy base. Cyan marks Dubai and the primary system. Electric blue marks Kathmandu and the PC link. Amber is reserved for daylight and attention (offline, stale, unreachable). Michroma (self-hosted, OFL) carries labels; SF Pro carries numerals and body text on iPad.

## Motion that means something

| Motion | Trigger | Off when |
|---|---|---|
| Outer segmented ring rotates | network online | offline (the core goes still and turns amber) |
| Inner ring rotates faster | PC companion delivering fresh samples | unpaired / unreachable |
| Scan sweep | weather fetch or PC linking in progress | idle |
| Link arc flash | a weather or telemetry sample arrives | — |
| Ripple through core | a task is added or completed | — |
| Seconds bezel tick | every second (information) | never, except Reduce Motion |
| Split-flap leaf | that digit changed | Reduce Motion (digits change in place) |

**Calm** mode keeps information motion only: the seconds bezel, the flips and the flashes. iPad **Reduce Motion** removes all animation. While the page is hidden, every animation is paused and the clock timer stops; on resume the clocks snap to the current time.

## Split-flap clocks

Each tile has two static halves and two leaves. The upper half shows the new digit and the lower half keeps the old digit until the new leaf lands. The old upper leaf falls on `rotateX(0 → −90°)` from the hinge line (300 ms, ease-in). The new lower leaf lands on `rotateX(90° → 0)` with a small 7° rebound (440 ms). The leaves are shaded and the halves beneath them darken and recover, all with opacity on the compositor. Leaves are hidden unless that digit is flipping. The static halves only ever hold settled glyphs. An interrupted flip settles first. A lost `animationend` falls back to a timer. Together these mean two numerals never overlap. Tiles flip minutes-first with a 40 ms stagger. In 12-hour mode the leading tile is a blank flap, and AM/PM sits on it as on classic flip clocks. A visually hidden `<time>` keeps the time readable for VoiceOver.

## Performance budget (iPad 7th generation)

- Continuous animation is limited to `transform` and `opacity` on a few dedicated layers: two rings, the glow, the seconds hand and, while busy, the sweep. The seconds hand is a 6 px element rotating about its base, not a full-size layer.
- There are no `backdrop-filter`, CSS filters, animated shadows, WebGL, canvas loops or per-frame JavaScript. The JavaScript runs once per second for the clocks, once per minute for the dial, and on data events.
- Glows are pre-baked radial gradients. The reference grid is a static gradient layer; an earlier `mask-image` version cost extra compositing in WebKit and was removed. Status dots no longer blink.
- Measured in Chromium with 4× CPU throttling at 2× DPR: 60 fps with p95 frame time 16.8 ms and no frame over 50 ms; about 7 % main-thread time; about 38 MB of compositor layers; a 1.4 MB JS heap. Windows Playwright WebKit composites in software (a blank page reaches only 40 fps), so its 6 fps figure reflects that port rather than the design. Real Safari frame rate must be confirmed on the device. Calm mode is the fallback if it falls short.

## References consulted (concepts only, nothing copied)

- **Penpot** (`ai-resources/penpot`): three-tier tokens (primitive → semantic → component) and uppercase headline roles. Adopted as primitive/semantic CSS custom properties and uppercase display labels. Penpot has no motion tokens and no reduced-motion handling; those were designed here.
- **system-design-primer**: availability over freshness, cache-aside with labelled staleness, and failure isolation. Adopted: the companion is never in the critical path, and weather shows a clearly labelled saved reading. Its exponential backoff advice was considered for companion polling. The documented 10-second retry was kept so a waking PC reappears promptly.
- **awesome** lists (web animation, SVG, offline-first, performance budget): pointers only; no libraries were added.
- **Fliqlo and classic split-flap clocks**: the visual idiom only. Tiles, glyphs and motion were drawn from scratch in CSS. The Iron Man HUD language (concentric telemetry, radial callouts) inspired the layout; no film assets were used.

## Honesty constraints kept

There is no fake AI, voice or "analysis" copy. The core's status is computed from network, storage, weather-feed and companion state. Telemetry shows only validated samples from the authenticated read-only companion. GPU and temperature stay "—" because the companion reports null. Telemetry and the CPU history clear on failure. PC controls remain disabled.
