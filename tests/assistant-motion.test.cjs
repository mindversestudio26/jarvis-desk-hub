'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Motion = require('../assistant-motion.js');
const Data = require('../assistant-rig-data.js');
const Rig = require('../assistant-rig.js');
const State = require('../assistant-state.js');
const ROOT = path.join(__dirname, '..');
const FRAME = 1000/60;

function model(patch) {
  return {fresh:true, condition:'clear', phase:'day', activity:'idle', gesture:'idle', direction:null, gestureAt:null, ...patch};
}
// Drive the engine at 60 fps; fn(t) supplies the model for each frame, sample collects poses.
function run(engine, from, to, fn, sample) {
  let pose = null;
  for (let t = from; t <= to; t += FRAME) { pose = engine.update(fn(t), t); if (sample) sample(pose, t); }
  return pose;
}
function blinks(poses) {
  const starts = []; let closed = false;
  for (const [p, t] of poses) { if (!closed && p.blink > .95) { closed = true; starts.push(t); } if (closed && p.blink < .05) closed = false; }
  return starts;
}

test('browser globals and CommonJS expose the same motion, rig-data and rig APIs', () => {
  for (const [file, name, api] of [['assistant-motion.js','JangeAssistantMotion',Motion],['assistant-rig-data.js','JangeAssistantRigData',Data],['assistant-rig.js','JangeAssistantRig',Rig]]) {
    const context = {window:{}, Math, Float32Array, Uint16Array, Uint32Array}; vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context);
    assert.deepEqual(Object.keys(context.window[name]).sort(), Object.keys(api).sort(), file);
  }
  assert.ok(Object.isFrozen(Motion.EXPRESSIONS.happy) && Object.isFrozen(Data.EYES.left.open));
});

test('relaxed is the untouched canonical portrait: zero displacement, open lids, centred gaze', () => {
  const face = Motion.blend([['relaxed', 1]]);
  for (const key of Motion.FACE) assert.equal(face[key], 0, key);
  const rest = {...face, lidL:0, lidR:0, gazeX:0, gazeY:0};
  for (const [, dx, dy] of Rig.handles(Data, rest)) { assert.equal(Math.abs(dx), 0); assert.equal(Math.abs(dy), 0); }
});

test('every named expression coordinates brows, eyes and mouth instead of colour alone', () => {
  const brow = ['browInnerUp','browOuterUp','browDown','browSqueeze'], eye = ['lid','squint'], mouth = ['smile','mouthPress','lipPart','cheekRaise'];
  for (const name of Object.keys(Motion.EXPRESSIONS)) {
    if (name === 'relaxed') continue;
    const f = Motion.blend([['relaxed',1],[name,1]]);
    const changed = keys => keys.some(k => Math.abs(f[k]) > .05);
    assert.ok(changed(mouth), name+' mouth');
    if (name !== 'neutral') assert.ok(changed(brow) || changed(eye), name+' brow/eye');
    assert.ok(Math.abs(f.blush) <= .4, name+' restrained colour');
    for (const [, dx, dy] of Rig.handles(Data, {...f, lidL:f.lid, lidR:f.lid, gazeX:0, gazeY:0})) assert.ok(Math.hypot(dx, dy) < 6, name+' no exaggeration');
  }
  assert.ok(!('speaking' in Motion.EXPRESSIONS) && !('listening' in Motion.EXPRESSIONS));
});

