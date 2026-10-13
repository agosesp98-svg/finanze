const CACHE='finanze-pwa-v9';
const ASSETS=['./','./index.html','./styles-v7.css?v=8','./experience-v8.css?v=8','./experience-v9.css','./db.js?v=8','./app-v7.js?v=8','./experience-v8.js?v=8','./experience-v9.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
async function combined(primary,addon,type){
  const cache=await caches.open(CACHE);
  const [a,b]=await Promise.all([cache.match(primary),cache.match(addon)]);
  if(!a)return fetch(primary);
  const at=await a.text(),bt=b?await b.text():'';
  return new Response(`${at}\n${bt}`,{headers:{'Content-Type':type,'Cache-Control':'no-store'}});
}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);if(u.origin!==location.origin)return;
  if(u.pathname.endsWith('/experience-v8.js')){e.respondWith(combined('./experience-v8.js?v=8','./experience-v9.js','application/javascript; charset=utf-8'));return;}
  if(u.pathname.endsWith('/experience-v8.css')){e.respondWith(combined('./experience-v8.css?v=8','./experience-v9.css','text/css; charset=utf-8'));return;}
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}return r;}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    const network=fetch(e.request).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>cached);
    return cached||network;
  }));
});