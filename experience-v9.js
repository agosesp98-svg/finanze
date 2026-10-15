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
    chevron:'<path d="m9 6 6 6-6 6"/>',
    eye:'<path d="M2.8 12s3.4-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.4 5.5-9.2 5.5S2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeOff:'<path d="m4 4 16 16M10.3 6.8A9 9 0 0 1 12 6.5c5.8 0 9.2 5.5 9.2 5.5a13.7 13.7 0 0 1-2.5 3.1M14.2 14.2A3.1 3.1 0 0 1 9.8 9.8M6.6 8.2A14 14 0 0 0 2.8 12s3.4 5.5 9.2 5.5c1 0 2-.2 2.9-.5"/>',
    minus:'<path d="M6 12h12"/>',
    plus:'<path d="M12 6v12M6 12h12"/>',
    arrows:'<path d="M5 8h14m-4-4 4 4-4 4M19 16H5m4 4-4-4 4-4"/>',
    calendar:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/>'
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

  /* V11 premium interaction layer */
  function addHeroPrivacy(){
    const line=$('.balance-hero .hero-line');const chip=$('#snapshotChip');if(!line||!chip||$('#v11PrivacyBtn'))return;
    const tools=document.createElement('div');tools.className='v11-hero-tools';chip.replaceWith(tools);tools.appendChild(chip);
    const btn=document.createElement('button');btn.id='v11PrivacyBtn';btn.className='v11-privacy';btn.type='button';btn.setAttribute('aria-label','Nascondi importi');btn.innerHTML=svg(icons.eye);tools.appendChild(btn);
    const hidden=localStorage.getItem('finanze-private-view')==='1';document.body.classList.toggle('v11-private',hidden);if(hidden){btn.innerHTML=svg(icons.eyeOff);btn.setAttribute('aria-label','Mostra importi')}
    btn.addEventListener('click',e=>{e.stopPropagation();const next=!document.body.classList.contains('v11-private');document.body.classList.toggle('v11-private',next);localStorage.setItem('finanze-private-view',next?'1':'0');btn.innerHTML=svg(next?icons.eyeOff:icons.eye);btn.setAttribute('aria-label',next?'Mostra importi':'Nascondi importi')});
  }

  function addDailyRing(){
    const smart=$('#spendTodayCard');const icon=$('.smart-icon',smart);if(!smart||!icon||$('#v11DailyRing'))return;
    icon.classList.add('v11-old-smart-icon');
    icon.insertAdjacentHTML('afterend','<span id="v11DailyRing" class="v11-daily-ring" style="--p:0"><span><b id="v11RingValue">0%</b><small>budget</small></span></span>');
    const meta=$('#v8DailyMeta');if(meta&&!$('#v11Cycle'))meta.insertAdjacentHTML('afterend','<div id="v11Cycle" class="v11-cycle"><div><i id="v11CycleBar"></i></div><span id="v11CycleText">Periodo stipendio</span></div>');
  }

  function syncDailyRing(){
    const bar=$('#budgetProgress'),ring=$('#v11DailyRing'),label=$('#v11RingValue');if(!bar||!ring||!label)return;
    const spent=Math.max(0,Math.min(100,parseFloat(bar.style.width)||0));const remaining=Math.round(100-spent);
    ring.style.setProperty('--p',remaining);label.textContent=`${remaining}%`;
  }

  async function syncCycle(){
    try{
      const s=await FinanceDB.get('settings','nextSalaryDate');if(!s?.value)return;
      const next=parse(s.value),prev=new Date(next);prev.setMonth(prev.getMonth()-1);
      const now=new Date();const total=Math.max(1,Math.round((next-prev)/86400000));const elapsed=Math.max(0,Math.min(total,Math.round((now-prev)/86400000)));const pct=Math.max(0,Math.min(100,elapsed/total*100));
      const bar=$('#v11CycleBar'),txt=$('#v11CycleText');if(bar)bar.style.width=`${pct}%`;if(txt)txt.textContent=`${Math.max(0,total-elapsed)} giorni al prossimo stipendio`;
    }catch{}
  }

  function addQuickComposer(){
    if($('#v11Composer'))return;
    document.body.insertAdjacentHTML('beforeend',`<div id="v11ComposerBackdrop" class="v11-composer-backdrop" hidden></div><section id="v11Composer" class="v11-composer" aria-hidden="true"><div class="v11-composer-handle"></div><div class="v11-composer-head"><div><small>NUOVO</small><h2>Registra</h2></div><button id="v11ComposerClose" type="button" aria-label="Chiudi">×</button></div><div class="v11-composer-grid"><button data-v11-action="expense"><span>${svg(icons.minus)}</span><b>Spesa</b><small>Registra un’uscita</small></button><button data-v11-action="income" class="is-income"><span>${svg(icons.plus)}</span><b>Entrata</b><small>Denaro ricevuto</small></button><button data-v11-action="transfer"><span>${svg(icons.arrows)}</span><b>Trasferimento</b><small>Tra i tuoi conti</small></button><button data-v11-action="commitment"><span>${svg(icons.calendar)}</span><b>Scadenza</b><small>Impegno futuro</small></button></div></section>`);
    const composer=$('#v11Composer'),backdrop=$('#v11ComposerBackdrop');
    const open=()=>{backdrop.hidden=false;requestAnimationFrame(()=>{backdrop.classList.add('open');composer.classList.add('open');composer.setAttribute('aria-hidden','false')})};
    const close=()=>{backdrop.classList.remove('open');composer.classList.remove('open');composer.setAttribute('aria-hidden','true');setTimeout(()=>backdrop.hidden=true,260)};
    $('#v11ComposerClose').onclick=close;backdrop.onclick=close;
    composer.addEventListener('click',e=>{const btn=e.target.closest('[data-v11-action]');if(!btn)return;const action=btn.dataset.v11Action;close();setTimeout(()=>document.querySelector(`[data-action="${action}"]`)?.click(),110)});
    const quick=$('#quickAddBtn');if(quick)quick.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();open()},true);
  }

  function addTabIndicator(){
    const nav=$('.tabbar');if(!nav||$('#v11TabIndicator'))return;
    const indicator=document.createElement('i');indicator.id='v11TabIndicator';indicator.className='v11-tab-indicator';nav.prepend(indicator);
    const move=()=>{const active=$('.tab.active',nav);if(!active)return;const nr=nav.getBoundingClientRect(),ar=active.getBoundingClientRect();indicator.style.width=`${ar.width-8}px`;indicator.style.transform=`translateX(${ar.left-nr.left+4}px)`};
    nav.addEventListener('click',()=>requestAnimationFrame(move));window.addEventListener('resize',move,{passive:true});setTimeout(move,80);setTimeout(move,500);
  }

  function bindScrollPolish(){
    let ticking=false;const update=()=>{ticking=false;document.body.classList.toggle('v11-scrolled',window.scrollY>18)};
    window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(update)}},{passive:true});update();
  }

  function bindSheetGesture(){
    const sheet=$('#sheet'),grab=$('.grabber',sheet),backdrop=$('#sheetBackdrop');if(!sheet||!grab||grab.dataset.v11Drag)return;grab.dataset.v11Drag='1';
    let start=0,dy=0,dragging=false;
    grab.addEventListener('touchstart',e=>{if(!sheet.classList.contains('open'))return;start=e.touches[0].clientY;dy=0;dragging=true;sheet.classList.add('v11-dragging')},{passive:true});
    grab.addEventListener('touchmove',e=>{if(!dragging)return;dy=Math.max(0,e.touches[0].clientY-start);sheet.style.transform=`translate(-50%,${dy}px)`;if(backdrop)backdrop.style.opacity=String(Math.max(0,1-dy/320))},{passive:true});
    grab.addEventListener('touchend',()=>{if(!dragging)return;dragging=false;sheet.classList.remove('v11-dragging');sheet.style.transform='';if(backdrop)backdrop.style.opacity='';if(dy>90)sheet.querySelector('[data-close="sheet"]')?.click()},{passive:true});
  }

  function animateBalance(){
    const el=$('#totalLiquidity');if(!el||el.dataset.v11Observe)return;el.dataset.v11Observe='1';new MutationObserver(()=>{el.classList.remove('v11-number-pop');void el.offsetWidth;el.classList.add('v11-number-pop')}).observe(el,{childList:true,characterData:true,subtree:true});
  }

  function premiumEnhance(){addHeroPrivacy();addDailyRing();syncDailyRing();syncCycle();addQuickComposer();addTabIndicator();bindSheetGesture();animateBalance()}

  function enhance(){fixUpcomingSpacing();fixExpectedRows();decorateAccounts();renderFinancing();premiumEnhance()}
  function observe(){['accountsList','expectedIncomeList','v8UpcomingRail','liabilitiesList','budgetProgress','drawerSalaryText'].forEach(id=>{const el=$(`#${id}`);if(el)new MutationObserver(()=>requestAnimationFrame(enhance)).observe(el,{childList:true,subtree:true,characterData:true,attributes:id==='budgetProgress',attributeFilter:id==='budgetProgress'?['style']:undefined})})}
  document.addEventListener('DOMContentLoaded',()=>{observe();bindScrollPolish();requestAnimationFrame(enhance);setTimeout(enhance,250);setTimeout(enhance,900)});
})();