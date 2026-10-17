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
  let rigQueued = 0;
  // Shader compilation waits until the page has loaded so it never delays first paint.
  function scheduleRig() {
    if (rig || rigQueued) return;
    if (document.readyState !== 'complete') { window.addEventListener('load', scheduleRig, {once:true}); return; }
    rigQueued = setTimeout(() => { rigQueued = 0; startRig(); }, 30);
  }
  // Derived arm layers for the weather gestures; without them the legacy pose photos carry gestures.
  let arms = null, armsState = 'none';
  function loadArms() {
    if (armsState !== 'none') return;
    armsState = 'loading'; const img = new Image(); img.decoding = 'async';
    img.onload = () => { arms = img; armsState = 'ready'; startRig(); };
    img.onerror = () => { armsState = 'failed'; startRig(); };
    img.src = 'brand/assistant/arms.webp';
  }
  function startRig() {
    if (rig || !rigApi || !motionApi) return;
    const idle = scene.querySelector('.assistant-photo-idle'), blink = scene.querySelector('.assistant-photo-blink');
    if (!idle.complete || !idle.naturalWidth || !blink.complete || !blink.naturalWidth) return;
    if (armsState === 'none') loadArms();
    if (armsState === 'loading') return;
    rig = rigApi.create({canvas:scene.querySelector('.assistant-rig'), idle, blink, arms, onLost:dropRig});
    if (!rig) return;
    scene.classList.toggle('rig-arms', !!rig.info.arms);
    motion = motionApi.create({seed:(Date.now() ^ 0x5bd1e995) >>> 0, reducedMotion:!motionAllowed(), quality:scene.dataset.quality === 'quiet' ? 'quiet' : 'full'});
    scene.classList.add('has-rig'); scene.dataset.rig = 'webgl';
    if (typeof ResizeObserver === 'function') { rigResize = new ResizeObserver(() => { if (rig) { rig.resize(); wakeRig(); } }); rigResize.observe(scene.querySelector('.assistant-rig')); }
    rigOptions(); wakeRig();
  }
  function dropRig() {
    stopRig(); if (rigResize) rigResize.disconnect();
    rig = null; motion = null; scene.classList.remove('has-rig','rig-arms'); scene.dataset.rig = 'fallback';
  }
  function rigOptions() {
    if (!rig) return;
    const quiet = scene.dataset.quality === 'quiet';
    rig.setMaxPixelRatio(quiet ? 1.25 : 2);
    motion.setOptions({reducedMotion:!motionAllowed(), quality:quiet ? 'quiet' : 'full'});
  }
  function stopRig() { cancelAnimationFrame(rigFrame); clearTimeout(rigTimer); rigFrame = 0; rigTimer = 0; }
  function wakeRig() { if (!rig || !visible()) return; stopRig(); rigFrame = requestAnimationFrame(rigStep); }
  function rigStep() {
    rigFrame = 0; rigTimer = 0;
    if (!rig || !visible() || !model) return;
    if (rig.lost) { dropRig(); return; }
    const now = Date.now(), pose = motion.update(model, now);
    rig.render(pose);
    scene.dataset.expression = pose.expression; scene.dataset.motion = pose.gesture.name+':'+pose.gesture.phase;
    if (pose.reducedMotion) return;
    const later = ms => { rigTimer = setTimeout(() => { rigFrame = requestAnimationFrame(rigStep); }, ms); };
    if (pose.rate === 'fast') rigFrame = requestAnimationFrame(rigStep);
    else if (pose.rate === 'steady') later(33);
    else if (pose.rate === 'ambient') later(50);
    else if (Number.isFinite(pose.nextAt)) later(Math.max(16, pose.nextAt-now));
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
      function finish(quality) {cancelAnimationFrame(probeFrame);clearTimeout(probeTimeout);scene.dataset.quality=quality;qualityDone=true;rigOptions();}
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
  window.JangeAssistant = Object.freeze({refresh,getState:()=>model ? JSON.parse(JSON.stringify(model)) : null,
    getRig:()=>rig ? {renderer:rig.info.renderer,vertices:rig.info.vertices,triangles:rig.info.triangles,pose:rig.lastPose ? JSON.parse(JSON.stringify(rig.lastPose)) : null,stats:rig.stats,arms:rig.info.arms,capture:rig.capture} : null});
  schedule();
})();
