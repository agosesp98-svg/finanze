const CACHE='finanze-stable-v6-recurrence-controls';
const CORE=['./','./index.html','./manifest.webmanifest','./app.css','./db.js','./engine.js','./app.js','./appearance.js','./insights.js','./projection-details.js','./recurrence-controls.js','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];

self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});

async function networkFirst(request,fallback=request){const cache=await caches.open(CACHE);try{const response=await fetch(request,{cache:'no-store'});if(response?.ok)await cache.put(fallback,response.clone());return response}catch(err){const cached=await cache.match(fallback);if(cached)return cached;throw err}}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,'./index.html'));return}
  if(/\.(?:js|css|json|webmanifest)$/i.test(url.pathname)){event.respondWith(networkFirst(event.request));return}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response})));
});
