(()=>{
  const STORES=['accounts','budgets','commitments','expectedIncomes','goals','liabilities','movements','settings'];
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm=FinanceEngine.norm;
  const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(v||0));
  const money0=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const monthKey=v=>String(v||'').slice(0,7);
  let pendingSalary=null,enhanceTimer=null,roleSettingsBusy=false;

  async function snapshot(){
    const values=await Promise.all(STORES.map(s=>FinanceDB.getAll(s)));
    return Object.fromEntries(STORES.map((s,i)=>[s,values[i]||[]]));
  }
  function setting(s,key,fallback=null){return s.settings.find(x=>x.key===key)?.value??fallback}
  function breakdownForMonth(s,key){return FinanceEngine.monthBreakdown(s,key)}

  function roles(s){
    const ordinary=s.accounts.filter(a=>!a.protected);
    const primaryId=Number(setting(s,'primaryAccountId',ordinary[0]?.id||0));
    const primary=s.accounts.find(a=>Number(a.id)===primaryId)||ordinary[0]||null;
    const storedSpending=Number(setting(s,'spendingAccountId',0));
    const spending=s.accounts.find(a=>Number(a.id)===storedSpending&&!a.protected)
      ||ordinary.find(a=>Number(a.id)!==Number(primary?.id)&&norm(a.kind).includes('prepag'))
      ||ordinary.find(a=>Number(a.id)!==Number(primary?.id))
      ||primary;
    const storedGoal=Number(setting(s,'goalAccountId',0));
    const goal=s.accounts.find(a=>Number(a.id)===storedGoal)
      ||s.accounts.find(a=>a.protected)
      ||null;
    return{primary,spending,goal};
  }

  function allocationPlan(s,amount){
    const m=FinanceEngine.calculate(s),b=breakdownForMonth(s,monthKey(FinanceEngine.iso(new Date()))),r=roles(s);
    const budget=Math.min(Math.max(0,amount),b.budgetTotal);
    const fixed=Math.min(Math.max(0,amount-budget),b.fixedTotal);
    const goal=Math.max(0,amount-budget-fixed);
    return{model:m,breakdown:b,roles:r,amount,budget,fixed,goal,shortfall:Math.max(0,b.plannedOutflow-amount)};
  }

  function replaceFixedRows(card,b){
    const list=$('.allocation-list',card);if(!list)return;
    const existing=$('[data-fixed-breakdown]',list);if(existing)return;
    const row=[...list.children].find(x=>norm(x.textContent).includes('rate e spese fisse'));
    if(!row)return;
    row.outerHTML=`<div data-fixed-breakdown><div class="allocation-row"><span>Rate</span><strong>${money0(b.rateTotal)}</strong></div><div class="allocation-row"><span>Abbonamenti e ricorrenti</span><strong>${money0(b.recurringTotal)}</strong></div><div class="allocation-row fixed"><span>Totale fisso</span><strong>${money0(b.fixedTotal)}</strong></div></div>`;
  }

  function replacePlanSummary(host,b){
    const eq=$('.plan-equation',host);if(!eq||$('[data-fixed-summary]',eq))return;
    const label=$$('span',eq).find(x=>norm(x.textContent).includes('rate + spese fisse'));
    if(!label)return;
    const value=label.nextElementSibling;if(!value)return;
    label.textContent='Rate';value.textContent=`− ${money(b.rateTotal)}`;
    value.insertAdjacentHTML('afterend',`<span data-fixed-summary>Abbonamenti e ricorrenti</span><strong data-fixed-summary>− ${money(b.recurringTotal)}</strong><span data-fixed-summary>Totale fisso</span><strong data-fixed-summary>− ${money(b.fixedTotal)}</strong>`);
  }

  async function enhanceFinancialViews(){
    try{
      const s=await snapshot(),key=monthKey(FinanceEngine.iso(new Date())),b=breakdownForMonth(s,key);
      const card=$('#monthlyPlan');if(card)replaceFixedRows(card,b);
      const summary=$('#planSummary');if(summary)replacePlanSummary(summary,b);
      const rows=$$('#projectionList .projection-row'),projection=FinanceEngine.projection(s,6);
      rows.forEach((row,i)=>{
        const p=projection[i];if(!p)return;const spans=$$('span',row);if(spans[0])spans[0].textContent=`Budget ${money0(p.monthlyBudget)} · Rate ${money0(p.rateTotal)} · Ricorrenti ${money0(p.recurringTotal)}`;
      });
      const heading=$$('#view-plan .section-title h2').find(h=>norm(h.textContent)==='come cambia il margine');if(heading)heading.textContent='Prossimi mesi';
    }catch(err){console.error('Insights UI',err)}
  }

  function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhanceFinancialViews,30)}

  function injectSalaryFlag(){
    const form=$('#movementForm');if(!form||$('#mvCategory',form)||$('#mvSalary',form))return;
    const title=$('#mvTitle',form)?.closest('.field');if(!title)return;
    title.insertAdjacentHTML('afterend','<label class="check-row"><input id="mvSalary" type="checkbox"> È lo stipendio mensile</label>');
  }

  function accountOptions(accounts,selected,allowNone=false){
    return `${allowNone?'<option value="">Solo indicazione, nessun conto dedicato</option>':''}${accounts.map(a=>`<option value="${a.id}" ${String(a.id)===String(selected||'')?'selected':''}>${esc(a.name)}</option>`).join('')}`;
  }

  async function injectRoleSettings(){
    if(roleSettingsBusy||$('#salaryAllocationSettings')||!$('#salarySettings'))return;roleSettingsBusy=true;
    try{
      const s=await snapshot(),r=roles(s),salarySection=$('#salarySettings')?.closest('.sheet-section');if(!salarySection)return;
      salarySection.insertAdjacentHTML('afterend',`<div id="salaryAllocationSettings" class="sheet-section"><h3>Distribuzione stipendio</h3><form id="allocationSettingsForm" class="form"><div class="field"><label>Conto spese quotidiane</label><select id="setSpendingAccount">${accountOptions(s.accounts.filter(a=>!a.protected),r.spending?.id)}</select></div><div class="field"><label>Conto obiettivo</label><select id="setGoalAccount">${accountOptions(s.accounts,r.goal?.id,true)}</select></div><p class="helper">Il conto principale resta quello configurato sopra. Questi ruoli servono solo per dirti come distribuire lo stipendio.</p><button class="secondary-button">Salva distribuzione</button><p id="allocationSettingsStatus" class="helper"></p></form></div>`);
      $('#allocationSettingsForm').addEventListener('submit',async e=>{e.preventDefault();await FinanceDB.put('settings',{key:'spendingAccountId',value:Number($('#setSpendingAccount').value)||null});await FinanceDB.put('settings',{key:'goalAccountId',value:Number($('#setGoalAccount').value)||null});$('#allocationSettingsStatus').textContent='Distribuzione aggiornata.';scheduleEnhance()});
    }finally{roleSettingsBusy=false}
  }

  function openSalaryPlan(plan,salaryAccountId){
    const {roles:r,breakdown:b}=plan,goal=plan.model.goal;
    const spendingLabel=r.spending?(Number(r.spending.id)===Number(salaryAccountId)?`Tieni su ${esc(r.spending.name)}`:`Porta su ${esc(r.spending.name)}`):'Budget spese quotidiane';
    const primaryLabel=r.primary?(Number(r.primary.id)===Number(salaryAccountId)?`Lascia su ${esc(r.primary.name)}`:`Porta su ${esc(r.primary.name)}`):'Rate e ricorrenti';
    const goalLabel=r.goal?`Sposta su ${esc(r.goal.name)}${goal?` per ${esc(goal.name)}`:''}`:`Accantona${goal?` per ${esc(goal.name)}`:' per l’obiettivo'}`;
    $('#sheetTitle').textContent='Distribuisci lo stipendio';
    $('#sheetBody').innerHTML=`<div class="sheet-section"><h3>${money(plan.amount)} ricevuti</h3><p class="helper">Questa è la ripartizione consigliata del nuovo stipendio, calcolata dallo stesso piano usato nel resto dell’app.</p><div class="allocation-list"><div class="allocation-row"><span>${spendingLabel}</span><strong>${money(plan.budget)}</strong></div><div class="allocation-row"><span>${primaryLabel}</span><strong>${money(plan.fixed)}</strong></div><div class="allocation-row fixed"><span>${goalLabel}</span><strong>${money(plan.goal)}</strong></div></div>${plan.shortfall>0?`<div class="month-note danger">Lo stipendio non copre il piano mensile per ${money(plan.shortfall)}.</div>`:''}</div><div class="sheet-section"><h3>Composizione del mese</h3><div class="allocation-list"><div class="allocation-row"><span>Budget mensili</span><strong>${money(b.budgetTotal)}</strong></div><div class="allocation-row"><span>Rate</span><strong>${money(b.rateTotal)}</strong></div><div class="allocation-row"><span>Abbonamenti e ricorrenti</span><strong>${money(b.recurringTotal)}</strong></div><div class="allocation-row fixed"><span>Totale pianificato</span><strong>${money(b.plannedOutflow)}</strong></div><div class="allocation-row fixed"><span>Margine obiettivi</span><strong>${money(b.capacity)}</strong></div></div><p class="helper">È una guida: l’app non sposta denaro automaticamente.</p></div>`;
    $('#sheetBackdrop').classList.add('open');$('#sheet').classList.add('open');$('#sheet').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  }

  async function showSalaryPlan(data){
    try{const s=await snapshot();openSalaryPlan(allocationPlan(s,Number(data.amount||0)),data.accountId)}catch(err){console.error('Salary allocation',err)}
  }

  document.addEventListener('submit',e=>{
    if(e.target?.id!=='movementForm')return;
    const form=e.target;if($('#mvCategory',form))return;
    const title=$('#mvTitle',form),flag=$('#mvSalary',form),isSalary=flag?.checked||norm(title?.value).includes('stipendio');if(!isSalary)return;
    if(flag?.checked&&title&&!title.value.trim())title.value='Stipendio';
    pendingSalary={amount:Number($('#mvAmount',form)?.value||0),accountId:Number($('#mvAccount',form)?.value)||null};
  },true);

  const sheet=$('#sheet');
  if(sheet)new MutationObserver(()=>{
    if(pendingSalary&&!sheet.classList.contains('open')){const data=pendingSalary;pendingSalary=null;setTimeout(()=>showSalaryPlan(data),80)}
  }).observe(sheet,{attributes:true,attributeFilter:['class']});

  const body=$('#sheetBody');
  if(body)new MutationObserver(()=>{injectSalaryFlag();injectRoleSettings();scheduleEnhance()}).observe(body,{childList:true,subtree:true});
  const app=$('#app');if(app)new MutationObserver(scheduleEnhance).observe(app,{childList:true,subtree:true});

  document.addEventListener('DOMContentLoaded',()=>{injectSalaryFlag();injectRoleSettings();scheduleEnhance()});
  scheduleEnhance();
})();
