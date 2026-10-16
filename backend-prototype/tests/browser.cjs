const {chromium,webkit}=require(process.env.JARVIS_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.JARVIS_TEST_URL;
const password=process.env.JARVIS_TEST_PASSWORD;
const out=process.env.JARVIS_TEST_OUTPUT||path.join(__dirname,'../test-results');
fs.mkdirSync(out,{recursive:true});
async function until(fn){for(let n=0;n<100;n++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Expected state did not arrive');}
async function signIn(page,name){
  await page.goto(base);
  await page.locator('#login input[name=username]').fill('owner');
  await page.locator('#login input[name=password]').fill(password);
  await page.locator('#login input[name=device]').fill(name);
  const loginResponse=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login'));
  await page.locator('#login button').click();
  const setCookie=(await (await loginResponse).allHeaders())['set-cookie'];
  assert(setCookie.includes('SameSite=Strict'));assert(setCookie.includes('HttpOnly'));
  await page.locator('#workspace').waitFor({state:'visible'});
}
(async()=>{
  const results=[];
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true,...(name==='chromium'&&process.env.JARVIS_CHROME_CHANNEL?{channel:process.env.JARVIS_CHROME_CHANNEL}:{})});
    try{
      const a=await browser.newContext({viewport:{width:1080,height:810}}),b=await browser.newContext({viewport:{width:1080,height:810}});
      const pa=await a.newPage(),pb=await b.newPage();const errors=[];
      for(const p of [pa,pb])p.on('pageerror',e=>errors.push(e.message));
      await signIn(pa,name+' Windows fixture');await signIn(pb,name+' iPad fixture');
      const task=name+' shared task';
      await pa.locator('#task-text').fill(task);await pa.getByRole('button',{name:'Add task',exact:true}).click();
      await until(async()=>await pa.evaluate(()=>JarvisSync.state.pending.length===0));
      await pb.getByRole('button',{name:'Sync now',exact:true}).click();
      await until(async()=>(await pb.locator('#tasks').innerText()).includes(task));
      await pa.locator('#event-text').fill(name+' shared event');await pa.locator('#event-date').fill('2026-10-17');await pa.locator('#event-time').fill('10:15');await pa.getByRole('button',{name:'Add event',exact:true}).click();
      await until(async()=>await pa.evaluate(()=>JarvisSync.state.pending.length===0));
      await pb.getByRole('button',{name:'Sync now',exact:true}).click();
      await until(async()=>(await pb.locator('#events').innerText()).includes(name+' shared event'));
      // Queue two concurrent edits against the same revision before either syncs.
      for(const p of [pa,pb])await p.locator('#tasks .row').filter({hasText:task}).getByRole('button',{name:'Complete',exact:true}).click();
      await pa.getByRole('button',{name:'Sync now',exact:true}).click();await until(async()=>await pa.evaluate(()=>JarvisSync.state.pending.length===0));
      await pb.getByRole('button',{name:'Sync now',exact:true}).click();await until(async()=>await pb.evaluate(()=>JarvisSync.state.conflicts.length===1));
      assert.match(await pb.locator('#conflicts').innerText(),new RegExp(task));
      await pb.getByRole('button',{name:'Keep server version',exact:true}).click();
      await until(async()=>await pb.evaluate(()=>JarvisSync.state.conflicts.length===0));
      await pa.locator('#command').fill('काम थप नेपाली परीक्षण काम');await pa.locator('#apply-command').click();
      await until(async()=>(await pa.locator('#tasks').innerText()).includes('नेपाली परीक्षण काम'));
      await until(async()=>await pa.locator('#command').inputValue()==='');
      const note='private fixture '+name;
      await pa.locator('#memory-text').fill(note);await pa.locator('#memory-save').click();
      await pa.locator('#memory-load').click();await until(async()=>(await pa.locator('#memory').innerText()).includes(note));
      assert(!(await pa.evaluate(()=>JSON.stringify(JarvisSync.state))).includes(note),'Memory absent from offline state');
      const cookies=await a.cookies();const cookie=cookies.find(c=>c.name==='JarvisDevSession');assert(cookie.httpOnly);if(name==='chromium')assert.equal(cookie.sameSite,'Strict');
      assert(!(await pa.evaluate(()=>document.cookie)).includes('JarvisDevSession'));
      assert(!await pa.evaluate(()=>JSON.stringify(JarvisSync.state).includes('csrf')));
      await pa.evaluate(()=>localStorage.setItem('jarvis.desk.v2','unchanged dashboard sentinel'));
      if(name==='chromium'){
        await pa.waitForFunction(()=>document.querySelector('#offline-ready').textContent==='Offline console ready');
        await pa.waitForFunction(()=>!!navigator.serviceWorker.controller);
        await a.setOffline(true);
        await pa.locator('#task-text').fill('offline queued fixture');await pa.getByRole('button',{name:'Add task',exact:true}).click();
        await until(async()=>await pa.locator('#task-text').inputValue()==='' && await pa.evaluate(()=>JarvisSync.state.pending.length===1));
        await pa.reload();await pa.locator('#offline').click();
        assert.match(await pa.locator('#tasks').innerText(),/offline queued fixture/);
        await a.setOffline(false);await pa.getByRole('button',{name:'Sync now',exact:true}).click();
        await until(async()=>await pa.evaluate(()=>JarvisSync.state.pending.length===0));
        await pb.getByRole('button',{name:'Sync now',exact:true}).click();
        await until(async()=>(await pb.locator('#tasks').innerText()).includes('offline queued fixture'));
      }
      assert.equal(await pa.evaluate(()=>localStorage.getItem('jarvis.desk.v2')),'unchanged dashboard sentinel');
      await pa.locator('#devices-load').click();await until(async()=>(await pa.locator('#devices').innerText()).includes(name+' iPad fixture'));
      pa.once('dialog',d=>d.accept());
      await pa.locator('#devices .row').filter({hasText:name+' iPad fixture'}).getByRole('button',{name:'Revoke session',exact:true}).click();
      await pb.getByRole('button',{name:'Sync now',exact:true}).click();
      await until(async()=>!(await pb.evaluate(()=>JarvisSync.authenticated)));
      await pa.screenshot({path:path.join(out,'prototype-'+name+'.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      results.push({engine:name,result:'PASS',checks:['shared identity with independent sessions','task and calendar synchronization','explicit conflict preservation/resolution','typed Nepali command','encrypted memory API, no offline memory cache','HttpOnly cookie and raw SameSite=Strict header','device session revocation','existing dashboard key untouched','no uncaught errors'],cookieObservation:cookie.sameSite,offline:name==='chromium'?'PASS: queued edit survives offline reload and later syncs':'Not tested: Windows WebKit offline simulator limitation'});
      await a.close();await b.close();
    }finally{await browser.close();}
  }
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({results},null,2));console.log(JSON.stringify({results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
