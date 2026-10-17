/* Expressive WebGL rig in the real desk: identity at rest, expressions from real states,
   pause/resume, reduced motion, context-loss and no-WebGL fallbacks, demo captures and
   frame timing. Synthetic weather fixtures only; never pairs or executes PC controls. */
const {chromium,webkit}=require(process.env.JARVIS_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=path.join(process.env.JARVIS_TEST_OUTPUT||path.join(root,'test-results'),'rig');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||name.startsWith('.git'))return res.writeHead(403).end();try{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
const report={environment:'Windows desktop Playwright engines (Chromium SwiftShader, WebKit software compositing); not a physical iPad',results:[]};
async function weatherContext(browser,extra){
  const ctx=await browser.newContext({viewport:{width:1210,height:834},timezoneId:'Asia/Dubai',hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:'no-preference',...extra});
  const fixture={current:{temperature_2m:29,apparent_temperature:30,relative_humidity_2m:45,wind_speed_10m:8,wind_direction_10m:90,is_day:1,weather_code:0,time:'2026-10-17T12:00'}};
  await ctx.route('https://api.open-meteo.com/**',r=>r.fulfill({json:{timezone:'Asia/Dubai',utc_offset_seconds:14400,current:fixture.current,daily:{weather_code:[0],time:['2026-10-17'],temperature_2m_max:[31],temperature_2m_min:[25]}}}));
  await ctx.route('**/roster.js',r=>r.fulfill({contentType:'application/javascript',body:'/* no test alarms */'}));
  return {ctx,fixture};
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
 const b=await engine.launch();try{
 const {ctx,fixture}=await weatherContext(b,{recordVideo:{dir:path.join(out,'recordings'),size:{width:1210,height:834}}});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));ctx.setDefaultTimeout(15000);
 await p.clock.install({time:new Date('2026-10-17T08:00:00Z')});await p.goto(base);await p.clock.pauseAt(new Date('2026-10-17T08:00:10Z'));
 await p.waitForFunction(()=>window.JangeAssistant?.getState()?.fresh);
 for(let i=0;i<20 && !(await p.evaluate(()=>document.querySelector('.living-scene').dataset.rig==='webgl'));i++) await p.clock.runFor(500);
 const scene=p.locator('.living-scene'),rig=()=>p.evaluate(()=>JangeAssistant.getRig());
 assert.equal(await scene.getAttribute('data-rig'),'webgl',name+' rig initialises');
 const info=await rig();assert.ok(info.vertices>10000 && info.triangles>20000,'dense facial mesh');
 await p.clock.runFor(600);
 await p.waitForFunction(()=>getComputedStyle(document.querySelector('.assistant-photo-idle')).opacity==='0' && getComputedStyle(document.querySelector('.assistant-rig')).opacity==='1',null,{timeout:5000});
 const crop=async n=>{const box=await scene.locator('.assistant-touch').boundingBox();await p.screenshot({path:path.join(out,name+'-'+n+'.png'),clip:{x:box.x+box.width*.2,y:box.y,width:box.width*.6,height:box.height*.62}});};
 const expr=()=>scene.getAttribute('data-expression');
 // Advance the fake clock in short steps: long single jumps run hundreds of unpresented frames.
 const advance=async ms=>{for(let t=0;t<ms;t+=500)await p.clock.runFor(Math.min(500,ms-t));};
 const change=async fields=>{Object.assign(fixture.current,fields);await p.evaluate(()=>weather());await advance(11000);};
 assert.equal(await expr(),'relaxed');await crop('relaxed');
 // Micro-behaviour actually moves: lids, gaze and head vary over time while idle.
 const lids=new Set(),gaze=new Set(),yaw=new Set();
 for(let i=0;i<60;i++){await p.clock.runFor(250);const pose=(await rig()).pose;lids.add(pose.face.lidL.toFixed(2));gaze.add(pose.face.gazeX.toFixed(2));yaw.add(pose.head.yaw.toFixed(2));}
 assert.ok(lids.size>2 && gaze.size>3 && yaw.size>3,'blinks, saccades and head drift while idle');
 await scene.locator('.assistant-touch').click();await p.clock.runFor(400);assert.equal(await expr(),'curious','tap: attentive eye contact');
 assert.ok(Math.abs((await rig()).pose.face.gazeX)<.08);await crop('attention');await p.clock.runFor(3000);assert.notEqual(await expr(),'curious');
 await p.evaluate(()=>setBusy('rig-test',true));await p.clock.runFor(700);assert.equal(await expr(),'concentrating');await crop('processing');await p.evaluate(()=>setBusy('rig-test',false));
 await p.evaluate(()=>pcStatus('auth','fixture'));await p.clock.runFor(700);assert.equal(await expr(),'concerned','error: controlled concern');await crop('error');
 await p.evaluate(()=>pcStatus('online','fixture'));await p.clock.runFor(700);assert.equal(await expr(),'content','connected: relaxed confidence');await crop('connected');
 await p.evaluate(()=>pcStatus('off','fixture'));
 // Heat wipe on the canonical face: the derived arm rises, strokes with eyes closed, lowers.
 // Sample from the weather change itself: the condition settles for 8 s before the wipe starts.
 Object.assign(fixture.current,{temperature_2m:43,apparent_temperature:46});await p.evaluate(()=>weather());
 const wipeSeen=new Set();let wipeArm=false,shot=false;
 for(let i=0;i<90;i++){await p.clock.runFor(200);const r=await rig();wipeSeen.add(r.pose.gesture.phase);if(r.stats.arms>0)wipeArm=true;if(!shot&&r.pose.gesture.phase==='wipe'){shot=true;await crop('heat-wipe');}}
 assert.equal((await p.evaluate(()=>JangeAssistant.getState())).condition,'heat');
 assert.ok(['raise','wipe','lower'].every(x=>wipeSeen.has(x)),'wipe phases '+[...wipeSeen]);assert.ok(wipeArm,'arm layer drawn');
 assert.equal(await scene.locator('.assistant-photo-wipe').evaluate(e=>getComputedStyle(e).opacity),'0','no face swap to the wipe photo');
 await p.clock.runFor(1000);assert.equal(await expr(),'heat','weather discomfort');await crop('heat');
 await change({temperature_2m:24,apparent_temperature:24,wind_speed_10m:40});await p.clock.runFor(1000);assert.equal(await expr(),'wind');await crop('wind');
 await change({wind_speed_10m:8});
 if(name==='chromium'){
 // Rain: the umbrella materialises, opens once, deflects rain while held and folds away after.
 await change({weather_code:61});assert.equal((await p.evaluate(()=>JangeAssistant.getState())).gesture,'umbrella');
 await advance(3500);let r0=await rig();assert.equal(r0.pose.umbrella.state,'open');assert.equal(r0.stats.umbrella,true);
 assert.equal(await scene.locator('.assistant-photo-umbrella').evaluate(e=>getComputedStyle(e).opacity),'0','no face swap to the umbrella photo');
 let splashes=0;for(let i=0;i<10;i++){await p.clock.runFor(300);splashes=Math.max(splashes,(await rig()).stats.splashes);}assert.ok(splashes>0,'rain splashes off the canopy');await crop('rain-umbrella');
 await advance(10000);assert.equal((await rig()).pose.umbrella.state,'open','no re-opening while rain continues');
 await change({weather_code:0});await advance(2500);r0=await rig();assert.equal(r0.pose.umbrella.state,'closed');assert.equal(r0.stats.umbrella,false);
 }
 // Cold: shoulders lift, cold expression and breath vapour; never the wrap photo's face.
 await change({temperature_2m:6,apparent_temperature:4});await p.clock.runFor(2500);assert.equal(await expr(),'cold');
 let puffs=0;for(let i=0;i<20;i++){await p.clock.runFor(400);puffs=Math.max(puffs,(await rig()).stats.puffs);}assert.ok(puffs>0,'breath vapour');
 assert.equal(await scene.locator('.assistant-photo-wrap').evaluate(e=>getComputedStyle(e).opacity),'0');await crop('cold');
 await change({temperature_2m:24,apparent_temperature:24});
 // Off Home and hidden: no frames are rendered; returning resumes coherently.
 await p.locator('[data-page-target="pc"]').click();const t0=(await rig()).pose.t;await p.clock.runFor(3000);assert.equal((await rig()).pose.t,t0,'no rendering off Home');
 await p.locator('[data-page-target="home"]').click();await p.clock.runFor(200);assert.ok((await rig()).pose.t>t0,'resumes on Home');
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 const t1=(await rig()).pose.t;await p.clock.runFor(3000);assert.equal((await rig()).pose.t,t1,'no rendering while hidden');
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await p.clock.runFor(200);
 // Reduced motion renders one static frame per state change; the static face is the approved portrait.
 await p.emulateMedia({reducedMotion:'reduce'});await p.clock.runFor(800);
 const s0=(await rig()).pose;assert.equal(s0.reducedMotion,true);await p.clock.runFor(2500);assert.equal((await rig()).pose.t,s0.t,'no frame loop under Reduce Motion');
 assert.equal(await expr(),'relaxed');
 const identity=await p.evaluate(async()=>{
   const shot=JangeAssistant.getRig().capture(),img=document.querySelector('.assistant-photo-idle');
   const W=shot.width,H=shot.height,x0=(shot.view[2]+1)/2*W,y0=(1-shot.view[3])/2*H,s=shot.scale;
   const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');g.drawImage(img,x0,y0,600*s,800*s);
   const ref=g.getImageData(0,0,W,H).data;let best=null;
   // GL reads back premultiplied colour; premultiply the 2D reference. Allow one device pixel of rounding.
   for(const [ox,oy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){let sum=0,n=0,max=0;
     for(let iy=250;iy<430;iy+=2)for(let ix=230;ix<370;ix+=2){const X=Math.round(x0+ix*s),Y=Math.round(y0+iy*s),a=((H-1-Y)*W+X)*4,r=((Y+oy)*W+X+ox)*4;
       for(let k=0;k<3;k++){const d=Math.abs(shot.pixels[a+k]-ref[r+k]*ref[r+3]/255);sum+=d;n++;if(d>max)max=d;}}
     if(!best||sum/n<best.mean)best={mean:sum/n,max,samples:n/3,offset:[ox,oy]};}
   const pose=JangeAssistant.getRig().pose;best.pose={head:pose.head,lean:pose.body.lean,expression:pose.expression,light:pose.light};
   return best;
 });
 assert.ok(identity.mean<3,name+' static rig face matches idle.webp: '+JSON.stringify(identity));
 report.results.push({engine:name,renderer:info.renderer,vertices:info.vertices,triangles:info.triangles,identityMeanAbsDiff:+identity.mean.toFixed(3),identityMax:identity.max});
 await p.emulateMedia({reducedMotion:'no-preference'});await p.clock.runFor(500);
 // Context loss falls back to the complete photo renderer without errors.
 await p.evaluate(()=>{window.__lose=document.querySelector('.assistant-rig').getContext('webgl').getExtension('WEBGL_lose_context');window.__lose.loseContext();});
 await p.clock.runFor(800);assert.equal(await scene.getAttribute('data-rig'),'fallback');
 assert.equal(await scene.evaluate(e=>e.classList.contains('has-rig')),false);
 // CSS opacity transitions run on real time, not the fake clock: wait for the fade to finish.
 await p.waitForFunction(()=>getComputedStyle(document.querySelector('.assistant-photo-idle')).opacity==='1',null,{timeout:5000});
 // The restored context brings the rig back without a reload.
 await p.evaluate(()=>window.__lose.restoreContext());for(let i=0;i<10 && await scene.getAttribute('data-rig')!=='webgl';i++) await p.clock.runFor(300);
 assert.equal(await scene.getAttribute('data-rig'),'webgl','rig restored with the context');
 assert.deepEqual(errors,[]);const video=p.video();await ctx.close();await video.saveAs(path.join(out,name+'-expressions.webm'));
 // WebKit: Windows Playwright WebKit crashes in long fake-clock WebGL rain, so rain runs in real time.
 if(name==='webkit'){
  const {ctx:ctxR,fixture:fxR}=await weatherContext(b,{});Object.assign(fxR.current,{weather_code:61,time:new Date(Date.now()+4*3600e3).toISOString().slice(0,16)});
  const pr=await ctxR.newPage(),errorsR=[];pr.on('pageerror',e=>errorsR.push(e.message));await pr.goto(base);
  await pr.waitForFunction(()=>JangeAssistant.getRig()?.pose?.umbrella?.state==='open',null,{timeout:30000});
  assert.equal(await pr.locator('.assistant-photo-umbrella').evaluate(e=>getComputedStyle(e).opacity),'0','no face swap to the umbrella photo');
  await pr.waitForFunction(()=>JangeAssistant.getRig().stats.splashes>0,null,{timeout:10000});
  const box=await pr.locator('.assistant-touch').boundingBox();await pr.screenshot({path:path.join(out,name+'-rain-umbrella.png'),clip:{x:box.x+box.width*.1,y:box.y,width:box.width*.8,height:box.height*.62}});
  Object.assign(fxR.current,{weather_code:0});await pr.evaluate(()=>weather());
  await pr.waitForFunction(()=>JangeAssistant.getRig().pose.umbrella.state==='closed',null,{timeout:60000});
  assert.equal((await pr.evaluate(()=>JangeAssistant.getRig().stats.umbrella)),false);assert.deepEqual(errorsR,[]);await ctxR.close();
 }
 // No WebGL at all: the photo portrait is the unchanged fallback.
 const {ctx:ctx2}=await weatherContext(b,{});await ctx2.addInitScript(()=>{const real=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...a){return /webgl/.test(type)?null:real.call(this,type,...a);};});
 const p2=await ctx2.newPage(),errors2=[];p2.on('pageerror',e=>errors2.push(e.message));await p2.goto(base);await p2.waitForFunction(()=>document.querySelector('.living-scene')?.classList.contains('has-realistic-portrait'));await p2.waitForTimeout(800);
 assert.equal(await p2.evaluate(()=>document.querySelector('.living-scene').classList.contains('has-rig')),false);
 assert.equal(await p2.locator('.assistant-photo-idle').evaluate(e=>getComputedStyle(e).opacity),'1');assert.deepEqual(errors2,[]);await ctx2.close();
 // Arm atlas unavailable: the rig still renders expressions; weather gestures use the pose photos.
 const {ctx:ctx4,fixture:fx4}=await weatherContext(b,{});await ctx4.route('**/brand/assistant/arms.webp',r=>r.abort());
 const p4=await ctx4.newPage(),errors4=[];p4.on('pageerror',e=>errors4.push(e.message));
 await p4.clock.install({time:new Date('2026-10-17T08:00:00Z')});await p4.goto(base);await p4.clock.pauseAt(new Date('2026-10-17T08:00:10Z'));
 await p4.waitForFunction(()=>window.JangeAssistant?.getState()?.fresh);
 for(let i=0;i<20 && !(await p4.evaluate(()=>document.querySelector('.living-scene').dataset.rig==='webgl'));i++) await p4.clock.runFor(500);
 assert.equal(await p4.evaluate(()=>document.querySelector('.living-scene').classList.contains('rig-arms')),false);
 Object.assign(fx4.current,{weather_code:61});await p4.evaluate(()=>weather());await p4.clock.runFor(11000);
 await p4.waitForFunction(()=>getComputedStyle(document.querySelector('.assistant-photo-umbrella')).opacity==='1' && getComputedStyle(document.querySelector('.assistant-rig')).opacity==='0',null,{timeout:5000});assert.deepEqual(errors4,[]);await ctx4.close();
 // Real-time frame pacing with the rig idling (ambient breathing/drift at a reduced rate).
 const {ctx:ctx3}=await weatherContext(b,{});const p3=await ctx3.newPage();await p3.goto(base);
 await p3.waitForFunction(()=>document.querySelector('.living-scene')?.dataset.rig==='webgl' && document.querySelector('.living-scene').dataset.quality);await p3.waitForTimeout(1500);
 const perf=await p3.evaluate(async()=>{const deltas=[],renders=new Set();let last=performance.now();
   await new Promise(done=>{function f(t){deltas.push(t-last);last=t;const r=JangeAssistant.getRig();if(r&&r.pose)renders.add(r.pose.t);if(deltas.length<180)requestAnimationFrame(f);else done();}requestAnimationFrame(f);});
   deltas.shift();const span=deltas.reduce((a,b)=>a+b,0);deltas.sort((a,b)=>a-b);
   return {quality:document.querySelector('.living-scene').dataset.quality,medianMs:+deltas[Math.floor(deltas.length/2)].toFixed(1),p95Ms:+deltas[Math.floor(deltas.length*.95)].toFixed(1),
     rendersPerSecond:+(renders.size/(span/1000)).toFixed(1),heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null};});
 Object.assign(report.results[report.results.length-1],{idlePerf:perf,estimatedGpuMB:+((2*600*800*4+info.vertices*7*4+info.triangles*3*2)/1048576).toFixed(2)});
 await p3.locator('[data-page-target="pc"]').click();await p3.waitForTimeout(500);
 const offPage=await p3.evaluate(async()=>{const a=JangeAssistant.getRig().pose.t;await new Promise(r=>setTimeout(r,1200));return JangeAssistant.getRig().pose.t===a;});
 assert.equal(offPage,true,'real-time: no renders off Home');await ctx3.close();
 console.log(name+': PASS rig identity '+identity.mean.toFixed(2)+', expressions from real states, pause/resume, reduced motion, fallbacks; idle '+JSON.stringify(perf));
 }finally{await b.close();}
}
fs.writeFileSync(path.join(out,'rig-report.json'),JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
