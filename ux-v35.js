(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const money2=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(v||0));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const CATEGORY_KEY='customExpenseCategories';
  let customCategories=[];
  let pendingAddCategory='';
  let pendingPutCategory='';
  let lastMovementId=null;
  let timer=null;
  if(typeof FinanceDB==='undefined'||typeof FinanceEngineV35==='undefined')return;

  const rawAdd=FinanceDB.add.bind(FinanceDB),rawPut=FinanceDB.put.bind(FinanceDB),rawRemove=FinanceDB.remove.bind(FinanceDB);
  FinanceDB.add=async(s,v)=>{
    let next=v;
    if(s==='movements'&&pendingAddCategory&&v?.type==='expense'){next={...v,budgetId:null,category:pendingAddCategory};pendingAddCategory=''}
    const out=await rawAdd(s,next);schedule();return out;
  };
  FinanceDB.put=async(s,v)=>{
    let next=v;
    if(s==='movements'&&pendingPutCategory&&v?.type==='expense'){next={...v,budgetId:null,category:pendingPutCategory};pendingPutCategory=''}
    const out=await rawPut(s,next);schedule();return out;
  };
  FinanceDB.remove=async(s,k)=>{const out=await rawRemove(s,k);schedule();return out};

  async function snapshot(){
    const [accounts,budgets,commitments,liabilities,goals,settings]=await Promise.all(['accounts','budgets','commitments','liabilities','goals','settings'].map(s=>FinanceDB.getAll(s)));
    return{accounts,budgets,commitments,liabilities,goals,settings};
  }

  async function model(){return FinanceEngineV35.calculate(await snapshot())}
  async function loadCategories(){const settings=await FinanceDB.getAll('settings');customCategories=Array.isArray(settings.find(x=>x.key===CATEGORY_KEY)?.value)?settings.find(x=>x.key===CATEGORY_KEY).value:[]}
  async function saveCategories(){customCategories=[...new Map(customCategories.map(x=>[norm(x),x])).values()].filter(Boolean);await rawPut('settings',{key:CATEGORY_KEY,value:customCategories})}
  const optionValue=name=>`custom:${encodeURIComponent(name)}`;
  const categoryFromValue=value=>String(value||'').startsWith('custom:')?decodeURIComponent(String(value).slice(7)):'';

  function appendCategoryOptions(select){
    if(!select)return;const present=new Set([...select.options].map(o=>o.value));
    for(const name of customCategories){const value=optionValue(name);if(present.has(value))continue;const o=document.createElement('option');o.value=value;o.textContent=name;select.appendChild(o)}
  }

  async function decorateClassification(){
    const select=$('#clBudget');if(!select||!lastMovementId)return;appendCategoryOptions(select);
    const movement=await FinanceDB.get('movements',Number(lastMovementId));if(!movement||movement.budgetId)return;
    const found=customCategories.find(x=>norm(x)===norm(movement.category));if(found)select.value=optionValue(found);
  }

  function decorateSettings(){
    if($('#v35CategorySettings')||!$('#salarySettings'))return;const host=$('#sheetBody');if(!host)return;
    const section=document.createElement('div');section.id='v35CategorySettings';section.className='sheet-section';
    section.innerHTML=`<h3>Categorie spesa extra</h3><div id="v35CategoryChips" class="v33-category-chips"></div><div class="v33-category-add"><input id="v35CategoryName" placeholder="Nuova categoria"><button id="v35AddCategory" class="secondary-button" type="button">Aggiungi</button></div><p class="helper">Tracciano spese senza trasformarle in budget mensili.</p>`;
    host.appendChild(section);renderCategoryChips();$('#v35AddCategory').onclick=async()=>{const input=$('#v35CategoryName'),value=input.value.trim();if(!value)return;if(!customCategories.some(x=>norm(x)===norm(value)))customCategories.push(value);input.value='';await saveCategories();renderCategoryChips()};
  }

  function renderCategoryChips(){const host=$('#v35CategoryChips');if(!host)return;host.innerHTML=customCategories.length?customCategories.map((name,i)=>`<button type="button" data-remove-v35-category="${i}">${esc(name)} <span aria-hidden="true">×</span></button>`).join(''):'<span class="v33-empty-inline">Nessuna categoria extra</span>'}

  async function decorateSheet(){appendCategoryOptions($('#mvBudget'));await decorateClassification();decorateSettings()}

  function monthlyRows(budgets){return budgets.filter(b=>FinanceEngineV35.budgetTarget(b)>0).map(b=>`<div class="v33-allocation-row"><span>${esc(b.name)}</span><strong>${money(FinanceEngineV35.budgetTarget(b))}</strong></div>`).join('')}

  async function renderUnified(){
    const snap=await snapshot(),m=FinanceEngineV35.calculate(snap);
    const spendValue=$('#spendValue'),spendDaily=$('#spendDaily'),spendDays=$('#spendDays'),spendLabel=$('#spendLabel'),spendCard=$('#spendCard');
    if(spendValue)spendValue.textContent=money2(m.spendable);if(spendDaily)spendDaily.textContent=`${money2(m.daily)} / giorno`;if(spendDays)spendDays.textContent=`${m.days} ${m.days===1?'giorno':'giorni'} rimasti`;if(spendLabel)spendLabel.textContent=`Puoi spendere fino al ${new Date(`${m.salary}T12:00:00`).getDate()}`;if(spendCard)spendCard.classList.toggle('danger',m.blockingShortfall>0);
    const banner=$('#todayStatus');if(banner){banner.className='status-banner';if(m.blockingShortfall>0){banner.classList.add('show','danger');banner.innerHTML=`<span class="status-dot"></span><span><b>Mancano ${money2(m.blockingShortfall)}</b> per coprire le uscite previste. Nuove spese discrezionali: €0.</span>`}else if(m.spendable===0&&m.due>0){banner.classList.add('show','warning');banner.innerHTML='<span class="status-dot"></span><span>Le prossime uscite assorbono il margine disponibile.</span>'}}

    if(spendCard){let card=$('#v35MonthlyPlan');if(!card){card=document.createElement('section');card.id='v35MonthlyPlan';card.className='v33-month-card';spendCard.insertAdjacentElement('afterend',card)}
      const label=m.goal?`Per ${m.goal.name}`:'Per gli obiettivi';let status='';
      if(!m.salaryNet)status='<div class="v33-month-note warning">Imposta lo stipendio per calcolare il piano mensile.</div>';
      else if(m.salaryNet<m.monthlyBudget+m.fixed)status=`<div class="v33-month-note danger">Il mese tipo supera lo stipendio di <b>${money(m.monthlyBudget+m.fixed-m.salaryNet)}</b>.</div>`;
      else if(m.goalNeed&&m.goalGap>0)status=`<div class="v33-month-note warning">Per restare in linea con ${esc(m.goal.name)} servirebbero circa <b>${money(m.goalNeed)}/mese</b>. Mancano ${money(m.goalGap)}.</div>`;
      else if(m.goalNeed)status=`<div class="v33-month-note success">Se mantieni questo piano, copri la quota mensile richiesta di ${money(m.goalNeed)}.</div>`;
      card.innerHTML=`<div class="v33-month-head"><div><small>MESE TIPO</small><h2>Questo mese hai</h2></div><strong>${m.salaryNet?money(m.salaryNet):'—'}</strong></div><div class="v33-allocation-list">${monthlyRows(snap.budgets)}<div class="v33-allocation-row fixed"><span>Rate e spese fisse</span><strong>${money(m.fixed)}</strong></div></div><div class="v33-month-result"><span>${esc(label)}</span><strong>${m.salaryNet?money(m.goalCapacity):'—'}</strong></div>${status}<button class="v33-plan-link" type="button" data-view="plan">Vedi il piano <span aria-hidden="true">›</span></button>`;
    }

    const plan=$('#planSummary');if(plan)plan.innerHTML=`<div class="plan-equation"><span>Stipendio netto</span><strong>${m.salaryNet?money2(m.salaryNet):'Da impostare'}</strong><span>Budget</span><strong>− ${money2(m.monthlyBudget)}</strong><span>Rate + spese fisse</span><strong>− ${money2(m.fixed)}</strong><b class="result">Per ${esc(m.goal?.name||'gli obiettivi')}</b><strong class="result-value">${m.salaryNet?money2(m.goalCapacity):'—'}</strong></div><p class="plan-caption">Home, Piano e Obiettivi usano lo stesso calcolo.</p>`;
    const goalCapacity=$('#goalCapacity');if(goalCapacity)goalCapacity.textContent=m.salaryNet?`${money2(m.goalCapacity)} disponibili nel mese tipo`:'Imposta lo stipendio per calcolare la capacità mensile.';
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(()=>{renderUnified().catch(()=>{});decorateSheet().catch(()=>{})},120)}

  function openSpendDetail(){
    model().then(m=>{
      const body=$('#sheetBody'),title=$('#sheetTitle'),sheet=$('#sheet'),backdrop=$('#sheetBackdrop');if(!body||!title||!sheet||!backdrop)return;
      title.textContent='Quanto puoi spendere';body.innerHTML=`<div class="sheet-section"><div class="kpi-grid"><div class="kpi"><small>Spendibile</small><strong>${money2(m.spendable)}</strong></div><div class="kpi"><small>Media giornaliera</small><strong>${money2(m.daily)}</strong></div></div></div><div class="sheet-section"><h3>Come viene calcolato</h3><div class="plan-equation"><span>Conti spendibili</span><strong>${money2(m.ordinary)}</strong><span>Uscite prima dello stipendio</span><strong>− ${money2(m.due)}</strong><span>Budget residuo</span><strong>${money2(m.budgetRemaining)}</strong><b class="result">Spendibile prudenziale</b><strong class="result-value">${money2(m.spendable)}</strong></div>${m.primaryShortfall>0?`<p class="helper">Il conto principale è corto di ${money2(m.primaryShortfall)} rispetto agli addebiti attribuiti.</p>`:''}</div>`;backdrop.classList.add('open');sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    })
  }

  document.addEventListener('click',e=>{
    const movement=e.target.closest('[data-movement]');if(movement)lastMovementId=movement.dataset.movement;
    const remove=e.target.closest('[data-remove-v35-category]');if(remove){e.preventDefault();e.stopPropagation();const i=Number(remove.dataset.removeV35Category);if(Number.isInteger(i)&&customCategories[i]!=null){customCategories.splice(i,1);saveCategories().then(renderCategoryChips)}return}
    if(e.target.closest('#spendCard')){e.preventDefault();e.stopImmediatePropagation();openSpendDetail()}
  },true);

  document.addEventListener('submit',e=>{
    if(e.target.id==='movementForm'){const select=$('#mvBudget'),custom=categoryFromValue(select?.value);if(custom){pendingAddCategory=custom;select.value=''}}
    if(e.target.id==='classifyForm'){const select=$('#clBudget'),custom=categoryFromValue(select?.value);if(custom){pendingPutCategory=custom;select.value=''}}
  },true);

  document.addEventListener('DOMContentLoaded',async()=>{
    await loadCategories();
    const snap=await snapshot();const cycle=await FinanceEngineV35.syncBudgetCycle(FinanceDB,snap);if(cycle.changed)location.reload();
    const sheet=$('#sheetBody');if(sheet)new MutationObserver(()=>setTimeout(()=>decorateSheet().catch(()=>{}),0)).observe(sheet,{childList:true,subtree:true});
    setTimeout(schedule,280);setTimeout(schedule,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  });
})();
