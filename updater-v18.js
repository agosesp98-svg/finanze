(()=>{
  const VERSION='v18';
  if(!('serviceWorker' in navigator))return;
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloading)return;
    if(sessionStorage.getItem(`finanze-reloaded-${VERSION}`)==='1')return;
    reloading=true;
    sessionStorage.setItem(`finanze-reloaded-${VERSION}`,'1');
    location.reload();
  });
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register(`./sw.js?${VERSION}`,{updateViaCache:'none'});
      await reg.update();
    }catch(e){console.warn('PWA update check',e)}
  });
})();
