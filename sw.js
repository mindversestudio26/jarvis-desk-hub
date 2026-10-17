'use strict';
// The jarvis-desk- prefix is kept so 3.1 (JANGE) cleans up every older shell cache.
const CACHE='jarvis-desk-v3.4.2';
const FILES=['./','./index.html','./style.css','./console.css','./controls.css','./controls.js','./console.js','./vendor/bs-data.js','./nepali-calendar.js','./app.js','./clocks.js','./alarms.js','./shifts.js','./quotes.js','./roster.js','./manifest.webmanifest','./brand/jange-emblem-512.webp','./brand/jange-head-160.webp','./icon-180.png','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./favicon-32.png','./fonts/michroma-latin-400.woff2','./fonts/cormorant-garamond-latin-500-italic.woff2'];
// Each version stores fresh copies: files keep their names across versions (e.g. the emblem),
// so a copy still in the browser's HTTP cache must never be saved into a new version.
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(f=>new Request(f,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jarvis-desk-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!FILES.map(p=>new URL(p,self.registration.scope).href).includes(url.href))return;
// roster.js changes without a new shell: try the network first (2.5 s), then the cached copy.
if(url.pathname.endsWith('/roster.js')){event.respondWith(caches.open(CACHE).then(cache=>{const fresh=fetch(event.request.url,{cache:'no-cache'}).then(r=>{if(r.ok)cache.put(event.request,r.clone());return r;});return Promise.race([fresh.catch(()=>null),new Promise(done=>setTimeout(done,2500,null))]).then(r=>(r&&r.ok?r:null)||cache.match(event.request)).then(r=>r||fresh);}));return;}
event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));});
