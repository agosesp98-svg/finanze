const FinanceAppV32=(()=>{
  const STORES=['accounts','budgets','commitments','expectedIncomes','goals','liabilities','movements','settings'];
  const state=Object.fromEntries(STORES.map(s=>[s,[]]));
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(v||0));
  const money0=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const dateFmt=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short'});
  const dateLong=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long'});
  const today=()=>iso(new Date());
  const parse=s=>s?new Date(`${s}T12:00:00`):null;
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
  const addMonth=s=>{const d=parse(s),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));return iso(d)};
  const daysBetween=(a,b)=>Math.max(0,Math.ceil((parse(b)-parse(a))/86400000));
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  let movementFilter='all';
  let toastTimer=null;

  const icons={
    plus:'<path d="M12 5v14M5 12h14"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    home:'<path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9Z"/>',
    list:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    calendar:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    card:'<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M3.5 10h17M7 15h4"/>',
    bank:'<path d="m3 9 9-5 9 5M5 10h14M6.5 10v7M10.2 10v7M13.8 10v7M17.5 10v7M4 20h16"/>',
    cash:'<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/>',
    lock:'<rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
    down:'<path d="M12 4v15m-5-5 5 5 5-5"/>',
    up:'<path d="M12 20V5m-5 5 5-5 5 5"/>',
    arrows:'<path d="M5 8h14m-4-4 4 4-4 4M19 16H5m4 4-4-4 4-4"/>',
    chevron:'<path d="m9 6 6 6-6 6"/>',
    wallet:'<path d="M5 6h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h11"/><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z"/>',
    warning:'<path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v5M12 17h.01"/>',
    edit:'<path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m13.5 7.5 3 3"/>'
  };
  const svg=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n]||icons.target}</svg>`;

  async function load(){
    const values=await Promise.all(STORES.map(s=>FinanceDB.getAll(s)));
    STORES.forEach((s,i)=>state[s]=values[i]||[]);
    sortState();
  }

  function sortState(){
    state.accounts.sort((a,b)=>(a.order||0)-(b.order||0));
    state.budgets.sort((a,b)=>(a.order||0)-(b.order||0));
    state.commitments.sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')));
    state.movements.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(Number(b.id||0)-Number(a.id||0)));
  }

  const setting=(key,fallback=null)=>state.settings.find(x=>x.key===key)?.value??fallback;
  async function saveSetting(key,value){
    const row={key,value};
    await FinanceDB.put('settings',row);
    const existing=state.settings.find(x=>x.key===key);
    if(existing)existing.value=value;else state.settings.push(row);
  }

  function salaryDate(){
    const configured=String(setting('nextSalaryDate','')||'');
    if(configured&&configured>=today())return configured;
    const day=clamp(Number(setting('salaryDay',10))||10,1,28);
    const now=new Date();
    let d=new Date(now.getFullYear(),now.getMonth(),day,12,0,0,0);
    if(now.getDate()>day)d=new Date(now.getFullYear(),now.getMonth()+1,day,12,0,0,0);
    return iso(d);
  }

  function budgetTarget(b){return Number(b.targetBudget??b.budget??0)}
  function budgetCeiling(b){return Number(b.ceilingBudget??b.budget??0)}
  function remainingBudget(){return state.budgets.reduce((s,b)=>s+Math.max(0,budgetTarget(b)-Number(b.spent||0)),0)}

  function monthlyEquivalent(c){
    const cadence=norm(c.cadence);
    const amount=Number(c.amount||0);
    if(cadence.includes('14 giorni'))return amount*26/12;
    if(cadence.includes('settiman'))return amount*52/12;
    if(cadence.includes('mensil'))return amount;
    return 0;
  }

  function fixedMonthly(){
    const liabilities=state.liabilities.filter(l=>!l.completed&&Number(l.monthly||0)>0).reduce((s,l)=>s+Number(l.monthly||0),0);
    const recurring=new Map();
    for(const c of state.commitments){
      if(c.liabilityId||c.liabilityKey)continue;
      const cadence=norm(c.cadence);
      const recurringLike=c.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman');
      if(!recurringLike)continue;
      const key=norm(c.name);if(!key)continue;
      const old=recurring.get(key);
      if(!old||String(c.dueDate||'')>String(old.dueDate||''))recurring.set(key,c);
    }
    return liabilities+[...recurring.values()].reduce((s,c)=>s+monthlyEquivalent(c),0);
  }

  function calc(){
    const total=state.accounts.reduce((s,a)=>s+Number(a.balance||0),0);
    const protectedTotal=state.accounts.filter(a=>a.protected).reduce((s,a)=>s+Number(a.balance||0),0);
    const ordinary=total-protectedTotal;
    const salary=salaryDate();
    const active=state.commitments.filter(c=>c.active!==false&&c.dueDate&&String(c.dueDate)<=salary);
    const due=active.reduce((s,c)=>s+Number(c.amount||0),0);
    const budgetRemaining=remainingBudget();
    const afterDue=ordinary-due;
    const spendable=Math.max(0,Math.min(budgetRemaining,afterDue));
    const deficit=Math.max(0,due-ordinary);
    const days=Math.max(1,daysBetween(today(),salary)+1);
    const daily=spendable/days;
    const salaryNet=Number(setting('salaryNet',0)||0);
    const monthlyBudget=state.budgets.reduce((s,b)=>s+budgetTarget(b),0);
    const fixed=fixedMonthly();
    const goalCapacity=Math.max(0,salaryNet-fixed-monthlyBudget);
    return{total,protectedTotal,ordinary,salary,active,due,budgetRemaining,afterDue,spendable,deficit,days,daily,salaryNet,monthlyBudget,fixed,goalCapacity};
  }

  function monthsUntil(date){
    if(!date)return null;
    const a=new Date(),b=parse(date);
    let months=(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth());
    if(b.getDate()>a.getDate())months+=1;
    return Math.max(1,months);
  }

  function goalStats(g){
    const target=Number(g.target||0),current=Number(g.current||0),remaining=Math.max(0,target-current);
    const pct=target?clamp(current/target*100,0,100):0;
    const months=monthsUntil(g.targetDate);
    const monthly=months?remaining/months:null;
    return{target,current,remaining,pct,months,monthly};
  }

  function primaryGoal(){
    const active=state.goals.filter(g=>!g.completed&&Number(g.target||0)>Number(g.current||0));
    return active.sort((a,b)=>{
      const pa=norm(a.priority)==='alta'?0:1,pb=norm(b.priority)==='alta'?0:1;
      if(pa!==pb)return pa-pb;
      return String(a.targetDate||'9999').localeCompare(String(b.targetDate||'9999'));
    })[0]||null;
  }

  async function cleanupCompletedGoals(){
    let changed=false;
    for(const g of [...state.goals]){
      if(Number(g.target||0)>0&&Number(g.current||0)>=Number(g.target||0)){
        await FinanceDB.remove('goals',g.id);changed=true;
      }
    }
    if(changed)await load();
  }

  function nextDateByCadence(date,cadence){
    const c=norm(cadence);
    if(c.includes('14 giorni'))return addDays(date,14);
    if(c.includes('settiman'))return addDays(date,7);
    if(c.includes('mensil'))return addMonth(date);
    return null;
  }

  async function syncUpcoming(){
    let changed=false;
    const existing=state.commitments;
    for(const l of state.liabilities){
      if(l.completed||!l.nextDueDate||Number(l.monthly||0)<=0)continue;
      const key=l.scheduleKey||`id:${l.id}`;
      const match=existing.some(c=>c.active!==false&&c.dueDate===l.nextDueDate&&((l.scheduleKey&&c.liabilityKey===l.scheduleKey)||Number(c.liabilityId)===Number(l.id)));
      if(!match){
        const item={name:l.name,amount:Number(l.monthly||0),dueDate:l.nextDueDate,cadence:'Mensile',estimated:false,active:true,recurring:true,generated:true,liabilityId:l.id,liabilityKey:l.scheduleKey||'',note:'Scadenza collegata al piano rate'};
        item.id=await FinanceDB.add('commitments',item);existing.push(item);changed=true;
      }
    }
    const groups=new Map();
    for(const c of existing){
      if(c.liabilityId||c.liabilityKey)continue;
      const cadence=norm(c.cadence);
      const isRecurring=c.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman');
      if(!isRecurring)continue;
      const key=norm(c.name);if(!key)continue;
      const old=groups.get(key);if(!old||String(c.dueDate||'')>String(old.dueDate||''))groups.set(key,c);
    }
    for(const latest of groups.values()){
      if(latest.active!==false||!latest.dueDate)continue;
      let next=nextDateByCadence(latest.dueDate,latest.cadence);if(!next)continue;
      while(next<=today())next=nextDateByCadence(next,latest.cadence);
      if(existing.some(c=>c.active!==false&&norm(c.name)===norm(latest.name)&&c.dueDate===next))continue;
      const copy={...latest};delete copy.id;delete copy.paidDate;delete copy.paidAmount;
      copy.dueDate=next;copy.active=true;copy.generated=true;copy.recurring=true;copy.estimated=false;
      copy.id=await FinanceDB.add('commitments',copy);existing.push(copy);changed=true;
    }
    if(changed){sortState();}
  }

  function logoForAccount(a){
    const n=norm(a.name);
    if(n.includes('postepay'))return 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Logo_Postepay.png';
    if(n.includes('intesa')||n.includes('sanpaolo')||n==='conto isp'||n.includes('isp'))return 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Intesa_Sanpaolo_logo.svg';
    return '';
  }
  function accountIcon(a){
    const logo=logoForAccount(a);
    if(logo)return `<img class="account-logo" src="${logo}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="account-fallback" style="display:none">${esc((a.name||'?').slice(0,2).toUpperCase())}</span>`;
    return `<span class="account-fallback">${a.protected?'🔒':norm(a.kind).includes('contant')?'€':esc((a.name||'?').slice(0,2).toUpperCase())}</span>`;
  }

  function render(){
    renderToday();renderMovements();renderPlan();renderGoals();
  }

  function renderToday(){
    const c=calc();
    const banner=$('#todayStatus');
    banner.className='status-banner';
    if(c.deficit>0){
      banner.classList.add('show','danger');
      banner.innerHTML=`<span class="status-dot"></span><span><b>Mancano ${money(c.deficit)}</b> per coprire le uscite previste entro il ${dateLong.format(parse(c.salary))}. Nuove spese discrezionali: €0.</span>`;
    }else if(c.spendable===0&&c.due>0){
      banner.classList.add('show','warning');
      banner.innerHTML=`<span class="status-dot"></span><span>Le prossime uscite assorbono il margine disponibile. Conviene evitare nuove spese non necessarie.</span>`;
    }
    const spend=$('#spendCard');
    spend.classList.toggle('danger',c.deficit>0);
    $('#spendLabel').textContent=`Puoi spendere fino al ${parse(c.salary).getDate()}`;
    $('#spendValue').textContent=money(c.spendable);
    $('#spendDaily').textContent=`${money(c.daily)} / giorno`;
    $('#spendDays').textContent=`${c.days} ${c.days===1?'giorno':'giorni'} rimasti`;

    const accounts=$('#accountsStrip');
    const ordered=[...state.accounts.filter(a=>!a.protected),...state.accounts.filter(a=>a.protected)];
    accounts.innerHTML=ordered.length?ordered.map(a=>`<button class="account-card ${a.protected?'protected':''}" data-account="${a.id}" type="button"><div class="account-card-top">${accountIcon(a)}${a.protected?'<span class="lock-badge">🔒</span>':''}</div><small>${esc(a.name)}</small><strong>${money(a.balance)}</strong></button>`).join(''):'<div class="empty">Aggiungi un conto dalle impostazioni.</div>';

    const upcoming=state.commitments.filter(x=>x.active!==false&&x.dueDate).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))).slice(0,4);
    $('#upcomingList').innerHTML=upcoming.length?upcoming.map(x=>`<button class="list-row" data-commitment="${x.id}" type="button"><span class="row-icon orange">${svg('calendar')}</span><span class="row-copy"><b>${esc(x.name)}</b><span>${dateLong.format(parse(x.dueDate))}${x.estimated?' · stimata':''}</span></span><span class="row-value">${money(x.amount)}</span><span class="chevron">›</span></button>`).join(''):'<div class="empty">Nessuna uscita programmata.</div>';

    const goal=primaryGoal();
    const box=$('#primaryGoal');
    if(!goal){box.innerHTML='<div class="empty">Nessun obiettivo attivo.</div>';return;}
    const s=goalStats(goal);
    box.innerHTML=`<button class="goal-hero" data-goal="${goal.id}" type="button"><small>Obiettivo prioritario</small><strong>${esc(goal.name)}</strong><p>${money(s.current)} di ${money(s.target)}</p><div class="progress"><i style="width:${s.pct}%"></i></div><div class="goal-foot"><span>${Math.round(s.pct)}% completato</span><span>${s.monthly?`${money0(s.monthly)}/mese richiesti`:money(s.remaining)+' mancanti'}</span></div></button>`;
  }

  function isUnclassified(m){
    return m.type==='expense'&&!m.budgetId&&(!m.category||norm(m.category)==='da classificare');
  }

  function renderMovements(){
    const unclassified=state.movements.filter(isUnclassified).length;
    const notice=$('#unclassifiedNotice');
    notice.hidden=!unclassified;
    if(unclassified)notice.innerHTML=`<span><b>${unclassified}</b> ${unclassified===1?'movimento da sistemare':'movimenti da sistemare'}</span><button type="button" data-filter="unclassified">Mostra</button>`;
    $$('#movementFilters button').forEach(b=>b.classList.toggle('active',b.dataset.filter===movementFilter));
    let items=state.movements;
    if(movementFilter==='expense')items=items.filter(m=>m.type==='expense');
    if(movementFilter==='income')items=items.filter(m=>m.type==='income');
    if(movementFilter==='unclassified')items=items.filter(isUnclassified);
    $('#movementList').innerHTML=items.length?items.slice(0,120).map(m=>{
      const account=state.accounts.find(a=>Number(a.id)===Number(m.accountId));
      const positive=m.type==='income',negative=m.type==='expense';
      const ic=positive?'down':negative?'up':m.type==='transfer'?'arrows':'edit';
      const sign=positive?'+':negative?'−':'';
      const cls=positive?'positive':negative?'negative':'';
      const category=isUnclassified(m)?'Da sistemare':m.category||m.type||'';
      return `<button class="list-row" data-movement="${m.id}" type="button"><span class="row-icon ${positive?'green':negative?'red':''}">${svg(ic)}</span><span class="row-copy"><b>${esc(m.title||'Movimento')}</b><span>${m.date?dateFmt.format(parse(m.date)):''}${category?` · ${esc(category)}`:''}${account?` · ${esc(account.name)}`:''}</span></span><span class="row-value ${cls}">${sign}${money(Math.abs(Number(m.amount||0)))}</span><span class="chevron">›</span></button>`;
    }).join(''):'<div class="empty">Nessun movimento.</div>';
  }

  function renderPlan(){
    const c=calc();
    $('#planSummary').innerHTML=`<div class="plan-equation"><span>Stipendio netto</span><strong>${c.salaryNet?money(c.salaryNet):'Da impostare'}</strong><span>Rate + ricorrenti</span><strong>− ${money(c.fixed)}</strong><span>Budget target</span><strong>− ${money(c.monthlyBudget)}</strong><b class="result">Per obiettivi</b><strong class="result-value">${c.salaryNet?money(c.goalCapacity):'—'}</strong></div><p class="plan-caption">Questo calcolo usa il mese tipo. Le entrate straordinarie non aumentano il budget ordinario.</p>`;

    $('#budgetList').innerHTML=state.budgets.length?state.budgets.map(b=>{
      const target=budgetTarget(b),ceiling=budgetCeiling(b),spent=Number(b.spent||0),pct=target?spent/target*100:0;
      const cls=spent>ceiling?'danger':spent>target?'over':'';
      return `<button class="budget-row ${cls}" data-budget="${b.id}" type="button"><div class="budget-top"><b>${esc(b.name)}</b><strong>${money(Math.max(0,target-spent))}</strong></div><div class="budget-sub"><span>Speso ${money(spent)} su ${money(target)}</span><span>${Math.round(pct)}%</span></div><div class="progress blue"><i style="width:${clamp(pct,0,100)}%"></i></div></button>`;
    }).join(''):'<div class="empty">Nessun budget.</div>';

    const scheduled=state.commitments.filter(x=>x.active!==false&&x.dueDate).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)));
    $('#scheduledList').innerHTML=scheduled.length?scheduled.map(x=>`<button class="list-row" data-commitment="${x.id}" type="button"><span class="row-icon orange">${svg('calendar')}</span><span class="row-copy"><b>${esc(x.name)}</b><span>${dateLong.format(parse(x.dueDate))} · ${esc(x.cadence||'Una tantum')}</span></span><span class="row-value">${money(x.amount)}</span><span class="chevron">›</span></button>`).join(''):'<div class="empty">Nessuna uscita programmata.</div>';

    const liabilities=state.liabilities.filter(l=>!l.completed);
    $('#liabilityList').innerHTML=liabilities.length?liabilities.map(l=>{
      const remaining=l.remaining!=null&&Number.isFinite(Number(l.remaining))?money(l.remaining):l.installmentsRemaining!=null?`${l.installmentsRemaining} rate`:'Piano attivo';
      return `<button class="list-row" data-liability="${l.id}" type="button"><span class="row-icon">${svg('card')}</span><span class="row-copy"><b>${esc(l.name)}</b><span>${remaining}${l.nextDueDate?` · prossima ${dateFmt.format(parse(l.nextDueDate))}`:''}</span></span><span class="row-value">${money(l.monthly)}/m</span><span class="chevron">›</span></button>`;
    }).join(''):'<div class="empty">Nessuna rata attiva.</div>';
  }

  function renderGoals(){
    const c=calc();
    const active=state.goals.filter(g=>!g.completed&&Number(g.target||0)>Number(g.current||0));
    $('#goalCapacity').textContent=c.salaryNet?`${money(c.goalCapacity)} disponibili nel mese tipo`:'Imposta lo stipendio nel menu per calcolare la capacità mensile.';
    $('#goalsList').innerHTML=active.length?active.map(g=>{
      const s=goalStats(g),need=s.monthly?`${money0(s.monthly)}/mese`:'Senza scadenza';
      return `<article class="goal-card"><h3>${esc(g.name)}</h3><div class="goal-amount">${money(s.current)} <span style="font-size:15px;color:var(--secondary);font-weight:600">/ ${money(s.target)}</span></div><div class="progress green"><i style="width:${s.pct}%"></i></div><div class="goal-meta"><span>${Math.round(s.pct)}% · ${money(s.remaining)} mancanti</span><span>${need}</span></div><div class="goal-actions"><button class="primary" data-contribute="${g.id}" type="button">Accantona</button><button class="secondary" data-goal="${g.id}" type="button">Modifica</button></div></article>`;
    }).join(''):'<div class="empty">Nessun obiettivo attivo. Puoi crearne uno con “Nuovo”.</div>';
  }

  function openSheet(title,html){
    $('#sheetTitle').textContent=title;
    $('#sheetBody').innerHTML=html;
    $('#sheetBackdrop').classList.add('open');
    $('#sheet').classList.add('open');
    $('#sheet').setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function closeSheet(){
    $('#sheetBackdrop').classList.remove('open');$('#sheet').classList.remove('open');$('#sheet').setAttribute('aria-hidden','true');document.body.style.overflow='';
  }

  function toast(message){
    const el=$('#toast');clearTimeout(toastTimer);el.textContent=message;el.classList.add('show');toastTimer=setTimeout(()=>el.classList.remove('show'),2200);
  }

  function accountOptions(selected){return state.accounts.map(a=>`<option value="${a.id}" ${String(a.id)===String(selected)?'selected':''}>${esc(a.name)} · ${money(a.balance)}</option>`).join('')}
  function budgetOptions(selected=''){return `<option value="">Da classificare</option>`+state.budgets.map(b=>`<option value="${b.id}" ${String(b.id)===String(selected)?'selected':''}>${esc(b.name)}</option>`).join('')}

  function openQuickAdd(mode='expense'){
    const account=state.accounts.find(a=>!a.protected)||state.accounts[0];
    if(mode==='transfer'){
      openSheet('Trasferisci',`<div class="segmented"><button data-quick-mode="expense">Spesa</button><button data-quick-mode="income">Entrata</button><button class="active" data-quick-mode="transfer">Trasferisci</button></div><form id="transferForm" class="form"><div class="field"><label>Importo</label><input id="trAmount" type="number" min="0.01" step="0.01" inputmode="decimal" required autofocus></div><div class="field"><label>Da</label><select id="trFrom">${accountOptions(account?.id)}</select></div><div class="field"><label>A</label><select id="trTo">${accountOptions(state.accounts.find(a=>a.id!==account?.id)?.id)}</select></div><div class="field"><label>Data</label><input id="trDate" type="date" value="${today()}"></div><div id="trError" class="inline-error"></div><button class="primary-button">Salva trasferimento</button></form>`);
      $('#transferForm').onsubmit=saveTransfer;return;
    }
    const isExpense=mode==='expense';
    openSheet(isExpense?'Nuova spesa':'Nuova entrata',`<div class="segmented"><button class="${isExpense?'active':''}" data-quick-mode="expense">Spesa</button><button class="${!isExpense?'active':''}" data-quick-mode="income">Entrata</button><button data-quick-mode="transfer">Trasferisci</button></div><form id="movementForm" class="form"><div class="field"><label>Importo</label><input id="mvAmount" type="number" min="0.01" step="0.01" inputmode="decimal" required autofocus></div><div class="field"><label>Conto</label><select id="mvAccount">${accountOptions(account?.id)}</select></div>${isExpense?`<div class="field"><label>Categoria</label><select id="mvBudget">${budgetOptions()}</select></div>`:''}<div class="field"><label>Descrizione <span style="font-weight:400">(opzionale)</span></label><input id="mvTitle" autocomplete="off" placeholder="${isExpense?'Es. supermercato':'Es. rimborso'}"></div><div class="field"><label>Data</label><input id="mvDate" type="date" value="${today()}"></div><div id="mvError" class="inline-error"></div><button class="primary-button">Salva ${isExpense?'spesa':'entrata'}</button></form>`);
    $('#movementForm').onsubmit=e=>saveMovement(e,mode);
  }

  async function saveMovement(e,mode){
    e.preventDefault();
    const amount=Number($('#mvAmount').value||0),account=state.accounts.find(a=>String(a.id)===$('#mvAccount').value),title=$('#mvTitle').value.trim(),date=$('#mvDate').value||today();
    if(!account||amount<=0)return;
    if(mode==='expense'&&account.balance<amount){$('#mvError').textContent='Saldo insufficiente su questo conto.';return;}
    let budget=null;
    if(mode==='expense')budget=state.budgets.find(b=>String(b.id)===$('#mvBudget').value);
    account.balance+=mode==='income'?amount:-amount;
    await FinanceDB.put('accounts',account);
    if(budget){budget.spent=Number(budget.spent||0)+amount;await FinanceDB.put('budgets',budget)}
    await FinanceDB.add('movements',{type:mode,date,title:title||(mode==='expense'?'Spesa':'Entrata'),amount,accountId:account.id,budgetId:budget?.id||null,category:budget?.name||(mode==='expense'?'Da classificare':'')});
    closeSheet();await refresh(mode==='expense'?'Spesa registrata':'Entrata registrata');
  }

  async function saveTransfer(e){
    e.preventDefault();
    const amount=Number($('#trAmount').value||0),from=state.accounts.find(a=>String(a.id)===$('#trFrom').value),to=state.accounts.find(a=>String(a.id)===$('#trTo').value),date=$('#trDate').value||today();
    if(!from||!to||from.id===to.id||amount<=0){$('#trError').textContent='Controlla i conti e l’importo.';return}
    if(from.balance<amount){$('#trError').textContent='Saldo insufficiente sul conto di partenza.';return}
    from.balance-=amount;to.balance+=amount;
    await FinanceDB.put('accounts',from);await FinanceDB.put('accounts',to);
    await FinanceDB.add('movements',{type:'transfer',date,title:`Trasferimento ${from.name} → ${to.name}`,amount,accountId:from.id,toAccountId:to.id,category:'Trasferimento'});
    closeSheet();await refresh('Trasferimento registrato');
  }

  function openMovement(id){
    const m=state.movements.find(x=>String(x.id)===String(id));if(!m)return;
    if(m.type!=='expense'){
      openSheet('Movimento',`<div class="sheet-section"><h3>${esc(m.title||'Movimento')}</h3><div class="kpi-grid"><div class="kpi"><small>Importo</small><strong>${money(m.amount)}</strong></div><div class="kpi"><small>Data</small><strong>${m.date?dateFmt.format(parse(m.date)):'—'}</strong></div></div></div>`);return;
    }
    openSheet('Classifica spesa',`<form id="classifyForm" class="form"><div class="field"><label>Descrizione</label><input id="clTitle" value="${esc(m.title||'')}"></div><div class="field"><label>Categoria</label><select id="clBudget">${budgetOptions(m.budgetId||'')}</select></div><p class="helper">Importo ${money(m.amount)}. Il cambio categoria aggiorna automaticamente i budget.</p><button class="primary-button">Aggiorna</button></form>`);
    $('#classifyForm').onsubmit=async e=>{
      e.preventDefault();
      const old=state.budgets.find(b=>Number(b.id)===Number(m.budgetId));
      const next=state.budgets.find(b=>String(b.id)===$('#clBudget').value);
      if(old&&(!next||old.id!==next.id)){old.spent=Math.max(0,Number(old.spent||0)-Number(m.amount||0));await FinanceDB.put('budgets',old)}
      if(next&&(!old||old.id!==next.id)){next.spent=Number(next.spent||0)+Number(m.amount||0);await FinanceDB.put('budgets',next)}
      m.title=$('#clTitle').value.trim()||m.title;m.budgetId=next?.id||null;m.category=next?.name||'Da classificare';await FinanceDB.put('movements',m);
      closeSheet();await refresh('Movimento aggiornato');
    };
  }

  function openAccount(id){
    const a=state.accounts.find(x=>String(x.id)===String(id));if(!a)return;
    openSheet('Conto',`<form id="accountForm" class="form"><div class="field"><label>Nome</label><input id="acName" value="${esc(a.name)}" required></div><div class="field"><label>Saldo</label><input id="acBalance" type="number" step="0.01" value="${Number(a.balance||0).toFixed(2)}" required></div><div class="form-grid"><div class="field"><label>Tipo</label><select id="acKind"><option ${a.kind==='Conto corrente'?'selected':''}>Conto corrente</option><option ${a.kind==='Prepagata'?'selected':''}>Prepagata</option><option ${a.kind==='Contanti'?'selected':''}>Contanti</option><option ${a.kind==='Risparmio'?'selected':''}>Risparmio</option></select></div><div class="field"><label>Disponibilità</label><select id="acProtected"><option value="false" ${!a.protected?'selected':''}>Spendibile</option><option value="true" ${a.protected?'selected':''}>Protetto</option></select></div></div><button class="primary-button">Salva</button></form>`);
    $('#accountForm').onsubmit=async e=>{
      e.preventDefault();const previous=Number(a.balance||0),next=Number($('#acBalance').value||0);a.name=$('#acName').value.trim();a.balance=next;a.kind=$('#acKind').value;a.protected=$('#acProtected').value==='true';await FinanceDB.put('accounts',a);
      const diff=next-previous;if(Math.abs(diff)>.009)await FinanceDB.add('movements',{type:'adjustment',date:today(),title:`Rettifica ${a.name}`,amount:diff,accountId:a.id,category:'Rettifica',note:`Saldo precedente ${money(previous)}`});
      closeSheet();await refresh('Conto aggiornato');
    };
  }

  function openBudget(id){
    const b=state.budgets.find(x=>String(x.id)===String(id));if(!b)return;
    openSheet('Budget',`<form id="budgetForm" class="form"><div class="field"><label>Categoria</label><input value="${esc(b.name)}" disabled></div><div class="form-grid"><div class="field"><label>Target</label><input id="buTarget" type="number" min="0" step="0.01" value="${budgetTarget(b).toFixed(2)}"></div><div class="field"><label>Tetto massimo</label><input id="buCeiling" type="number" min="0" step="0.01" value="${budgetCeiling(b).toFixed(2)}"></div></div><div class="field"><label>Già speso nel ciclo</label><input id="buSpent" type="number" min="0" step="0.01" value="${Number(b.spent||0).toFixed(2)}"></div><p class="helper">Lo spendibile usa il target. Il tetto serve solo come soglia di allerta.</p><button class="primary-button">Salva budget</button></form>`);
    $('#budgetForm').onsubmit=async e=>{e.preventDefault();const target=Math.max(0,Number($('#buTarget').value||0)),ceiling=Math.max(target,Number($('#buCeiling').value||target));b.budget=target;b.targetBudget=target;b.ceilingBudget=ceiling;b.spent=Math.max(0,Number($('#buSpent').value||0));await FinanceDB.put('budgets',b);closeSheet();await refresh('Budget aggiornato')};
  }

  function openCommitment(id=null){
    const item=id?state.commitments.find(x=>String(x.id)===String(id)):null;
    openSheet(item?'Uscita programmata':'Nuova uscita',`<form id="commitmentForm" class="form"><div class="field"><label>Nome</label><input id="cmName" value="${esc(item?.name||'')}" required></div><div class="form-grid"><div class="field"><label>Importo</label><input id="cmAmount" type="number" min="0.01" step="0.01" value="${item?Number(item.amount||0).toFixed(2):''}" required></div><div class="field"><label>Data</label><input id="cmDate" type="date" value="${item?.dueDate||today()}" required></div></div><div class="field"><label>Ricorrenza</label><select id="cmCadence"><option ${norm(item?.cadence)==='una tantum'?'selected':''}>Una tantum</option><option ${norm(item?.cadence).includes('mensil')?'selected':''}>Mensile</option><option ${norm(item?.cadence).includes('14 giorni')?'selected':''}>Ogni 14 giorni</option><option ${norm(item?.cadence).includes('settiman')?'selected':''}>Settimanale</option></select></div><label style="display:flex;gap:10px;align-items:center;min-height:44px"><input id="cmActive" type="checkbox" ${item?.active===false?'':'checked'}> Attiva</label><div class="form-actions">${item&&item.active!==false?'<button type="button" class="secondary-button" data-pay-commitment="'+item.id+'">Segna pagata</button>':'<span></span>'}<button class="primary-button">Salva</button></div></form>`);
    $('#commitmentForm').onsubmit=async e=>{e.preventDefault();const cadence=$('#cmCadence').value;const value={...(item||{}),name:$('#cmName').value.trim(),amount:Number($('#cmAmount').value||0),dueDate:$('#cmDate').value,cadence,active:$('#cmActive').checked,recurring:cadence!=='Una tantum',estimated:item?.estimated||false};if(item)await FinanceDB.put('commitments',value);else await FinanceDB.add('commitments',value);closeSheet();await refresh('Uscita aggiornata')};
  }

  function payCommitment(id){
    const item=state.commitments.find(x=>String(x.id)===String(id));if(!item)return;
    const account=state.accounts.find(a=>!a.protected)||state.accounts[0];
    openSheet('Segna pagata',`<form id="payForm" class="form"><div class="field"><label>Importo</label><input id="payAmount" type="number" step="0.01" value="${Number(item.amount||0).toFixed(2)}"></div><div class="field"><label>Conto</label><select id="payAccount">${accountOptions(account?.id)}</select></div><div id="payError" class="inline-error"></div><button class="primary-button">Conferma pagamento</button></form>`);
    $('#payForm').onsubmit=async e=>{
      e.preventDefault();const amount=Number($('#payAmount').value||0),a=state.accounts.find(x=>String(x.id)===$('#payAccount').value);if(!a||amount<=0)return;if(a.balance<amount){$('#payError').textContent='Saldo insufficiente.';return}
      a.balance-=amount;item.active=false;item.paidDate=today();item.paidAmount=amount;await FinanceDB.put('accounts',a);await FinanceDB.put('commitments',item);await FinanceDB.add('movements',{type:'expense',date:today(),title:item.name,amount,accountId:a.id,category:item.liabilityId||item.liabilityKey?'Rata':'Scadenza'});
      await advanceAfterPayment(item,amount);closeSheet();await refresh('Pagamento registrato');
    };
  }

  async function advanceAfterPayment(item,amount){
    let liability=null;
    if(item.liabilityId)liability=state.liabilities.find(l=>Number(l.id)===Number(item.liabilityId));
    if(!liability&&item.liabilityKey)liability=state.liabilities.find(l=>l.scheduleKey===item.liabilityKey);
    if(liability){
      if(liability.remaining!=null&&Number.isFinite(Number(liability.remaining)))liability.remaining=Math.max(0,Number(liability.remaining)-amount);
      if(liability.installmentsRemaining!=null)liability.installmentsRemaining=Math.max(0,Number(liability.installmentsRemaining)-1);
      liability.completedInstallments=Number(liability.completedInstallments||0)+1;
      const complete=(liability.installmentsRemaining!=null&&Number(liability.installmentsRemaining)<=0)||(liability.remaining!=null&&Number(liability.remaining)<=0);
      if(complete)liability.completed=true;else liability.nextDueDate=addMonth(item.dueDate);
      await FinanceDB.put('liabilities',liability);
      if(!complete){
        const next={name:liability.name,amount:Number(liability.monthly||item.amount||0),dueDate:liability.nextDueDate,cadence:'Mensile',estimated:false,active:true,recurring:true,generated:true,liabilityId:liability.id,liabilityKey:liability.scheduleKey||'',note:'Scadenza collegata al piano rate'};
        if(!state.commitments.some(c=>c.active!==false&&c.dueDate===next.dueDate&&((next.liabilityKey&&c.liabilityKey===next.liabilityKey)||Number(c.liabilityId)===Number(next.liabilityId))))await FinanceDB.add('commitments',next);
      }
      return;
    }
    const nextDate=nextDateByCadence(item.dueDate,item.cadence);
    if(item.recurring===true&&nextDate){const copy={...item};delete copy.id;delete copy.paidDate;delete copy.paidAmount;copy.dueDate=nextDate;copy.active=true;copy.generated=true;await FinanceDB.add('commitments',copy)}
  }

  function openLiability(id){
    const l=state.liabilities.find(x=>String(x.id)===String(id));if(!l)return;
    openSheet('Rata / finanziamento',`<form id="liabilityForm" class="form"><div class="field"><label>Nome</label><input id="liName" value="${esc(l.name)}"></div><div class="form-grid"><div class="field"><label>Rata mensile</label><input id="liMonthly" type="number" min="0" step="0.01" value="${Number(l.monthly||0).toFixed(2)}"></div><div class="field"><label>Residuo</label><input id="liRemaining" type="number" min="0" step="0.01" value="${l.remaining==null?'':Number(l.remaining).toFixed(2)}"></div></div><div class="form-grid"><div class="field"><label>Prossima scadenza</label><input id="liNext" type="date" value="${l.nextDueDate||''}"></div><div class="field"><label>Fine prevista</label><input id="liEnd" type="date" value="${l.finalDueDate||l.endDate||''}"></div></div><div class="form-grid"><div class="field"><label>Rate rimanenti</label><input id="liRemainCount" type="number" min="0" step="1" value="${l.installmentsRemaining??''}"></div><div class="field"><label>Rate totali</label><input id="liTotalCount" type="number" min="0" step="1" value="${l.installmentsTotal??''}"></div></div><label style="display:flex;gap:10px;align-items:center;min-height:44px"><input id="liCompleted" type="checkbox" ${l.completed?'checked':''}> Completato</label><button class="primary-button">Salva piano</button></form>`);
    $('#liabilityForm').onsubmit=async e=>{e.preventDefault();l.name=$('#liName').value.trim();l.monthly=Math.max(0,Number($('#liMonthly').value||0));l.remaining=$('#liRemaining').value===''?null:Math.max(0,Number($('#liRemaining').value));l.nextDueDate=$('#liNext').value;l.finalDueDate=$('#liEnd').value;l.installmentsRemaining=$('#liRemainCount').value===''?null:Number($('#liRemainCount').value);l.installmentsTotal=$('#liTotalCount').value===''?null:Number($('#liTotalCount').value);l.completed=$('#liCompleted').checked;await FinanceDB.put('liabilities',l);closeSheet();await refresh('Piano rate aggiornato')};
  }

  function openGoal(id=null){
    const g=id?state.goals.find(x=>String(x.id)===String(id)):null;
    openSheet(g?'Obiettivo':'Nuovo obiettivo',`<form id="goalForm" class="form"><div class="field"><label>Nome</label><input id="goName" value="${esc(g?.name||'')}" required></div><div class="form-grid"><div class="field"><label>Target</label><input id="goTarget" type="number" min="0.01" step="0.01" value="${g?Number(g.target||0).toFixed(2):''}" required></div><div class="field"><label>Già accantonato</label><input id="goCurrent" type="number" min="0" step="0.01" value="${g?Number(g.current||0).toFixed(2):'0.00'}"></div></div><div class="form-grid"><div class="field"><label>Data obiettivo</label><input id="goDate" type="date" value="${g?.targetDate||''}"></div><div class="field"><label>Priorità</label><select id="goPriority"><option ${g?.priority==='Alta'?'selected':''}>Alta</option><option ${g?.priority==='Media'?'selected':''}>Media</option><option ${g?.priority==='Bassa'?'selected':''}>Bassa</option></select></div></div><button class="primary-button">Salva obiettivo</button></form>`);
    $('#goalForm').onsubmit=async e=>{e.preventDefault();const value={...(g||{}),name:$('#goName').value.trim(),target:Math.max(0,Number($('#goTarget').value||0)),current:Math.max(0,Number($('#goCurrent').value||0)),targetDate:$('#goDate').value,priority:$('#goPriority').value,completed:false,createdAt:g?.createdAt||today()};if(g){if(value.current>=value.target&&value.target>0)await FinanceDB.remove('goals',g.id);else await FinanceDB.put('goals',value)}else if(value.current<value.target)await FinanceDB.add('goals',value);closeSheet();await refresh(value.current>=value.target?'Obiettivo raggiunto e rimosso':'Obiettivo aggiornato')};
  }

  function contributeGoal(id){
    const g=state.goals.find(x=>String(x.id)===String(id));if(!g)return;
    const source=state.accounts.find(a=>!a.protected)||state.accounts[0];
    const protectedAccount=state.accounts.find(a=>a.protected);
    openSheet('Accantona',`<form id="contributionForm" class="form"><div class="field"><label>Importo</label><input id="coAmount" type="number" min="0.01" step="0.01" required autofocus></div><div class="field"><label>Da</label><select id="coSource">${accountOptions(source?.id)}</select></div><div class="field"><label>Dove metterli</label><select id="coTarget"><option value="">Solo registra nell’obiettivo</option>${state.accounts.filter(a=>a.protected).map(a=>`<option value="${a.id}" ${protectedAccount?.id===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div><p class="helper">Se scegli un conto protetto, l’app registra anche il trasferimento reale.</p><div id="coError" class="inline-error"></div><button class="primary-button">Accantona per ${esc(g.name)}</button></form>`);
    $('#contributionForm').onsubmit=async e=>{e.preventDefault();const amount=Number($('#coAmount').value||0),from=state.accounts.find(a=>String(a.id)===$('#coSource').value),to=state.accounts.find(a=>String(a.id)===$('#coTarget').value);if(!from||amount<=0)return;if(to&&from.balance<amount){$('#coError').textContent='Saldo insufficiente sul conto di partenza.';return}if(to){from.balance-=amount;to.balance+=amount;await FinanceDB.put('accounts',from);await FinanceDB.put('accounts',to);await FinanceDB.add('movements',{type:'transfer',date:today(),title:`Accantonamento ${g.name}`,amount,accountId:from.id,toAccountId:to.id,category:'Accantonamento'})}g.current=Number(g.current||0)+amount;if(Number(g.target||0)>0&&g.current>=Number(g.target)){await FinanceDB.remove('goals',g.id);closeSheet();await refresh('Obiettivo raggiunto e rimosso');return}await FinanceDB.put('goals',g);closeSheet();await refresh('Accantonamento registrato')};
  }

  function openSettings(){
    const c=calc();
    openSheet('Impostazioni',`<div class="sheet-section"><h3>Conti</h3><div class="list-card">${state.accounts.map(a=>`<button class="list-row" data-account="${a.id}" type="button"><span class="row-icon">${svg(a.protected?'lock':'wallet')}</span><span class="row-copy"><b>${esc(a.name)}</b><span>${a.protected?'Protetto':esc(a.kind||'Conto')}</span></span><span class="row-value">${money(a.balance)}</span><span class="chevron">›</span></button>`).join('')}</div><button class="text-button" data-new-account type="button">+ Aggiungi conto</button></div><div class="sheet-section"><h3>Stipendio</h3><form id="salarySettings" class="form"><div class="form-grid"><div class="field"><label>Netto mensile</label><input id="setSalary" type="number" min="0" step="0.01" value="${c.salaryNet||''}"></div><div class="field"><label>Prossimo accredito</label><input id="setSalaryDate" type="date" value="${c.salary}"></div></div><button class="secondary-button">Aggiorna</button></form></div><div class="sheet-section"><h3>Dati</h3><div class="stack"><button class="secondary-button" data-backup type="button">Esporta backup</button><button class="secondary-button" data-import type="button">Importa backup</button><button class="danger-button" data-reset type="button">Azzera dati locali</button></div></div>`);
    $('#salarySettings').onsubmit=async e=>{e.preventDefault();await saveSetting('salaryNet',Number($('#setSalary').value||0));await saveSetting('nextSalaryDate',$('#setSalaryDate').value);closeSheet();await refresh('Stipendio aggiornato')};
  }

  function newAccount(){
    openSheet('Nuovo conto',`<form id="newAccountForm" class="form"><div class="field"><label>Nome</label><input id="naName" required></div><div class="form-grid"><div class="field"><label>Saldo</label><input id="naBalance" type="number" step="0.01" value="0"></div><div class="field"><label>Tipo</label><select id="naKind"><option>Conto corrente</option><option>Prepagata</option><option>Contanti</option><option>Risparmio</option></select></div></div><div class="field"><label>Disponibilità</label><select id="naProtected"><option value="false">Spendibile</option><option value="true">Protetto</option></select></div><button class="primary-button">Aggiungi conto</button></form>`);
    $('#newAccountForm').onsubmit=async e=>{e.preventDefault();await FinanceDB.add('accounts',{name:$('#naName').value.trim(),balance:Number($('#naBalance').value||0),kind:$('#naKind').value,protected:$('#naProtected').value==='true',order:state.accounts.length});closeSheet();await refresh('Conto aggiunto')};
  }

  async function exportBackup(){
    const payload=await FinanceDB.exportAll();const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`finanze-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup esportato');
  }

  async function importBackup(file){
    if(!file)return;try{const payload=JSON.parse(await file.text());await FinanceDB.importAll(payload);location.reload()}catch{toast('Backup non valido')}
  }

  async function refresh(message=''){
    await load();await cleanupCompletedGoals();await syncUpcoming();render();if(message)toast(message);
  }

  function switchView(view){
    $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));
    $$('.tab').forEach(t=>{const active=t.dataset.view===view;t.classList.toggle('active',active);t.setAttribute('aria-current',active?'page':'false')});
    window.scrollTo({top:0,behavior:'instant'});
  }

  function bind(){
    document.addEventListener('click',e=>{
      const nav=e.target.closest('[data-view]');if(nav){switchView(nav.dataset.view);return}
      if(e.target.closest('#quickAdd')){openQuickAdd('expense');return}
      if(e.target.closest('#settingsBtn')){openSettings();return}
      if(e.target.closest('[data-close-sheet]')||e.target.id==='sheetBackdrop'){closeSheet();return}
      const qm=e.target.closest('[data-quick-mode]');if(qm){openQuickAdd(qm.dataset.quickMode);return}
      const acc=e.target.closest('[data-account]');if(acc){openAccount(acc.dataset.account);return}
      const mov=e.target.closest('[data-movement]');if(mov){openMovement(mov.dataset.movement);return}
      const bud=e.target.closest('[data-budget]');if(bud){openBudget(bud.dataset.budget);return}
      const com=e.target.closest('[data-commitment]');if(com){openCommitment(com.dataset.commitment);return}
      const pay=e.target.closest('[data-pay-commitment]');if(pay){payCommitment(pay.dataset.payCommitment);return}
      const li=e.target.closest('[data-liability]');if(li){openLiability(li.dataset.liability);return}
      const goal=e.target.closest('[data-goal]');if(goal){openGoal(goal.dataset.goal);return}
      const contribute=e.target.closest('[data-contribute]');if(contribute){contributeGoal(contribute.dataset.contribute);return}
      const filter=e.target.closest('[data-filter]');if(filter){movementFilter=filter.dataset.filter;renderMovements();return}
      if(e.target.closest('[data-new-commitment]')){openCommitment();return}
      if(e.target.closest('[data-new-goal]')){openGoal();return}
      if(e.target.closest('[data-new-account]')){newAccount();return}
      if(e.target.closest('[data-backup]')){exportBackup();return}
      if(e.target.closest('[data-import]')){$('#backupInput').click();return}
      if(e.target.closest('[data-reset]')){if(confirm('Vuoi davvero cancellare tutti i dati locali?'))FinanceDB.clearAll().then(()=>location.reload());return}
      if(e.target.closest('#spendCard')){openSpendDetail();return}
    });
    $('#backupInput').addEventListener('change',e=>importBackup(e.target.files?.[0]));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
  }

  function openSpendDetail(){
    const c=calc();
    openSheet('Quanto puoi spendere',`<div class="sheet-section"><div class="kpi-grid"><div class="kpi"><small>Spendibile</small><strong>${money(c.spendable)}</strong></div><div class="kpi"><small>Media giornaliera</small><strong>${money(c.daily)}</strong></div></div></div><div class="sheet-section"><h3>Come viene calcolato</h3><div class="plan-equation"><span>Disponibile sui conti spendibili</span><strong>${money(c.ordinary)}</strong><span>Uscite prima dello stipendio</span><strong>− ${money(c.due)}</strong><span>Budget ancora disponibile</span><strong>${money(c.budgetRemaining)}</strong><b class="result">Spendibile prudenziale</b><strong class="result-value">${money(c.spendable)}</strong></div><p class="helper" style="margin-top:12px">L’app usa il valore più basso tra il budget residuo e la liquidità che resta dopo le uscite programmate. I conti protetti non vengono considerati.</p></div>${c.deficit>0?`<div class="status-banner show danger"><span class="status-dot"></span><span>Mancano ${money(c.deficit)} per coprire le uscite già previste.</span></div>`:''}`);
  }

  async function init(){
    try{
      await load();await cleanupCompletedGoals();await syncUpcoming();await load();render();bind();
      if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{})}
    }catch(err){console.error(err);toast('Errore nel caricamento dei dati')}
    requestAnimationFrame(()=>setTimeout(()=>$('#boot').classList.add('hide'),120));
  }

  return{init};
})();

document.addEventListener('DOMContentLoaded',FinanceAppV32.init);
