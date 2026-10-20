(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const money0=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n||0));
  const dateFmt=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short'});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const parse=s=>s?new Date(`${s}T12:00:00`):null;
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today=()=>iso(new Date());
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  let last=null,timer=null;

  function fallbackSalaryDate(){
    const n=new Date();let y=n.getFullYear(),m=n.getMonth();
    if(n.getDate()>10){m+=1;if(m>11){m=0;y+=1}}
    return `${y}-${String(m+1).padStart(2,'0')}-10`;
  }
  function liabilityMatchesCommitment(l,c){
    if(String(c.liabilityId||'')&&String(c.liabilityId||'')===String(l.id||''))return true;
    if(l.scheduleKey&&c.liabilityKey&&String(l.scheduleKey)===String(c.liabilityKey))return true;
    return norm(l.name)&&norm(l.name)===norm(c.name);
  }
  async function snapshot(){
    if(typeof FinanceDB==='undefined')return null;
    const [accounts,budgets,commitments,liabilities,settings,movements]=await Promise.all([
      FinanceDB.getAll('accounts'),FinanceDB.getAll('budgets'),FinanceDB.getAll('commitments'),FinanceDB.getAll('liabilities'),FinanceDB.getAll('settings'),FinanceDB.getAll('movements')
    ]);
    const configured=settings.find(x=>x.key==='nextSalaryDate')?.value;
    const salary=(configured&&configured>=today())?configured:fallbackSalaryDate();
    const ordinaryAccounts=accounts.filter(a=>!a.protected);
    const ordinary=ordinaryAccounts.reduce((s,a)=>s+Number(a.balance||0),0);
    const protectedAmount=accounts.filter(a=>a.protected).reduce((s,a)=>s+Number(a.balance||0),0);
    const categories=budgets.map(b=>({name:b.name||'Categoria',budget:Number(b.budget||0),spent:Number(b.spent||0),remaining:Math.max(0,Number(b.budget||0)-Number(b.spent||0))}));
    const budgetTotal=categories.reduce((s,b)=>s+b.budget,0);
    const budgetSpent=categories.reduce((s,b)=>s+b.spent,0);
    const remainingBudget=categories.reduce((s,b)=>s+b.remaining,0);
    const dueCommitments=commitments.filter(c=>c.active&&c.dueDate&&c.dueDate<=salary).map(c=>({name:c.name||'Scadenza',amount:Number(c.amount||0),date:c.dueDate,raw:c,source:'commitment'}));
    const uncoveredRates=liabilities.filter(l=>!l.completed&&l.nextDueDate&&l.nextDueDate<=salary&&Number(l.monthly||0)>0)
      .filter(l=>!dueCommitments.some(x=>liabilityMatchesCommitment(l,x.raw)))
      .map(l=>({name:l.name||'Rata',amount:Number(l.monthly||0),date:l.nextDueDate,raw:l,source:'liability'}));
    const dueItems=[...dueCommitments,...uncoveredRates].filter(x=>x.amount>0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const due=dueItems.reduce((s,x)=>s+x.amount,0);
    const rawAfter=ordinary-due;
    const shortfall=Math.max(0,-rawAfter);
    const afterBills=Math.max(0,rawAfter);
    const spendable=shortfall>0?0:Math.max(0,Math.min(remainingBudget,afterBills));
    const days=Math.max(1,Math.ceil((parse(salary)-parse(today()))/86400000)+1);
    const daily=spendable/days;
    const coverage=remainingBudget>0?Math.max(0,Math.min(100,spendable/remainingBudget*100)):100;
    const month=today().slice(0,7);
    const monthMovements=movements.filter(m=>String(m.date||m.createdAt||'').slice(0,7)===month);
    const monthOut=monthMovements.filter(m=>m.type==='expense').reduce((s,m)=>s+Number(m.amount||0),0);
    const monthIn=monthMovements.filter(m=>m.type==='income').reduce((s,m)=>s+Number(m.amount||0),0);
    last={accounts,ordinaryAccounts,ordinary,protectedAmount,categories,budgetTotal,budgetSpent,remainingBudget,dueItems,due,rawAfter,shortfall,afterBills,spendable,days,daily,coverage,salary,monthOut,monthIn,monthCount:monthMovements.length};
    return last;
  }

  function ensureSpendView(){
    if($('#view-spend'))return;
    const dashboard=$('#view-dashboard');if(!dashboard)return;
    dashboard.insertAdjacentHTML('afterend',`<section id="view-spend" class="view v28-spend-view" aria-label="Limite di spesa fino allo stipendio">
      <div class="v28-spend-head">
        <button id="v28SpendBack" class="v28-round" type="button" aria-label="Torna alla Home"><span aria-hidden="true">‹</span></button>
        <strong>Limite</strong>
        <button id="v28SpendMenu" class="v28-round" type="button" aria-label="Apri gestione"><span class="v28-grid-icon" aria-hidden="true">⌘</span></button>
      </div>
      <section id="v28GaugeCard" class="v28-gauge-card">
        <div class="v28-gauge-title"><div><small>FINO AL PROSSIMO STIPENDIO</small><h2 id="v28GaugeTitle">Limite di spesa</h2></div><span id="v28GaugeDate">—</span></div>
        <div class="v28-gauge" aria-hidden="true">
          <svg viewBox="0 0 288 172" focusable="false"><path class="v28-gauge-bg" d="M34 145 A110 110 0 0 1 254 145"/><path id="v28GaugeArc" class="v28-gauge-arc" d="M34 145 A110 110 0 0 1 254 145"/></svg>
          <span id="v28Needle" class="v28-needle"></span>
        </div>
        <div class="v28-gauge-values"><div><strong id="v28Spendable">—</strong><span id="v28BudgetLeft">/ —</span></div><b id="v28Coverage">0%</b></div>
        <p id="v28GaugeCaption">Calcolo prudenziale basato su budget e scadenze.</p>
      </section>
      <div id="v28SpendDanger" class="v28-spend-danger" hidden role="alert"><small>DEFICIT PRIMA DELLO STIPENDIO</small><strong id="v28SpendDangerValue">—</strong><p>Non considerare nuove spese discrezionali finché questo importo non è coperto.</p></div>
      <div class="v28-spend-metrics">
        <article><small>DOPO LE SCADENZE</small><strong id="v28AfterBills">—</strong><span>liquidità utilizzabile</span></article>
        <article><small>BUDGET RESIDUO</small><strong id="v28RemainingBudget">—</strong><span>spesa, bar, uscite…</span></article>
      </div>
      <section class="v28-spend-advice">
        <div><small>RITMO CONSIGLIATO</small><h3 id="v28Daily">— al giorno</h3><p id="v28DailyCopy">—</p></div>
        <button id="v28Breakdown" type="button">Vedi calcolo <span aria-hidden="true">›</span></button>
      </section>
      <section class="v28-due-panel"><div class="v28-section-head"><div><small>DA COPRIRE</small><h3>Prima del 10</h3></div><span id="v28DueTotal">—</span></div><div id="v28DueList" class="v28-due-list"></div></section>
    </section>`);
  }

  function ensureHomeModules(){
    const dash=$('#view-dashboard');if(!dash)return;
    if(!$('#v28CycleCard')){
      const spend=$('#spendTodayCard');
      spend?.insertAdjacentHTML('afterend',`<section id="v28CycleCard" class="v28-cycle-card" aria-label="Situazione fino allo stipendio">
        <div class="v28-cycle-top"><div><small>DA QUI AL 10</small><h2>Situazione</h2></div><span id="v28CycleStatus">Coperto</span></div>
        <div class="v28-cycle-lines"><div><span>Disponibile sui conti</span><strong id="v28CycleAvailable">—</strong></div><div><span>Uscite previste</span><strong id="v28CycleDue">—</strong></div></div>
        <div id="v28CycleDueList" class="v28-cycle-due"></div>
      </section>`);
    }
    if(!$('#v28Actions')){
      $('#v28CycleCard')?.insertAdjacentHTML('afterend',`<section id="v28Actions" class="v28-actions" aria-label="Azioni rapide">
        <button type="button" data-action="expense"><span aria-hidden="true">−</span><small>AGGIUNGI</small><strong>Spesa</strong></button>
        <button type="button" data-action="income"><span aria-hidden="true">＋</span><small>AGGIUNGI</small><strong>Entrata</strong></button>
        <button type="button" data-action="transfer"><span aria-hidden="true">✓</span><small>GESTISCI</small><strong>Trasferimento</strong></button>
      </section>`);
    }
    if(!$('#v28Report')){
      $('#v28Actions')?.insertAdjacentHTML('afterend',`<section id="v28Report" class="v28-report"><div class="v28-section-head"><div><small>INFORME FINANZIARIO</small><h2>Budget del periodo</h2></div><button type="button" id="v28OpenBudget">Dettagli</button></div><div id="v28ReportBars" class="v28-report-bars"></div><div id="v28ReportLegend" class="v28-report-legend"></div></section>`);
    }
    const ring=$('#spendTodayCard .v28-spend-ring');
    if(!ring){$('#spendTodayCard .chevron')?.insertAdjacentHTML('beforebegin','<span class="v28-spend-ring" aria-hidden="true"><i></i></span>')}
  }

  function ensureMarriageReference(){
    const view=$('#view-marriage');if(!view)return;
    if(!$('#v28MarriageAdd')){
      const head=$('.marriage-page-head',view);
      head?.insertAdjacentHTML('afterend',`<button id="v28MarriageAdd" class="v28-marriage-add" type="button"><span><small>AGGIUNGI</small><strong>Nuovo accantonamento</strong></span><b aria-hidden="true">＋</b></button><div id="v28MarriageListLabel" class="v28-list-label">Il tuo obiettivo</div>`);
    }
    const h=$('.marriage-page-head h2',view);if(h)h.textContent='Matrimonio';
    const sm=$('.marriage-page-head small',view);if(sm)sm.textContent='RISPARMIO';
  }

  function ensureAccountSummary(){
    const view=$('#view-accounts');if(!view||$('#v28AccountSummary'))return;
    $('#accountsList')?.insertAdjacentHTML('afterend',`<section id="v28AccountSummary" class="v28-account-summary"><div class="v28-account-month"><span>Questo mese</span><i></i></div><div class="v28-account-summary-row"><div><small>MOVIMENTI</small><strong id="v28MoveCount">0</strong></div><div><small>ENTRATE</small><strong id="v28MonthIn">—</strong></div><div><small>USCITE</small><strong id="v28MonthOut">—</strong></div></div></section>`);
  }

  function markAccounts(){
    $$('#accountsList .account-card').forEach(card=>{
      const n=norm($('.account-name',card)?.textContent||'');
      card.classList.remove('v28-bank','v28-protected-account','v28-cash-account');
      if(n.includes('xme')||n.includes('protett'))card.classList.add('v28-protected-account');
      else if(n.includes('contant'))card.classList.add('v28-cash-account');
      else card.classList.add('v28-bank');
    });
  }

  function setGauge(pct){
    const p=Math.max(0,Math.min(100,Number(pct||0)));
    const arc=$('#v28GaugeArc');
    if(arc){const len=346;arc.style.strokeDasharray=String(len);arc.style.strokeDashoffset=String(len*(1-p/100))}
    const needle=$('#v28Needle');if(needle)needle.style.transform=`translateX(-50%) rotate(${-90+p*1.8}deg)`;
    const ring=$('#spendTodayCard .v28-spend-ring');if(ring)ring.style.setProperty('--v28-p',`${p*3.6}deg`);
  }

  function renderHome(s){
    ensureHomeModules();
    const card=$('#spendTodayCard');
    if(card){
      const small=$('.smart-copy small',card),value=$('#spendTodayValue'),text=$('#spendTodayText');
      if(small)small.textContent=s.shortfall>0?'PRIMA COPRI LE USCITE':'LIMITE FINO AL 10';
      if(value)value.textContent=money(s.spendable);
      if(text)text.textContent=s.shortfall>0?`Mancano ${money(s.shortfall)} per coprire le scadenze`:`${money(s.daily)}/giorno · ${s.days} giorni`;
      card.classList.toggle('is-danger',s.shortfall>0);
    }
    setGauge(s.coverage);
    $('#v28CycleAvailable').textContent=money(s.ordinary);
    $('#v28CycleDue').textContent=money(s.due);
    const status=$('#v28CycleStatus');
    if(status){status.textContent=s.shortfall>0?`Deficit ${money(s.shortfall)}`:'Coperto';status.classList.toggle('danger',s.shortfall>0)}
    $('#v28CycleCard')?.classList.toggle('is-danger',s.shortfall>0);
    const dueList=$('#v28CycleDueList');
    if(dueList)dueList.innerHTML=s.dueItems.slice(0,3).map(x=>`<div><span><b>${esc(x.name)}</b><small>${dateFmt.format(parse(x.date)).replace('.','')}</small></span><strong>${money(x.amount)}</strong></div>`).join('')||'<p>Nessuna uscita registrata prima dello stipendio.</p>';

    const bars=$('#v28ReportBars'),legend=$('#v28ReportLegend');
    const cats=s.categories.filter(x=>x.budget>0).slice(0,5);
    if(bars){bars.innerHTML=cats.map((c,i)=>{const pct=Math.max(4,Math.min(100,c.spent/c.budget*100||0));return `<button type="button" data-v28-budget aria-label="${esc(c.name)}: ${Math.round(c.spent/c.budget*100||0)}% usato"><span><i style="height:${pct}%"></i></span><b>${Math.round(c.spent/c.budget*100||0)}%</b></button>`}).join('')||'<p class="v28-empty">Nessun budget impostato.</p>'}
    if(legend){legend.innerHTML=cats.map((c,i)=>`<span><i class="c${i+1}"></i>${esc(c.name)}</span>`).join('')}
  }

  function renderSpend(s){
    ensureSpendView();
    const salaryLabel=dateFmt.format(parse(s.salary)).replace('.','');
    $('#v28GaugeDate').textContent=salaryLabel;
    $('#v28Spendable').textContent=money0(s.spendable);
    $('#v28BudgetLeft').textContent=`/ ${money0(s.remainingBudget)}`;
    $('#v28Coverage').textContent=`${Math.round(s.coverage)}%`;
    $('#v28GaugeCaption').textContent=s.shortfall>0?'La liquidità non copre ancora tutte le uscite previste.':'Percentuale del budget residuo realmente coperta dalla liquidità dopo le scadenze.';
    $('#v28AfterBills').textContent=money(s.rawAfter);
    $('#v28RemainingBudget').textContent=money(s.remainingBudget);
    $('#v28Daily').textContent=`${money(s.daily)} al giorno`;
    $('#v28DailyCopy').textContent=s.shortfall>0?`Spendibile prudenziale a zero finché non copri ${money(s.shortfall)}.`:`Per ${s.days} giorni, fino al ${salaryLabel}.`;
    $('#v28DueTotal').textContent=money(s.due);
    const danger=$('#v28SpendDanger');danger.hidden=s.shortfall<=0;
    if(s.shortfall>0)$('#v28SpendDangerValue').textContent=money(s.shortfall);
    const list=$('#v28DueList');if(list)list.innerHTML=s.dueItems.map(x=>`<div><span><b>${esc(x.name)}</b><small>${dateFmt.format(parse(x.date)).replace('.','')}</small></span><strong>${money(x.amount)}</strong></div>`).join('')||'<p>Nessuna scadenza prima dello stipendio.</p>';
    setGauge(s.coverage);
  }

  function renderAccountSummary(s){
    ensureAccountSummary();markAccounts();
    $('#v28MoveCount').textContent=String(s.monthCount||0);
    $('#v28MonthIn').textContent=money0(s.monthIn);
    $('#v28MonthOut').textContent=money0(s.monthOut);
  }

  function arrangeHome(){
    const dash=$('#view-dashboard');if(!dash)return;
    const nodes=[
      $('.balance-hero.v17-account-hero',dash),$('#marriageHomeCard',dash),$('#v16SafetyAlert',dash),$('#spendTodayCard',dash),$('#v28CycleCard',dash),$('#v28Actions',dash),$('#v28Report',dash)
    ].filter(Boolean);
    nodes.forEach(el=>dash.appendChild(el));
  }

  function applyMode(){
    const id=$('.view.active')?.id||'view-dashboard';
    document.body.classList.toggle('v28-spend-mode',id==='view-spend');
    document.body.classList.toggle('v28-accounts-mode',id==='view-accounts');
    document.body.classList.toggle('v28-marriage-mode',id==='view-marriage');
    const theme=id==='view-accounts'?'#ffe94a':'#0b0b0c';
    $$('meta[name="theme-color"]').forEach(m=>m.setAttribute('content',theme));
  }

  function openSpend(){
    ensureSpendView();
    $$('.view').forEach(v=>v.classList.remove('active'));$('#view-spend')?.classList.add('active');
    $$('.tab').forEach(t=>t.classList.remove('active'));
    applyMode();window.scrollTo({top:0,behavior:'auto'});
    snapshot().then(s=>{if(s)renderSpend(s)});
  }
  function closeSpend(){
    $$('.view').forEach(v=>v.classList.remove('active'));$('#view-dashboard')?.classList.add('active');
    $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view==='dashboard'));
    const title=$('#pageTitle');if(title)title.textContent='Oggi';applyMode();window.scrollTo({top:0,behavior:'auto'});
  }

  function openBreakdown(s){
    const body=$('#sheetBody'),sheet=$('#sheet'),back=$('#sheetBackdrop');if(!body||!sheet||!back)return;
    $('#sheetKicker').textContent='COME LO CALCOLO';$('#sheetTitle').textContent='Limite fino allo stipendio';
    body.innerHTML=`<div class="v28-sheet-total ${s.shortfall>0?'danger':''}"><small>SPENDIBILE FINO AL ${dateFmt.format(parse(s.salary)).toUpperCase()}</small><strong>${money(s.spendable)}</strong><span>${s.shortfall>0?`Prima devi coprire un deficit di ${money(s.shortfall)}.`:`Equivale a ${money(s.daily)} al giorno per ${s.days} giorni.`}</span></div>
      <div class="v28-sheet-formula"><div><span>Conti non protetti</span><strong>${money(s.ordinary)}</strong></div><div><span>− Scadenze e rate entro il 10</span><strong>− ${money(s.due)}</strong></div><div class="${s.rawAfter<0?'danger':''}"><span>= Dopo le scadenze</span><strong>${money(s.rawAfter)}</strong></div><div><span>Budget quotidiano residuo</span><strong>${money(s.remainingBudget)}</strong></div><div class="result"><span>Limite prudenziale</span><strong>${money(s.spendable)}</strong></div></div>
      <p class="v28-sheet-note">Il limite è il valore più basso tra budget residuo e liquidità rimasta dopo le uscite registrate fino al prossimo stipendio. Le entrate attese non vengono considerate finché non risultano ricevute.</p>`;
    back.hidden=false;requestAnimationFrame(()=>{back.classList.add('open');sheet.classList.add('open');sheet.setAttribute('aria-hidden','false')});sheet.scrollTop=0;
  }

  async function render(){
    ensureSpendView();ensureHomeModules();ensureMarriageReference();ensureAccountSummary();arrangeHome();applyMode();
    try{const s=await snapshot();if(!s)return;renderHome(s);renderSpend(s);renderAccountSummary(s)}catch(e){console.warn('V28 UI render',e)}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(render,100)}

  window.addEventListener('click',e=>{
    if(e.target.closest('#spendTodayCard')){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openSpend();return;
    }
  },true);

  document.addEventListener('click',e=>{
    if(e.target.closest('#v28SpendBack')){e.preventDefault();closeSpend();return}
    if(e.target.closest('#v28SpendMenu')){e.preventDefault();$('#menuBtn')?.click();return}
    if(e.target.closest('#v28Breakdown')){e.preventDefault();(last?Promise.resolve(last):snapshot()).then(s=>s&&openBreakdown(s));return}
    if(e.target.closest('#v28OpenBudget,[data-v28-budget]')){e.preventDefault();$('.tab[data-view="budget"]')?.click();return}
    if(e.target.closest('#v28MarriageAdd')){e.preventDefault();const card=$('.marriage-save-card');card?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('#marriageAddAmount')?.focus(),350);return}
    if(e.target.closest('.tab'))setTimeout(()=>{applyMode();schedule()},40);
  });

  document.addEventListener('DOMContentLoaded',()=>{
    document.body.classList.add('v28-ui');
    render();[180,500,1000,1800,2800].forEach(ms=>setTimeout(render,ms));
    const roots=['accountsList','budgetCategories','commitmentsList','liabilitiesList','movementsList','marriageCurrent','marriageHomeCurrent'];
    roots.forEach(id=>{const el=$(`#${id}`);if(el)new MutationObserver(schedule).observe(el,{childList:true,subtree:true,characterData:true})});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});window.addEventListener('pageshow',render,{passive:true});
  });
})();
