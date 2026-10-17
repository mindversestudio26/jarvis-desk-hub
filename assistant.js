/* Additive live-context adapter. No credential, microphone or command access. */
(() => {
  'use strict';
  const engine = window.JangeAssistantState, art = window.JangeAssistantArt;
  const host = document.querySelector('#hud'), stage = document.querySelector('.core-stage');
  if (!engine || !art || !host || !stage) return;
  const scene = art.create();
  stage.prepend(scene); host.classList.add('has-living-assistant');
  const status = scene.querySelector('.assistant-status'), context = scene.querySelector('.assistant-context');
  const touch = scene.querySelector('.assistant-touch');
  let model = null, attentionUntil = 0, timer = 0, attentionTimer = 0, gestureTimer = 0, settleTimer = 0;
  const descriptions = {neutral:'Neutral atmosphere',clear:'Clear',cloud:'Cloudy',rain:'Rain',storm:'Storm',snow:'Snow',heat:'High heat',cold:'Cold',wind:'Windy',fog:'Mist'};
  const activities = {idle:'Here with you',attention:'You have my attention',processing:'Updating live information',connected:'PC connected',disconnected:'Connection unavailable',error:'A system needs attention'};
  function visible() { return !document.hidden && host.dataset.activePage === 'home'; }
  function refresh() {
    scene.dataset.paused = String(!visible());
    if (!visible()) return;
    clearTimeout(settleTimer);
    const previous = model;
    model = engine.derive({weather:lastWeather,cached:sys.wx !== 'live',online:sys.net,selectedPlace:place,
      pc:sys.pc,processing:busy.size > 0,error:storageBroken || sys.pc === 'auth',attentionUntil,now:Date.now()},model);
    for (const key of ['condition','phase','activity','gesture']) scene.dataset[key] = model[key];
    if (model.candidateCondition) settleTimer = setTimeout(refresh, Math.max(1,engine.DEFAULTS.transitionMs-(Date.now()-model.candidateSince)+5));
    scene.dataset.entry = String(model.lastGesture === model.gesture && Number.isFinite(model.gestureAt) && Date.now()-model.gestureAt < 2500);
    scene.dataset.direction = model.direction === null ? 'none' : model.direction > 0 && model.direction < 180 ? 'left' : 'right';
    status.textContent = activities[model.activity] || 'Here with you';
    const locality = typeof place.name === 'string' ? place.name : 'Selected location';
    context.textContent = model.fresh ? locality+' · '+descriptions[model.condition]+' · current model' : locality+' · neutral · current weather unavailable';
    scene.setAttribute('aria-label','IMANE holographic assistant. '+status.textContent+'. '+context.textContent+'. Voice features are not enabled.');
    context.title = model.fresh ? 'Environment follows the selected weather location. Open-Meteo current model estimate; not an on-site sensor. Reading '+new Date(lastWeather.observedAt).toISOString() : 'Cached, old, offline or unverified readings do not drive environmental effects.';
    if (['wipe','alert'].includes(model.gesture) && previous?.gesture !== model.gesture) { clearTimeout(gestureTimer); gestureTimer = setTimeout(refresh,Math.max(1,model.gestureAt+5000-Date.now()+5)); }
    wakeRig();
  }
  // Expressive WebGL rig on the canonical portrait. Frames run only while something moves,
  // at a reduced ambient rate for breathing/drift, and stop entirely when hidden or static.
  const rigApi = window.JangeAssistantRig, motionApi = window.JangeAssistantMotion;
  let rig = null, motion = null, rigFrame = 0, rigTimer = 0, rigResize = null;
  let rigQueued = 0, rigResume = false, rigLast = 0, loadedAt = 0, lastInput = 0, rigStarting = false, softwareGL = false;
  // Creating a GL context and compiling shaders can block the main thread for a moment on slow
  // renderers, so the rig starts only once the page has loaded and the user has paused (1.5 s
  // without touch, pointer, key or wheel input), in an idle period where the browser offers one.
  for (const type of ['pointerdown','touchstart','keydown','wheel']) window.addEventListener(type, () => { lastInput = Date.now(); }, {capture:true, passive:true});
  function scheduleRig() {
    if (rig || rigQueued || rigStarting) return;
    if (document.readyState !== 'complete') { window.addEventListener('load', scheduleRig, {once:true}); return; }
    if (!loadedAt) loadedAt = Date.now();
    const now = Date.now(), wait = Math.max(0, loadedAt+1500-now, lastInput+1500-now);
    rigQueued = setTimeout(() => {
      rigQueued = 0;
      if (Date.now()-lastInput < 1500) { scheduleRig(); return; }
      if (typeof requestIdleCallback === 'function') requestIdleCallback(startRig, {timeout:1000}); else startRig();
    }, wait+30);
  }
  // Derived arm layers for the weather gestures; without them the legacy pose photos carry gestures.
  let arms = null, armsState = 'none';
  function loadArms() {
    if (armsState !== 'none') return;
    armsState = 'loading'; const img = new Image(); img.decoding = 'async';
    img.onload = () => { arms = img; armsState = 'ready'; scheduleRig(); };
    img.onerror = () => { armsState = 'failed'; scheduleRig(); };
    img.src = 'brand/assistant/arms.webp';
  }
  function startRig() {
    if (rig || rigStarting || !rigApi || !motionApi) return;
    const idle = scene.querySelector('.assistant-photo-idle'), blink = scene.querySelector('.assistant-photo-blink');
    if (!idle.complete || !idle.naturalWidth || !blink.complete || !blink.naturalWidth) return;
    if (armsState === 'none') loadArms();
    if (armsState === 'loading') return;
    // Decode first so texture upload does not decode on the main thread.
    rigStarting = true;
    Promise.all([idle, blink, arms].filter(Boolean).map(img => typeof img.decode === 'function' ? img.decode().catch(() => {}) : null))
      .then(() => { rigStarting = false; createRig(idle, blink); });
  }
  function createRig(idle, blink) {
    if (rig) return;
    rig = rigApi.create({canvas:scene.querySelector('.assistant-rig'), idle, blink, arms, onLost:dropRig});
    if (!rig) return;
    scene.classList.toggle('rig-arms', !!rig.info.arms);
    // Software rasterisers get the quiet tier straight away instead of a frame probe. WebKit on
    // Windows exists only as a software-composited test build (Safari ships on Apple platforms).
    const ua = navigator.userAgent || '';
    const softwareCompositor = /Windows/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
    if (softwareCompositor || /swiftshader|llvmpipe|software|basic render/i.test(rig.info.renderer || '')) { softwareGL = true; scene.dataset.quality = 'quiet'; qualityDone = true; }
    motion = motionApi.create({seed:(Date.now() ^ 0x5bd1e995) >>> 0, reducedMotion:!motionAllowed(), quality:scene.dataset.quality === 'quiet' ? 'quiet' : 'full'});
    scene.classList.add('has-rig'); scene.dataset.rig = 'webgl';
    if (typeof ResizeObserver === 'function') { rigResize = new ResizeObserver(() => { if (rig) { rig.resize(); wakeRig(); } }); rigResize.observe(scene.querySelector('.assistant-rig')); }
    rigOptions(); wakeRig();
  }
  function dropRig() {
    stopRig(); if (rigResize) rigResize.disconnect();
    if (rig) rig.destroy();
    rig = null; motion = null; scene.classList.remove('has-rig','rig-arms'); scene.dataset.rig = 'fallback';
  }
  // A restored context (iOS can reclaim it under memory pressure) brings the rig back.
  scene.querySelector('.assistant-rig').addEventListener('webglcontextrestored', () => { if (!rig) { clearTimeout(rigQueued); rigQueued = 0; scheduleRig(); } });
  function rigOptions() {
    if (!rig) return;
    const quiet = scene.dataset.quality === 'quiet';
    rig.setMaxPixelRatio(quiet ? 1.25 : 2);
    motion.setOptions({reducedMotion:!motionAllowed(), quality:quiet ? 'quiet' : 'full'});
  }
  function stopRig() { cancelAnimationFrame(rigFrame); clearTimeout(rigTimer); rigFrame = 0; rigTimer = 0; rigResume = true; }
  // A modal panel (settings, tasks, alarms, ringing) covers the figure: no frames until it closes.
  const covered = () => !!document.querySelector('dialog[open]');
  function wakeRig() { if (!rig || !visible() || covered()) return; const resume = rigResume; stopRig(); rigResume = resume; rigFrame = requestAnimationFrame(rigStep); }
  function rigStep(stamp) {
    rigFrame = 0; rigTimer = 0;
    if (!rig || !visible() || !model || covered()) { rigResume = true; return; }
    if (rig.lost) { dropRig(); return; }
    // At most ~60 renders a second, also on 120 Hz displays.
    if (stamp && stamp-rigLast < 14) { rigFrame = requestAnimationFrame(rigStep); return; }
    rigLast = stamp || performance.now();
    const now = Date.now();
    let pose;
    try {
      // After a pause (hidden, off Home, covered) jump to the current state rather than replay it.
      if (rigResume) { rigResume = false; motion.settle(model, now); }
      pose = motion.update(model, now);
      rig.render(pose);
    } catch (e) { dropRig(); return; }
    scene.dataset.expression = pose.expression; scene.dataset.motion = pose.gesture.name+':'+pose.gesture.phase;
    if (pose.reducedMotion) return;
    // Timers wake a little early because the following animation frame adds up to one vsync.
    const later = ms => { rigTimer = setTimeout(() => { rigFrame = requestAnimationFrame(rigStep); }, ms); };
    if (pose.rate === 'fast') rigFrame = requestAnimationFrame(rigStep);
    else if (pose.rate === 'steady') later(scene.dataset.quality === 'quiet' ? 58 : 26);
    else if (pose.rate === 'ambient') later(58);
    else if (Number.isFinite(pose.nextAt)) later(Math.min(1000, Math.max(16, pose.nextAt-now-8)));
    else later(1000);
  }
  // One bounded frame sample selects quieter rendering on slow engines; no perpetual frame loop.
  let qualityDone=false, probeFrame=0, probeTimeout=0, probeDelay=0, blinkTimer=0, blinkEnd=0;
  const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
  function motionAllowed() {return !motionPreference.matches && !document.documentElement.classList.contains('calm') && !document.body.classList.contains('calm') && scene.dataset.static!=='true' && !scene.classList.contains('assistant-static');}
  function stopMotionWork() {
    cancelAnimationFrame(probeFrame);clearTimeout(probeTimeout);clearTimeout(probeDelay);
    clearTimeout(blinkTimer);clearTimeout(blinkEnd);scene.classList.remove('portrait-blinking');
    stopRig();
  }
  function quietBlink() {
    if(!visible()) return;
    if(!rig && scene.dataset.quality==='quiet' && scene.dataset.static!=='true' && !scene.classList.contains('assistant-static') && !['umbrella','wipe','wrap','alert'].includes(model?.gesture) && model?.condition!=='storm' && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('calm') && !document.body.classList.contains('calm')) {
      scene.classList.add('portrait-blinking');blinkEnd=setTimeout(()=>scene.classList.remove('portrait-blinking'),130);
    }
    blinkTimer=setTimeout(quietBlink,7900);
  }
  function startMotionWork() {
    stopMotionWork();rigOptions();wakeRig();if(!visible() || !motionAllowed()) return;
    blinkTimer=setTimeout(quietBlink,7900);
    if(qualityDone || !scene.classList.contains('has-realistic-portrait')) return;
    probeDelay=setTimeout(()=>{
      const intervals=[];let last=performance.now();
      function finish(quality) {cancelAnimationFrame(probeFrame);clearTimeout(probeTimeout);scene.dataset.quality=softwareGL ? 'quiet' : quality;qualityDone=true;rigOptions();}
      function sample(now) {
        if(!visible()) return;
        intervals.push(now-last);last=now;
        if(intervals.length>=40) {const sorted=intervals.slice(5).sort((a,b)=>a-b);finish(sorted[Math.floor(sorted.length/2)]>40?'quiet':'full');}
        else probeFrame=requestAnimationFrame(sample);
      }
      probeTimeout=setTimeout(()=>finish('quiet'),4500);probeFrame=requestAnimationFrame(sample);
    },1200);
  }
  scene.addEventListener('jange:portrait-ready',()=>{scheduleRig();startMotionWork();});
  scene.querySelector('.assistant-photo-blink').addEventListener('load',scheduleRig);
  motionPreference.addEventListener('change',startMotionWork);
  let motionWasAllowed=motionAllowed();
  const motionObserver=new MutationObserver(()=>{const allowed=motionAllowed();if(allowed!==motionWasAllowed){motionWasAllowed=allowed;startMotionWork();}});
  for(const node of [document.documentElement,document.body,scene]) motionObserver.observe(node,{attributes:true,attributeFilter:['class','data-static']});
  function schedule() {
    clearInterval(timer); refresh();startMotionWork();
    if (visible()) timer = setInterval(refresh,10000);
    else { clearTimeout(attentionTimer);clearTimeout(gestureTimer);clearTimeout(settleTimer);attentionUntil=0; }
  }
  touch.addEventListener('click',() => {
    attentionUntil = Date.now()+2500; refresh(); clearTimeout(attentionTimer); attentionTimer=setTimeout(refresh,2550);
  });
  window.addEventListener('jange:context',refresh);
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('pagehide',()=>{stopMotionWork();clearInterval(timer);clearTimeout(attentionTimer);clearTimeout(gestureTimer);clearTimeout(settleTimer);scene.dataset.paused='true';});
  new MutationObserver(schedule).observe(host,{attributes:true,attributeFilter:['data-active-page']});
  const dialogs = new MutationObserver(wakeRig);
  for (const d of document.querySelectorAll('dialog')) dialogs.observe(d,{attributes:true,attributeFilter:['open']});
  window.JangeAssistant = Object.freeze({refresh,getState:()=>model ? JSON.parse(JSON.stringify(model)) : null,
    getRig:()=>rig ? {renderer:rig.info.renderer,vertices:rig.info.vertices,triangles:rig.info.triangles,pose:rig.lastPose ? JSON.parse(JSON.stringify(rig.lastPose)) : null,stats:rig.stats,arms:rig.info.arms,capture:rig.capture} : null});
  schedule();
})();