test('real activity and weather choose the expression with the documented priority', () => {
  const pick = patch => Motion.dominant(Motion.expressionLayers(model(patch)));
  assert.equal(pick({}), 'relaxed');
  assert.equal(pick({activity:'attention'}), 'curious');
  assert.equal(pick({activity:'processing'}), 'concentrating');
  assert.equal(pick({activity:'error', condition:'heat'}), 'concerned');
  assert.equal(pick({activity:'connected'}), 'content');
  assert.equal(pick({activity:'disconnected'}), 'neutral');
  assert.equal(pick({condition:'heat'}), 'heat');
  assert.equal(pick({condition:'cold'}), 'cold');
  assert.equal(pick({condition:'snow'}), 'cold');
  assert.equal(pick({condition:'wind'}), 'wind');
  assert.equal(pick({condition:'storm'}), 'concerned');
  assert.equal(pick({condition:'heat', fresh:false}), 'relaxed', 'stale weather never drives mood');
  const night = Motion.blend(Motion.expressionLayers(model({phase:'night'}))), day = Motion.blend(Motion.expressionLayers(model({})));
  assert.ok(night.lid > day.lid && night.lid < .3, 'night is calmer, not asleep');
});

test('blinks are natural: varied intervals, full closure, asymmetric and occasionally doubled', () => {
  const engine = Motion.create({seed:11}), poses = [];
  run(engine, 0, 180000, () => model({}), (p, t) => poses.push([p, t]));
  const starts = blinks(poses), gaps = starts.slice(1).map((t, i) => t-starts[i]);
  assert.ok(starts.length >= 30 && starts.length <= 90, 'blink count '+starts.length);
  const mean = gaps.reduce((a, b) => a+b)/gaps.length, sd = Math.sqrt(gaps.reduce((a, g) => a+(g-mean)**2, 0)/gaps.length);
  assert.ok(sd/mean > .3, 'not metronomic');
  assert.ok(gaps.some(g => g < 600), 'occasional double blink');
  // Closure is faster than reopening.
  const i = poses.findIndex(([p]) => p.blink > 0);
  let close = 0, open = 0; for (let k = i; poses[k][0].blink < .95; k++) close++;
  let k = i; while (poses[k][0].blink < .95) k++; while (poses[k][0].blink > .05) { open++; k++; }
  assert.ok(open > close, 'opens slower than it closes');
});

test('gaze, head and body stay within restrained bounds; attention makes eye contact', () => {
  const engine = Motion.create({seed:5});
  let max = {gx:0, gy:0, yaw:0, pitch:0, roll:0, lean:0};
  run(engine, 0, 120000, () => model({}), p => {
    max = {gx:Math.max(max.gx, Math.abs(p.face.gazeX)), gy:Math.max(max.gy, Math.abs(p.face.gazeY)), yaw:Math.max(max.yaw, Math.abs(p.head.yaw)),
      pitch:Math.max(max.pitch, Math.abs(p.head.pitch)), roll:Math.max(max.roll, Math.abs(p.head.roll)), lean:Math.max(max.lean, Math.abs(p.body.lean))};
  });
  assert.ok(max.gx <= 1 && max.gy <= 1 && max.gx > .4, 'gaze explores within the eye');
  assert.ok(max.yaw < .6 && max.pitch < .6 && max.roll < 1, JSON.stringify(max));
  assert.ok(max.lean <= .3);
  const p = run(engine, 120000, 120400, () => model({activity:'attention'}));
  assert.ok(Math.abs(p.face.gazeX) < .06 && Math.abs(p.face.gazeY) < .06, 'eye contact on tap');
  assert.equal(p.expression, 'curious');
});

test('heat wipe runs perceive, raise, two strokes, lower and settle once per request', () => {
  const engine = Motion.create({seed:3}), seen = [];
  run(engine, 0, 1000, () => model({condition:'heat'}));
  const t0 = 1100; let peak = 0, eyes = 0;
  run(engine, 1016, 9000, t => model({condition:'heat', gesture:t >= t0 && t < t0+5000 ? 'wipe' : 'idle', gestureAt:t >= t0 ? t0 : null}), (p) => {
    if (seen[seen.length-1] !== p.gesture.phase) seen.push(p.gesture.phase);
    if (p.arms.right.mode === 'wipe') { peak = Math.max(peak, p.arms.right.raise); if (p.gesture.phase === 'wipe') eyes = Math.max(eyes, p.face.lidL); }
  });
  assert.deepEqual(seen, ['idle','perceive','raise','wipe','lower','settle','idle']);
  assert.equal(peak, 1); assert.ok(eyes > .6, 'eyes close while wiping');
  // The same admitted gesture is never replayed by later polls.
  const later = run(engine, 9016, 12000, () => model({condition:'heat', gesture:'wipe', gestureAt:t0}));
  assert.equal(later.gesture.name, 'idle');
  assert.deepEqual(Motion.WIPE.phases.map(p => p[0]), ['perceive','raise','wipe','lower','settle','done']);
});

