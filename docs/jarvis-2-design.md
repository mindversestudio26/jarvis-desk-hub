# Jarvis 2.0 — design critique and decisions

## Baseline critique, before implementation

Baseline inspected: `d0851b9b8ab43c22f1c8e9269cad6ba2200216a0`.

1. The single oversized Dubai clock takes two columns, leaving the calendar, tasks and PC sections competing for depth. Adding a second large card to that layout would increase scrolling rather than improve the desk.
2. Compact breakpoints shrink calendar cells to 30 pixels tall. This saves space at the cost of reliable touch interaction. Event inputs embedded below the grid make card height unpredictable.
3. Header copy, broad empty areas and PC sensor tiles create uneven density. Large shells with small text feel sparse without creating clear priorities.
4. Identical card treatments give every section equal emphasis. Cyan, purple, typography and surface depth can provide useful hierarchy without expensive rendering.
5. One-second `Intl` construction and interval-based ticking are unnecessary. Two clocks must share one instant while still having independent dates and correct quarter-hour offset handling.

## Implemented direction

Two prominent city panels form the first row with compact weather. Cyan identifies Dubai; lavender identifies Kathmandu. Both show explicit IANA zones, UTC offsets and full dates. Static radial backgrounds and translucent layered surfaces provide ambient depth; there is no animated lighting or backdrop blur. System fonts and tabular digits avoid font downloads and shifting clock widths.

The next row groups focus tasks, the calendar and the workstation. The calendar receives slightly more width so its dates stay at least 44 × 44 pixels at tested widths. Event editing moves to a native modal dialog with visible close control, linked heading, labelled inputs and keyboard Escape support. Dates and day summary both open the agenda. A horizontal launchpad finishes the landscape layout. Smaller widths reflow naturally; extra content and larger text scroll rather than being clipped.

Only a brief opacity/5-pixel translation entrance and short interaction transitions are used. `prefers-reduced-motion` disables both. There is no continuous animation, GPU filter, new image download, chart library or frontend dependency.

## Clock and data architecture

`clocks.js` caches timezone formatters and projects one input instant into Dubai and Kathmandu snapshots. The app samples one `Date` per tick, aligns its next timeout to the next second, stops scheduling when hidden and resamples immediately on foreground or pageshow. It does not increment displayed counters, so suspension and device-clock corrections do not accumulate drift. Independent city dates roll over correctly; the Dubai calendar follows today across month changes only when the user had today selected.

The device remains the source of wall-clock truth; automatic system date/time should be enabled. Clock formatting does not depend on network weather or a running Windows PC.

No task/event storage schema, key, backup format, credential handling, metric validation, companion endpoint or PC authorization behavior changed. The new shell has a new cache version and adds the clock file to atomic pre-caching; it retains the existing wait-for-closed-clients update policy. A regression installs the baseline worker, stores data, updates, closes the old client and checks new offline behavior and preserved data.

## References consulted

Local `D:\Android Project\ai-resources\penpot` README: design tokens and CSS Grid/Flex as a shared design/implementation language. Local `system-design-primer` README: availability and cache/failure isolation. Concepts only; no source code, branding or unrelated assets copied.

## Design limits

The five-week default calendar fits the tested 1080 × 810 viewport. Six-week months and increased text size can extend the page. The design preserves touch targets and content access instead of enforcing a fixed-height canvas. Browser emulation cannot establish physical iPad frame rate, Safari chrome dimensions, home-screen lifecycle or actual Tailscale permissions.
