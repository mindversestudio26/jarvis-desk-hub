# Living assistant: additive architecture and design assessment

Existing baseline: 578459d. Three pages, direct/keyboard/swipe navigation, page memory, tactile materials, flip clocks, flags, seconds subdials, hourly bilingual quotes, BS/AD planner, tasks/events/alarms/shifts, offline cache and separately authorized PC controls already work. Preserve them. Add the humanoid/environment only; the German Shepherd remains the brand emblem. The owner explicitly authorized incremental deployment in the current request.

## Reference assessment

ScanMadira `lib/core/widgets/materials.dart` paints texture tiles once rather than regenerating per frame; `app_tokens.dart` separates tight contact shadows from soft key shadows and uses role-based spacing. Adapt those ideas with static CSS layers; do not copy Flutter widgets or modify ScanMadira. Penpot's open SVG/CSS model and theme tokens support a small, inspectable scene without a graphics runtime. Local `ai-resources/penpot` and system-design-primer were consulted as references only.

- [Home Assistant](https://www.home-assistant.io/dashboards/cards/): conditional presentation of real states. Retain distinct connection states and avoid decorative fake activity.
- [DAKboard](https://dakboard.com/site): readable glanceable clocks/calendar/weather. Keep quotes and clocks readable around the assistant.
- [Touch Portal](https://touchportal.com/blog/post/tutorials/navigating-multiple-pages-v3.php): touch-first page/actions. Preserve existing action confirmations and exclude them from swipe gestures.
- [Grafana](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/): focused hierarchy and meaningful measurements. Never add random telemetry.
- [WebKit energy guidance](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/) and [reduced motion](https://webkit.org/blog/7551/responsive-design-for-motion/): favor bounded CSS transform/opacity animation, stop offscreen work, preserve a static readable pose.
- [Open-Meteo](https://open-meteo.com/en/docs): current conditions are weather-model estimates, not an on-site rain sensor. Label provenance; never use daily forecast rain as current rain.

## Rendering decision

| Approach | Assessment |
|---|---|
| Layered raster | Attractive static art but limited independent facial/hand geometry; multiple pose assets cost memory. |
| Inline SVG + CSS | Selected: original articulated figure, explicit hands/props, scalable, accessible static fallback, no frame-render loop. |
| Canvas 2D | Requires manual continuous redraw and separate accessibility/picking logic. |
| Rive/Lottie runtime | Useful for authored animation but adds dependency/tooling and export complexity for this small scene. |
| WebGL | Unnecessary GPU/context cost for the older iPad and this waist-up illustration. |

## Boundaries and risks

A pure deterministic weather/character engine owns condition, phase, activity and gesture. An adapter reads existing actual app state without tokens; a renderer owns SVG poses. No microphone, speech or AI backend is fabricated. Attention is a real user interaction; processing follows active operations, not a lingering decorative spinner. Existing task interaction remains accessible.

Weather follows the selected weather location. Preserve provider timezone, UTC offset and an unambiguous current reading timestamp. Cached, stale, future, malformed, offline or location-mismatched readings yield neutral atmosphere. Model estimates remain distinct from daily forecast. Hysteresis and transition holds prevent flicker; a cooldown avoids repeating gestures on each poll. Simultaneous rain/heat must resolve to one coherent precipitation scene.

Primary risks are tiny facial details, unclear arm silhouettes, umbrella/rain occlusion, short landscape overflow and animation battery cost. Review actual screenshots and gesture states, not only passing tests. PC/auth/storage/backend and tailnet settings are outside this visual change. Physical iPad performance cannot be inferred from Windows WebKit's software compositing.


## Implementation and verification

Original adult female vector artwork uses 148 SVG elements, gradients and clipped rain; no SVG filters, WebGL, external rendering runtime or continuous JavaScript frame loop. Umbrella, finite forehead wipe and cold arm-wrap use articulated original poses. German Shepherd branding remains in the header. Night lighting never shows a sun or unrelated heat haze. Unknown wind bearing remains neutral.

Thresholds: heat at 38°C actual / 40°C apparent, cold at 12°C, wind at 30 km/h; hysteresis, an 8-second condition hold and per-gesture 60-second cooldown prevent repeated reactions. Wipe/protective alert expire after 5 seconds. Model readings older than 30 minutes or fetches older than 20 minutes do not drive atmosphere. Calm, reduced-motion and static modes disable animation; hidden/off-Home scenes pause.

Validation: 70 unit/calendar tests; 55 companion/security tests; Chromium and WebKit assistant, console/layout, swipe, browser/storage/clock, alarm/shift/location feature and isolated companion/control integration suites passed. Control tests use harmless fixtures, never real Windows power actions. Screenshots and synthetic-weather reaction recordings are generated under test-results by tests/assistant.cjs. Synthetic demonstrations are labeled. tests/assistant-performance.cjs captures settled real-weather Home/PC/Planner views and frame timing.

Limitations: this is an original stylized SVG holographic character, not a photorealistic 3D model or conversational AI. Voice/listening/speech are not enabled. Weather is an Open-Meteo current model estimate, not an on-site sensor. No new holiday data is invented; existing verified BS date range remains unchanged. Windows desktop WebKit is tested, but physical iPad rendering, battery and touch feel still require device observation. WebKit offline emulation on Windows is limited; Chromium offline and cache-migration checks passed. No companion, credential, monitoring-token or tailnet changes were made.
