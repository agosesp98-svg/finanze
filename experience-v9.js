(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const dateFmt=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric'});
  const monthFmt=new Intl.DateTimeFormat('it-IT',{month:'short',year:'numeric'});
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const parse=s=>new Date(`${s}T12:00:00`);
  const svg=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const icons={
    car:'<path d="m5 10 1.6-4h10.8l1.6 4M4 10h16a1.5 1.5 0 0 1 1.5 1.5V17H19v2h-3v-2H8v2H5v-2H2.5v-5.5A1.5 1.5 0 0 1 4 10Z"/>',
    card:'<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M3.5 9.5h17M7 15h4"/>',
    chevron:'<path d="m9 6 6 6-6 6"/>'
  };
  const logoIntesa='https://commons.wikimedia.org/wiki/Special:Redirect/file/Intesa%20Sanpaolo%20logo.svg';
  const logoPostepay='https://commons.wikimedia.org/wiki/Special:Redirect/file/Logo%20Postepay.svg';
  let financeBusy=false,financeQueued=false,lastFinanceSignature='';

  function fixUpcomingSpacing(){const rail=$('#v8UpcomingRail');if(rail)rail.classList.add('v9-upcoming-rail')}
  function fixExpectedRows(){$$('#expectedIncomeList .list-row').forEach(row=>row.classList.add('v9-expected-row'))}

  function accountBrand(name){
    const n=norm(name);
    if(n.includes('postepay'))return{type:'logo',src:logoPostepay,alt:'Postepay'};
    if(n.includes('intesa')||n==='isp'||n.includes('sanpaolo'))return{type:'logo',src:logoIntesa,alt:'Intesa Sanpaolo'};
    if(n.includes('contant'))return{type:'emoji',value:'💶',label:'Contanti'};
    if(n.includes('xme')||n.includes('protett'))return{type:'emoji',value:'🔐',label:'XME protetto'};
    return null;
  }

  function decorateAccounts(){
    $$('#accountsList .account-card').forEach(card=>{
      const name=$('.account-name',card)?.textContent||'';
      const brand=accountBrand(name),slot=$('.row-icon',card);if(!brand||!slot||slot.dataset.v9Brand===brand.alt||slot.dataset.v9Brand===brand.label)return;
      slot.className='row-icon v9-account-brand';slot.dataset.v9Brand=brand.alt||brand.label;
      if(brand.type==='logo'){
        slot.classList.add('is-logo');slot.innerHTML=`<img src="${brand.src}" alt="${brand.alt}" loading="eager" decoding="async">`;
        const img=$('img',slot);if(img)img.onerror=()=>{slot.className='row-icon v9-account-brand is-fallback';slot.textContent=brand.alt==='Postepay'?'PP':'ISP'};
      }else{slot.classList.add('is-emoji');slot.setAttribute('role','img');slot.setAttribute('aria-label',brand.label);slot.textContent=brand.value}
    });
  }

  function monthsInclusive(start,end){if(!start||!end)return 0;const a=parse(start),b=parse(end);if(a>b)return 0;return(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth())+1}

  function financingMeta(l){
    const n=norm(l.name),completed=Math.max(0,Number(l.completedInstallments||0));
    let total=Number(l.installmentsTotal||0),remaining=l.installmentsRemaining!=null?Math.max(0,Number(l.installmentsRemaining)):null,label='Avanzamento del piano';
    if(!total&&n.includes('clio')){const future=monthsInclusive(l.nextDueDate||'2026-10-15',l.recurrenceEnd||'2028-12-15');total=Math.max(1,completed+future);remaining=future;label='Rate monitorate'}
    if(!total&&n.includes('dyson')){total=2;remaining=remaining??2}
    if(!total&&n.includes('ninja')){total=2;remaining=remaining??2}
    if(!total&&(n.includes('anticipo banca')||n.includes('rimborso anticipo'))){total=36;remaining=remaining??Math.max(0,36-completed)}
    if(total&&remaining==null)remaining=Math.max(0,total-completed);
    const paid=total?Math.max(0,total-Number(remaining||0)):completed,pct=total?Math.max(0,Math.min(100,paid/total*100)):0;
    return{total,remaining,paid,pct,label};
  }

  function financingIcon(name){return norm(name).includes('clio')?'car':'card'}

  async function renderFinancing(){
    if(financeBusy){financeQueued=true;return}
    financeBusy=true;
    try{
      const box=$('#liabilitiesList');if(!box)return;
      const liabilities=await FinanceDB.getAll('liabilities');
      const signature=JSON.stringify(liabilities.map(l=>[l.id,l.name,l.monthly,l.nextDueDate,l.finalDueDate,l.recurrenceEnd,l.finalPaymentDate,l.installmentsTotal,l.installmentsRemaining,l.completedInstallments,l.remaining,l.completed,l.finalPayment]));
      if(signature===lastFinanceSignature&&box.querySelector('.v9-finance-card'))return;
      lastFinanceSignature=signature;
      if(!liabilities.length){box.innerHTML='<div class="empty">Nessun finanziamento.</div>';return}
      box.classList.add('v9-finance-list');
      box.innerHTML=liabilities.map(l=>{
        const m=financingMeta(l),end=l.finalDueDate||l.recurrenceEnd||l.endDate||l.finalPaymentDate||'',next=l.nextDueDate||'',monthly=Number(l.monthly||0),done=!!l.completed;
        const progressText=m.total?`${m.paid} di ${m.total} rate completate`:(done?'Completato':'Durata da definire'),status=done?'Concluso':'Attivo';
        const note=l.finalPayment?`Maxirata ${money(l.finalPayment)}`:(l.remaining!=null?`Residuo stimato ${money(l.remaining)}`:'');
        return `<button class="v9-finance-card" data-liability="${l.id}" type="button"><div class="v9-finance-top"><span class="v9-finance-icon">${svg(icons[financingIcon(l.name)])}</span><div class="v9-finance-heading"><span>${status}</span><h3>${esc(l.name||'Finanziamento')}</h3></div><span class="v9-finance-arrow">${svg(icons.chevron)}</span></div><div class="v9-finance-amount"><strong>${monthly?money(monthly):'—'}</strong><span>${monthly?'/ mese':''}</span></div><div class="v9-finance-progress-head"><span>${m.label}</span><strong>${Math.round(m.pct)}%</strong></div><div class="v9-finance-progress"><i style="width:${m.pct}%"></i></div><div class="v9-finance-progress-foot"><span>${progressText}</span>${note?`<span>${esc(note)}</span>`:''}</div><div class="v9-finance-meta"><div><small>Prossima rata</small><strong>${next?dateFmt.format(parse(next)):'—'}</strong></div><div><small>Fine prevista</small><strong>${end?monthFmt.format(parse(end)).replace('.',''):'Da definire'}</strong></div></div></button>`;
      }).join('');
    }catch(e){console.warn('Financing UI',e)}finally{financeBusy=false;if(financeQueued){financeQueued=false;setTimeout(renderFinancing,0)}}
  }

  function enhance(){fixUpcomingSpacing();fixExpectedRows();decorateAccounts();renderFinancing()}
  function observe(){['accountsList','expectedIncomeList','v8UpcomingRail','liabilitiesList'].forEach(id=>{const el=$(`#${id}`);if(el)new MutationObserver(()=>requestAnimationFrame(enhance)).observe(el,{childList:true,subtree:true,characterData:true})})}
  document.addEventListener('DOMContentLoaded',()=>{observe();requestAnimationFrame(enhance);setTimeout(enhance,250);setTimeout(enhance,900)});
})();