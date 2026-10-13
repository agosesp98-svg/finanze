(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  const icons={
    dashboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-7Z"/><path d="M9.5 20v-5.5h5V20"/></svg>',
    accounts:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M3.5 9.5h17"/><path d="M15.5 14h2.5"/></svg>',
    movements:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v15"/><path d="m3.5 7.5 3.5-3.5 3.5 3.5"/><path d="M17 20V5"/><path d="m13.5 16.5 3.5 3.5 3.5-3.5"/></svg>',
    budget:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 3.5a8 8 0 0 1 5.5 5.5H15V3.5Z"/></svg>',
    plan:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="m12 12 5-5"/></svg>',
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/><path d="M4 12h5"/><path d="M13 12h7"/><circle cx="11" cy="12" r="2"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    bank:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 9 8.5-5 8.5 5"/><path d="M5 10.5h14M6.5 10.5v7M10.2 10.5v7M13.8 10.5v7M17.5 10.5v7M4.5 20h15"/></svg>',
    card:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M3.5 9.5h17"/><path d="M7 15h4"/></svg>',
    cash:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5a2 2 0 0 0 2-2M18 14.5a2 2 0 0 0-2 2"/></svg>',
    lock:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/><path d="M12 14v2"/></svg>',
    arrowDown:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15"/><path d="m6.5 13.5 5.5 5.5 5.5-5.5"/></svg>',
    arrowUp:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V5"/><path d="m6.5 10.5 5.5-5.5 5.5 5.5"/></svg>',
    transfer:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14"/><path d="m15.5 4.5 3.5 3.5-3.5 3.5"/><path d="M19 16H5"/><path d="m8.5 12.5-3.5 3.5 3.5 3.5"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/></svg>',
    target:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>',
    shield:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.3c0 4.6-2.8 7.6-7 9.2-4.2-1.6-7-4.6-7-9.2V6l7-2.5Z"/><path d="m8.8 12 2.1 2.1 4.4-4.5"/></svg>',
    download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/></svg>'
  };

  function setSvg(el,svg){if(el)el.innerHTML=svg;}

  function installIcons(){
    $$('.tab').forEach(tab=>setSvg($('.tab-icon',tab),icons[tab.dataset.view]||icons.dashboard));
    const plus=$('#quickAddBtn'); if(plus)setSvg(plus,icons.plus);
  }

  function createTopActions(){
    const top=$('.topbar'),plus=$('#quickAddBtn');
    if(!top||!plus||$('#menuBtn'))return;
    const wrap=document.createElement('div');wrap.className='top-actions';
    const menu=document.createElement('button');menu.id='menuBtn';menu.className='icon-button';menu.type='button';menu.setAttribute('aria-label','Apri menu');menu.innerHTML=icons.settings;
    plus.before(wrap);wrap.append(menu,plus);
    menu.addEventListener('click',openDrawer);
  }

  function createDrawer(){
    if($('#appDrawer'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="drawerBackdrop" class="drawer-backdrop" aria-hidden="true"></div>
      <aside id="appDrawer" class="app-drawer" aria-hidden="true" aria-label="Menu">
        <div class="drawer-handle"></div>
        <div class="drawer-header">
          <div><div class="drawer-kicker">FINANZE</div><h2>Gestione</h2></div>
          <button id="drawerClose" class="icon-button drawer-close" aria-label="Chiudi">×</button>
        </div>
        <div class="drawer-group">
          <button class="drawer-item" data-go="accounts"><span class="drawer-symbol">${icons.accounts}</span><span><strong>Conti</strong><small>Saldi e disponibilità</small></span><i>${icons.chevron}</i></button>
          <button class="drawer-item" data-go="plan"><span class="drawer-symbol">${icons.plan}</span><span><strong>Piano finanziario</strong><small>Obiettivi, rate e scadenze</small></span><i>${icons.chevron}</i></button>
          <button class="drawer-item" data-go="settings"><span class="drawer-symbol">${icons.shield}</span><span><strong>Backup e sicurezza</strong><small>PIN, esportazione e ripristino</small></span><i>${icons.chevron}</i></button>
        </div>
        <div class="drawer-group">
          <button class="drawer-item" data-action="backup"><span class="drawer-symbol">${icons.download}</span><span><strong>Esporta backup</strong><small>Salva una copia dei tuoi dati</small></span><i>${icons.chevron}</i></button>
        </div>
        <div class="drawer-foot">I dati finanziari restano sul dispositivo.</div>
      </aside>`);
    $('#drawerBackdrop').addEventListener('click',closeDrawer);
    $('#drawerClose').addEventListener('click',closeDrawer);
    $$('#appDrawer [data-go]').forEach(btn=>btn.addEventListener('click',()=>{const tab=$(`.tab[data-view="${btn.dataset.go}"]`);if(tab)tab.click();closeDrawer();}));
    $('#appDrawer [data-action="backup"]').addEventListener('click',()=>{closeDrawer();$('#exportBackupBtn')?.click();});
  }

  function openDrawer(){document.body.classList.add('drawer-open');$('#drawerBackdrop')?.classList.add('is-open');$('#appDrawer')?.classList.add('is-open');}
  function closeDrawer(){document.body.classList.remove('drawer-open');$('#drawerBackdrop')?.classList.remove('is-open');$('#appDrawer')?.classList.remove('is-open');}

  function createDetailSheet(){
    if($('#detailSheet'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="detailBackdrop" class="detail-backdrop"></div>
      <section id="detailSheet" class="detail-sheet" aria-hidden="true">
        <div class="sheet-grabber"></div>
        <div class="sheet-head"><div><div id="detailKicker" class="sheet-kicker">DETTAGLIO</div><h2 id="detailTitle">Dettaglio</h2></div><button id="detailClose" class="icon-button" aria-label="Chiudi">×</button></div>
        <div id="detailValue" class="sheet-value"></div>
        <div id="detailText" class="sheet-text"></div>
      </section>`);
    $('#detailBackdrop').addEventListener('click',closeDetail);
    $('#detailClose').addEventListener('click',closeDetail);
    enableSwipeToClose($('#detailSheet'),closeDetail);
  }

  function openDetail({kicker='DETTAGLIO',title,value='',text=''}){
    $('#detailKicker').textContent=kicker;$('#detailTitle').textContent=title;$('#detailValue').textContent=value;$('#detailText').textContent=text;
    $('#detailBackdrop').classList.add('is-open');$('#detailSheet').classList.add('is-open');$('#detailSheet').setAttribute('aria-hidden','false');
    document.body.classList.add('sheet-open');
  }
  function closeDetail(){
    $('#detailBackdrop')?.classList.remove('is-open');$('#detailSheet')?.classList.remove('is-open');$('#detailSheet')?.setAttribute('aria-hidden','true');document.body.classList.remove('sheet-open');
  }

  function metricDetails(){
    const details=[
      ['DISPONIBILITÀ','Libero davvero','Questa è la cifra che resta dopo aver escluso la liquidità protetta, il budget ancora da spendere e le scadenze già impegnate.'],
      ['IMPEGNI','Già impegnato','Somma delle scadenze future che hai già deciso di coprire con la liquidità attuale.'],
      ['BUDGET','Budget residuo','Quanto puoi ancora spendere nelle categorie del budget corrente senza superare i limiti impostati.'],
      ['ENTRATE','In arrivo','Entrate attese non ancora conteggiate nei saldi dei tuoi conti.']
    ];
    $$('.metric-card').forEach((card,i)=>{
      card.classList.add('metric-tappable');
      card.onclick=()=>openDetail({kicker:details[i][0],title:details[i][1],value:$('.metric-value',card)?.textContent||'',text:details[i][2]});
    });
  }

  function svgForAccount(title){const t=title.toLowerCase();if(t.includes('xme'))return icons.lock;if(t.includes('contanti'))return icons.cash;if(t.includes('postepay'))return icons.card;return icons.bank;}
  function decorateRows(){
    $$('#accountsList .list-row').forEach(row=>decorate(row,svgForAccount($('.list-title',row)?.textContent||''),true));
    $$('#movementsList .list-row').forEach(row=>{const amount=$('.list-amount',row);let svg=icons.transfer;if(amount?.classList.contains('positive'))svg=icons.arrowDown;else if(amount?.classList.contains('negative'))svg=icons.arrowUp;decorate(row,svg,false);});
    $$('#expectedIncomeList .list-row').forEach(row=>decorate(row,icons.arrowDown,false));
    $$('#commitmentsList .list-row').forEach(row=>decorate(row,icons.calendar,false));
    $$('#liabilitiesList .list-row').forEach(row=>decorate(row,icons.card,false));
    $$('#goalsList > div').forEach(row=>{if(!row.querySelector('.row-symbol'))row.insertAdjacentHTML('afterbegin',`<span class="row-symbol stack-symbol">${icons.target}</span>`);});
  }

  function decorate(row,svg,accountInteractive){
    if(!row.querySelector(':scope > .row-symbol'))row.insertAdjacentHTML('afterbegin',`<span class="row-symbol">${svg}</span>`);
    if(accountInteractive&&!row.dataset.detailBound){
      row.dataset.detailBound='1';row.classList.add('interactive-row');
      row.addEventListener('click',e=>{if(e.target.closest('button'))return;const title=$('.list-title',row)?.childNodes[0]?.textContent?.trim()||$('.list-title',row)?.textContent||'Conto';const sub=$('.list-sub',row)?.textContent||'';const value=$('.list-amount',row)?.textContent||'';openDetail({kicker:'CONTO',title,value,text:sub+(title.toLowerCase().includes('xme')?' · Liquidità protetta':'')});});
    }
  }

  function enableSwipeToClose(el,onClose){
    if(!el)return;let start=0,delta=0,active=false;
    el.addEventListener('touchstart',e=>{if(e.touches[0].clientY-el.getBoundingClientRect().top>80)return;start=e.touches[0].clientY;delta=0;active=true;el.style.transition='none';},{passive:true});
    el.addEventListener('touchmove',e=>{if(!active)return;delta=Math.max(0,e.touches[0].clientY-start);el.style.transform=`translateY(${delta}px)`;},{passive:true});
    el.addEventListener('touchend',()=>{if(!active)return;active=false;el.style.transition='';el.style.transform='';if(delta>85)onClose();},{passive:true});
  }

  function enhanceNativeModal(){
    const modal=$('.modal');if(modal)enableSwipeToClose(modal,()=>$('#closeModalBtn')?.click());
    const backdrop=$('#modalBackdrop');if(backdrop){const obs=new MutationObserver(()=>{if(!backdrop.classList.contains('hidden')){modal?.classList.remove('sheet-pop');requestAnimationFrame(()=>modal?.classList.add('sheet-pop'));}});obs.observe(backdrop,{attributes:true,attributeFilter:['class']});}
  }

  function viewAnimations(){
    $$('.tab').forEach(tab=>tab.addEventListener('click',()=>requestAnimationFrame(()=>{const active=$('.view.active');if(!active)return;active.classList.remove('view-enter');void active.offsetWidth;active.classList.add('view-enter');setTimeout(()=>active.classList.remove('view-enter'),360);}))); 
  }

  function observeDynamicContent(){
    const ids=['accountsList','movementsList','expectedIncomeList','commitmentsList','liabilitiesList','goalsList'];
    ids.forEach(id=>{const el=$(`#${id}`);if(el)new MutationObserver(decorateRows).observe(el,{childList:true,subtree:true});});
  }

  function launchAnimation(){
    requestAnimationFrame(()=>{$('.hero-card')?.classList.add('reveal');$$('.metric-card').forEach((el,i)=>setTimeout(()=>el.classList.add('reveal'),55+i*45));});
  }

  document.addEventListener('DOMContentLoaded',()=>{
    installIcons();createTopActions();createDrawer();createDetailSheet();metricDetails();decorateRows();observeDynamicContent();enhanceNativeModal();viewAnimations();launchAnimation();
  });
})();