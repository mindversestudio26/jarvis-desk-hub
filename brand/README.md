# IMANE · इमाने — brand guide

IMANE (renamed from JANGE on 17 October 2026) is an advanced personal desk assistant. Its identity is the assistant herself: the emblem is a gold medallion of the approved holographic portrait (`brand/assistant/idle.webp`), paired with a geometric wordmark. The earlier German Shepherd identity has been retired and its artwork removed; it remains only in Git history.

The brand should read as calm intelligence, care and reliability. It must not read as a gadget or a toy.

## Emblem

The portrait is rendered as a gold duotone (obsidian → bronze → champagne) with gentle local contrast, cropped to the head and hair, its neck fading softly. It sits in a thin champagne ring on obsidian for the app icons, and without the ring in the interface.

| File | Use |
|---|---|
| `jange-emblem-1024.png` | Master medallion (transparent) |
| `jange-emblem-512.webp` | Welcome screen |
| `jange-head-160.webp` | Tighter face crop: header, task core and alarm screen (legible at 30–46 px) |
| `jange-emblem.svg`, `jange-emblem-ring.svg`, `jange-emblem-mono.svg` | Emblem framings for documents (they reference `jange-emblem-512.webp`) |
| `jange-wordmark.svg`, `jange-wordmark-mono.svg` | Wordmark only |
| `jange-lockup-horizontal.svg`, `jange-lockup-vertical.svg`, `jange-lockup-mono.svg` | Emblem + wordmark + इमाने |
| `../icon-180.png` | Apple touch icon (full bleed; iOS rounds the corners) |
| `../icon-192.png`, `../icon-512.png` | PWA icons (`purpose: any`) |
| `../icon-maskable-512.png` | PWA maskable icon, inside the 80 % safe zone |
| `../favicon-32.png` | Favicon (face crop) |

File names keep their historical `jange-*` identifiers so the markup and the service worker stay unchanged.

## Wordmark

The wordmark is five geometric capitals on a 40-unit cap height, drawn as paths, so it never depends on a font. The **A has no crossbar**. Letter-spacing is fixed in the drawing. In the app it is a `<symbol>` in `index.html`.

The Devanagari name इमाने is set in the system Devanagari font (Kohinoor Devanagari on iPad).

## Colour

| Token | Hex | Role |
|---|---|---|
| Obsidian | `#07080A` | Background |
| Dark graphite | `#16181C`–`#2A2E35` | Surfaces, tiles |
| Champagne gold | `#D9C08E` (light `#ECD9AE`) | The emblem, anything important |
| Soft white | `#EFEBE3` | Text, clock numerals |
| Restrained cyan | `#6FC3CF` | Live technology and system state only |
| Ember | `#E0915F` | Attention (offline, missed, unreachable) |

There are no neon glows.

## Minimum sizes

- The medallion with its ring: 48 px.
- The face crop: 16 px (favicon).
- The wordmark: 14 px cap height.

## Rebuilding

```bash
python -I brand/portrait/export.py . <preview-dir>
node brand/build.cjs
```

The first command writes the medallion images and app icons from the canonical portrait. The second writes the wordmark, emblem and lockup SVGs, and `brand/symbols.html` with the wordmark symbol for the sprite in `index.html`.
