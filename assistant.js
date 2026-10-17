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
  }
  // One bounded frame sample selects quieter rendering on slow engines; no perpetual frame loop.
  let qualityDone=false, probeFrame=0, probeTimeout=0, probeDelay=0, blinkTimer=0, blinkEnd=0;
  const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
  function motionAllowed() {return !motionPreference.matches && !document.documentElement.classList.contains('calm') && !document.body.classList.contains('calm') && scene.dataset.static!=='true' && !scene.classList.contains('assistant-static');}
  function stopMotionWork() {
    cancelAnimationFrame(probeFrame);clearTimeout(probeTimeout);clearTimeout(probeDelay);
    clearTimeout(blinkTimer);clearTimeout(blinkEnd);scene.classList.remove('portrait-blinking');
  }
  function quietBlink() {
    if(!visible()) return;
    if(scene.dataset.quality==='quiet' && scene.dataset.static!=='true' && !scene.classList.contains('assistant-static') && !['umbrella','wipe','wrap','alert'].includes(model?.gesture) && model?.condition!=='storm' && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('calm') && !document.body.classList.contains('calm')) {
      scene.classList.add('portrait-blinking');blinkEnd=setTimeout(()=>scene.classList.remove('portrait-blinking'),130);
    }
    blinkTimer=setTimeout(quietBlink,7900);
  }
  function startMotionWork() {
    stopMotionWork();if(!visible() || !motionAllowed()) return;
    blinkTimer=setTimeout(quietBlink,7900);
    if(qualityDone || !scene.classList.contains('has-realistic-portrait')) return;
    probeDelay=setTimeout(()=>{
      const intervals=[];let last=performance.now();
      function finish(quality) {cancelAnimationFrame(probeFrame);clearTimeout(probeTimeout);scene.dataset.quality=quality;qualityDone=true;}
      function sample(now) {
        if(!visible()) return;
        intervals.push(now-last);last=now;
        if(intervals.length>=40) {const sorted=intervals.slice(5).sort((a,b)=>a-b);finish(sorted[Math.floor(sorted.length/2)]>40?'quiet':'full');}
        else probeFrame=requestAnimationFrame(sample);
      }
      probeTimeout=setTimeout(()=>finish('quiet'),4500);probeFrame=requestAnimationFrame(sample);
    },1200);
  }
  scene.addEventListener('jange:portrait-ready',startMotionWork);
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
  window.JangeAssistant = Object.freeze({refresh,getState:()=>model ? JSON.parse(JSON.stringify(model)) : null});
  schedule();
})();
