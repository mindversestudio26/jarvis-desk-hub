# Expressive assistant: rig, motion and environment

The holographic assistant keeps the single approved character (`brand/assistant/idle.webp`). Expressions, head and eye micro-behaviour, and the weather gestures are rendered by deforming that portrait in WebGL. The other pose generations contribute only their arms and hands. No other face is ever shown when the rig is active.

## Assessment of the previous system

The previous system cross-faded five whole photographs (idle, blink, umbrella, wipe, wrap) and added CSS breathing and a timer blink.

- **Identity drift:** the umbrella, wipe and wrap photos are separate generations, with different framing, head position and slightly different faces. Every gesture visibly swapped the face.
- **Expression:** there were no facial expressions. "Concern" and "attention" were colour or opacity changes and a 0.45° rotation.
- **Motion:** the blink was periodic (7.7 s). There was no gaze, no head movement and no continuous gesture motion; poses jumped in 220 ms.

## Approach

| Approach | Verdict |
|---|---|
| **Layered 2D rig + mesh deformation on the canonical portrait** | **Selected.** It keeps the exact face. Brows, lids, gaze, mouth corners, cheeks, head turn/tilt/nod and breathing are local, continuous deformations. One draw call, about 25k triangles. |
| Skeletal animation | Used only for the arm layers (two bones, linear blend skinning). A full skeleton needs layered, inpainted body art that does not exist. |
| Morph targets / 3D | Would need a 3D head that matches this face. A generic avatar (VRM, Rocketbox, MetaHuman) is prohibited, and building a matching mesh is outside this scope. |
| Swapping whole photos (previous) | Rejected: identity drift, abrupt swaps. |

## Architecture

| Layer | File | Role |
|---|---|---|
| App state | `assistant-state.js` (unchanged) | Weather, phase, activity, gesture admission, cooldowns, staleness. |
| Identity anchor | `assistant-rig-data.js` | Landmarks measured on idle.webp, lid curves from the pixel-aligned blink.webp, feature handles, head and body regions, arm-piece registration, umbrella geometry. |
| Motion brain | `assistant-motion.js` | Pure; time is passed in. It handles expression layering and priorities, blinks, saccades, head drift, breathing, posture, the gesture timelines (wipe), the umbrella and wrap state machines, lightning, environment and light targets, critically damped blending, frame-rate hints, and resume and reduced-motion settling. |
| Renderer | `assistant-rig.js` | WebGL 1 (GLSL ES 1.0), three programs. 1) Face/body mesh: vertex feature handles, depth parallax, roll, breathing; fragment eyelid slide with a rigid lash band and lid shadow, iris shift inside the eye opening, environment grade. 2) Skinned arm layers from `arms.webp`. 3) Procedural colour geometry: holographic umbrella, rain, splashes and breath vapour. |
| Adapter | `assistant.js` | Owns frame scheduling. It starts the rig after page load, falls back to the photos without WebGL or on context loss, pauses off Home or when hidden, and resumes coherently. |
| Assets | `brand/assistant/arms/derive.py` → `arms.webp` | Arm and hand cut-outs (polygon × alpha × closed luminance mask), registered with similarity transforms. |

**Priorities**
- Mood layers stack in this order: base (weather, phase, connection), then processing, then attention, then error.
- Gesture faces are layered on top of the mood.
- One arm owner at a time: the cold wrap fully releases before the umbrella opens, and a requested wipe waits up to 5 s for a busy arm, then lapses.
- A tap during the umbrella hold makes eye contact and keeps the umbrella.
- The umbrella opens once per rain episode; rain returning mid-close reverses without restarting.
- Returning from the background settles directly to the current state: an umbrella that should be open is already open, and old wipes are not replayed.

**Gestures**
- **Wipe** (5 s): perceive, raise (the upper arm swings forward from the canonical shoulder; the forearm foreshortens as it passes the chest), two forehead strokes that follow the head's tilt while the eyes close, lower, then relief.
- **Umbrella**: reach, then the shaft materialises upward from the fist; the folded canopy unfolds with a slight overshoot; it holds with sway, and rain splashes off the canopy and drips from the rim. On close it folds, dematerialises and the hand lowers.
- **Storm**: alert on entry, protective umbrella, heavier rain, darker light, and restrained lightning (one double flicker every 18–40 s, with no flashes under Reduce Motion).
- **Cold**: shoulders lift and a shiver plays on entry, then both forearms sweep up from below the frame and cross to grip the opposite upper arms, rubbing gently. Periodic shivers, a cold expression, cool light and breath vapour follow.
- **Wind**: squint, directional hair displacement with gusts, lean, and slanted rain.

**Environment**
- Rain is drawn by the rig only when the state engine reports current rain. Stale, cached, offline or unknown weather is neutral, so there is no umbrella, rain or heat light.
- Clear weather never shows an umbrella.
- Night is calmer: slower breathing and slightly lowered lids. The existing CSS opacity handles dimming.

## Performance and device strategy

- Frames run only while something moves:
  - transitions and events: display rate, capped at about 60 renders a second on 120 Hz displays;
  - rain, wind and the umbrella hold: 30 fps;
  - breathing and drift: 15 fps;
  - otherwise idle until the next scheduled blink or gaze change, waking at least once a second.
- No frames at all off Home, while hidden, or while a modal panel (settings, tasks, alarms, ringing) covers the figure. Returning settles explicitly to the current state.
- A software rasteriser (no GPU) gets the quiet tier immediately.
- If the WebGL context is lost, the photos take over; when the browser restores the context, the rig returns without a reload. A renderer exception also falls back to the photos.
- The startup probe still selects *quiet* on slow engines: device-pixel ratio 1.25, no drift or breathing, event motion only.
- Reduce Motion, Calm and static modes render one static frame per state change: no blinks, drift, wipe or lightning, and the held umbrella is shown open.
- GPU memory estimate: about 6 MB (two 600×800 textures, a 1010×457 arm atlas, about 14k vertices).
- The shaders are WebGL 1 / GLSL ES 1.0 for older iPads.
- Without WebGL the photo portrait remains the complete fallback.

## Limitations

- **Arm motion** is two-bone cut-out animation of derived arm layers. It is not a true 3D arm. Mid-swing foreshortening is approximated, and a brief cross-fade swaps the canonical arm for the raised layer. Production-grade continuous arm motion would need hand-painted or inpainted layered body art, or a matching 3D rig.
- **Mouth:** there is no open-mouth texture, so lip parting is limited to a subtle seam stretch.
- **Voice:** voice is not implemented, so there are no speaking or listening states.
- **Measurements:** Windows Playwright engines (SwiftShader Chromium, software-composited WebKit) are not an iPad proxy. Smoothness, battery and thermals need the physical iPad.
- **Test environment:** under Playwright's fake clock, Windows WebKit crashes after a long simulated rain or storm (roughly 45 s of fake time). Real-time rain and storm ran crash-free, including a 4-minute storm. So the WebKit rig test skips the long continuing-rain hold, which Chromium and the unit tests cover. The rig submits at most one GPU frame per real rendering frame (`document.timeline`), and the tests advance the fake clock in 500 ms steps.
- **Start-up:** on slow renderers, creating the context and compiling the shaders takes about 0.3–1 s once, so the rig starts only after load, 1.5 s after the last input, in an idle period. The photo portrait shows until then.
