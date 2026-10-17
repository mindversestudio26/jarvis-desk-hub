/* Pure motion brain for the expressive assistant. No DOM, clock reads, timers or network:
 * the caller passes the state-engine model and a timestamp; the result is a plain pose of
 * expression, eye, head, body, arm, umbrella, light and environment parameters.
 * Weather only arrives through the model (neutral when stale, cached, offline or unknown).
 * Voice is not implemented, so no speaking/listening expression exists.
 * Gaze: x>0 looks toward the viewer's right, y>0 looks down. Roll>0 tilts the crown to the
 * viewer's right. Arms: "right" is the character's right hand (viewer's left). */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JangeAssistantMotion = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const FACE = ['browInnerUp','browOuterUp','browDown','browSqueeze','browAsym','lid','squint',
    'cheekRaise','smile','mouthPress','lipPart','blush','roll','pitch','shoulderLift'];
  const deepFreeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
    return value;
  };
  // Complete faces: unspecified channels are zero. relaxed (all zero) is the canonical portrait itself.
  const EXPRESSIONS = deepFreeze({
    neutral:{smile:-.24},
    relaxed:{},
    happy:{smile:.78,cheekRaise:.68,squint:.46,lid:.12,browOuterUp:.12,blush:.34},
    curious:{browInnerUp:.28,browOuterUp:.46,browAsym:.42,lid:-.14,smile:.34,cheekRaise:.16,roll:.5},
    concerned:{browInnerUp:.82,browSqueeze:.52,smile:-.48,mouthPress:.3,lid:.06,pitch:.18},
    surprised:{browInnerUp:.9,browOuterUp:1,lid:-.16,lipPart:.62,smile:-.12,pitch:-.32},
    concentrating:{browDown:.6,browSqueeze:.62,squint:.3,lid:.2,mouthPress:.5,pitch:.16},
    sleepy:{lid:.46,browInnerUp:.18,browOuterUp:-.2,smile:-.06,roll:.5,pitch:.26},
    content:{smile:.36,cheekRaise:.22,squint:.16,lid:.16,browOuterUp:-.08,roll:.18},
    heat:{browInnerUp:.52,browSqueeze:.42,squint:.5,lid:.24,smile:-.3,lipPart:.26},
    cold:{browInnerUp:.42,squint:.32,mouthPress:.52,smile:-.2,shoulderLift:.55,pitch:.12},
    wind:{squint:.52,browDown:.3,lid:.16,smile:-.08,mouthPress:.24},
    alert:{browInnerUp:.56,browOuterUp:.46,lid:-.18,mouthPress:.26,smile:-.24,pitch:-.12}
  });
  const WIPE = deepFreeze({duration:5000, phases:[['perceive',0],['raise',800],['wipe',1500],['lower',3100],['settle',3900],['done',5000]]});
  const UMBRELLA = deepFreeze({openMs:2600, closeMs:1700});
  const WRAP = deepFreeze({inMs:1800, outMs:1300});
  const ALERT_MS = 5000;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(e0, e1, x) { const t = clamp((x-e0)/(e1-e0), 0, 1); return t*t*(3-2*t); }
  function bump(a, b, c, d, x) { return smooth(a, b, x)*(1-smooth(c, d, x)); }
  function rngFrom(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function zeroFace() { const o = {}; for (const k of FACE) o[k] = 0; return o; }
  function preset(name) { const o = zeroFace(); Object.assign(o, EXPRESSIONS[name] || {}); return o; }
  function lerpFace(face, name, weight) {
    if (!(weight > 0)) return face;
    const p = preset(name), w = clamp(weight, 0, 1);
    for (const k of FACE) face[k] += (p[k]-face[k])*w;
    return face;
  }
  const wantsUmbrella = m => !!m && m.fresh === true && (m.gesture === 'umbrella' || m.condition === 'storm');
  const wantsWrap = m => !!m && m.fresh === true && m.gesture === 'wrap';
  /* Layered expression choice. Base mood from weather/phase/connection, then real activity
   * overlays (error > attention > processing). Returns [[preset, weight], ...] in order. */
  function expressionLayers(model, context) {
    const ctx = context || {}, layers = [['relaxed', 1]];
    if (!model) return layers;
    const condition = model.fresh ? model.condition : 'neutral';
    if (model.activity === 'disconnected') layers.push(['neutral', .75]);
    if (model.activity === 'connected') layers.push(['content', .8]);
    if (model.phase === 'night') layers.push(['sleepy', ctx.lateNight ? .72 : .32]);
    if (condition === 'heat') layers.push(['heat', .58]);
    else if (condition === 'cold' || condition === 'snow') layers.push(['cold', .72]);
    else if (condition === 'wind') layers.push(['wind', .66]);
    else if (condition === 'storm') layers.push(['concerned', .55]);
    if (ctx.smileMoment && model.activity === 'idle') layers.push(['happy', .42]);
    if (model.activity === 'processing') layers.push(['concentrating', .78]);
    if (model.activity === 'attention') layers.push(['curious', .9]);
    if (model.activity === 'error') layers.push(['concerned', .86]);
    return layers;
  }
  function blend(layers) { const face = zeroFace(); for (const [name, w] of layers) lerpFace(face, name, w); return face; }
  function dominant(layers) {
    let name = layers[0][0];
    for (const [n, w] of layers) if (w >= .5) name = n;
    return name;
  }
  function wipePhase(elapsed) {
    if (!(elapsed >= 0)) return 'none';
    let name = 'perceive';
    for (const [phase, at] of WIPE.phases) if (elapsed >= at) name = phase;
    return name;
  }
  /* Wipe choreography as a pure function of elapsed ms: perceive heat, raise the hand,
   * two forehead strokes, lower, settle. Weight is the gesture's share of the face. */
  function wipeTrack(elapsed) {
    const e = elapsed, raise = smooth(800, 1500, e)*(1-smooth(3100, 3900, e));
    const strokes = e > 1500 && e < 3100 ? Math.sin((e-1500)/1600*Math.PI*2) : 0;
    return {
      phase:wipePhase(e), weight:bump(0, 600, 3900, 5000, e), raise, stroke:strokes,
      eyesClosed:bump(1300, 1700, 2900, 3300, e)*.72, lean:bump(1100, 1700, 3000, 3700, e),
      relief:bump(3300, 3800, 4300, 5000, e), lookUp:bump(150, 450, 750, 1100, e)
    };
  }
  function blinkCurve(t, close, hold, open) {
    if (t < 0) return 0;
    if (t < close) return smooth(0, close, t);
    if (t < close+hold) return 1;
    if (t < close+hold+open) return 1-smooth(close+hold, close+hold+open, t);
    return 0;
  }
  function spring(s, target, omega, dt) {
    // Critically damped step; exact for any dt so dropped frames never overshoot.
    const y = s.x-target, e = Math.exp(-omega*dt), c = s.v+omega*y;
    s.x = target+(y+c*dt)*e; s.v = (s.v-omega*c*dt)*e;
    return s.x;
  }

  function create(options) {
    const opts = Object.assign({seed:1, reducedMotion:false, quality:'full'}, options || {});
    const rnd = rngFrom(opts.seed), range = (a, b) => a+(b-a)*rnd();
    const springs = {};
    const sp = key => springs[key] || (springs[key] = {x:0, v:0});
    let last = null, model = null;
    const blink = {next:0, start:-1, close:90, hold:30, open:150, second:-1};
    const gaze = {x:0, y:0, next:0, lastBlinkSaccade:0};
    const posture = {next:0, lean:0, roll:0};
    const smileMoment = {next:0, until:0};
    let breathPhase = 0, wipeStart = -1, wipePendingSince = 0, wipeSeenAt = null, nextAmbientWipe = 0;
    let umbrella = 0, umbrellaDir = 0, wrap = 0, wrapDir = 0, alertStart = -1, alertSeenAt = null;
    const shiver = {next:0, start:-1};
    const flash = {next:0, start:-1};
    function scheduleBlink(now, face) {
      const mean = face.lid > .35 ? 5200 : model && model.activity === 'processing' ? 6000 :
        model && model.activity === 'attention' ? 2900 : 3800;
      blink.next = now+mean*range(.42, 1.5);
      const slow = face.lid > .35;
      blink.close = slow ? range(140, 180) : range(70, 100);
      blink.hold = slow ? range(90, 150) : range(18, 45);
      blink.open = slow ? range(240, 320) : range(120, 185);
    }
    function startBlink(now) { if (blink.start < 0 || now-blink.start > blink.close+blink.hold+blink.open) { blink.start = now; blink.second = rnd() < .14 ? now+range(260, 380) : -1; } }
    function nextGaze(now, ctx) {
      let x, y, hold;
      const r = rnd();
      if (ctx.attention) { x = 0; y = 0; hold = range(900, 1600); }
      else if (ctx.processing) { x = r < .75 ? range(.28, .5) : range(-.1, .1); y = r < .75 ? range(.35, .6) : 0; hold = range(1200, 3400); }
      else if (ctx.sleepy) { x = range(-.25, .25); y = range(.15, .5); hold = range(2400, 5200); }
      else if (r < .6) { x = range(-.14, .14); y = range(-.08, .1); hold = range(1100, 3600); }
      else if (r < .85) { x = (rnd() < .5 ? -1 : 1)*range(.55, .9); y = range(-.15, .15); hold = range(600, 1500); }
      else { x = range(-.2, .2); y = range(.45, .8); hold = range(700, 1700); }
      if (ctx.umbrellaHold && rnd() < .18) { x = range(-.1, .2); y = -range(.6, .85); hold = range(700, 1300); }
      const jump = Math.hypot(x-gaze.x, y-gaze.y);
      gaze.x = x; gaze.y = y; gaze.next = now+hold;
      if (jump > .5 && rnd() < .35 && now-gaze.lastBlinkSaccade > 2000) { gaze.lastBlinkSaccade = now; startBlink(now); }
    }

    function settle(nextModel, now) {
      model = nextModel || model; last = now;
      umbrellaDir = 0; wrapDir = 0;
      umbrella = wantsUmbrella(model) ? 1 : 0; wrap = wantsWrap(model) ? 1 : 0;
      wipeStart = -1; alertStart = -1; shiver.start = -1; flash.start = -1; blink.start = -1;
      wipeSeenAt = model && model.gesture === 'wipe' ? model.gestureAt : null;
      alertSeenAt = model && model.gesture === 'alert' ? model.gestureAt : null;
      gaze.x = 0; gaze.y = 0; gaze.next = now+range(800, 2000);
      posture.lean = 0; posture.roll = 0; posture.next = now+range(20000, 50000);
      nextAmbientWipe = now+range(240000, 360000);
      shiver.next = now+range(9000, 16000); flash.next = now+range(6000, 15000);
      for (const key of Object.keys(springs)) springs[key].v = 0;
      return update(model, now, true);
    }

    function update(nextModel, now, snapping) {
      if (!Number.isFinite(now)) throw new TypeError('now must be a finite timestamp');
      // Callers settle explicitly when resuming; a long silent gap is treated the same way.
      if (last === null || (!snapping && (now-last > 10000 || now < last))) return settle(nextModel, now);
      model = nextModel || model;
      const dt = clamp((now-last)/1000, 0, .1); last = now;
      const still = opts.reducedMotion, ambient = !still && opts.quality !== 'quiet';
      const m = model || {fresh:false, condition:'neutral', activity:'idle', gesture:'idle', phase:'unknown'};
      const fresh = m.fresh === true, condition = fresh ? m.condition : 'neutral';

      // Gesture requests from the state engine (events) plus ambient time-driven repeats.
      // A requested wipe waits briefly for a busy arm, then lapses rather than replaying late.
      if (m.gesture === 'wipe' && m.gestureAt !== wipeSeenAt) { wipeSeenAt = m.gestureAt; if (now-m.gestureAt < 4000) { wipeStart = -2; wipePendingSince = now; } }
      if (condition === 'heat' && ambient && wipeStart === -1 && now > nextAmbientWipe && umbrella === 0 && wrap === 0) { wipeStart = -2; wipePendingSince = now; }
      if (wipeStart === -2 && (condition !== 'heat' || now-wipePendingSince > 5000)) wipeStart = -1;
      const armBusy = umbrella > 0 || wrap > 0 || umbrellaDir > 0 || wrapDir > 0;
      if (wipeStart === -2 && !armBusy) { wipeStart = still ? -1 : now; nextAmbientWipe = now+range(240000, 360000); }
      if (m.gesture === 'alert' && m.gestureAt !== alertSeenAt) { alertSeenAt = m.gestureAt; alertStart = still ? -1 : now; }
      const wipeElapsed = wipeStart >= 0 ? now-wipeStart : -1;
      if (wipeElapsed >= WIPE.duration) wipeStart = -1;
      const wipe = wipeStart >= 0 ? wipeTrack(wipeElapsed) : null;

      // Persistent arm states: one owner at a time, the old pose exits before the next enters.
      const wantU = wantsUmbrella(m), wantW = wantsWrap(m), wiping = !!wipe;
      if (wantU && wrap === 0 && !wiping) umbrellaDir = 1; else if (!wantU || wrap > 0) umbrellaDir = umbrella > 0 ? -1 : 0;
      if (wantW && umbrella === 0 && !wiping) wrapDir = 1; else if (!wantW || umbrella > 0) wrapDir = wrap > 0 ? -1 : 0;
      if (still) { umbrella = umbrellaDir > 0 ? 1 : umbrellaDir < 0 ? 0 : umbrella; wrap = wrapDir > 0 ? 1 : wrapDir < 0 ? 0 : wrap; }
      else {
        umbrella = clamp(umbrella+umbrellaDir*dt*1000/(umbrellaDir > 0 ? UMBRELLA.openMs : UMBRELLA.closeMs), 0, 1);
        wrap = clamp(wrap+wrapDir*dt*1000/(wrapDir > 0 ? WRAP.inMs : WRAP.outMs), 0, 1);
      }
      if ((umbrella === 1 && umbrellaDir > 0) || (umbrella === 0 && umbrellaDir < 0)) umbrellaDir = 0;
      if ((wrap === 1 && wrapDir > 0) || (wrap === 0 && wrapDir < 0)) wrapDir = 0;
      const umbrellaHold = umbrella === 1 && umbrellaDir === 0;

      // Expression target: layered mood, then gesture shares.
      if (ambient && m.activity === 'idle' && now > smileMoment.next) {
        if (smileMoment.next) smileMoment.until = now+range(2600, 4600);
        smileMoment.next = now+range(26000, 62000);
      }
      const layers = expressionLayers(m, {lateNight:false, smileMoment:now < smileMoment.until});
      if (wipe) layers.push(['heat', wipe.weight]);
      const opening = umbrellaDir > 0 && umbrella < .45 ? bump(0, .08, .3, .45, umbrella) : 0;
      if (opening) layers.push(['surprised', opening*.32]);
      if (umbrellaHold && condition === 'rain' && m.activity === 'idle') layers.push(['content', .45]);
      if (wrap > 0) layers.push(['cold', wrap]);
      const alertElapsed = alertStart >= 0 ? now-alertStart : -1;
      if (alertElapsed >= ALERT_MS) alertStart = -1;
      if (alertStart >= 0) layers.push(['alert', bump(0, 250, 2600, ALERT_MS, alertElapsed)]);
      const face = blend(layers);
      if (wipe) {
        face.lid += (1-face.lid)*wipe.eyesClosed;
        face.roll -= wipe.lean*.9;
        face.pitch += wipe.lean*.25;
        face.lipPart = Math.max(face.lipPart, wipe.relief*.45);
        face.smile += wipe.relief*.35;
        face.browInnerUp -= wipe.relief*.2;
      }
      if (umbrellaDir > 0 || umbrellaDir < 0) face.roll -= bump(.15, .45, .7, 1, umbrella)*.25;

      // Micro-behaviour: blinks, gaze, head drift, breathing and posture.
      if (!still) {
        if (!blink.next) scheduleBlink(now, face);
        if (now >= blink.next) { startBlink(now); scheduleBlink(now, face); }
        if (blink.second > 0 && now >= blink.second) { blink.start = now; blink.second = -1; }
        const sleepy = face.lid > .35;
        const ctx = {attention:m.activity === 'attention', processing:m.activity === 'processing', sleepy, umbrellaHold};
        if (now >= gaze.next || (ctx.attention && (gaze.x !== 0 || gaze.y !== 0))) nextGaze(now, ctx);
      } else { gaze.x = 0; gaze.y = 0; }
      let gx = gaze.x, gy = gaze.y;
      if (wipe) { gx = gx*(1-wipe.lookUp)+.35*wipe.lookUp; gy = gy*(1-wipe.lookUp)-.7*wipe.lookUp; }
      if (opening) { gx *= 1-opening; gy = gy*(1-opening)-.8*opening; }
      const tBlink = blink.start >= 0 ? now-blink.start : -1;
      const b = still ? 0 : blinkCurve(tBlink, blink.close, blink.hold, blink.open);
      if (tBlink > blink.close+blink.hold+blink.open) blink.start = -1;

      if (ambient && now >= posture.next) { posture.lean = range(-.24, .24); posture.roll = range(-.22, .22); posture.next = now+range(34000, 82000); }
      const s = now/1000;
      const drift = ambient ? {
        yaw:.11*Math.sin(s*.65+.7)+.05*Math.sin(s*1.53+2.1),
        pitch:.07*Math.sin(s*.47+1.3)+.03*Math.sin(s*1.21),
        roll:.1*Math.sin(s*.37+.4)+.04*Math.sin(s*.93+1.7)
      } : {yaw:0, pitch:0, roll:0};
      const period = face.lid > .35 ? 6.4 : condition === 'heat' || wiping ? 4.2 : alertStart >= 0 ? 3.6 : 5;
      if (ambient) breathPhase = (breathPhase+dt/period)%1;
      const bp = breathPhase < .4 ? breathPhase/.4*.5 : .5+(breathPhase-.4)/.6*.5;
      const breath = ambient ? .5-.5*Math.cos(bp*Math.PI*2) : 0;

      // Cold: periodic shivers while wrapped. Storm: restrained, spaced lightning.
      if (!still && wrap === 1 && now >= shiver.next) { shiver.start = now; shiver.next = now+range(9000, 16000); }
      const shiverT = shiver.start >= 0 ? now-shiver.start : -1;
      const shake = shiverT >= 0 && shiverT < 800 ? Math.sin(shiverT/1000*Math.PI*2*9)*(1-shiverT/800) : 0;
      if (shiverT >= 800) shiver.start = -1;
      const entryShiver = wrapDir > 0 ? Math.sin(now/1000*Math.PI*2*9)*bump(0, .1, .35, .5, wrap) : 0;
      if (!still && condition === 'storm' && now >= flash.next) { flash.start = now; flash.next = now+range(18000, 40000); if (rnd() < .5) startBlink(now+40); }
      const flashT = flash.start >= 0 ? now-flash.start : -1;
      const flashAmt = flashT < 0 || flashT > 600 ? 0 : Math.max(bump(0, 20, 60, 140, flashT), .7*bump(200, 220, 280, 600, flashT));
      if (flashT > 600) flash.start = -1;

      // Smooth everything toward targets.
      const snap = still || snapping;
      const go = (key, target, omega) => { const st = sp(key); if (snap) { st.x = target; st.v = 0; return target; } return spring(st, target, omega, dt); };
      const out = {};
      for (const k of FACE) out[k] = go('f.'+k, face[k], k === 'lid' ? 14 : 8);
      const lidBase = clamp(out.lid+Math.max(0, gy)*.22-Math.max(0, -gy)*.08, -.24, 1);
      const gazeX = go('g.x', clamp(gx, -1, 1), 38), gazeY = go('g.y', clamp(gy, -1, 1), 38);
      const leanTarget = posture.lean+(wipe ? -wipe.lean*.4 : 0);
      const lean = go('b.lean', leanTarget, 2.2);
      const postureRoll = go('b.roll', posture.roll, 2);
      const headYaw = go('h.yaw', gazeX*.3+drift.yaw, 6)+(shake+entryShiver)*.06;
      const headPitch = go('h.pitch', out.pitch+gazeY*.22+drift.pitch, 6);
      const headRoll = go('h.roll', out.roll+postureRoll+drift.roll, 5);
      const windDir = m.direction === null || m.direction === undefined ? 0 : m.direction > 0 && m.direction < 180 ? -1 : 1;
      const env = {
        rain:go('e.rain', condition === 'storm' ? 1 : condition === 'rain' ? .62 : 0, 1.6),
        heat:go('e.heat', condition === 'heat' ? 1 : 0, 1.4),
        cold:go('e.cold', condition === 'cold' || condition === 'snow' ? 1 : 0, 1.4),
        wind:go('e.wind', condition === 'wind' ? 1 : 0, 1.4), windDir,
        storm:go('e.storm', condition === 'storm' ? 1 : 0, 1.4),
        night:go('e.night', m.phase === 'night' ? 1 : 0, 1.2), flash:still ? 0 : flashAmt
      };
      const gust = ambient && env.wind > .01 ? .55+.3*Math.sin(s*1.7)+.15*Math.sin(s*4.3+1) : 0;
      const warmth = condition === 'heat' ? (m.phase === 'night' ? .3 : .7) : m.phase === 'morning' || m.phase === 'evening' ? .25 :
        condition === 'cold' || condition === 'snow' ? -.5 : condition === 'storm' ? -.35 : condition === 'rain' ? -.25 : 0;
      const light = {
        warmth:go('l.warmth', warmth, 1.4),
        bright:go('l.bright', m.activity === 'attention' ? 1.05 : condition === 'storm' ? .93 : 1, 3),
        wet:go('l.wet', condition === 'storm' ? .7 : condition === 'rain' ? .5 : 0, 1.2),
        desat:go('l.desat', m.activity === 'disconnected' ? .3 : condition === 'fog' ? .15 : condition === 'storm' ? .12 : 0, 2),
        scan:go('l.scan', m.activity === 'processing' ? 1 : 0, 4), flash:env.flash
      };
      const umbrellaPose = {
        amount:umbrella, state:umbrellaDir > 0 ? 'opening' : umbrellaDir < 0 ? 'closing' : umbrella === 1 ? 'open' : 'closed',
        reach:smooth(.2, .5, umbrella), materialize:smooth(.4, .7, umbrella), open:smooth(.6, 1, umbrella),
        sway:umbrellaHold ? .012*Math.sin(s*.9)+.02*gust*env.wind*windDir : 0
      };
      const wrapPose = {amount:wrap, state:wrapDir > 0 ? 'in' : wrapDir < 0 ? 'out' : wrap === 1 ? 'held' : 'free', arms:smooth(.3, 1, wrap), rub:wrap === 1 && ambient ? Math.max(0, Math.sin(s*.8))*.6 : 0};
      const pose = {
        t:now, expression:dominant(layers),
        face:{browInnerUp:out.browInnerUp, browOuterUp:out.browOuterUp, browDown:out.browDown, browSqueeze:out.browSqueeze,
          browAsym:out.browAsym, lidL:clamp(lidBase+(1-lidBase)*b, -.24, 1), lidR:clamp(lidBase+(1-lidBase)*b, -.24, 1),
          squint:out.squint, cheekRaise:out.cheekRaise, smile:out.smile, mouthPress:out.mouthPress, lipPart:out.lipPart,
          blush:out.blush, gazeX, gazeY},
        head:{yaw:headYaw, pitch:headPitch, roll:headRoll},
        body:{breath, shoulderLift:out.shoulderLift+Math.abs(shake)*.1, lean, shiver:shake+entryShiver},
        hair:{wind:env.wind*windDir*(.4+.6*gust)},
        arms:{right:wipe ? {mode:'wipe', raise:wipe.raise, stroke:wipe.stroke} : umbrella > 0 ? {mode:'umbrella', raise:umbrellaPose.reach, stroke:0} :
          wrap > 0 ? {mode:'wrap', raise:wrapPose.arms, stroke:wrapPose.rub} : {mode:'none', raise:0, stroke:0},
          left:wrap > 0 ? {mode:'wrap', raise:wrapPose.arms, stroke:wrapPose.rub} : {mode:'none', raise:0, stroke:0}},
        gesture:{name:wipe ? 'wipe' : umbrella > 0 ? 'umbrella' : wrap > 0 ? 'wrap' : alertStart >= 0 ? 'alert' : env.wind > .5 ? 'wind' : 'idle',
          phase:wipe ? wipe.phase : umbrella > 0 ? umbrellaPose.state : wrap > 0 ? wrapPose.state : alertStart >= 0 ? 'alert' : 'idle'},
        umbrella:umbrellaPose, wrap:wrapPose, light, env,
        blink:b, reducedMotion:still
      };
      // Head and posture springs chase continuous drift; only transitions count as movement.
      // Head/posture springs chase continuous drift and saccades are near-instant, so neither
      // demands display-rate frames; expression, light and environment transitions do.
      const moving = Object.keys(springs).some(k => !/^[hbg]\./.test(k) && Math.abs(springs[k].v) > .004);
      // Frame pacing hint: fast for transitions and events, steady for rain/wind particles and
      // hair, ambient for slow breathing and drift only, idle when nothing moves.
      const fast = !still && (moving || b > 0 || blink.start >= 0 || blink.second > 0 || !!wipe || umbrellaDir !== 0 || wrapDir !== 0 ||
        shake !== 0 || flashAmt > 0 || alertStart >= 0);
      const steady = !still && !fast && (env.rain > .01 || (ambient && env.wind > .01) || umbrellaHold);
      pose.rate = fast ? 'fast' : steady ? 'steady' : ambient ? 'ambient' : 'idle';
      pose.active = fast || steady;
      pose.ambient = ambient;
      // Earliest scheduled micro-event, so a caller that idles between frames can wake for it.
      pose.nextAt = still ? Infinity : Math.min(blink.next || Infinity, blink.second > 0 ? blink.second : Infinity, gaze.next || Infinity,
        wrap === 1 ? shiver.next : Infinity, condition === 'storm' ? flash.next : Infinity);
      return pose;
    }
    return Object.freeze({
      update:(m, now) => update(m, now, false),
      settle,
      setOptions(next) { const was = opts.reducedMotion; Object.assign(opts, next || {}); if (last !== null && was !== opts.reducedMotion) settle(model, last); },
      get options() { return Object.assign({}, opts); }
    });
  }
  return Object.freeze({create, EXPRESSIONS, FACE, WIPE, UMBRELLA, WRAP, expressionLayers, blend, dominant, wipePhase, wipeTrack, blinkCurve});
});