test('umbrella materialises and opens once, holds through continuing rain and closes when rain ends', () => {
  const engine = Motion.create({seed:9}), order = [];
  run(engine, 0, 500, () => model({}));
  let reachAt = null, materialAt = null, openAt = null, fullAt = null;
  run(engine, 516, 4000, () => model({condition:'rain', gesture:'umbrella'}), (p, t) => {
    if (reachAt === null && p.umbrella.reach > .01) reachAt = t;
    if (materialAt === null && p.umbrella.materialize > .01) materialAt = t;
    if (openAt === null && p.umbrella.open > .01) openAt = t;
    if (fullAt === null && p.umbrella.state === 'open') fullAt = t;
    if (order[order.length-1] !== p.umbrella.state) order.push(p.umbrella.state);
  });
  assert.ok(reachAt < materialAt && materialAt < openAt, 'reach, then materialise, then unfold');
  assert.ok(fullAt-516 >= 2400 && fullAt-516 <= 2900, 'opens in about 2.6 s');
  // Ten minutes of continuing rain: never re-opens.
  let min = 1;
  run(engine, 4016, 604000, () => model({condition:'rain', gesture:'umbrella'}), p => { min = Math.min(min, p.umbrella.amount); if (p.umbrella.state !== 'open') order.push('again:'+p.umbrella.state); });
  assert.equal(min, 1); assert.deepEqual(order, ['opening','open']);
  let closedAt = null;
  run(engine, 604016, 607000, () => model({}), (p, t) => { if (closedAt === null && p.umbrella.state === 'closed') closedAt = t; });
  assert.ok(closedAt-604016 <= 1800, 'closes and dismisses promptly');
  assert.equal(run(engine, 607016, 608000, () => model({})).arms.right.mode, 'none');
});

test('rain returning mid-close reverses without restarting; clear weather never shows an umbrella', () => {
  const engine = Motion.create({seed:2});
  run(engine, 0, 4000, () => model({condition:'rain', gesture:'umbrella'}));
  let min = 1;
  run(engine, 4016, 4600, () => model({}), p => { min = Math.min(min, p.umbrella.amount); });
  const back = run(engine, 4616, 6500, () => model({condition:'rain', gesture:'umbrella'}), p => { min = Math.min(min, p.umbrella.amount); });
  assert.ok(min > .3, 'never dropped to closed'); assert.equal(back.umbrella.state, 'open');
  const clear = Motion.create({seed:4}); let shown = 0;
  run(clear, 0, 60000, t => model({condition:t < 30000 ? 'clear' : 'heat', phase:t < 15000 ? 'day' : 'night'}), p => { shown = Math.max(shown, p.umbrella.amount); });
  assert.equal(shown, 0);
});

