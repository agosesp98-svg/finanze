(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const CATEGORY_KEY='customExpenseCategories';
  let customCategories=[];
  let pendingAddCategory='';
  let pendingPutCategory='';
  let lastMovementId=null;
  let renderTimer=null;
  let decorating=false;

  if(typeof FinanceDB==='undefined')return;

  const rawAdd=FinanceDB.add.bind(FinanceDB);
  const rawPut=FinanceDB.put.bind(FinanceDB);
  const rawRemove=FinanceDB.remove?.bind(FinanceDB);

  FinanceDB.add=async(s,v)=>{
    let next=v;
    if(s==='movements'&&pendingAddCategory&&v?.type==='expense'){
      next={...v,budgetId:null,category:pendingAddCategory};
      pendingAddCategory='';
    }
    const result=await rawAdd(s,next);
    scheduleRender();
    return result;
  };

  FinanceDB.put=async(s,v)=>{
    let next=v;
    if(s==='movements'&&pendingPutCategory&&v?.type==='expense'){
      next={...v,budgetId:null,category:pendingPutCategory};
      pendingPutCategory='';
    }
    const result=await rawPut(s,next);
    scheduleRender();
    return result;
  };

  if(rawRemove){
    FinanceDB.remove=async(s,k)=>{
      const result=await rawRemove(s,k);
      scheduleRender();
      return result;
    };
  }

  function normalizeList(value){
    return Array.isArray(value)?value.map(x=>String(x||'').trim()).filter(Boolean):[];
  }

  async function loadCategories(){
    const settings=await FinanceDB.getAll('settings');
    customCategories=normalizeList(settings.find(x=>x.key===CATEGORY_KEY)?.value);
  }

  async function saveCategories(){
    customCategories=[...new Map(customCategories.map(x=>[norm(x),x])).values()].filter(Boolean);
    await rawPut('settings',{key:CATEGORY_KEY,value:customCategories});
    decorateSheet();
  }

  async function consumeCategoryFromUrl(){
    const url=new URL(location.href);
    const label=(url.searchParams.get('expenseCategory')||'').trim();
    if(!label)return;
    if(!customCategories.some(x=>norm(x)===norm(label))){
      customCategories.push(label);
      await saveCategories();
    }
    url.searchParams.delete('expenseCategory');
    history.replaceState(null,'',url.pathname+(url.search?url.search:'')+url.hash);
  }

  function optionValue(name){return `custom:${encodeURIComponent(name)}`}
  function categoryFromValue(value){
    if(!String(value||'').startsWith('custom:'))return '';
    try{return decodeURIComponent(String(value).slice(7))}catch{return String(value).slice(7)}
  }

  function appendCategoryOptions(select){
    if(!select)return;
    const present=new Set([...select.options].map(o=>o.value));
    for(const name of customCategories){
      const value=optionValue(name);
      if(present.has(value))continue;
      const option=document.createElement('option');
      option.value=value;option.textContent=name;
      select.appendChild(option);
    }
  }

  async function decorateClassification(){
    const select=$('#clBudget');
    if(!select||!lastMovementId)return;
    appendCategoryOptions(select);
    try{
      const movement=await FinanceDB.get('movements',Number(lastMovementId));
      if(!movement||movement.budgetId)return;
      const found=customCategories.find(x=>norm(x)===norm(movement.category));
      if(found)select.value=optionValue(found);
    }catch{}
  }

  function decorateSettings(){
    if($('#v33CategorySettings')||!$('#salarySettings'))return;
    const host=$('#sheetBody');if(!host)return;
    const section=document.createElement('div');
    section.id='v33CategorySettings';section.className='sheet-section';
    section.innerHTML=`<h3>Categorie spesa extra</h3><div id="v33CategoryChips" class="v33-category-chips"></div><div class="v33-category-add"><input id="v33CategoryName" placeholder="Nuova categoria"><button id="v33AddCategory" class="secondary-button" type="button">Aggiungi</button></div><p class="helper">Servono per tracciare spese che non devono diventare un budget mensile.</p>`;
    host.appendChild(section);
    renderCategoryChips();
    $('#v33AddCategory').onclick=async()=>{
      const input=$('#v33CategoryName');const value=input.value.trim();if(!value)return;
      if(!customCategories.some(x=>norm(x)===norm(value)))customCategories.push(value);
      input.value='';await saveCategories();renderCategoryChips();
    };
  }

  function renderCategoryChips(){
    const host=$('#v33CategoryChips');if(!host)return;
    host.innerHTML=customCategories.length?customCategories.map((name,i)=>`<button type="button" data-remove-custom="${i}">${escapeHtml(name)} <span aria-hidden="true">×</span></button>`).join(''):'<span class="v33-empty-inline">Nessuna categoria extra</span>';
  }

  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

  function decorateSheet(){
    if(decorating)return;decorating=true;
    try{
      appendCategoryOptions($('#mvBudget'));
      decorateClassification();
      decorateSettings();
    }finally{decorating=false}
  }

  function monthlyEquivalent(c){
    const cadence=norm(c.cadence),amount=Number(c.amount||0);
    if(cadence.includes('14 giorni'))return amount*26/12;
    if(cadence.includes('settiman'))return amount*52/12;
    if(cadence.includes('mensil'))return amount;
    return 0;
  }

  function fixedMonthly(liabilities,commitments){
    const liabilityMonthly=liabilities.filter(l=>!l.completed&&Number(l.monthly||0)>0).reduce((s,l)=>s+Number(l.monthly||0),0);
    const recurring=new Map();
    for(const c of commitments){
      if(c.liabilityId||c.liabilityKey)continue;
      const cadence=norm(c.cadence);
      const recurringLike=c.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman');
      if(!recurringLike)continue;
      const key=norm(c.name);if(!key)continue;
      const old=recurring.get(key);
      if(!old||String(c.dueDate||'')>String(old.dueDate||''))recurring.set(key,c);
    }
    return liabilityMonthly+[...recurring.values()].reduce((s,c)=>s+monthlyEquivalent(c),0);
  }

  function budgetTarget(b){return Number(b.targetBudget??b.budget??0)}
  function byName(budgets,tests){return budgets.filter(b=>tests.some(t=>norm(b.name).includes(t))).reduce((s,b)=>s+budgetTarget(b),0)}

  async function monthlyModel(){
    const [settings,budgets,liabilities,commitments,goals]=await Promise.all([
      FinanceDB.getAll('settings'),FinanceDB.getAll('budgets'),FinanceDB.getAll('liabilities'),FinanceDB.getAll('commitments'),FinanceDB.getAll('goals')
    ]);
    const salary=Number(settings.find(x=>x.key==='salaryNet')?.value||0);
    const usable=budgets.filter(b=>budgetTarget(b)>0);
    const food=byName(usable,['spesa aliment','alimentar','supermerc','grocer']);
    const fuel=byName(usable,['benzina','carbur']);
    const tobacco=byName(usable,['tabacco','sigarette']);
    const leisure=byName(usable,['ristor','bar / caff','bar/caff','caffe']);
    const known=new Set();
    usable.forEach(b=>{
      const n=norm(b.name);
      if(['spesa aliment','alimentar','supermerc','grocer','benzina','carbur','tabacco','sigarette','ristor','bar / caff','bar/caff','caffe'].some(t=>n.includes(t)))known.add(b.id);
    });
    const other=usable.filter(b=>!known.has(b.id)).reduce((s,b)=>s+budgetTarget(b),0);
    const budgetsTotal=usable.reduce((s,b)=>s+budgetTarget(b),0);
    const fixed=fixedMonthly(liabilities,commitments);
    const capacity=Math.max(0,salary-budgetsTotal-fixed);
    const deficit=Math.max(0,budgetsTotal+fixed-salary);
    const wedding=goals.find(g=>!g.completed&&norm(g.name).includes('matrimonio'))||null;
    let weddingNeed=null,weddingGap=0;
    if(wedding?.targetDate){
      const now=new Date(),end=new Date(`${wedding.targetDate}T12:00:00`);
      let months=(end.getFullYear()-now.getFullYear())*12+(end.getMonth()-now.getMonth());
      if(end.getDate()>now.getDate())months+=1;
      months=Math.max(1,months);
      weddingNeed=Math.max(0,Number(wedding.target||0)-Number(wedding.current||0))/months;
      weddingGap=Math.max(0,weddingNeed-capacity);
    }
    return{salary,food,fuel,tobacco,leisure,other,budgetsTotal,fixed,capacity,deficit,wedding,weddingNeed,weddingGap};
  }

  function allocationRow(label,value,kind=''){
    if(value<=0)return '';
    return `<div class="v33-allocation-row ${kind}"><span>${escapeHtml(label)}</span><strong>${money(value)}</strong></div>`;
  }

  async function renderMonthlyPlan(){
    const spend=$('#spendCard');if(!spend)return;
    let card=$('#v33MonthlyPlan');
    if(!card){
      card=document.createElement('section');card.id='v33MonthlyPlan';card.className='v33-month-card';
      spend.insertAdjacentElement('afterend',card);
    }
    const m=await monthlyModel();
    const goalLabel=m.wedding?'Per il matrimonio':'Per gli obiettivi';
    let status='';
    if(!m.salary)status='<div class="v33-month-note warning">Imposta lo stipendio nelle impostazioni per ottenere il piano mensile.</div>';
    else if(m.deficit>0)status=`<div class="v33-month-note danger">Il mese tipo supera lo stipendio di <b>${money(m.deficit)}</b>. Prima di accantonare bisogna ridurre budget o costi fissi.</div>`;
    else if(m.weddingNeed&&m.weddingGap>0)status=`<div class="v33-month-note warning">Con questo piano puoi accantonare <b>${money(m.capacity)}</b>. Per restare in linea con il matrimonio servirebbero circa <b>${money(m.weddingNeed)}/mese</b>: mancano ${money(m.weddingGap)}.</div>`;
    else if(m.weddingNeed)status=`<div class="v33-month-note success">Il piano copre la quota indicativa per il matrimonio di ${money(m.weddingNeed)}/mese.</div>`;

    card.innerHTML=`
      <div class="v33-month-head"><div><small>MESE TIPO</small><h2>Questo mese hai</h2></div><strong>${m.salary?money(m.salary):'—'}</strong></div>
      <div class="v33-allocation-list">
        ${allocationRow('Spesa',m.food)}
        ${allocationRow('Benzina',m.fuel)}
        ${allocationRow('Tabacco',m.tobacco)}
        ${allocationRow('Ristoranti e bar',m.leisure)}
        ${allocationRow('Altri budget',m.other)}
        ${allocationRow('Rate e spese fisse',m.fixed,'fixed')}
      </div>
      <div class="v33-month-result"><span>${goalLabel}</span><strong>${m.salary?money(m.capacity):'—'}</strong></div>
      ${status}
      <button class="v33-plan-link" type="button" data-view="plan">Vedi come è calcolato <span aria-hidden="true">›</span></button>`;
  }

  function scheduleRender(){
    clearTimeout(renderTimer);renderTimer=setTimeout(()=>{renderMonthlyPlan().catch(()=>{});decorateSheet()},180);
  }

  document.addEventListener('click',e=>{
    const movement=e.target.closest('[data-movement]');if(movement)lastMovementId=movement.dataset.movement;
    const remove=e.target.closest('[data-remove-custom]');
    if(remove){
      e.preventDefault();e.stopPropagation();
      const i=Number(remove.dataset.removeCustom);if(Number.isInteger(i)&&customCategories[i]!=null){customCategories.splice(i,1);saveCategories().then(renderCategoryChips)}
    }
  },true);

  document.addEventListener('submit',e=>{
    if(e.target.id==='movementForm'){
      const select=$('#mvBudget');const custom=categoryFromValue(select?.value);
      if(custom){pendingAddCategory=custom;select.value='';}
    }
    if(e.target.id==='classifyForm'){
      const select=$('#clBudget');const custom=categoryFromValue(select?.value);
      if(custom){pendingPutCategory=custom;select.value='';}
    }
  },true);

  document.addEventListener('DOMContentLoaded',async()=>{
    await loadCategories();
    await consumeCategoryFromUrl();
    const sheet=$('#sheetBody');if(sheet)new MutationObserver(()=>setTimeout(decorateSheet,0)).observe(sheet,{childList:true,subtree:true});
    setTimeout(scheduleRender,300);setTimeout(scheduleRender,1100);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleRender()});
  });
})();
