# Realistic hologram — 3.6

The owner corrected the target device to **iPad Pro 11-inch M4**. [Apple specifications](https://support.apple.com/en-au/119892) list 2420×1668 physical pixels; we test the typical 2× CSS landscape viewport 1210×834, toolbar-constrained 1210×740, portrait 834×1210, and previous smaller layouts. Browser emulation is not physical-device performance evidence.

## Visual change

Original photorealistic adult female artwork replaces the vector character whenever its local image has loaded. Existing environment/state logic and all other pages remain. Five transparent 600×800 WebP files total 501,690 bytes (~490 KiB); decoded pixel storage is approximately 9.2 MiB before browser overhead. Idle and blink share framing; the blink layer clips to the eyes so clothing and other facial features do not move. Subpixel whole-bust breathing (18 interpolation steps per half-cycle to limit repaint frequency) and a restrained touch response use transforms, with short opacity transitions into realistic umbrella, heat and cold poses. Directional wind remains a separate visible environmental cue. Storm preserves its umbrella beyond the brief alert. These are photographic pose transitions, not a full skeletal 3D character or generated video.

No per-frame JavaScript renderer, animated blur or added rendering framework. A single bounded 40-frame startup sample (4.5-second ceiling, cancelled when hidden) selects quiet rendering if median frame time exceeds 40 ms. Quiet rendering preserves real poses and a brief timer-driven blink instead of continuous animations. Full motion remains on faster renderers. Existing hidden/off-page pause, Calm and reduced-motion rules apply. Loaded-pose classes retain the neutral portrait when a pose asset fails. The earlier vector portrait remains an emergency fallback if the neutral image cannot load. The service worker caches all five images in v3.6.0. No user data, credentials, tailnet rules or companion code changed.

## Asset provenance and prompt set

Created with the built-in image generation tool, not the API/CLI. Final project assets: `brand/assistant/{idle,blink,umbrella,wipe,wrap}.webp`. Source PNGs remain in the local Codex generated-images directory. Asset packaging only extracts atlas panels, aligns transparent canvases, resizes and encodes WebP; no face is drawn or retouched in code.

1. **Neutral:** Original photorealistic female holographic assistant, adult around 28–35, refined natural human proportions, intelligent brown eyes, subtle closed-lip expression, detailed realistic skin and cheekbones, subtle makeup, brunette hair with loose strands. Frontal head and upper torso, eye-level camera, relaxed arms. Modest charcoal high-neck tailored futuristic suit with champagne-gold seams. Soft cyan rim light, natural warm skin, subtle transparent shoulders; no cartoon, anime, vector, heavy scanlines, text, pedestal, UI or celebrity likeness. Transparent portrait composition, torso fades into transparency.
2. **Pose atlas:** Reference the same neutral woman and preserve face, hair, outfit, light and photographic quality. Three equal transparent panels with aligned head scale: umbrella held at chest with small transparent cyan canopy; natural right-hand forehead wipe with realistic fingers and lowered eyes; gently folded arms holding upper arms for cold. No labels, background, rain, motion blur or exaggerated gestures.
3. **Blink:** Edit only the reference woman's eyelids to a gentle natural closed blink. Preserve exact canvas, head position, skin, hair, clothing, lighting and alpha. No head movement, changed expression, sleeping or squinting. Only the eye region of this output is displayed.

## Verification

The targeted assistant suite covers actual asset decode, weather pose visibility, direction-aware wind, neutral stale/offline behavior, true activity state, pause, reduced motion and the M4 viewport sizes in Chromium and WebKit. The existing browser regression suite checks storage, clocks, backup, pairing states and service-worker upgrades/offline in Chromium; Windows WebKit offline emulation remains limited. No physical Windows power command is executed. Performance observations are reported separately from device guarantees.


Desktop measurements at 1210×834 (179 frame intervals): Chromium full motion median 16.7 ms / p95 16.8 ms; Windows WebKit selected quiet mode, median 29 ms / p95 108 ms. Continuous photographic animation had measured about 100 ms median in Windows WebKit. Quiet mode improves idle responsiveness but occasional slow frames remain; no 60/120-fps guarantee is made for physical hardware. Both engines had zero running assistant animations off Home. The capability sample waits for the portrait and respects explicit motion preferences.
