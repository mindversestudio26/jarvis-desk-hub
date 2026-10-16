'use strict';
// The jarvis-desk- prefix is kept so 3.1 (JANGE) cleans up every older shell cache.
const CACHE='jarvis-desk-v3.1.0';
const FILES=['./','./index.html','./style.css','./app.js','./clocks.js','./alarms.js','./shifts.js','./quotes.js','./manifest.webmanifest','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./favicon-32.png','./fonts/michroma-latin-400.woff2','./fonts/cormorant-garamond-latin-500-italic.woff2'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jarvis-desk-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!FILES.map(p=>new URL(p,self.registration.scope).href).includes(url.href))return;event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));});
