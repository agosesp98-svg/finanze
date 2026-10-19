const CACHE='finanze-pwa-v21';
const CORE=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
const COMBINED_JS=['./app-v7.js?v=10','./quickadd-fix-v12.js','./experience-v13.js','./experience-v14.js','./self-heal-v19.js'];
const COMBINED_CSS=['./experience-v9.css?v=10','./experience-v13.css','./experience-v14.css'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(CORE.map(async p=>{try{const r=await fetch(p,{cache:'no-store'});if(r.ok)await c.put(p,r.clone())}catch{}}))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('finanze-pwa')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
async function networkFirst(req,key=req){const cache=await caches.open(CACHE);try{const r=await fetch(req,{cache:'no-store'});if(r&&r.ok)await cache.put(key,r.clone());return r}catch{const c=await cache.match(key);if(c)return c;throw new Error('offline')}}
async function part(path){const cache=await caches.open(CACHE);try{const r=await fetch(path,{cache:'no-store'});if(r&&r.ok){await cache.put(path,r.clone());return await r.text()}}catch{}const c=await cache.match(path);return c?await c.text():''}
async function combined(paths,type){const chunks=[];for(const p of paths)chunks.push(await part(p));return new Response(chunks.join('\n'),{headers:{'Content-Type':type,'Cache-Control':'no-store'}})}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;
  if(e.request.mode==='navigate'){e.respondWith(networkFirst(e.request,'./index.html'));return;}
  if(u.pathname.endsWith('/app-v7.js')){e.respondWith(combined(COMBINED_JS,'application/javascript; charset=utf-8'));return;}
  if(u.pathname.endsWith('/experience-v9.css')){e.respondWith(combined(COMBINED_CSS,'text/css; charset=utf-8'));return;}
  if(/\.(?:js|css|json|webmanifest)$/i.test(u.pathname)){e.respondWith(networkFirst(e.request));return;}
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy));}return r;})));
});