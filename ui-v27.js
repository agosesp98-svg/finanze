(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const context={
    dashboard:'Disponibilità, spese e obiettivi fino al prossimo stipendio',
    accounts:'Dove sono i tuoi soldi e cosa è protetto',
    marriage:'Piano di risparmio per il matrimonio',
    movements:'Entrate, uscite e trasferimenti',
    budget:'Categorie di spesa del periodo corrente',
    plan:'Budget, scadenze, obiettivi e rate',
    rates:'Finanziamenti e rateizzazioni'
  };

  function currentView(){
    const active=$('.view.active');
    if(!active)return'dashboard';
    return active.id.replace(/^view-/,'');
  }

  function ensureHeaderContext(){
    const title=$('#pageTitle');if(!title)return;
    let p=$('#pageContext');
    if(!p){p=document.createElement('p');p.id='pageContext';title.insertAdjacentElement('afterend',p)}
    const key=currentView();
    p.textContent=context[key]||'Gestisci le tue finanze';
  }

  function markCurrentTab(){
    $$('.tabbar .tab').forEach(tab=>{
      if(tab.classList.contains('active'))tab.setAttribute('aria-current','page');
      else tab.removeAttribute('aria-current');
    });
  }

  function nameHome(){
    const head=$('.v17-accounts-head');
    if(head){
      const small=$('small',head),h=$('h2',head);
      if(small)small.textContent='CONTI DISPONIBILI';
      if(h)h.textContent='I tuoi soldi';
    }
    const marriage=$('#marriageHomeCard .marriage-home-main>small');if(marriage)marriage.textContent='FONDO MATRIMONIO';
    const upcoming=$('#v8Upcoming .v8-upcoming-head');
    if(upcoming){const small=$('small',upcoming),h=$('h2',upcoming);if(small)small.textContent='IN ARRIVO';if(h)h.textContent='Prossime uscite'}
    const budget=$('.v23-budget-card .section-title-row');
    if(budget){const small=$('small',budget),h=$('h2',budget);if(small)small.textContent='BUDGET DEL PERIODO';if(h)h.textContent='Spese quotidiane'}
  }

  function enhanceRegions(){
    const hero=$('.balance-hero.v17-account-hero');if(hero){hero.setAttribute('role','region');hero.setAttribute('aria-label','Conti disponibili')}
    const upcoming=$('#v8Upcoming');if(upcoming){upcoming.setAttribute('role','region');upcoming.setAttribute('aria-label','Prossime uscite')}
    const safety=$('.v16-safety');if(safety){safety.setAttribute('role','alert');safety.setAttribute('aria-live','assertive')}
    const marriage=$('#marriageHomeCard');if(marriage&&!marriage.getAttribute('aria-label'))marriage.setAttribute('aria-label','Apri il fondo matrimonio');
    const spend=$('#spendTodayCard');if(spend&&!spend.getAttribute('aria-label'))spend.setAttribute('aria-label','Apri il dettaglio di quanto puoi spendere oggi');
  }

  function arrangePlan(){
    const plan=$('#view-plan');if(!plan)return;
    const budget=$('#v23PlanBudget'),rates=$('#v14RateEntry');
    if(!budget&&!rates)return;
    let grid=$('#v27PlanGrid');
    if(!grid){
      grid=document.createElement('div');grid.id='v27PlanGrid';grid.setAttribute('role','group');grid.setAttribute('aria-label','Strumenti principali del piano');
      const head=$('.section-head-page',plan);head?.insertAdjacentElement('afterend',grid);
    }
    [budget,rates].filter(Boolean).forEach(el=>{if(el.parentElement!==grid)grid.appendChild(el)});
  }

  function improveRates(){
    const view=$('#view-rates');if(!view)return;
    view.setAttribute('aria-label','Rate e finanziamenti');
    $$('.v14-edit',view).forEach(btn=>{if(!btn.getAttribute('aria-label'))btn.setAttribute('aria-label','Modifica rata')});
  }

  function sync(){
    document.body.classList.add('v27-ui');
    ensureHeaderContext();markCurrentTab();nameHome();enhanceRegions();arrangePlan();improveRates();
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('.tab,[data-open-rates],[data-v23-budget],#v14Back,#v23BudgetBack,[data-go="marriage"]'))setTimeout(sync,40);
  },true);

  document.addEventListener('DOMContentLoaded',()=>{
    sync();
    [120,450,900,1600,2600].forEach(ms=>setTimeout(sync,ms));
    const tabs=$('.tabbar');
    if(tabs)new MutationObserver(()=>{markCurrentTab();ensureHeaderContext()}).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class']});
    const plan=$('#view-plan');
    if(plan)new MutationObserver(()=>{if(!$('#v27PlanGrid')||$('#v14RateEntry')?.parentElement?.id!=='v27PlanGrid'||$('#v23PlanBudget')?.parentElement?.id!=='v27PlanGrid')arrangePlan()}).observe(plan,{childList:true,subtree:false});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
    window.addEventListener('pageshow',sync,{passive:true});
  });
})();
