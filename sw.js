const CACHE='finanze-stable-v28-four-tabs';
const V='20261110g';
const CORE=['./','./index.html',`./manifest.webmanifest?v=${V}`,`./app.css?v=${V}`,`./db.js?v=${V}`,`./engine.js?v=${V}`,`./spendable-guard.js?v=${V}`,`./app.js?v=${V}`,`./appearance.js?v=${V}`,`./insights.js?v=${V}`,`./projection-details.js?v=${V}`,`./recurrence-controls.js?v=${V}`,`./goal-priority.js?v=${V}`,`./plan-patch.js?v=${V}`,`./plan-update-ui.js?v=${V}`,`./plan-update.css?v=${V}`,`./salary-guide.js?v=${V}`,`./salary-guide.css?v=${V}`,`./ui-polish.css?v=${V}`,`./home-clean.css?v=${V}`,`./pages-clean.css?v=${V}`,`./app-updater.js?v=${V}`,'./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];

// Best-effort caching: a single temporarily unavailable asset must not lock
// a device to an old worker indefinitely. Online assets remain network-first.
self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.allSettled(CORE.map(url=>cache.add(new Request(url,{cache:'reload'}))));
 await self.skipWaiting();
})())});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('finanze-stable-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});

async function networkFirst(request,fallback=request){const cache=await caches.open(CACHE);try{const response=await fetch(request,{cache:'no-store'});if(response?.ok)await cache.put(fallback,response.clone());return response}catch(err){const cached=await cache.match(fallback);if(cached)return cached;throw err}}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,'./index.html'));return}
  if(/\.(?:js|css|json|webmanifest)$/i.test(url.pathname)){event.respondWith(networkFirst(event.request));return}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response})));
});
