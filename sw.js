const CACHE='finanze-pwa-v33';
const CORE=[
  './',
  './index.html',
  './manifest.webmanifest?v=33',
  './ui-v32.css?v=33',
  './ux-v33.css?v=33',
  './db.js?v=33',
  './app-v32.js?v=33',
  './ux-v33.js?v=33',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

async function networkFirst(request,fallbackKey=request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response&&response.ok)await cache.put(fallbackKey,response.clone());
    return response;
  }catch(error){
    const cached=await cache.match(fallbackKey);
    if(cached)return cached;
    throw error;
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;

  if(event.request.mode==='navigate'){
    event.respondWith(networkFirst(event.request,'./index.html'));
    return;
  }

  if(/\.(?:js|css|json|webmanifest)$/i.test(url.pathname)){
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      if(response&&response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }))
  );
});