test('stale, cached and offline weather from the state engine are neutral: no umbrella, rain or heat light', () => {
  const NOW = Date.UTC(2026,9,17,6,15), PLACE = {name:'Dubai', lat:25.2, lon:55.3, source:'manual'};
  const weather = State.normalizeObservation({timezone:'Asia/Dubai', utc_offset_seconds:14400,
    current:{time:'2026-10-17T10:15', temperature_2m:30, apparent_temperature:31, wind_speed_10m:5, wind_direction_10m:90, weather_code:63, is_day:1}}, PLACE, NOW);
  for (const patch of [{cached:true}, {online:false}, {now:NOW+45*60000}]) {
    const m = State.derive({weather, cached:false, online:true, selectedPlace:PLACE, pc:'off', processing:false, error:false, attentionUntil:0, now:NOW, ...patch});
    const engine = Motion.create({seed:1});
    const p = run(engine, 0, 4000, () => m);
    assert.equal(p.umbrella.amount, 0, JSON.stringify(patch)); assert.ok(p.env.rain < .001 && p.light.wet < .001);
  }
  const live = State.derive({weather, cached:false, online:true, selectedPlace:PLACE, pc:'off', processing:false, error:false, attentionUntil:0, now:NOW});
  assert.equal(live.condition, 'rain');
  assert.equal(run(Motion.create({seed:1}), 0, 4000, () => live).umbrella.state, 'open');
});

test('one arm owner at a time: the cold wrap fully releases before the umbrella opens', () => {
  const engine = Motion.create({seed:6});
  run(engine, 0, 3000, () => model({condition:'cold', gesture:'wrap'}));
  let overlap = false, wrapGoneAt = null, umbrellaAt = null;
  run(engine, 3016, 8000, () => model({condition:'rain', gesture:'umbrella'}), (p, t) => {
    if (p.wrap.amount > 0 && p.umbrella.amount > 0) overlap = true;
    if (wrapGoneAt === null && p.wrap.amount === 0) wrapGoneAt = t;
    if (umbrellaAt === null && p.umbrella.amount > 0) umbrellaAt = t;
  });
  assert.equal(overlap, false); assert.ok(umbrellaAt >= wrapGoneAt);
  // A real tap during the held umbrella looks at the user without dropping it.
  const tap = run(engine, 8016, 8600, () => model({condition:'rain', gesture:'umbrella', activity:'attention'}));
  assert.equal(tap.umbrella.state, 'open'); assert.equal(tap.expression, 'curious');
});

test('storm: protective umbrella, alert on entry, and restrained spaced lightning', () => {
  const engine = Motion.create({seed:8}); let flashes = 0, on = false, longest = 0, run0 = 0, alert = false;
  run(engine, 0, 500, () => model({condition:'rain', gesture:'umbrella'}));
  run(engine, 516, 120000, t => model({condition:'storm', gesture:t < 5516 ? 'alert' : 'idle', gestureAt:516}), (p, t) => {
    if (p.expression === 'alert') alert = true;
    // One strike is a double flicker; count strikes, not pulses.
    if (p.env.flash > .05 && !on) { on = true; if (t-run0 > 900) { flashes++; run0 = t; } }
    if (p.env.flash <= .05 && on) { on = false; longest = Math.max(longest, t-run0); }
  });
  assert.ok(alert); assert.ok(flashes >= 2 && flashes <= 8, 'flashes '+flashes); assert.ok(longest < 700);
  assert.equal(run(engine, 120016, 121000, () => model({condition:'storm'})).umbrella.state, 'open');
});

test('reduced motion is static: no blinks, drift, breathing, wipe or lightning; held poses snap', () => {
  const engine = Motion.create({seed:12, reducedMotion:true});
  let lid = new Set(), gaze = new Set(), breath = 0, active = false, flash = 0, wipe = false;
  run(engine, 0, 60000, t => model({condition:t < 30000 ? 'heat' : 'storm', gesture:t > 1000 && t < 6000 ? 'wipe' : 'idle', gestureAt:1000}), p => {
    lid.add(p.face.lidL.toFixed(3)); gaze.add(p.face.gazeX.toFixed(3)); breath = Math.max(breath, p.body.breath);
    active = active || p.active; flash = Math.max(flash, p.env.flash); wipe = wipe || p.gesture.name === 'wipe';
  });
  assert.ok(lid.size <= 3, 'lids only change with mood'); assert.equal(gaze.size, 1); assert.equal(breath, 0);
  assert.equal(active, false); assert.equal(flash, 0); assert.equal(wipe, false);
  const rain = Motion.create({seed:1, reducedMotion:true});
  assert.equal(rain.update(model({condition:'rain', gesture:'umbrella'}), 0).umbrella.amount, 1);
  assert.equal(rain.update(model({condition:'rain', gesture:'umbrella'}), 16).nextAt, Infinity);
});

