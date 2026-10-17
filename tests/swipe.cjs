/* Isolated swipe regressions: loopback assets, blocked external traffic, no PC pairing/actions. */
const {chromium,webkit}=require(process.env.JARVIS_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||name.startsWith('.git'))return res.writeHead(403).end();
  try{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
  const browser=await engine.launch(name==='chromium'&&process.env.JARVIS_CHROME_CHANNEL?{channel:process.env.JARVIS_CHROME_CHANNEL}:{});
  try{
   const context=await browser.newContext({viewport:{width:1080,height:810},hasTouch:true,serviceWorkers:'block',reducedMotion:'no-preference'});
   await context.route('**/*',r=>{
    const url=r.request().url();
    if(url===base+'/roster.js')return r.fulfill({contentType:'application/javascript',body:'/* no alarms in gesture tests */'});
    return url.startsWith(base+'/')?r.continue():r.abort();
   });
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.swipeViolations=[];document.addEventListener('securitypolicyviolation',e=>window.swipeViolations.push(e.violatedDirective));});
   await page.goto(base);
   await page.waitForFunction(()=>!!window.JangeConsole);
   const current=()=>page.locator('#hud').getAttribute('data-active-page');
   const go=async name=>{await page.evaluate(n=>JangeConsole.navigate(n),name);};
   const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const transform=()=>page.locator('.console-page:not([hidden])').evaluate(e=>e.style.transform);
   async function touch(type,{selector='.console-page:not([hidden])',x=300,y=300,t=100,multi=false,remaining=false,id=7}={}){
    return page.locator(selector).first().evaluate((target,p)=>{
     const e=new Event(p.type,{bubbles:true,cancelable:true});
     const point={identifier:p.id,clientX:p.x,clientY:p.y};
     Object.defineProperties(e,{timeStamp:{value:p.t},touches:{value:p.type==='touchend'&&!p.remaining?[]:p.multi?[point,{identifier:8,clientX:p.x+10,clientY:p.y}]:[point]},changedTouches:{value:[point]}});
     target.dispatchEvent(e);return e.defaultPrevented;
    },{type,x,y,t,multi,remaining,id});
   }
   async function drag(dx,dy=0){await touch('touchstart');await touch('touchmove',{x:300+dx,y:300+dy,t:150});await frame();}
   async function finish(dx,dy=0,t=400){await touch('touchend',{x:300+dx,y:300+dy,t});}

   assert.deepEqual(await page.locator('.console-home-grid').evaluate(e=>[...e.children].map(n=>n.classList.contains('env')?'env':n.classList.contains('core-stage')?'core':n.classList.contains('console-shift')?'shift':'other')),['env','core','shift']);
   assert.equal(await page.locator('.core-stage').evaluate(e=>e.hidden||e.getAttribute('aria-hidden')==='true'),false);
   assert.equal(await page.locator('#core').count(),1);
   await page.locator('#core').evaluate(e=>e.click());
   assert.equal(await page.locator('#tasks-dialog').evaluate(e=>e.open),true,'original core handler survives relocation');
   await page.locator('#tasks-dialog').evaluate(e=>e.close());
   await page.waitForTimeout(30);

   // Follow the finger, without changing the page or stored selection before commitment.
   await drag(-70);
   assert.match(await transform(),/translate3d\(-/);
   assert.equal(await current(),'home');
   assert.equal(await page.evaluate(()=>localStorage.getItem('jange.console.page.v1')),'home');
   await finish(-180);
   assert.equal(await current(),'pc');
   assert.equal(await page.locator('#console-home').evaluate(e=>e.style.transform),'');
   // Suppress the compatibility click after a horizontal gesture, even over PC controls.
   assert.equal(await page.locator('.pc-controls button').first().evaluate(e=>{const ev=new MouseEvent('click',{bubbles:true,cancelable:true});e.dispatchEvent(ev);return ev.defaultPrevented;}),true);

   await go('home');await drag(-50);await finish(-50,0,500);
   assert.equal(await current(),'home','short, slow drag snaps back');
   assert.equal(await transform(),'');
   await page.waitForTimeout(220);
   await touch('touchstart');await touch('touchmove',{x:260,t:140});await touch('touchend',{x:255,t:160});
   assert.equal(await current(),'pc','short deliberate flick commits by velocity');

   await go('home');await touch('touchstart');
   assert.equal(await touch('touchmove',{x:302,y:340,t:130}),false,'vertical scroll is not prevented');
   await touch('touchmove',{x:100,y:345,t:160});await finish(-200,45);
   assert.equal(await current(),'home','vertical lock cannot become a page swipe');
   await drag(-90);await touch('touchcancel');
   assert.equal(await current(),'home');assert.equal(await transform(),'');
   await drag(-90);await touch('touchmove',{x:200,multi:true,t:170});await finish(-200);
   assert.equal(await current(),'home','multitouch cancels');
   await drag(-90);await touch('touchstart',{selector:'#settings-open',multi:true,t:170});await finish(-200);
   assert.equal(await current(),'home','second finger outside deck cancels');

   // Existing start/end-only synthetic tests still navigate.
   await page.locator('#console-home').evaluate(e=>{
    const a=new Event('touchstart',{bubbles:true});Object.defineProperty(a,'touches',{value:[{clientX:300,clientY:300}]});e.dispatchEvent(a);
    const z=new Event('touchend',{bubbles:true});Object.defineProperty(z,'changedTouches',{value:[{clientX:140,clientY:300}]});e.dispatchEvent(z);
   });
   assert.equal(await current(),'pc');
   for(const selector of ['.pc-controls','.pc-controls button','#control-authorize']){
    if(!await page.locator(selector).count())continue;
    await touch('touchstart',{selector});await touch('touchmove',{selector,x:100,t:150});await touch('touchend',{selector,x:100,t:200});
    assert.equal(await current(),'pc','control exclusion: '+selector);
   }
   await go('planner');await touch('touchstart',{selector:'.console-calendar'});await touch('touchend',{selector:'.console-calendar',x:100,t:200});
   assert.equal(await current(),'planner');
   await go('home');
   await page.locator('#console-home').evaluate(e=>{
    const box=document.createElement('div');box.id='swipe-scroll-fixture';box.style.width='100px';box.style.height='60px';box.style.overflow='auto';
    const child=document.createElement('div');child.style.width='300px';child.style.height='200px';box.append(child);e.append(box);
   });
   await touch('touchstart',{selector:'#swipe-scroll-fixture'});await touch('touchend',{selector:'#swipe-scroll-fixture',x:100,t:200});
   assert.equal(await current(),'home','scrollable region excluded');
   await page.locator('#swipe-scroll-fixture').evaluate(e=>e.remove());

   await drag(-90);
   await page.locator('#settings').evaluate(e=>e.showModal());await frame();
   assert.equal(await transform(),'');await finish(-200);assert.equal(await current(),'home');
   await page.locator('#settings').evaluate(e=>e.close());
   await drag(-90);await go('planner');await finish(-200);
   assert.equal(await current(),'planner','navigation cancels old gesture');
   await go('home');await drag(-90);
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await transform(),'');
   await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
   await finish(-200);assert.equal(await current(),'home','background cancels gesture');

   await go('planner');await touch('touchstart');await finish(-180);
   assert.equal(await current(),'home','wraparound swipe commits');
   assert.equal(await page.locator('#console-home').evaluate(e=>e.getAnimations().some(a=>a.effect.getKeyframes()[0].transform==='translateX(48px)')),true,'wraparound enters from swipe direction');
   await touch('touchstart');await touch('touchmove',{x:210,t:150});
   await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await frame();
   assert.equal(await transform(),'','pagehide cancels queued animation frame');
   await finish(-200);assert.equal(await current(),'home');
   await drag(-90);await page.emulateMedia({reducedMotion:'reduce'});await frame();
   assert.equal(await transform(),'','changing motion preference cancels active drag');
   await page.emulateMedia({reducedMotion:'reduce'});await drag(-90);
   assert.equal(await transform(),'','Reduce Motion prevents drag');
   await finish(-180);assert.equal(await current(),'pc');
   await go('home');await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(()=>document.documentElement.classList.add('calm'));await drag(-90);
   assert.equal(await transform(),'','Calm prevents drag');await touch('touchcancel');
   await page.evaluate(()=>document.documentElement.classList.remove('calm'));
   await page.locator('#console-home').focus();await page.keyboard.press('ArrowRight');
   assert.equal(await current(),'pc','keyboard navigation retained');
   await go('home');
   assert.deepEqual(await page.locator('.core-stage .ring').evaluateAll(es=>es.map(e=>({name:getComputedStyle(e).animationName,state:getComputedStyle(e).animationPlayState}))),[{name:'spin',state:'running'},{name:'spin',state:'running'}],'normal Home rings run');
   await page.evaluate(()=>{document.documentElement.classList.add('calm');document.querySelector('#hud').setAttribute('data-busy','');});
   assert.equal(await page.locator('.core-avatar').evaluate(e=>getComputedStyle(e,'::after').animationName),'none','Calm busy avatar does not pulse');
   assert.deepEqual(await page.locator('.core-stage .ring').evaluateAll(es=>es.map(e=>getComputedStyle(e).animationName)),['none','none'],'Calm rings do not animate');
   await page.evaluate(()=>{document.documentElement.classList.remove('calm');document.querySelector('#hud').removeAttribute('data-busy');});
   await go('pc');
   assert.deepEqual(await page.locator('.core-stage .ring').evaluateAll(es=>es.map(e=>getComputedStyle(e).animationPlayState)),['paused','paused'],'PC page pauses hidden core rings');
   assert.equal(await page.locator('.pc-controls button:disabled').count(),5);
   assert.deepEqual(await page.evaluate(()=>window.swipeViolations),[],'CSSOM drag respects strict CSP');
   assert.deepEqual(errors,[]);
   await context.close();console.log('PASS '+name+' swipe/core: drag, distance/flick, cancellation, exclusions, motion, CSP, keyboard');
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
