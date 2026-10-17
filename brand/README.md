# JANGE · जङ्गे — brand guide

JANGE is named after the family's German Shepherd, who died about two years ago. The identity honours him through the breed, and only through the breed. No reference photograph was supplied, so no individual markings were invented. The emblem uses the black-and-tan traits every German Shepherd shares:

- a broad skull
- large, upright ears set wide and high
- a clear step from cheek into a blunt muzzle
- a strong nose
- the dark mask

If a photograph becomes available, refine `G.head`, `G.crown` and `G.muzzle` in `build.cjs`. The construction, colours and lockups stay the same.

The brand should read as loyalty, intelligence, protection and companionship, carried by an advanced personal assistant. It must not read as a pet product.

## Concepts explored

| | Concept | Verdict |
|---|---|---|
| A | **Minimal Luxury**: a gold line drawing on obsidian | Elegant, but without the mask it reads as a generic wolf or dog. It fails the "recognisably a German Shepherd" test. |
| B | **Futuristic AI Guardian**: a solid emblem with the breed mask in negative space, a circular ring and cyan eye glints | **Selected.** The mask makes it unmistakably a Shepherd at every size. The ring matches the radial JANGE core, and the cyan glints carry live-system meaning. |
| C | **Royal Guardian**: the emblem in a shield with refined gold detailing | Strong, but the shield reads as a police or sports badge. It also clashes with the circular interface. |

The first sketches tapered to a point and looked like a fox. They were redrawn around the breed traits above before any concept was judged. The final mark is B, refined with A's restraint:

- a plain ring instead of a tick-studded bezel
- slightly rounded ear tips, so the mark is alert rather than aggressive
- softer almond eyes
- hairline facet lines as the only "technology" detail

## Files

| File | Use |
|---|---|
| `jange-emblem.svg` | Master emblem: gold, obsidian mask, cyan glints |
| `jange-emblem-ring.svg` | Emblem in its ring (icon artwork) |
| `jange-emblem-mono.svg` | One-colour emblem: dark line and mask on paper |
| `jange-wordmark.svg`, `jange-wordmark-mono.svg` | Wordmark only |
| `jange-lockup-horizontal.svg` | Emblem + wordmark + जङ्गे on obsidian |
| `jange-lockup-vertical.svg` | Stacked lockup on obsidian |
| `jange-lockup-mono.svg` | Horizontal monochrome lockup |
| `concepts/` | The three explored concepts, for the record |
| `../icon-180.png` | Apple touch icon (full bleed; iOS rounds the corners) |
| `../icon-192.png`, `../icon-512.png` | PWA icons (`purpose: any`) |
| `../icon-maskable-512.png` | PWA maskable icon, inside the 80 % safe zone |
| `../favicon-32.png` | PNG favicon for browsers without SVG favicons |

In the app, the emblem and wordmark are `<symbol>`s in `index.html`, built from the same geometry. Colour reaches each symbol through inherited channels:

- `color` sets the tan (gold) areas.
- `fill` sets the mask (obsidian).
- `stroke` sets the eye glints. These glints carry state: cyan when online, ember when offline.

## Wordmark

The wordmark is five geometric capitals on a 40-unit cap height, drawn as paths, so it never depends on a font. The **A has no crossbar**: a raised ear, quietly. Letter-spacing is fixed in the drawing.

Lockups:

- horizontal and vertical (emblem with the wordmark)
- logo-only (the emblem)
- wordmark-only

The Devanagari name जङ्गे is set in the system Devanagari font (Kohinoor Devanagari on iPad).

## Colour

| Token | Hex | Role |
|---|---|---|
| Obsidian | `#07080A` | Background, mask |
| Dark graphite | `#16181C`–`#2A2E35` | Surfaces, tiles |
| Champagne gold | `#D9C08E` (light `#ECD9AE`) | The emblem, anything important |
| Warm metallic amber | `#C9974F` | Secondary rule in the crest concept only |
| Soft white | `#EFEBE3` | Text, clock numerals |
| Restrained cyan | `#6FC3CF` | Live technology and system state only |
| Ember | `#E0915F` | Attention (offline, missed, unreachable) |

There are no neon glows and no metallic gradients. The emblem works in a single ink.

## Minimum sizes

- The emblem with its ring: 48 px.
- The head alone: 16 px. This is what the favicon uses.
- The wordmark: 14 px cap height.

## Rebuilding

```bash
node brand/build.cjs
```

That command writes the outline-mark SVGs (the 3.1 identity, kept for the record). The app icons and in-app images now come from `realistic/export.py`; `--png` is retired so it cannot overwrite them.

## Realistic gold emblem (3.2, awaiting approval)

The owner asked for a realistic, premium canine emblem in place of the outline mark. `realistic/sculpt.py` sculpts a forward-facing German Shepherd head as a height map:
- skull, brows, eye sockets, a muzzle rising from the stop to the nose, lips, ears with deep hollows, and the neck ruff;
- fur smeared along the breed's hair flow (line-integral convolution) and fur strands breaking the cheek outline;
- gold lighting: a studio environment reflected off the surface and mapped through a gold ramp, from deep bronze to pale champagne;
- the black-and-tan saddle mask in antique gold, with dark glass eyes and nose.

`realistic/export.py` writes these files:
- `jange-emblem-512.webp`, the full bust for the welcome screen;
- `jange-head-160.webp`, the head from the low-fur render, used in the header, the core and the alarm screen;
- `jange-emblem-1024.png`, the master;
- the app icons and favicon.

The eye glints stay a small SVG overlay in the app, so they keep their live-state colour.

```
python brand/realistic/sculpt.py 1024 1.0 v13
python brand/realistic/sculpt.py 1024 0.6 small
python brand/realistic/export.py
```

## Emblem from the owner's drawing (3.2.2, current)

From 3.2.2 the emblem is the owner's own choice: a German Shepherd head line drawing they supplied (`german-shepherd-dog-face-black-outline-…-vector.jpg`). It is not in the repo, because the source file's licence is the owner's to check.
- `drawing/convert.py` turns the white face into polished gold (champagne at the brow, deeper gold at the ruff) and keeps the black ink as dark engraving.
- Everything outside the dog's outline becomes transparent.
- `drawing/export.py` writes `jange-emblem-512.webp` (welcome screen) and `jange-head-160.webp` (head crop for the header, core and alarm screen). It also writes `jange-emblem-1024.png` and the app icons, then prints the eye-glint positions for the live-state overlay in `index.html`.

```
python -I brand/drawing/convert.py <drawing.jpg> <work-dir>
python -I brand/drawing/export.py <work-dir> <export-dir>
```

The sculpted emblem in `realistic/` (3.2.0–3.2.1) is kept for the record.
