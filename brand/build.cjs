/* IMANE brand builder (formerly JANGE) (development tool, not loaded by the app).
   Writes the emblem, wordmark, lockups and concept sketches as SVG, and the
   application icons as PNG when Playwright is available:
     node brand/build.cjs              # SVG only
     PW=<path to playwright> node brand/build.cjs --png
   The German Shepherd head is drawn from breed traits only (broad skull, high
   wide-based ears, a step into a blunt muzzle, black-and-tan mask). No
   individual markings are invented; refine `head`/`mask` here if a photo of
   Jange becomes available. Every shape is symmetrical by construction. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const f = n => +n.toFixed(2);
const pt = p => f(p[0]) + ' ' + f(p[1]);
const mx = ([x, y]) => [200 - x, y];
// Right half once, mirrored about x = 100: start and end on the axis.
function mirrored(start, segs) {
  let d = 'M' + pt(start);
  for (const [a, b, p] of segs) d += 'C' + pt(a) + ' ' + pt(b) + ' ' + pt(p);
  const pts = [start, ...segs.map(s => s[2])];
  for (let i = segs.length - 1; i >= 0; i--) d += 'C' + pt(mx(segs[i][1])) + ' ' + pt(mx(segs[i][0])) + ' ' + pt(mx(pts[i]));
  return d + 'Z';
}
const closed = (start, segs) => 'M' + pt(start) + segs.map(([a, b, p]) => 'C' + pt(a) + ' ' + pt(b) + ' ' + pt(p)).join('') + 'Z';
const pair = (start, segs) => closed(start, segs) + closed(mx(start), segs.map(([a, b, p]) => [mx(a), mx(b), mx(p)]));

/* ---------------------------------------------------------------- emblem */
const G = {
  head: mirrored([100, 50], [
    [[106, 49], [112, 49], [118, 46]],     // crown to inner ear base
    [[126, 33], [135, 19], [143, 8]],      // inner ear edge
    [[145, 5], [149, 4], [151, 7]],        // softened tip
    [[159, 24], [166, 47], [168, 70]],     // outer ear edge
    [[172, 80], [175, 92], [172, 104]],    // skull side
    [[170, 118], [162, 131], [150, 139]],  // cheek to jaw corner
    [[143, 143], [135, 147], [130, 152]],  // step into the muzzle
    [[129, 160], [129, 172], [126, 180]],  // muzzle side
    [[120, 188], [110, 192], [100, 192]],  // chin
  ]),
  innerEar: pair([122, 50], [
    [[129, 38], [137, 25], [144, 16]],
    [[152, 32], [159, 50], [161, 68]],
    [[148, 61], [134, 54], [122, 50]],
  ]),
  // Breed-typical mask: dark crown peak between the brows, dark muzzle.
  crown: mirrored([100, 52], [
    [[106, 51], [112, 51], [117, 49]],
    [[116, 62], [111, 76], [100, 94]],
  ]),
  muzzle: mirrored([100, 101], [
    [[106, 104], [111, 112], [114, 122]],
    [[118, 134], [124, 144], [130, 152]],
    [[129, 160], [129, 172], [126, 180]],
    [[120, 188], [110, 192], [100, 192]],
  ]),
  eyes: pair([113, 102.5], [
    [[117, 95], [127, 92.5], [135.5, 97]],
    [[131, 105.5], [120, 108], [113, 102.5]],
  ]),
  nose: mirrored([100, 159], [
    [[106, 158], [112, 158], [116, 160]],
    [[120, 164], [118, 170], [113, 173]],
    [[109, 175], [104, 176], [100, 176]],
  ]),
  mouth: 'M100 176V181M100 181C104 185 109 185 113 182M100 181C96 185 91 185 87 182',
  // Subtle facet lines: the "technology" layer, quiet at every size.
  facets: 'M135.5 98L150 139M150 139L130 152M64.5 98L50 139M50 139L70 152M168 70L150 139M32 70L50 139',
  glints: [[124.5, 99.2], [75.5, 99.2]],
};

