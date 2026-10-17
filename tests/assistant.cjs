/* Synthetic current-weather scenes only; never pairs or executes PC controls. */
const {chromium,webkit}=require(process.env.JARVIS_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||name.startsWith('.git'))return res.writeHead(403).end();try{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
 const b=await engine.launch();try{
 const ctx=await b.newContext({viewport:{width:1080,height:810},timezoneId:'America/New_York',hasTouch:true,serviceWorkers:'block',reducedMotion:'no-preference',recordVideo:{dir:path.join(out,'assistant-recordings'),size:{width:1080,height:810}}});
 let current={temperature_2m:29,apparent_temperature:30,relative_humidity_2m:45,wind_speed_10m:8,wind_direction_10m:90,is_day:1,weather_code:0,time:'2026-10-17T12:00'};
 let rejectWeather=false;
 await ctx.route('https://api.open-meteo.com/**',r=>rejectWeather?r.abort():r.fulfill({json:{timezone:'Asia/Dubai',utc_offset_seconds:14400,current,daily:{weather_code:[95],time:['2026-10-17'],temperature_2m_max:[40],temperature_2m_min:[25]}}}));
 await ctx.route('**/roster.js',r=>r.fulfill({contentType:'application/javascript',body:'/* no test alarms */'}));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));ctx.setDefaultTimeout(10000);
 await p.clock.install({time:new Date('2026-10-17T08:00:00Z')});await p.goto(base);await p.clock.pauseAt(new Date('2026-10-17T08:00:01Z'));
 await p.waitForFunction(()=>window.JangeAssistant?.getState()?.fresh);await p.clock.runFor(3000);
 await p.evaluate(()=>{const b=document.createElement('div');b.textContent='DEMONSTRATION · synthetic weather fixtures';b.style.position='fixed';b.style.top='0';b.style.right='0';b.style.fontSize='10px';b.style.color='#d9c08e';b.style.zIndex='99';document.body.append(b);});
 const scene=p.locator('.living-scene');const state=()=>p.evaluate(()=>JangeAssistant.getState());
 const shot=async n=>{await p.waitForTimeout(250);await p.screenshot({path:path.join(out,name+'-assistant-'+n+'.png')});};
 const change=async fields=>{Object.assign(current,fields);await p.evaluate(()=>weather());await p.clock.runFor(11000);};
 assert.equal((await state()).condition,'clear','daily storm forecast never drives current atmosphere');
 assert.equal(await p.locator('#kathmandu-date').isVisible(),false);assert.equal(await scene.isVisible(),true);await shot('clear');
 await scene.locator('.assistant-touch').click();assert.equal((await state()).activity,'attention');await p.clock.runFor(3000);assert.notEqual((await state()).activity,'attention');
 await change({weather_code:61});assert.equal((await state()).condition,'rain');assert.equal((await state()).gesture,'umbrella');assert.equal(await scene.locator('.assistant-rain-covered .assistant-rain-strokes').evaluate(e=>getComputedStyle(e).animationName),'assistant-rain');await shot('rain');
 await change({weather_code:0,temperature_2m:43,apparent_temperature:46});assert.equal((await state()).condition,'heat');assert.equal((await state()).gesture,'wipe');assert.equal(await scene.locator('.assistant-wiping-arm').evaluate(e=>getComputedStyle(e).animationName),'assistant-wipe');await shot('heat');await p.clock.runFor(6000);assert.equal((await state()).gesture,'idle','heat wipe finishes');
 await change({temperature_2m:7,apparent_temperature:5});assert.equal((await state()).condition,'cold');assert.equal((await state()).gesture,'wrap');await shot('cold');
 await change({temperature_2m:24,apparent_temperature:24,wind_speed_10m:40,wind_direction_10m:90});assert.equal((await state()).condition,'wind');assert.equal(await scene.getAttribute('data-direction'),'left');await shot('wind');await change({wind_direction_10m:null});assert.equal(await scene.locator('.assistant-hair-tail').evaluate(e=>getComputedStyle(e).animationName),'none','unknown direction must not imply a bearing');
 await change({weather_code:95});assert.equal((await state()).condition,'storm');await shot('storm');
 await p.clock.setSystemTime(new Date('2026-10-17T18:00:00Z'));Object.assign(current,{weather_code:0,temperature_2m:25,apparent_temperature:25,wind_speed_10m:5,is_day:0,time:'2026-10-17T22:00'});await p.evaluate(()=>weather());await p.clock.runFor(11000);assert.equal((await state()).phase,'night');assert.equal(await scene.locator('.assistant-heat').evaluate(e=>getComputedStyle(e).opacity),'0','ordinary night has no heat overlay');await shot('night');await change({temperature_2m:43,apparent_temperature:45});assert.equal(await scene.locator('.assistant-sun').evaluate(e=>getComputedStyle(e).opacity),'0','hot night has no sun');
 rejectWeather=true;await p.evaluate(()=>weather());assert.equal((await state()).condition,'neutral');assert.equal((await state()).gesture,'idle');await shot('unavailable');
 rejectWeather=false;await p.evaluate(()=>weather());await p.evaluate(()=>{sys.net=false;setSystems();});assert.equal((await state()).condition,'neutral');await p.evaluate(()=>{sys.net=true;setSystems();});
 await p.evaluate(()=>{lastWeather.fetched-=21*60000;JangeAssistant.refresh();});assert.equal((await state()).reason,'stale-weather');
 await p.evaluate(()=>{pcStatus('online','fixture');});assert.equal((await state()).activity,'connected');await p.evaluate(()=>{pcStatus('unreachable','fixture');});assert.equal((await state()).activity,'disconnected');await p.evaluate(()=>{pcStatus('auth','fixture');});assert.equal((await state()).activity,'error');await p.evaluate(()=>pcStatus('off','fixture'));
 await p.evaluate(()=>{setBusy('test-operation',true);});assert.equal((await state()).activity,'processing');await p.evaluate(()=>setBusy('test-operation',false));assert.notEqual((await state()).activity,'processing','no fake spinner hold');
 await p.locator('[data-page-target="pc"]').click();assert.equal(await scene.getAttribute('data-paused'),'true');await p.screenshot({path:path.join(out,name+'-living-pc.png')});
 await p.locator('[data-page-target="planner"]').click();await p.screenshot({path:path.join(out,name+'-living-planner.png')});await p.locator('[data-page-target="home"]').click();
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await scene.getAttribute('data-paused'),'true');await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await scene.evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'static reduced motion fallback');
 for(const [width,height] of [[1080,810],[1080,740],[1024,768],[810,1080],[375,812]]){await p.setViewportSize({width,height});const box=await p.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));assert.ok(box.w<=width, name+' horizontal overflow');if(width>900)assert.ok(box.h<=height,name+' landscape overflow '+box.h+' > '+height);}
 assert.deepEqual(errors,[]);assert.ok(!['speaking','listening'].includes((await state()).activity));
 const video=p.video();await ctx.close();await video.saveAs(path.join(out,name+'-assistant-reactions.webm'));console.log(name+': PASS coherent rain/heat/cold/wind/storm/night, stale/offline, real event states, visibility, reduced motion and layouts');
 }finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