test('returning from the background settles coherently instead of replaying gestures', () => {
  const engine = Motion.create({seed:13});
  run(engine, 0, 1000, () => model({}));
  // Rain began and a wipe was admitted while hidden; on return the umbrella is already up.
  const back = engine.update(model({condition:'rain', gesture:'umbrella'}), 120000);
  assert.equal(back.umbrella.state, 'open'); assert.equal(back.umbrella.amount, 1);
  const heat = engine.update(model({condition:'heat', gesture:'wipe', gestureAt:100000}), 240000);
  assert.notEqual(heat.gesture.name, 'wipe');
  const next = run(engine, 240016, 241000, () => model({condition:'heat', gesture:'wipe', gestureAt:100000}));
  assert.notEqual(next.gesture.name, 'wipe', 'old admission is not replayed');
});

test('quiet quality keeps event motion but drops continuous drift and breathing', () => {
  const engine = Motion.create({seed:14, quality:'quiet'}); const poses = [];
  run(engine, 0, 30000, () => model({}), (p, t) => poses.push([p, t]));
  assert.ok(poses.every(([p]) => p.body.breath === 0 && p.ambient === false));
  assert.ok(blinks(poses).length >= 4);
  assert.ok(Number.isFinite(poses[poses.length-1][0].nextAt));
});

test('identity anchor: rig data measures the canonical portrait and nothing else', () => {
  const W = Data.source.width, H = Data.source.height;
  assert.equal(Data.source.image, 'brand/assistant/idle.webp');
  for (const name of ['idle','blink','umbrella','wipe','wrap']) {
    const buf = fs.readFileSync(path.join(ROOT, 'brand/assistant', name+'.webp'));
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 12, 16), 'VP8X', name);
    assert.equal(1+buf.readUIntLE(24, 3), 600, name); assert.equal(1+buf.readUIntLE(27, 3), 800, name);
  }
  for (const side of ['left','right']) {
    const e = Data.EYES[side], c = Data.curves(e), x = e.iris[0];
    assert.ok(e.x0 > 0 && e.x1 < W && e.x0 < x && x < e.x1);
    const at = k => Data.evaluate(c[k], x);
    assert.ok(at('top') < at('open') && at('open') < at('closed') && at('closed') <= at('bottom'), side+' lid order');
    assert.ok(at('lower') > at('open') && Math.abs(e.iris[1]-(at('open')+at('lower'))/2) < 4, side+' iris inside opening');
    for (const k of ['open','closed','lower','top','bottom']) for (const [px, py] of e[k]) assert.ok(Math.abs(Data.evaluate(c[k], px)-py) < 1e-9);
  }
  assert.ok(Data.EYES.left.iris[0] < 300 && Data.EYES.right.iris[0] > 300, 'viewer-left/right convention');
  const rigSource = fs.readFileSync(path.join(ROOT, 'assistant-rig.js'), 'utf8');
  assert.doesNotMatch(rigSource, /umbrella\.webp|wipe\.webp|wrap\.webp/, 'rig never draws another generated face');
});

