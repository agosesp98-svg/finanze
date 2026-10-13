(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const euro=s=>{const raw=String(s||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.');return Number(raw)||0};
  let syncQueued=false;

  function svg(path){return `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`}
  const iconCheck=svg('<path d="m5 12 4.2 4.2L19 6.5"/>');
  const iconSpark=svg('<path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>');

  async function removePin(){
    try{await FinanceDB.put('settings',{key:'pinHash',value:''})}catch{}
    const pinRow=$('[data-action="pin"]');if(pinRow)pinRow.remove();
    const lock=$('#lockScreen');if(lock){lock.hidden=true;lock.style.display='none'}
  }

  function buildHome(){
    const dash=$('#view-dashboard');if(!dash||dash.dataset.v8Built)return;dash.dataset.v8Built='1';
    const hero=$('.balance-hero',dash);
    if(hero){
      hero.insertAdjacentHTML('beforeend',`<div id="v8HeroStatus" class="v8-hero-status"><i></i><span>Analizzo la situazione…</span></div><div class="v8-hero-chips"><div class="v8-hero-chip"><small>Libero</small><strong id="v8HeroFree">—</strong></div><div class="v8-hero-chip"><small>Impegnato</small><strong id="v8HeroCommitted">—</strong></div><div class="v8-hero-chip"><small>Stipendio</small><strong id="v8HeroSalary">—</strong></div></div>`);
    }
    const smart=$('#spendTodayCard');
    const copy=smart?.querySelector('.smart-copy');
    if(copy&&!$('#v8DailyMeta'))copy.insertAdjacentHTML('beforeend','<div id="v8DailyMeta" class="v8-daily-meta"><span class="v8-daily-pill accent">Budget sicuro</span><span class="v8-daily-pill" id="v8DailyDays">—</span></div>');
    const metrics=$('.metric-grid',dash);
    if(metrics&&!$('#v8Insight'))metrics.insertAdjacentHTML('afterend',`<section id="v8Insight" class="v8-insight"><div class="v8-insight-top"><span class="v8-insight-icon">${iconSpark}</span><div><small>INSIGHT</small><strong id="v8InsightTitle">Situazione in lettura</strong></div></div><p id="v8InsightText">Sto incrociando disponibilità, budget e prossime scadenze.</p></section>`);

    const nextTitle=$('#nextCommitmentName');const nextSection=nextTitle?.closest('.section-card');
    if(nextSection&&!$('#v8Upcoming')){
      nextSection.hidden=true;
      nextSection.insertAdjacentHTML('beforebegin','<section id="v8Upcoming" class="v8-upcoming"><div class="v8-upcoming-head"><div><small>PROSSIME USCITE</small><h2>In arrivo</h2></div><button type="button" data-go="plan">Vedi tutto</button></div><div id="v8UpcomingRail" class="v8-upcoming-rail"></div></section>');
    }

    const expected=$('#expectedIncomeList')?.closest('.section-card');
    if(expected&&!$('#v8Recent'))expected.insertAdjacentHTML('afterend','<section id="v8Recent" class="section-card v8-recent"><div class="section-title-row"><div><small>ULTIME ATTIVITÀ</small><h2>Movimenti recenti</h2></div><button class="link-button" type="button" data-go="movements">Vedi tutti</button></div><div id="v8RecentList" class="list"></div></section>');

    const eyebrow=$('.topbar .eyebrow');if(eyebrow){const d=new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'numeric',month:'short'}).format(new Date()).replace('.','');eyebrow.textContent=d.toUpperCase()}
    const chip=$('#snapshotChip');if(chip)chip.textContent='Aggiornato ora';
  }

  function syncHero(){
    const free=euro($('#freeLiquidity')?.textContent), committed=euro($('#committedAmount')?.textContent);
    const salary=$('#drawerSalaryText')?.textContent?.trim()||'Entro il 10';
    if($('#v8HeroFree'))$('#v8HeroFree').textContent=money(free);
    if($('#v8HeroCommitted'))$('#v8HeroCommitted').textContent=money(committed);
    if($('#v8HeroSalary'))$('#v8HeroSalary').textContent=salary.replace(/\s+202\d$/,'');
    const st=$('#v8HeroStatus');if(st){
      st.classList.toggle('warn',free<0);
      const txt=st.querySelector('span');
      if(txt)txt.textContent=free<0?'Margine da riequilibrare':free<100?'Sei coperto, con margine contenuto':'Piano in equilibrio';
    }
  }

  function syncDaily(){
    const days=$('#budgetDays')?.textContent?.trim();
    const salary=$('#drawerSalaryText')?.textContent?.trim();
    if($('#v8DailyDays'))$('#v8DailyDays').textContent=days&&days!=='Fino allo stipendio'?`${days} al prossimo stipendio`:salary&&salary!=='Non impostato'?`Stipendio ${salary}`:'Stipendio entro il 10';
  }

  function syncInsight(){
    const free=euro($('#freeLiquidity')?.textContent), committed=euro($('#committedAmount')?.textContent), daily=euro($('#spendTodayValue')?.textContent);
    const title=$('#v8InsightTitle'),text=$('#v8InsightText');if(!title||!text)return;
    if(free<0){title.textContent='Serve un piccolo riequilibrio';text.textContent=`Le scadenze e il budget assorbono più della liquidità ordinaria. Per oggi resta sotto ${money(Math.max(0,daily))} e evita nuove uscite non pianificate.`;return}
    if(free<100){title.textContent='Coperto, ma senza sprechi';text.textContent=`Hai ${money(free)} di margine realmente libero oltre budget e scadenze. Il ritmo giornaliero consigliato resta ${money(daily)}.`;return}
    title.textContent='Hai margine di manovra';text.textContent=`Dopo budget e scadenze restano ${money(free)} liberi. Puoi mantenere un ritmo di circa ${money(daily)} al giorno senza intaccare il piano.`;
  }

  function syncUpcoming(){
    const rail=$('#v8UpcomingRail');if(!rail)return;
    const rows=$$('#commitmentsList .list-row').slice(0,4);
    if(!rows.length){rail.innerHTML='<div class="empty">Nessuna uscita pianificata.</div>';return}
    rail.innerHTML=rows.map((row,i)=>{
      const name=$('.list-title',row)?.textContent?.trim()||'Scadenza';
      const sub=$('.list-sub',row)?.textContent?.trim()||'';
      const amount=$('.list-amount',row)?.textContent?.trim()||'—';
      const parts=sub.split('·').map(x=>x.trim());
      return `<button class="v8-upcoming-card" type="button" data-go="plan"><div class="v8-upcoming-date"><span><i></i>${i===0?'Prossima':`#${i+1}`}</span><span>${parts[0]||''}</span></div><h3>${name}</h3><strong>${amount}</strong><p>${parts.slice(1).join(' · ')||'Uscita pianificata'}</p></button>`;
    }).join('');
  }

  function syncRecent(){
    const box=$('#v8RecentList');if(!box)return;
    const rows=$$('#movementsList .list-row').slice(0,3);
    if(!rows.length){box.innerHTML='<div class="empty">Nessun movimento recente.</div>';return}
    box.innerHTML=rows.map(r=>`<div class="list-row">${r.innerHTML}</div>`).join('');
  }

  function sync(){
    syncQueued=false;buildHome();removePin();syncHero();syncDaily();syncInsight();syncUpcoming();syncRecent();
    const dash=$('#view-dashboard');if(dash&&!dash.classList.contains('v8-ready'))requestAnimationFrame(()=>dash.classList.add('v8-ready'));
  }
  function queueSync(){if(syncQueued)return;syncQueued=true;requestAnimationFrame(sync)}

  function watch(){
    const targets=['totalLiquidity','freeLiquidity','committedAmount','spendTodayValue','budgetDays','drawerSalaryText','commitmentsList','movementsList','expectedIncomeList','homeGoals'];
    targets.forEach(id=>{const el=$(`#${id}`);if(el)new MutationObserver(queueSync).observe(el,{childList:true,subtree:true,characterData:true})});
    const app=$('#app');if(app)new MutationObserver(()=>{if(app.getAttribute('aria-busy')==='false')queueSync()}).observe(app,{attributes:true,attributeFilter:['aria-busy']});
  }

  document.addEventListener('DOMContentLoaded',()=>{
    buildHome();removePin();watch();queueSync();setTimeout(queueSync,180);setTimeout(queueSync,700);
  });
})();
