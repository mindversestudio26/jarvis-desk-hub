const {chromium,webkit}=require(process.env.JARVIS_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.JARVIS_TEST_URL,out=process.env.JARVIS_TEST_OUTPUT||path.join(__dirname,'../test-results');
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('State timed out');}
(async()=>{
 const results=[];
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true,...(name==='chromium'&&process.env.JARVIS_CHROME_CHANNEL?{channel:process.env.JARVIS_CHROME_CHANNEL}:{})});
  try{
   const context=await browser.newContext({viewport:{width:1080,height:810}});
   // Test the Safari-compatible IDB path even without BroadcastChannel/Web Locks.
   await context.addInitScript(()=>{
    window.BroadcastChannel=undefined;window.setInterval=()=>0;
    const original=window.fetch;
    window.fetch=async function(url,options){
     if(String(url).startsWith('/api/')&&localStorage.getItem('jange-fixture-offline')==='1')throw TypeError('Synthetic transport unavailable');
     const response=await original.call(this,url,options);
     if(window.fixtureHoldSnapshot&&String(url)==='/api/v1/sync'&&options?.method==='GET'){window.fixtureSnapshotWaiting=true;await new Promise(resolve=>{window.fixtureReleaseSnapshot=resolve;});}
     if(window.fixtureLoseAck&&String(url)==='/api/v1/sync'&&options?.method==='POST'){window.fixtureLoseAck=false;window.fixtureLost=true;throw TypeError('Synthetic acknowledgement loss after server commit');}
     if(window.fixtureGeneration&&String(url)==='/api/v1/session'){const data=await response.json();data.binding.generation=window.fixtureGeneration;return new Response(JSON.stringify(data),{status:response.status,headers:response.headers});}
     return response;
    };
   });
   const a=await context.newPage(),b=await context.newPage();await a.goto(base);
   await a.locator('#login input[name=username]').fill('owner');await a.locator('#login input[name=password]').fill(process.env.JARVIS_TEST_PASSWORD);await a.locator('#login input[name=device]').fill('multitab fixture');await a.locator('#login button').click();await a.locator('#workspace').waitFor({state:'visible'});
   await b.goto(base);await until(()=>b.evaluate(()=>JarvisSync.authenticated&&!JarvisSync.syncing));
   const before=await a.evaluate(async()=>(await JarvisSync.api('/sync')).revision);
   await a.evaluate(()=>localStorage.setItem('jange-fixture-offline','1'));
   await Promise.all([a,b].map((p,n)=>p.evaluate(async n=>{for(let i=0;i<20;i++)await JarvisSync.enqueue('task',`mt-${n}-${crypto.randomUUID()}`,{text:`tab ${n} ${i}`,done:false});},n)));
   const shared='same-'+Date.now();
   const attempts=await Promise.all([a,b].map(p=>p.evaluate(async id=>{try{await JarvisSync.enqueue('task',id,{text:'same item',done:false});return true;}catch{return false;}},shared)));
   assert.equal(attempts.filter(Boolean).length,1);
   for(const p of [a,b]){await p.evaluate(()=>JarvisSync.load());assert.equal(await p.evaluate(()=>JarvisSync.state.pending.length),41);}
   await a.reload();await a.waitForFunction(()=>window.JarvisSync);await a.evaluate(()=>JarvisSync.load());assert.equal(await a.evaluate(()=>JarvisSync.state.pending.length),41);
   await a.evaluate(()=>localStorage.removeItem('jange-fixture-offline'));await Promise.all([a,b].map(p=>p.evaluate(()=>JarvisSync.sync())));
   for(const p of [a,b]){await p.evaluate(()=>JarvisSync.load());assert.equal(await p.evaluate(()=>JarvisSync.state.pending.length),0);}
   assert.equal(await a.evaluate(async()=>(await JarvisSync.api('/sync')).revision),before+41);
   // Server commits, but the response is lost: both tabs retry one operation.
   await a.evaluate(()=>JarvisSync.enqueue('task','lost-'+crypto.randomUUID(),{text:'lost acknowledgement',done:false}));
   await a.evaluate(()=>{window.fixtureLoseAck=true;});
   await a.evaluate(()=>JarvisSync.sync().catch(e=>e.message));assert(await a.evaluate(()=>window.fixtureLost),name);assert.equal(await a.evaluate(()=>JarvisSync.state.pending.length),1);
   await Promise.all([a,b].map(p=>p.evaluate(()=>JarvisSync.sync())));
   assert.equal(await a.evaluate(async()=>(await JarvisSync.api('/sync')).revision),before+42);
   // A remote deletion conflicts with a locally preserved edit.
   const record=await a.evaluate(()=>JarvisSync.state.records.find(r=>r.id.startsWith('lost-')));
   await a.evaluate(r=>JarvisSync.enqueue('task',r.id,{text:'preserved deleted-item draft',done:false}),record);
   await b.evaluate(r=>JarvisSync.api('/sync',{operation_id:crypto.randomUUID(),kind:r.kind,id:r.id,base_revision:r.revision,deleted:true,data:null}),record);
   await Promise.all([a,b].map(p=>p.evaluate(()=>JarvisSync.sync())));
   await a.evaluate(()=>JarvisSync.load());assert.equal(await a.evaluate(()=>JarvisSync.state.conflicts.length),1);
   assert.equal(await a.evaluate(()=>JarvisSync.state.conflicts[0].operation.data.text),'preserved deleted-item draft');
   // Mismatched identity metadata must not rewrite or send a cached draft.
   await a.evaluate(()=>JarvisSync.enqueue('task','bound-'+crypto.randomUUID(),{text:'bound draft',done:false}));
   const original=await a.evaluate(()=>JarvisSync.state.binding);let sent=0;
   await a.evaluate(()=>{window.fixtureGeneration='0'.repeat(32);});
   a.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/v1/sync'))sent++;});
   const mismatch=await a.evaluate(()=>JarvisSync.sync().then(()=>false,()=>true));assert(mismatch);assert.equal(sent,0);
   assert.deepEqual(await a.evaluate(()=>JarvisSync.state.binding),original);assert.equal(await a.evaluate(()=>JarvisSync.state.pending.length),1);
   await a.evaluate(()=>{window.fixtureGeneration=null;});
   await a.evaluate(binding=>JarvisSync.switchWorkspace(binding),original);
   const archives=await a.evaluate(()=>JarvisSync.exportLocal());assert(archives.some(v=>v.pending.some(p=>p.data?.text==='bound draft')));
   assert(archives.some(v=>v.conflicts.some(c=>c.operation.data?.text==='preserved deleted-item draft')));
   // An already-authorized snapshot arriving after cross-tab logout cannot
   // restore cleared private cache or adopt the old workspace automatically.
   await b.evaluate(()=>JarvisSync.sync());
   await a.evaluate(()=>{window.fixtureHoldSnapshot=true;window.fixtureDelayedSync=JarvisSync.sync().then(()=>false,()=>true);});
   await until(()=>a.evaluate(()=>window.fixtureSnapshotWaiting===true));
   await b.evaluate(()=>JarvisSync.logout());
   await a.evaluate(()=>window.fixtureReleaseSnapshot());
   assert(await a.evaluate(()=>window.fixtureDelayedSync));
   await a.evaluate(()=>JarvisSync.load());assert.equal(await a.evaluate(()=>JarvisSync.state.records.length),0);assert.equal(await a.evaluate(()=>JarvisSync.state.binding),null);
   // An unbound legacy cache is preserved, never silently assigned to an owner.
   const legacyContext=await browser.newContext();await legacyContext.addInitScript(()=>{window.setInterval=()=>0;});const legacy=await legacyContext.newPage();await legacy.goto(base);
   await legacy.evaluate(async()=>{await JarvisSync.load();await new Promise((yes,no)=>{const q=indexedDB.open('jarvis-lab-cache-v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('cache','readwrite');tx.objectStore('cache').put({identity:'owner',records:[],pending:[{id:'legacy',data:{text:'legacy retained'}}],conflicts:[]},'owner');tx.oncomplete=()=>{db.close();yes();};tx.onerror=()=>no(tx.error);};});});
   await legacy.evaluate(()=>JarvisSync.load());assert.equal(await legacy.evaluate(()=>JarvisSync.state.pending[0].data.text),'legacy retained');
   const rejected=await legacy.evaluate(password=>JarvisSync.login('owner',password,'legacy fixture').then(()=>false,()=>true),process.env.JARVIS_TEST_PASSWORD);assert(rejected);
   assert.equal(await legacy.evaluate(()=>JarvisSync.state.pending[0].data.text),'legacy retained');
   await legacyContext.close();await context.close();
   results.push({engine:name,result:'PASS',viewport:'1080x810',checks:['IDB coordination without BroadcastChannel','41 concurrent offline queue edits survive reload','same-record enqueue serialized','two-tab replay once per operation','lost acknowledgement retry once','remote deletion preserves one conflict draft','generation mismatch sends no mutations','explicit switch archives drafts and conflicts','late snapshot rejected after cross-tab logout','legacy unbound cache retained'],offline:'Synthetic fetch transport failure; full OS offline tested separately in Chromium'});
  }finally{await browser.close();}
 }
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'multitab-results.json'),JSON.stringify({results},null,2));console.log(JSON.stringify({results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