test('mesh covers the portrait, turns the head and leaves the collar and shoulders fixed', () => {
  const mesh = Rig.buildMesh(Data);
  assert.equal(mesh.xs[0], 0); assert.equal(mesh.xs[mesh.xs.length-1], 600); assert.equal(mesh.ys[0], 0); assert.equal(mesh.ys[mesh.ys.length-1], 800);
  assert.ok(mesh.count < 65536 && mesh.index instanceof Uint16Array, 'WebGL1 16-bit indices');
  const near = (axis, v) => axis.reduce((best, a, i) => Math.abs(a-v) < Math.abs(axis[best]-v) ? i : best, 0);
  const weightAt = (x, y) => { const i = near(mesh.ys, y)*mesh.xs.length+near(mesh.xs, x); return {head:mesh.w[i*4], chest:mesh.w[i*4+1], depth:mesh.depth[i]}; };
  assert.equal(weightAt(300, 300).head, 1);
  assert.equal(weightAt(300, 520).head, 0); assert.equal(weightAt(100, 700).head, 0);
  assert.ok(weightAt(300, 336).depth > weightAt(250, 300).depth, 'nose is nearer than the eye socket');
  assert.ok(weightAt(300, 600).chest > .99 && weightAt(300, 300).chest === 0);
});

test('arm layers are registered onto the canonical body and the atlas matches its metadata', () => {
  const buf = fs.readFileSync(path.join(ROOT, Data.ARMS.atlas.file));
  assert.equal(buf.toString('ascii', 12, 16), 'VP8X');
  assert.equal(1+buf.readUIntLE(24, 3), Data.ARMS.atlas.width); assert.equal(1+buf.readUIntLE(27, 3), Data.ARMS.atlas.height);
  for (const [name, piece] of Object.entries(Data.ARMS.pieces)) {
    const [x, y, w, h] = piece.atlas;
    assert.ok(x >= 0 && y >= 0 && x+w <= Data.ARMS.atlas.width && y+h <= Data.ARMS.atlas.height, name+' inside atlas');
  }
  const arms = Rig.buildArms(Data), hand = Data.ARMS.pieces.wipe.bones.hand, grip = Data.ARMS.pieces.umbrella.bones.gripHigh;
  assert.ok(hand[0] > 240 && hand[0] < 300 && hand[1] > 200 && hand[1] < 260, 'wiping hand lands on the forehead');
  assert.ok(grip[0] > 100 && grip[0] < 260 && grip[1] > 450 && grip[1] < 700, 'umbrella fist at the chest');
  const w = arms.wipe; let fore = 0, upper = 0;
  for (let i = 0; i < w.count; i++) { if (w.fore[i] > .99) fore++; if (w.fore[i] < .01) upper++; }
  assert.ok(fore > 50 && upper > 50, 'two bones with a blended elbow');
  assert.ok(arms.umbrella.fore.every(v => v === 1), 'umbrella forearm is a single bone');
  assert.equal(Rig.polygonWeight(80, 700, Data.ARMS.hideRight, 6), 1); assert.equal(Rig.polygonWeight(300, 700, Data.ARMS.hideRight, 6), 0);
});

test('head-follow point mirrors the shader: rest is identity, roll tilts about the neck', () => {
  const pose = {head:{yaw:0, pitch:0, roll:0}, body:{shoulderLift:0, lean:0, shiver:0}};
  assert.deepEqual(Rig.headPoint([275, 234], pose, Data).map(v => +v.toFixed(6)), [275, 234]);
  const rolled = Rig.headPoint([275, 234], {...pose, head:{yaw:0, pitch:0, roll:-1}}, Data);
  assert.ok(rolled[0] < 275 && Math.abs(Math.hypot(rolled[0]-300, rolled[1]-456)-Math.hypot(275-300, 234-456)) < 1e-6);
});

test('frame pacing hints: idle drift is ambient, rain is steady, events are fast, static is idle', () => {
  const idle = Motion.create({seed:21}), rain = Motion.create({seed:21}), still = Motion.create({seed:21, reducedMotion:true});
  run(idle, 0, 400, () => model({}));
  let rates = new Set(); run(idle, 416, 20000, () => model({}), p => rates.add(p.rate));
  assert.ok(rates.has('ambient') && rates.has('fast'), [...rates].join());
  assert.ok(!rates.has('steady'));
  rates = new Set(); run(rain, 0, 8000, () => model({condition:'rain', gesture:'umbrella'}), (p, t) => { if (t > 4000) rates.add(p.rate); });
  assert.ok(rates.has('steady') && !rates.has('ambient'));
  assert.equal(run(still, 0, 1000, () => model({condition:'rain', gesture:'umbrella'})).rate, 'idle');
});

