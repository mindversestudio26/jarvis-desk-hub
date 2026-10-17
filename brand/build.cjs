/* IMANE brand builder (development tool, not loaded by the app).
   Writes the wordmark and the emblem and lockup SVGs that frame the gold portrait
   medallion (exported from the approved assistant portrait by brand/portrait/export.py):
     node brand/build.cjs
   App icons and in-app emblem images come from brand/portrait/export.py. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const f = n => +n.toFixed(2);

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
const C = { obsidian: '#07080a', gold: '#d9c08e', white: '#efebe3' };
const svg = (vb, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>
`;
const ring = (r, color, w = 2.4) => `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
const DEVANAGARI = 'Kohinoor Devanagari, Noto Sans Devanagari, Nirmala UI, Mangal, sans-serif'; // system fonts; viewers without Devanagari fall back

// IMANE emblem: the gold portrait medallion (brand/jange-emblem-512.webp) inside a gold ring.
const portrait = `<image href="jange-emblem-512.webp" x="22" y="20" width="156" height="156"/>`;
const mono = `<defs><filter id="mono"><feColorMatrix type="saturate" values="0"/></filter></defs>`;
const files = {
  // Masters
  'brand/jange-emblem.svg': svg('0 0 200 200', portrait, 'IMANE emblem'),
  'brand/jange-emblem-ring.svg': svg('0 0 200 200', ring(94, C.gold) + portrait, 'IMANE emblem in ring'),
  'brand/jange-emblem-mono.svg': svg('0 0 200 200', mono + ring(94, '#111111') + `<g filter="url(#mono)">${portrait}</g>`, 'IMANE emblem, monochrome'),
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
    mono + `<g transform="translate(10 10) scale(.5)">${ring(94, '#111111')}<g filter="url(#mono)">${portrait}</g></g>` +
    `<g transform="translate(128 30) scale(.62)">${wordmarkBody('#111111')}</g>` +
    `<text x="128" y="94" font-family="${DEVANAGARI}" font-size="20" fill="#111111">इमाने</text>`, 'IMANE — इमाने, monochrome'),
};
for (const [rel, text] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}
/* Wordmark symbol for index.html, printed so it can be pasted into the sprite. */
fs.writeFileSync(path.join(__dirname, 'symbols.html'), `<symbol id="jange-wordmark" viewBox="0 0 ${WM.width} ${WM.height}">${wordmarkBody()}</symbol>
`);
module.exports = { WM, wordmarkBody };