/* Emblem markup. Colours come from three inherited channels so one <symbol>
   serves every variant: `color` = tan/gold, `fill` = mask, `stroke` = eye glint. */
function emblemBody({ tan = 'currentColor', line = tan, mask = null, glint = null, facets = true } = {}) {
  const m = mask ? ` fill="${mask}"` : '';
  const g = glint ? ` stroke="${glint}"` : '';
  return `<path d="${G.head}" fill="${tan}" stroke="none"/>`
    + `<path d="${G.innerEar}"${m} stroke="none"/><path d="${G.crown}"${m} stroke="none"/><path d="${G.muzzle}"${m} stroke="none"/><path d="${G.eyes}"${m} stroke="none"/>`
    + (facets ? `<path d="${G.facets}" fill="none"${mask ? ` stroke="${mask}"` : ' stroke="#000"'} stroke-opacity=".28" stroke-width="1.1" stroke-dasharray="none"/>` : '')
    + G.glints.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="none" stroke-width="3.4" stroke-dasharray="none"${g}/>`).join('')
    + `<path d="${G.nose}" fill="${line}" stroke="none"/>`
    + `<path d="${G.mouth}" fill="none" stroke="${line}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="none"/>`
    + `<path class="em-outline" d="${G.head}" fill="none" stroke="${line}" stroke-width="3.2" stroke-linejoin="round" pathLength="1"/>`;
}

/* ---------------------------------------------------------------- wordmark
   Wide geometric letters on a 40-unit cap height. The A has no crossbar: a
   raised ear, quietly. */
const LETTERS = [
  ['I', 0, 'M0 0V40'],
  ['M', 46, 'M0 40V0L23 30L46 0V40'],
  ['A', 42, 'M0 40L21 0L42 40'],
  ['N', 38, 'M0 40V0L38 40V0'],
  ['E', 32, 'M32 0H0V40H32M0 20H25'],
];
const GAP = 15, STROKE = 4.6;
function wordmarkPath() {
  let x = STROKE, d = '';
  for (const [, w, p] of LETTERS) {
    d += p.replace(/([MLHVC])([^MLHVCZ]*)/g, (all, cmd, args) => {
      const n = args.trim().split(/[ ,]+/).filter(Boolean).map(Number);
      if (cmd === 'H') return 'H' + f(n[0] + x);
      if (cmd === 'V') return 'V' + f(n[0] + STROKE / 2);
      const out = [];
      for (let i = 0; i < n.length; i += 2) out.push(f(n[i] + x) + ' ' + f(n[i + 1] + STROKE / 2));
      return cmd + out.join(' ');
    });
    x += w + GAP;
  }
  return { d, width: f(x - GAP + STROKE), height: f(40 + STROKE) };
}
const WM = wordmarkPath();
const wordmarkBody = (color = 'currentColor') => `<path d="${WM.d}" fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linejoin="miter" stroke-miterlimit="10"/>`;

