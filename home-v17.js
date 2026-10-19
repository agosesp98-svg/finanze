(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const BRAND={
    intesa:{src:'https://upload.wikimedia.org/wikipedia/commons/5/51/Intesa_Sanpaolo_logo.svg',alt:'Intesa Sanpaolo',fallback:'INTESA SANPAOLO'},
    postepay:{src:'https://upload.wikimedia.org/wikipedia/commons/2/22/Logo_Postepay.svg',alt:'Postepay',fallback:'POSTEPAY'}
  };
  let timer=null;

  function kind(a){
    const n=norm(a?.name);
    if(n.includes('postepay'))return'postepay';
    if(n.includes('intesa')||n==='isp'||n.includes('sanpaolo'))return'intesa';
    if(n.includes('xme')||n.includes('protett'))return'xme';
    if(n.includes('contant'))return'cash';
    return'other';
  }
  function brandMarkup(type,compact=false){
    const b=BRAND[type];
    if(!b)return'';
    return `<span class="v17-brand-mark ${compact?'is-compact':''}" data-v17-logo="${type}"><img src="${b.src}" alt="${b.alt}" referrerpolicy="no-referrer"><span>${b.fallback}</span></span>`;
  }
  function attachLogoFallback(root=document){
    $$('[data-v17-logo]',root).forEach(slot=>{
      if(slot.dataset.bound==='1')return;slot.dataset.bound='1';
      const img=$('img',slot);if(!img)return;
      img.addEventListener('load',()=>slot.classList.add('is-loaded'),{once:true});
      img.addEventListener('error',()=>slot.classList.add('is-error'),{once:true});
      if(img.complete&&img.naturalWidth>0)slot.classList.add('is-loaded');
    });
  }

  function findAccounts(accounts){
    const intesa=accounts.find(a=>kind(a)==='intesa')||accounts.find(a=>!a.protected&&kind(a)!=='cash');
    const postepay=accounts.find(a=>kind(a)==='postepay')||accounts.find(a=>!a.protected&&a.id!==intesa?.id&&kind(a)!=='cash');
    const xme=accounts.find(a=>kind(a)==='xme')||accounts.find(a=>a.protected);
    return{intesa,postepay,xme};
  }

  function card(a,type,label){
    if(!a)return `<article class="v17-bank-card is-empty"><div class="v17-bank-brand">${brandMarkup(type)}</div><div class="v17-bank-copy"><small>${label}</small><strong>—</strong><span>Conto non trovato</span></div></article>`;
    return `<button class="v17-bank-card" type="button" data-v17-go-account="${a.id}"><div class="v17-bank-brand">${brandMarkup(type)}</div><div class="v17-bank-copy"><small>${label}</small><strong>${money(a.balance)}</strong><span>Disponibile sul conto</span></div><span class="v17-card-dot"></span></button>`;
  }

  async function renderHomeAccounts(){
    const hero=$('.balance-hero');if(!hero||!window.FinanceDB)return;
    try{
      const accounts=await FinanceDB.getAll('accounts');
      const {intesa,postepay,xme}=findAccounts(accounts);
      hero.classList.add('v17-account-hero');
      hero.innerHTML=`<div class="v17-accounts-head"><div><small>I TUOI SOLDI</small><h2>Disponibilità</h2></div><button class="v17-all-accounts" type="button" data-v17-open-accounts>Vedi conti</button></div>
        <div class="v17-bank-grid">${card(intesa,'intesa','Intesa Sanpaolo')}${card(postepay,'postepay','Postepay')}</div>
        ${xme?`<button class="v17-protected" type="button" data-v17-go-account="${xme.id}"><span class="v17-lock" role="img" aria-label="Protetto">🔐</span><span><small>XME PROTETTO</small><strong>${money(xme.balance)}</strong><em>Riserva separata · non disponibile per le spese</em></span></button>`:''}`;
      attachLogoFallback(hero);
    }catch(e){console.warn('V17 home accounts',e)}
  }

  function decorateAccountList(){
    $$('#accountsList .account-card').forEach(card=>{
      const name=$('.account-name',card)?.textContent||'';const type=kind({name});const slot=$('.row-icon',card);if(!slot)return;
      if(type==='intesa'||type==='postepay'){
        if(slot.dataset.v17Brand===type)return;
        slot.dataset.v17Brand=type;slot.className='row-icon v17-list-brand';slot.innerHTML=brandMarkup(type,true);attachLogoFallback(slot);
      }else if(type==='cash'){
        slot.dataset.v17Brand='cash';slot.className='row-icon v17-list-emoji';slot.setAttribute('role','img');slot.setAttribute('aria-label','Contanti');slot.textContent='💶';
      }else if(type==='xme'){
        slot.dataset.v17Brand='xme';slot.className='row-icon v17-list-emoji';slot.setAttribute('role','img');slot.setAttribute('aria-label','XME protetto');slot.textContent='🔐';
      }
    });
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(()=>{renderHomeAccounts();decorateAccountList()},80)}
  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-v17-open-accounts],[data-v17-go-account]');if(!open)return;
    e.preventDefault();document.querySelector('.tab[data-view="accounts"]')?.click();
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    renderHomeAccounts();decorateAccountList();
    const list=$('#accountsList');if(list)new MutationObserver(schedule).observe(list,{childList:true,subtree:true,characterData:true});
    const total=$('#totalLiquidity');if(total)new MutationObserver(schedule).observe(total,{childList:true,characterData:true,subtree:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
    setTimeout(schedule,400);setTimeout(schedule,1200);
  });
})();