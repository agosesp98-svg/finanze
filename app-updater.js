/* Client-only PWA update controls. App financial records stay in IndexedDB. */
(()=>{
'use strict';
const VERSION='20261113c';
const label=()=>document.getElementById('finanzeVersionLabel');
const status=()=>document.getElementById('finanzeUpdateStatus');
const message=msg=>{for(const el of [status(),document.getElementById('finanzeHomeUpdateStatus')])if(el)el.textContent=msg};
let running=false;
function showVersion(){
 for(const el of [label(),...document.querySelectorAll('[data-finanze-version]')]){
  if(el&&el.textContent!==VERSION)el.textContent=VERSION;
 }
}
async function upgrade(){
 if(running)return;
 const buttons=[...document.querySelectorAll('[data-check-updates]')];
 buttons.forEach(button=>{button.disabled=true});
 running=true;
 try{
  if(typeof navigator.onLine==='boolean'&&!navigator.onLine){
   throw Error('Sei offline. Connettiti a Internet e riprova.');
  }
  message('Controllo della versione pubblicata…');
  const probe=new URL('./index.html',document.baseURI);
  probe.searchParams.set('version_check',String(Date.now()));
  const response=await fetch(probe.href,{cache:'no-store'});
  if(!response.ok)throw Error('Il sito non risponde. Riprovare quando è raggiungibile.');
  const html=await response.text();
  const found=html.match(/<meta\s+name="finanze-version"\s+content="([^"]+)"/);
  if(!found)throw Error('Non riesco a verificare la versione pubblicata: il sito potrebbe essere ancora in fase di aggiornamento.');
  if(found[1]!==VERSION){
   throw Error('Versione pubblicata: '+found[1]+'. Versione attesa: '+VERSION+'. La pubblicazione non è ancora allineata: riprova più tardi senza cancellare alcun dato.');
  }
  message('Versione '+found[1]+' verificata. Aggiornamento in corso…');
  // Remove ONLY Cache Storage files used for the app shell.
  // Never touch IndexedDB, localStorage or the user's financial records.
  const registration=await navigator.serviceWorker?.getRegistration();
  await registration?.update();
  if('caches' in window){
   const keys=await caches.keys();
   await Promise.all(keys.filter(k=>k.startsWith('finanze-stable-')).map(k=>caches.delete(k)));
  }
  // A versioned navigation ensures fresh HTML, JS and CSS in standalone iOS PWA.
  const destination=new URL('./',document.baseURI);
  destination.searchParams.set('app_refresh',String(Date.now()));
  location.replace(destination.href);
 }catch(err){
  message(err?.message||'Aggiornamento non riuscito. I dati locali non sono stati modificati.');
 }finally{
  running=false;
  buttons.forEach(button=>{button.disabled=false});
 }
}
document.addEventListener('click',e=>{
 if(e.target.closest('[data-check-updates]')){e.preventDefault();upgrade();return}
 if(e.target.closest('#settingsBtn'))showVersion();
});
const sheet=document.getElementById('sheetBody');
if(sheet)new MutationObserver(showVersion).observe(sheet,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',showVersion);
showVersion();
})();