test('cold wrap forearms grip the canonical upper arms and sweep inward from below the frame', () => {
  const P = Data.ARMS.pieces, front = P.wrapFront.bones, back = P.wrapBack.bones;
  assert.ok(front.hand[0] > 30 && front.hand[0] < 170 && front.hand[1] > 600 && front.hand[1] < 740, 'front hand on the viewer-left upper arm');
  assert.ok(back.hand[0] > 430 && back.hand[0] < 580 && back.hand[1] > 600 && back.hand[1] < 740, 'back hand on the viewer-right upper arm');
  assert.ok(front.elbow[1] > 800 && back.elbow[1] > 800, 'elbows stay below the portrait');
  assert.ok(front.elbow[0] > 300 && back.elbow[0] < 300, 'forearms cross the body');
  const arms = Rig.buildArms(Data);
  assert.ok(arms.wrapFront.fore.every(v => v === 1) && arms.wrapBack.fore.every(v => v === 1));
});

// Steps the engine the way the adapter schedules frames: display rate when fast, timers otherwise.
function paced(engine, from, to, fn, sample) {
  let t = from, pose = null;
  while (t <= to) {
    pose = engine.update(fn(t), t); if (sample) sample(pose, t);
    t += pose.rate === 'fast' ? FRAME : pose.rate === 'steady' ? 33 : pose.rate === 'ambient' ? 66 :
      Math.min(1000, Math.max(16, (Number.isFinite(pose.nextAt) ? pose.nextAt : t+1000)-t));
  }
  return pose;
}

test('adapter pacing keeps blinks in quiet mode and never snaps weather after idle gaps', () => {
  const fixed = [], pacedPoses = [];
  run(Motion.create({seed:31, quality:'quiet'}), 0, 300000, () => model({}), (p, t) => fixed.push([p, t]));
  paced(Motion.create({seed:31, quality:'quiet'}), 0, 300000, () => model({}), (p, t) => pacedPoses.push([p, t]));
  const a = blinks(fixed).length, b = blinks(pacedPoses).length;
  assert.ok(b >= a*.85, 'paced blinks '+b+' vs continuous '+a);
  // Rain arrives after a long quiet stretch: the umbrella still reaches, materialises and opens.
  const engine = Motion.create({seed:32, quality:'quiet'}); let first = null;
  paced(engine, 0, 9000, () => model({}));
  paced(engine, 9001, 14000, () => model({condition:'rain', gesture:'umbrella'}), p => { if (first === null) first = p.umbrella.amount; });
  assert.ok(first < .2, 'animates from closed, first frame '+first);
  assert.equal(engine.update(model({condition:'rain', gesture:'umbrella'}), 14100).umbrella.state, 'open');
});

test('umbrella hands over to the cold wrap only after it has folded away', () => {
  const engine = Motion.create({seed:33});
  run(engine, 0, 4000, () => model({condition:'rain', gesture:'umbrella'}));
  let overlap = false, umbrellaGone = null, wrapAt = null;
  run(engine, 4016, 9000, () => model({condition:'cold', gesture:'wrap'}), (p, t) => {
    if (p.umbrella.amount > 0 && p.wrap.amount > 0) overlap = true;
    if (umbrellaGone === null && p.umbrella.amount === 0) umbrellaGone = t;
    if (wrapAt === null && p.wrap.amount > 0) wrapAt = t;
  });
  assert.equal(overlap, false); assert.ok(wrapAt >= umbrellaGone);
});
