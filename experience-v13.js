(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const shortDate=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long'});
  const parse=s=>new Date(`${s}T12:00:00`);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today=()=>iso(new Date());
  let snapshot=null,timer=null,busy=false;

  function fallbackSalaryDate(){
    const n=new Date();
    let y=n.getFullYear(),m=n.getMonth();
    if(n.getDate()>10){m+=1;if(m>11){m=0;y+=1}}
    return `${y}-${String(m+1).padStart(2,'0')}-10`;
  }

  async function loadSnapshot(){
    if(busy)return snapshot;
    busy=true;
    try{
      const [accounts,budgets,commitments,settings]=await Promise.all([
        FinanceDB.getAll('accounts'),FinanceDB.getAll('budgets'),FinanceDB.getAll('commitments'),FinanceDB.getAll('settings')
      ]);
      const setting=settings.find(x=>x.key==='nextSalaryDate')?.value;
      const salary=(setting&&setting>=today())?setting:fallbackSalaryDate();
      const ordinary=accounts.filter(a=>!a.protected).reduce((s,a)=>s+Number(a.balance||0),0);
      const protectedAmount=accounts.filter(a=>a.protected).reduce((s,a)=>s+Number(a.balance||0),0);
      const remainingCategories=budgets.map(b=>({name:b.name||'Categoria',remaining:Math.max(0,Number(b.budget||0)-Number(b.spent||0)),budget:Number(b.budget||0),spent:Number(b.spent||0)}));
      const remainingBudget=remainingCategories.reduce((s,b)=>s+b.remaining,0);
      const dueBeforeSalary=commitments.filter(c=>c.active&&c.dueDate&&c.dueDate<=salary).reduce((s,c)=>s+Number(c.amount||0),0);
      const afterBills=Math.max(0,ordinary-dueBeforeSalary);
      const spendUntilSalary=Math.max(0,Math.min(remainingBudget,afterBills));
      const extra=Math.max(0,afterBills-remainingBudget);
      const days=Math.max(1,Math.ceil((parse(salary)-parse(today()))/86400000)+1);
      const daily=spendUntilSalary/days;
      snapshot={salary,ordinary,protectedAmount,remainingBudget,dueBeforeSalary,afterBills,spendUntilSalary,extra,days,daily,remainingCategories};
      return snapshot;
    }finally{busy=false}
  }

  function ensureClarityCard(){
    if($('#v13Clarity'))return;
    const metrics=$('.metric-grid');
    if(!metrics)return;
    metrics.insertAdjacentHTML('afterend',`<section id="v13Clarity" class="v13-clarity" aria-live="polite">
      <div class="v13-clarity-head"><div><small>IL TUO MARGINE</small><h2>Quanto puoi davvero spendere</h2></div><button id="v13Explain" type="button">Come lo calcolo</button></div>
      <div class="v13-equation">
        <div><span>Disponibile sui conti</span><strong id="v13Ordinary">—</strong></div>
        <i>−</i>
        <div><span>Scadenze prima dello stipendio</span><strong id="v13Bills">—</strong></div>
        <i>=</i>
        <div class="is-result"><span>Liquidità utilizzabile</span><strong id="v13AfterBills">—</strong></div>
      </div>
      <div class="v13-spend-strip"><div><small>PER SPESA, BAR, USCITE, BENZINA…</small><strong id="v13UntilSalary">—</strong><span id="v13UntilSalaryDate"></span></div><div><small>MEDIA AL GIORNO</small><strong id="v13Daily">—</strong><span id="v13Days"></span></div></div>
      <div id="v13Categories" class="v13-categories"></div>
      <div class="v13-extra"><span>Extra non assegnato</span><strong id="v13Extra">—</strong><small>Resta libero anche dopo budget quotidiano e scadenze.</small></div>
    </section>`);
  }

  function updateHome(s){
    ensureClarityCard();
    const smartLabel=$('#spendTodayCard .smart-copy small');
    if(smartLabel)smartLabel.textContent='PER SPESE QUOTIDIANE · OGGI';
    const smartValue=$('#spendTodayValue');if(smartValue)smartValue.textContent=money(s.daily);
    const smartText=$('#spendTodayText');if(smartText)smartText.textContent=`${money(s.spendUntilSalary)} fino al ${shortDate.format(parse(s.salary))} · ${s.days} giorni`;

    const freeCard=$('[data-detail="free"]');
    if(freeCard){
      const sm=$('small',freeCard),st=$('strong',freeCard),sp=$('span',freeCard);
      if(sm)sm.textContent='Spendibile fino allo stipendio';if(st)st.textContent=money(s.spendUntilSalary);if(sp)sp.textContent='Spesa, bar, ristoranti, benzina…';
    }
    const committed=$('[data-detail="committed"]');
    if(committed){
      const sm=$('small',committed),st=$('strong',committed),sp=$('span',committed);
      if(sm)sm.textContent='Da tenere per scadenze';if(st)st.textContent=money(s.dueBeforeSalary);if(sp)sp.textContent=`Prima del ${shortDate.format(parse(s.salary))}`;
    }
    const map={v13Ordinary:s.ordinary,v13Bills:s.dueBeforeSalary,v13AfterBills:s.afterBills,v13UntilSalary:s.spendUntilSalary,v13Daily:s.daily,v13Extra:s.extra};
    Object.entries(map).forEach(([id,v])=>{const el=$(`#${id}`);if(el)el.textContent=money(v)});
    const sd=$('#v13UntilSalaryDate');if(sd)sd.textContent=`fino al ${shortDate.format(parse(s.salary))}`;
    const d=$('#v13Days');if(d)d.textContent=`per ${s.days} giorni`;
    const cats=$('#v13Categories');if(cats)cats.innerHTML=s.remainingCategories.map(b=>`<button type="button" data-go-budget="1"><span>${b.name}</span><strong>${money(b.remaining)}</strong></button>`).join('');
  }

  function openBreakdown(s){
    const body=$('#sheetBody'),sheet=$('#sheet'),back=$('#sheetBackdrop');if(!body||!sheet||!back)return;
    $('#sheetKicker').textContent='COME LO CALCOLO';$('#sheetTitle').textContent='Quanto puoi spendere';
    body.innerHTML=`<div class="v13-sheet-hero"><small>OGGI</small><strong>${money(s.daily)}</strong><span>È la media giornaliera sostenibile per le spese quotidiane fino al ${shortDate.format(parse(s.salary))}.</span></div>
      <div class="v13-sheet-formula">
        <div><span>Disponibile non protetto</span><strong>${money(s.ordinary)}</strong></div>
        <div><span>− Scadenze prima dello stipendio</span><strong>− ${money(s.dueBeforeSalary)}</strong></div>
        <div><span>= Liquidità dopo le scadenze</span><strong>${money(s.afterBills)}</strong></div>
        <div><span>Budget quotidiano ancora disponibile</span><strong>${money(s.remainingBudget)}</strong></div>
        <div class="result"><span>Spendibile fino allo stipendio</span><strong>${money(s.spendUntilSalary)}</strong></div>
      </div>
      <p class="v13-sheet-note">Lo spendibile è il valore più basso tra il budget quotidiano che ti resta e la liquidità che rimane dopo le scadenze. In questo modo l’app non considera “spendibili” i soldi protetti o quelli necessari per rate e addebiti.</p>
      <div class="v13-sheet-cats"><small>BUDGET PER CATEGORIA</small>${s.remainingCategories.map(b=>`<div><span>${b.name}</span><strong>${money(b.remaining)}</strong></div>`).join('')}</div>
      <div class="v13-sheet-extra"><span>Extra non assegnato</span><strong>${money(s.extra)}</strong><small>Non serve a coprire né budget quotidiano né scadenze prima dello stipendio.</small></div>`;
    back.hidden=false;requestAnimationFrame(()=>{back.classList.add('open');sheet.classList.add('open');sheet.setAttribute('aria-hidden','false')});sheet.scrollTop=0;
  }

  async function refresh(){try{const s=await loadSnapshot();if(s)updateHome(s)}catch(e){console.warn('V13 spend clarity',e)}}
  function schedule(){clearTimeout(timer);timer=setTimeout(refresh,80)}

  document.addEventListener('click',e=>{
    if(e.target.closest('#spendTodayCard')||e.target.closest('#v13Explain')||e.target.closest('[data-detail="free"]')){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      (snapshot?Promise.resolve(snapshot):loadSnapshot()).then(openBreakdown);
      return;
    }
    if(e.target.closest('[data-go-budget]')){e.preventDefault();document.querySelector('.tab[data-view="budget"]')?.click()}
  },true);

  document.addEventListener('DOMContentLoaded',()=>{
    ensureClarityCard();refresh();
    const roots=['totalLiquidity','budgetSummary','commitmentsList','accountsList'];
    roots.forEach(id=>{const el=$(`#${id}`);if(el)new MutationObserver(schedule).observe(el,{subtree:true,childList:true,characterData:true})});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
    setTimeout(refresh,350);setTimeout(refresh,1200);
  });
})();