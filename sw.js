const CACHE='finanze-pwa-v16-direct';
const ASSETS=['./','./index.html','./styles-v7.css?v=10','./experience-v8.css?v=10','./experience-v9.css?v=10','./experience-v13.css','./experience-v14.css','./safety-v16.css?v=16','./db.js?v=10','./app-v7.js?v=10','./experience-v8.js?v=10','./experience-v9.js?v=10','./quickadd-fix-v12.js','./experience-v13.js','./experience-v14.js','./safety-v16.js?v=16','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
async function combinedMany(paths,type){
  const cache=await caches.open(CACHE);
  const parts=[];
  for(const p of paths){const r=await cache.match(p);if(r)parts.push(await r.text());}
  return new Response(parts.join('\n'),{headers:{'Content-Type':type,'Cache-Control':'no-store'}});
}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);if(u.origin!==location.origin)return;
  if(u.pathname.endsWith('/app-v7.js')){e.respondWith(combinedMany(['./app-v7.js?v=10','./quickadd-fix-v12.js','./experience-v13.js','./experience-v14.js'],'application/javascript; charset=utf-8'));return;}
  if(u.pathname.endsWith('/experience-v9.css')){e.respondWith(combinedMany(['./experience-v9.css?v=10','./experience-v13.css','./experience-v14.css'],'text/css; charset=utf-8'));return;}
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}return r;}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    const network=fetch(e.request,{cache:'no-cache'}).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>cached);
    return cached||network;
  }));
});