/* ---------------------------------------------------------------- palette */
const C = { obsidian: '#07080a', graphite: '#16181c', gold: '#d9c08e', gold2: '#ecd9ae', amber: '#c9974f', cyan: '#6fc3cf', white: '#efebe3' };
const svg = (vb, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
const ring = (r, color, w = 2.4) => `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
const inRing = (scale, body) => `<g transform="translate(100 103) scale(${scale}) translate(-100 -100)">${body}</g>`;
const DEVANAGARI = 'Kohinoor Devanagari, Noto Sans Devanagari, Nirmala UI, Mangal, sans-serif'; // system fonts; viewers without Devanagari fall back

// IMANE emblem: the gold portrait medallion exported by brand/portrait/export.py.
const portrait = `<image href="jange-emblem-512.webp" x="22" y="20" width="156" height="156"/>`;
const files = {
  // Masters
  'brand/jange-emblem.svg': svg('0 0 200 200', emblemBody({ tan: C.gold, mask: C.obsidian, glint: C.cyan }), 'JANGE emblem (historical)'),
  'brand/jange-emblem-ring.svg': svg('0 0 200 200', ring(94, C.gold) + inRing(.78, emblemBody({ tan: C.gold, mask: C.obsidian, glint: C.cyan })), 'JANGE emblem in ring (historical)'),
  'brand/jange-emblem-mono.svg': svg('0 0 200 200', emblemBody({ tan: '#ffffff', line: '#111111', mask: '#111111', glint: '#ffffff', facets: false }), 'JANGE emblem, monochrome (historical)'),
  'brand/jange-wordmark.svg': svg(`0 0 ${WM.width} ${WM.height}`, wordmarkBody(C.gold), 'IMANE'),
  'brand/jange-wordmark-mono.svg': svg(`0 0 ${WM.width} ${WM.height}`, wordmarkBody('#111111'), 'IMANE'),
  // Lockups
  'brand/jange-lockup-horizontal.svg': svg(`0 0 ${f(150 + WM.width * .62)} 120`,
    `<rect width="100%" height="100%" fill="${C.obsidian}"/>` +
    `<g transform="translate(10 10) scale(.5)">${ring(94, C.gold)}${portrait}</g>` +
    `<g transform="translate(128 30) scale(.62)">${wordmarkBody(C.gold)}</g>` +
    `<text x="128" y="94" font-family="${DEVANAGARI}" font-size="20" fill="${C.white}" fill-opacity=".72">इमाने</text>`, 'IMANE — इमाने'),
  'brand/jange-lockup-vertical.svg': svg('0 0 240 300',
    `<rect width="100%" height="100%" fill="${C.obsidian}"/>` +
    `<g transform="translate(50 18) scale(.7)">${ring(94, C.gold)}${portrait}</g>` +
    `<g transform="translate(${f(120 - WM.width * .62 / 2)} 182) scale(.62)">${wordmarkBody(C.gold)}</g>` +
    `<text x="120" y="262" text-anchor="middle" font-family="${DEVANAGARI}" font-size="22" fill="${C.white}" fill-opacity=".72">इमाने</text>`, 'IMANE — इमाने'),
  'brand/jange-lockup-mono.svg': svg(`0 0 ${f(150 + WM.width * .62)} 120`,
    `<defs><filter id="mono"><feColorMatrix type="saturate" values="0"/></filter></defs><g transform="translate(10 10) scale(.5)">${ring(94, '#111111')}<g filter="url(#mono)">${portrait}</g></g>` +
    `<g transform="translate(128 30) scale(.62)">${wordmarkBody('#111111')}</g>` +
    `<text x="128" y="94" font-family="${DEVANAGARI}" font-size="20" fill="#111111">इमाने</text>`, 'IMANE — इमाने, monochrome'),
};

/* ---------------------------------------------------------------- concepts */
const conceptA = svg('0 0 200 200', `<rect width="200" height="200" rx="44" fill="${C.obsidian}"/>` + inRing(.86,
  `<g fill="none" stroke="${C.gold}" stroke-linejoin="round" stroke-linecap="round"><path d="${G.head}" stroke-width="4"/><path d="${G.innerEar}" stroke-width="2.4"/><path d="${G.eyes}" stroke-width="2.6"/><path d="M111 110C112 126 113 142 112 158M89 110C88 126 87 142 88 158M100 62V92" stroke-width="2.2"/><path d="${G.mouth}" stroke-width="2.2"/></g><path d="${G.nose}" fill="${C.gold}"/>`), 'Concept A — Minimal Luxury');
let ticks = '';
for (let i = 0; i < 48; i++) {
  const a = i / 48 * Math.PI * 2, long = i % 12 === 0, r1 = 91, r2 = long ? 98 : 95;
  ticks += `<line x1="${f(100 + r1 * Math.sin(a))}" y1="${f(100 - r1 * Math.cos(a))}" x2="${f(100 + r2 * Math.sin(a))}" y2="${f(100 - r2 * Math.cos(a))}" stroke="${C.gold}" stroke-width="${long ? 2 : 1}"/>`;
}
const conceptB = svg('0 0 200 200', `<rect width="200" height="200" rx="44" fill="${C.obsidian}"/>` + ring(86, C.gold, 1.8) + ticks + inRing(.72, emblemBody({ tan: C.gold, mask: C.obsidian, glint: C.cyan })), 'Concept B — Futuristic AI Guardian');
const shield = 'M100 8L172 30V96C172 140 142 174 100 192C58 174 28 140 28 96V30Z';
const conceptC = svg('0 0 200 200', `<rect width="200" height="200" rx="44" fill="${C.obsidian}"/><path d="${shield}" fill="none" stroke="${C.gold}" stroke-width="3.2"/><path d="M100 18L162 37V96C162 134 136 164 100 180C64 164 38 134 38 96V37Z" fill="none" stroke="${C.amber}" stroke-width="1.2"/>` + inRing(.6, emblemBody({ tan: C.gold, mask: C.obsidian, glint: C.gold })), 'Concept C — Royal Guardian');
Object.assign(files, { 'brand/concepts/concept-a-minimal-luxury.svg': conceptA, 'brand/concepts/concept-b-ai-guardian.svg': conceptB, 'brand/concepts/concept-c-royal-guardian.svg': conceptC });

for (const [rel, text] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

/* Symbols for index.html, printed so they can be pasted into the sprite. */
const symbols = `<symbol id="jange-emblem" viewBox="0 0 200 200">${emblemBody()}</symbol>\n<symbol id="jange-wordmark" viewBox="0 0 ${WM.width} ${WM.height}">${wordmarkBody()}</symbol>`;
// Inline welcome emblem: separate classes so each layer can be animated.
const welcome = `<svg class="welcome-emblem" viewBox="0 0 200 200" aria-hidden="true">`
  + `<path class="em-fill" d="${G.head}"/><path class="em-mask" d="${G.innerEar}"/><path class="em-mask" d="${G.crown}"/><path class="em-mask" d="${G.muzzle}"/><path class="em-mask" d="${G.eyes}"/>`
  + `<path class="em-facets" d="${G.facets}"/>` + G.glints.map(([x, y]) => `<circle class="em-glint" cx="${x}" cy="${y}" r="2.6"/>`).join('')
  + `<path class="em-fill" d="${G.nose}"/><path class="em-line" d="${G.mouth}"/><path class="em-outline" d="${G.head}" pathLength="1"/></svg>`;
fs.writeFileSync(path.join(__dirname, 'symbols.html'), symbols + '\n' + welcome + '\n');

/* ---------------------------------------------------------------- PNG icons */
async function pngs() {
  const { chromium } = require(process.env.PW || 'playwright');
  const iconBody = (pad, ringOn) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${C.obsidian}"/><g transform="translate(100 100) scale(${pad}) translate(-100 -100)">${ringOn ? ring(94, C.gold, 2.6) + inRing(.78, emblemBody({ tan: C.gold, mask: C.obsidian, glint: C.cyan })) : inRing(.92, emblemBody({ tan: C.gold, mask: C.obsidian, glint: C.cyan, facets: false }))}</g></svg>`;
  const jobs = [
    ['icon-180.png', 180, iconBody(.84, true)],          // Apple touch icon: iOS rounds the corners itself
    ['icon-192.png', 192, iconBody(.84, true)],
    ['icon-512.png', 512, iconBody(.84, true)],
    ['icon-maskable-512.png', 512, iconBody(.66, true)], // inside the 80 % safe zone
    ['favicon-32.png', 32, iconBody(1, false)],
  ];
  const browser = await chromium.launch();
  for (const [name, size, body] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:${C.obsidian}">${body.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(root, name), omitBackground: false });
    await page.close();
  }
  await browser.close();
}
// The app icons now come from the realistic emblem (brand/realistic/export.py); the old
// vector PNG step is kept for the record but never overwrites them.
if (process.argv.includes('--png')) console.log('Icons come from brand/realistic/export.py now; --png is retired.');
module.exports = { G, WM, emblemBody, wordmarkBody };
