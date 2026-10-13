const FinanceApp=(()=>{
  const STORES=['accounts','budgets','commitments','expectedIncomes','goals','liabilities','movements','settings'];
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const dateFmt=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric'});
  const shortDate=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long'});
  const monthFmt=new Intl.DateTimeFormat('it-IT',{month:'short',year:'numeric'});
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const parse=s=>new Date(`${s}T12:00:00`), iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today=()=>iso(new Date());
  const addMonth=s=>{const d=parse(s),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));return iso(d)};
  const daysBetween=(a,b)=>Math.max(0,Math.ceil((parse(b)-parse(a))/86400000));
  const monthIndex=d=>d.getFullYear()*12+d.getMonth();
  let state=Object.fromEntries(STORES.map(s=>[s,[]]));
  let movementFilter='all';
  let toastTimer=null;

  const icons={
    home:'<path d="M4 11.5 12 4l8 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-7Z"/><path d="M9.5 20v-5.5h5V20"/>',
    wallet:'<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M15 10.5h5.5v4H15a2 2 0 0 1 0-4Z"/>',
    list:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4.5" cy="6" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="18" r=".8"/>',
    chart:'<path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 3.5a8 8 0 0 1 5.5 5.5H15V3.5Z"/>',
    target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    menu:'<path d="M5 7h14M5 12h14M5 17h14"/>',
    close:'<path d="m7 7 10 10M17 7 7 17"/>',
    chevron:'<path d="m9 6 6 6-6 6"/>',
    spark:'<path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
    minusCircle:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    plusCircle:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>',
    arrows:'<path d="M5 8h14m-4-4 4 4-4 4M19 16H5m4 4-4-4 4-4"/>',
    calendar:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/>',
    bank:'<path d="m3.5 9 8.5-5 8.5 5M5 10.5h14M6.5 10.5v7M10.2 10.5v7M13.8 10.5v7M17.5 10.5v7M4.5 20h15"/>',
    card:'<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M3.5 9.5h17M7 15h4"/>',
    cash:'<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/>',
    lock:'<rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
    down:'<path d="M12 4v15m-5.5-5.5L12 19l5.5-5.5"/>',
    up:'<path d="M12 20V5m-5.5 5.5L12 5l5.5 5.5"/>',
    download:'<path d="M12 3v12m-4.5-4.5L12 15l4.5-4.5M5 20h14"/>',
    upload:'<path d="M12 21V9m-4.5 4.5L12 9l4.5 4.5M5 4h14"/>',
    trash:'<path d="M4.5 7h15M9 7V4.5h6V7m-8.5 0 .8 13h9.4l.8-13M10 11v5M14 11v5"/>',
    heart:'<path d="M20.5 8.6c0 5-8.5 10.2-8.5 10.2S3.5 13.6 3.5 8.6A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.5 2.5Z"/>',
    diamond:'<path d="m4 8 4-4h8l4 4-8 12L4 8ZM4 8h16M8 4l4 4 4-4"/>',
    car:'<path d="m5 10 1.6-4h10.8l1.6 4M4 10h16a1.5 1.5 0 0 1 1.5 1.5V17H19v2h-3v-2H8v2H5v-2H2.5v-5.5A1.5 1.5 0 0 1 4 10Z"/>',
    shield:'<path d="M12 3.5 19 6v5.3c0 4.6-2.8 7.6-7 9.2-4.2-1.6-7-4.6-7-9.2V6l7-2.5Z"/>'
  };
  const svg=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n]||icons.target}</svg>`;
  const iconize=()=>$$('[data-icon]').forEach(el=>{const n=el.dataset.icon;if(icons[n])el.innerHTML=svg(n)});

  const rateConfigs=[
    {key:'clio',match:['clio'],next:'2026-10-15',end:'2028-12-15',balloon:'2029-01-01',monthly:287.92,note:'Le rate mensili proseguono fino alla fase finale. La maxirata è prevista a gennaio 2029.'},
    {key:'dyson',match:['dyson'],next:'2026-11-01',final:'2026-12-01',monthly:44,total:2,remaining:88,note:'Ultima rata prevista a dicembre 2026.'},
    {key:'ninja',match:['ninja creami','ninja'],next:'2026-11-03',final:'2026-12-03',monthly:64.99,total:2,remaining:129.99,note:'Restano due rate tra novembre e dicembre 2026.'},
    {key:'bank',match:['anticipo banca','rimborso anticipo banca'],next:'2026-11-01',final:'2029-10-01',monthly:15.99,total:36,remaining:575.64,note:'36 rate mensili da €15,99; fine stimata ottobre 2029.'},
    {key:'iphone',match:['iphone compass','iphone'],next:'2026-12-15',monthly:98.07,note:'Prima rata il 15 dicembre. Estinzione anticipata da valutare.'}
  ];
  const configFor=n=>rateConfigs.find(c=>c.match.some(m=>norm(n).includes(m)));
  const getSetting=(key,fallback=null)=>state.settings.find(x=>x.key===key)?.value??fallback;
  const setSettingLocal=(key,value)=>{const x=state.settings.find(s=>s.key===key);if(x)x.value=value;else state.settings.push({key,value})};

  async function loadData(){
    const vals=await Promise.all(STORES.map(s=>FinanceDB.getAll(s)));
    STORES.forEach((s,i)=>state[s]=vals[i]||[]);
    sortState();
  }
  function sortState(){
    state.accounts.sort((a,b)=>(a.order||0)-(b.order||0));
    state.budgets.sort((a,b)=>(a.order||0)-(b.order||0));
    state.commitments.sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')));
    state.movements.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(b.id||0)-(a.id||0));
  }
  function applyMigrationsInMemory(){
    for(const g of state.goals){
      if(norm(g.name).includes('matrimonio')){g.target=13000;g.targetDate='2028-05-31';g.createdAt=g.createdAt||'2026-10-13';g.note='Obiettivo matrimonio · Maggio 2028';}
      else g.createdAt=g.createdAt||'2026-10-13';
    }
    for(const l of state.liabilities){
      const c=configFor(l.name);if(!c)continue;
      l.scheduleKey=l.scheduleKey||c.key;
      l.recurrence=l.recurrence||'monthly';
      if(l.nextDueDate===undefined)l.nextDueDate=c.next;
      if(c.final&&l.finalDueDate===undefined)l.finalDueDate=c.final;
      if(c.end&&l.recurrenceEnd===undefined)l.recurrenceEnd=c.end;
      if(c.balloon&&l.finalPaymentDate===undefined)l.finalPaymentDate=c.balloon;
      if(c.total&&l.installmentsTotal===undefined)l.installmentsTotal=c.total;
      if(c.total&&l.installmentsRemaining===undefined)l.installmentsRemaining=c.total;
      if(c.remaining!=null&&(l.remaining==null||!Number.isFinite(Number(l.remaining))))l.remaining=c.remaining;
      l.scheduleNote=l.scheduleNote||c.note;
    }
    for(const cmt of state.commitments){const c=configFor(cmt.name);if(c){cmt.liabilityKey=cmt.liabilityKey||c.key;if(cmt.recurring===undefined)cmt.recurring=true;}}
  }
  async function persistMigrations(){
    try{
      await Promise.all([
        ...state.goals.map(g=>FinanceDB.put('goals',g)),
        ...state.liabilities.map(l=>FinanceDB.put('liabilities',l)),
        ...state.commitments.map(c=>FinanceDB.put('commitments',c))
      ]);
      await ensureUpcoming();
    }catch(e){console.warn(e)}
  }
  async function ensureUpcoming(){
    const horizon=new Date();horizon.setDate(horizon.getDate()+40);
    let changed=false;
    for(const l of state.liabilities){
      if(l.completed||!l.nextDueDate||l.recurrence!=='monthly'||parse(l.nextDueDate)>horizon)continue;
      const c=configFor(l.name);if(!c)continue;
      if(state.commitments.some(x=>x.active&&configFor(x.name)?.key===c.key&&x.dueDate===l.nextDueDate))continue;
      let amount=Number(l.monthly||c.monthly||0);
      if(Number(l.installmentsRemaining)===1&&Number(l.remaining)>0)amount=Number(l.remaining);
      if(amount>0){
        const item={name:c.key==='bank'?'Rimborso anticipo banca':l.name,amount:+amount.toFixed(2),dueDate:l.nextDueDate,cadence:'Mensile',estimated:false,active:true,recurring:true,generated:true,liabilityKey:c.key,note:'Rata generata automaticamente'};
        item.id=await FinanceDB.add('commitments',item);
        state.commitments.push(item);changed=true;
      }
    }
    if(changed){sortState();render();}
  }

  function calc(){
    const total=state.accounts.reduce((s,a)=>s+Number(a.balance||0),0);
    const prot=state.accounts.filter(a=>a.protected).reduce((s,a)=>s+Number(a.balance||0),0);
    const ordinary=total-prot;
    const remainingBudget=state.budgets.reduce((s,b)=>s+Math.max(0,Number(b.budget||0)-Number(b.spent||0)),0);
    const active=state.commitments.filter(c=>c.active);
    const committed=active.reduce((s,c)=>s+Number(c.amount||0),0);
    const expected=state.expectedIncomes.filter(i=>i.status==='Atteso');
    const emin=expected.reduce((s,i)=>s+Number(i.min||0),0),emax=expected.reduce((s,i)=>s+Number(i.max||0),0);
    const free=ordinary-remainingBudget-committed;
    return{total,prot,ordinary,remainingBudget,active,committed,expected,emin,emax,free};
  }
  function goalStats(g){
    const target=Number(g.target||0),current=Number(g.current||0),remaining=Math.max(0,target-current),pct=target?Math.min(100,current/target*100):0;
    const targetDate=g.targetDate?parse(g.targetDate):null,now=new Date(),created=g.createdAt?parse(g.createdAt):now;
    const months=targetDate?Math.max(1,monthIndex(targetDate)-monthIndex(now)):null,monthly=months?remaining/months:null,weekly=monthly?monthly*12/52:null;
    let status='In corso';
    if(target&&current>=target)status='Completato';
    else if(targetDate){const totalMonths=Math.max(1,monthIndex(targetDate)-monthIndex(created)),elapsed=Math.max(0,monthIndex(now)-monthIndex(created)),expected=target*Math.min(1,elapsed/totalMonths);if(elapsed===0)status='Partenza';else if(current>=expected*1.1)status='In anticipo';else if(current>=expected*.9)status='In linea';else status='Da recuperare';}
    return{target,current,remaining,pct,months,monthly,weekly,status,targetDate};
  }
  const goalIcon=n=>norm(n).includes('matrimonio')?'heart':norm(n).includes('anello')?'diamond':norm(n).includes('clio')?'car':norm(n).includes('tranquillita')?'shield':'target';
  const accountIcon=a=>a.protected?'lock':norm(a.name).includes('contant')?'cash':norm(a.name).includes('postepay')?'card':'bank';
  const goalDate=g=>g.targetDate?monthFmt.format(parse(g.targetDate)).replace('.',''):'Nessuna data';
  function forecast30(){const end=new Date();end.setDate(end.getDate()+30);const out=state.commitments.filter(c=>c.active&&parse(c.dueDate)<=end).reduce((s,c)=>s+Number(c.amount||0),0);const inc=state.expectedIncomes.filter(i=>i.status==='Atteso').reduce((s,i)=>s+Number(i.min||0),0);return{out,inc};}
  function spendToday(c){const salary=getSetting('nextSalaryDate','');if(salary&&salary>=today()){const days=Math.max(1,daysBetween(today(),salary)+1);return{value:c.remainingBudget/days,text:`Budget medio giornaliero fino al ${shortDate.format(parse(salary))}`,days};}return{value:Math.max(0,c.free),text:c.free>0?'Margine extra oltre budget e scadenze · imposta lo stipendio per il ritmo giornaliero':'Nessun margine extra: resta nel budget pianificato',days:null};}

  function render(){renderDashboard();renderAccounts();renderMovements();renderBudget();renderPlan();renderDrawerMeta();}
  function renderDashboard(){
    const c=calc(),sp=spendToday(c),f=forecast30();
    $('#totalLiquidity').textContent=money(c.total);
    $('#protectedLiquidity').textContent=`Protetti ${money(c.prot)}`;
    $('#ordinaryLiquidity').textContent=`Disponibili ${money(c.ordinary)}`;
    $('#freeLiquidity').textContent=money(c.free);
    $('#committedAmount').textContent=money(c.committed);
    $('#spendTodayValue').textContent=money(sp.value);
    $('#spendTodayText').textContent=sp.text;
    const next=c.active[0];
    $('#nextCommitmentName').textContent=next?next.name:'Nessuna scadenza';
    $('#nextCommitmentAmount').textContent=next?money(next.amount):'—';
    $('#nextCommitmentDate').textContent=next?shortDate.format(parse(next.dueDate)):'';
    $('#forecastOut').textContent=money(f.out);
    $('#forecastIn').textContent=c.emin===c.emax?money(c.emin):`${money(c.emin)}–${money(c.emax)}`;
    $('#forecastAfter').textContent=money(c.ordinary-f.out);
    const totalBudget=state.budgets.reduce((s,b)=>s+Number(b.budget||0),0),spent=state.budgets.reduce((s,b)=>s+Number(b.spent||0),0);
    $('#budgetSummary').textContent=`${money(spent)} / ${money(totalBudget)}`;
    $('#budgetProgress').style.width=`${Math.min(100,totalBudget?spent/totalBudget*100:0)}%`;
    $('#budgetRemainingText').textContent=`Restano ${money(c.remainingBudget)}.`;
    $('#budgetDays').textContent=sp.days?`${sp.days} giorni`:'Fino allo stipendio';
    renderHomeGoals();renderExpected();
  }
  function renderHomeGoals(){
    const goals=state.goals.filter(g=>!g.completed).slice().sort((a,b)=>norm(a.name).includes('matrimonio')?-1:1).slice(0,2);
    $('#homeGoals').innerHTML=goals.length?goals.map(g=>{const s=goalStats(g);return`<button class="home-goal" data-goal="${g.id}"><span>${svg(goalIcon(g.name))}</span><small>${esc(g.name)}</small><strong>${Math.round(s.pct)}%</strong><em>${s.monthly?`${money(s.monthly)}/mese`:'Apri dettaglio'}</em><div class="tiny-progress"><i style="width:${s.pct}%"></i></div></button>`}).join(''):'<div class="empty">Nessun obiettivo attivo.</div>';
  }
  function renderExpected(){
    const items=state.expectedIncomes.filter(i=>i.status==='Atteso');
    $('#expectedIncomeList').innerHTML=items.length?items.map(i=>`<div class="list-row"><div class="list-main"><span class="row-icon">${svg('down')}</span><div class="list-copy"><div class="list-title">${esc(i.name)}</div><div class="list-sub">${esc(i.period||i.note||'Atteso')}</div></div></div><div><div class="list-amount positive">${i.min===i.max?money(i.min):`${money(i.min)}–${money(i.max)}`}</div><button class="small-pill" data-receive="${i.id}">Ricevuta</button></div></div>`).join(''):'<div class="empty">Nessuna entrata attesa.</div>';
  }
  function renderAccounts(){
    $('#accountsList').innerHTML=state.accounts.length?state.accounts.map(a=>`<button class="account-card" data-account="${a.id}"><div class="account-top"><div class="list-main"><span class="row-icon">${svg(accountIcon(a))}</span><div><div class="account-name">${esc(a.name)}</div><div class="account-meta">${esc(a.kind||'Conto')}</div></div></div>${a.protected?'<span class="protected-pill">Protetto</span>':''}</div><div class="account-balance">${money(a.balance)}</div></button>`).join(''):'<div class="empty">Nessun conto. Importa il backup o aggiungine uno.</div>';
  }
  function renderMovements(){
    const items=(movementFilter==='all'?state.movements:state.movements.filter(m=>m.type===movementFilter)).slice(0,80);
    $('#movementsList').innerHTML=items.length?items.map(m=>{const a=state.accounts.find(x=>x.id===m.accountId),positive=m.type==='income',negative=m.type==='expense',ic=positive?'down':negative?'up':'arrows';return`<div class="list-row"><div class="list-main"><span class="row-icon">${svg(ic)}</span><div class="list-copy"><div class="list-title">${esc(m.title||'Movimento')}</div><div class="list-sub">${m.date?dateFmt.format(parse(m.date)):''}${a?` · ${esc(a.name)}`:''}${m.category?` · ${esc(m.category)}`:''}</div></div></div><div class="list-amount ${positive?'positive':negative?'negative':''}">${positive?'+':negative?'−':''}${money(Math.abs(m.amount||0))}</div></div>`}).join(''):'<div class="empty">Nessun movimento.</div>';
  }
  function renderBudget(){
    $('#budgetCategories').innerHTML=state.budgets.length?state.budgets.map(b=>{const rem=Math.max(0,Number(b.budget||0)-Number(b.spent||0)),p=b.budget?Math.min(100,Number(b.spent||0)/Number(b.budget)*100):0;return`<button class="budget-card" data-budget="${b.id}"><div class="budget-top"><div class="budget-name">${esc(b.name)}</div><strong>${money(rem)}</strong></div><div class="budget-meta">Speso ${money(b.spent)} su ${money(b.budget)}</div><div class="progress"><i style="width:${p}%"></i></div><div class="budget-values"><span>${Math.round(p)}% utilizzato</span><span>${esc(b.period||'Periodo corrente')}</span></div></button>`}).join(''):'<div class="empty">Nessun budget impostato.</div>';
  }
  function renderPlan(){
    $('#goalsList').innerHTML=state.goals.length?state.goals.map(g=>{const s=goalStats(g);return`<button class="goal-row" data-goal="${g.id}"><h3>${esc(g.name)}</h3><p>${g.target?`${money(g.current)} / ${money(g.target)} · ${goalDate(g)}`:'Target da definire'}</p><div class="goal-progress"><i style="width:${s.pct}%"></i></div><span class="goal-right">${svg('chevron')}</span></button>`}).join(''):'<div class="empty">Nessun obiettivo.</div>';
    const active=state.commitments.filter(c=>c.active);
    $('#commitmentsList').innerHTML=active.length?active.map(c=>`<div class="list-row"><div class="list-main"><span class="row-icon">${svg('calendar')}</span><div class="list-copy"><div class="list-title">${esc(c.name)}</div><div class="list-sub">${dateFmt.format(parse(c.dueDate))} · ${esc(c.cadence||'')}</div></div></div><div><div class="list-amount">${money(c.amount)}</div><button class="small-pill" data-pay="${c.id}">Pagata</button></div></div>`).join(''):'<div class="empty">Nessuna scadenza attiva.</div>';
    $('#liabilitiesList').innerHTML=state.liabilities.length?state.liabilities.map(l=>{const end=l.finalDueDate||l.recurrenceEnd||l.endDate||l.finalPaymentDate||'',count=l.installmentsRemaining;return`<button class="list-row liability-row" data-liability="${l.id}"><div class="list-main"><span class="row-icon">${svg(norm(l.name).includes('clio')?'car':'card')}</span><div class="list-copy"><div class="list-title">${esc(l.name)}</div><div class="list-sub">${l.monthly?`Rata ${money(l.monthly)}`:''}${count!=null?` · ${count} rate rimaste`:''}${end?` · fine ${monthFmt.format(parse(end)).replace('.','')}`:''}</div></div></div><span class="chevron">${svg('chevron')}</span></button>`}).join(''):'<div class="empty">Nessun finanziamento.</div>';
  }
  function renderDrawerMeta(){const d=getSetting('nextSalaryDate','');$('#drawerSalaryText').textContent=d?dateFmt.format(parse(d)):'Non impostato';}

  function showView(view,title){$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));$$('.view').forEach(v=>v.classList.remove('active'));$(`#view-${view}`)?.classList.add('active');$('#pageTitle').textContent=title||'';window.scrollTo({top:0,behavior:'auto'});}
  function openDrawer(){closeSheet();$('#drawerBackdrop').hidden=false;requestAnimationFrame(()=>{$('#drawerBackdrop').classList.add('open');$('#drawer').classList.add('open');$('#drawer').setAttribute('aria-hidden','false')});}
  function closeDrawer(){$('#drawerBackdrop').classList.remove('open');$('#drawer').classList.remove('open');$('#drawer').setAttribute('aria-hidden','true');setTimeout(()=>$('#drawerBackdrop').hidden=true,210);}
  function openSheet(kicker,title,html){closeDrawer();$('#sheetKicker').textContent=kicker;$('#sheetTitle').textContent=title;$('#sheetBody').innerHTML=html;$('#sheetBackdrop').hidden=false;requestAnimationFrame(()=>{$('#sheetBackdrop').classList.add('open');$('#sheet').classList.add('open');$('#sheet').setAttribute('aria-hidden','false')});$('#sheet').scrollTop=0;}
  function closeSheet(){$('#sheetBackdrop').classList.remove('open');$('#sheet').classList.remove('open');$('#sheet').setAttribute('aria-hidden','true');setTimeout(()=>$('#sheetBackdrop').hidden=true,210);}
  function toast(msg){clearTimeout(toastTimer);const el=$('#toast');el.textContent=msg;el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,2200);}

  function accountOptions(selected){return state.accounts.map(a=>`<option value="${a.id}" ${String(a.id)===String(selected)?'selected':''}>${esc(a.name)} — ${money(a.balance)}</option>`).join('')}
  function budgetOptions(){return'<option value="">Da classificare / nessuna</option>'+state.budgets.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}
  function movementForm(type='expense'){
    if(!state.accounts.length){toast('Aggiungi prima un conto.');return;}
    openSheet(type==='income'?'ENTRATA':'MOVIMENTO',type==='income'?'Nuova entrata':'Nuova spesa',`<form id="movementForm" class="form"><div class="field"><label>Descrizione</label><input id="mvTitle" required autocomplete="off"></div><div class="form-row"><div class="field"><label>Importo</label><input id="mvAmount" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Data</label><input id="mvDate" type="date" value="${today()}" required></div></div><div class="field"><label>Conto</label><select id="mvAccount">${accountOptions(state.accounts[0].id)}</select></div>${type==='expense'?`<div class="field"><label>Categoria budget</label><select id="mvBudget">${budgetOptions()}</select></div>`:''}<div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Salva</button></div></form>`);
    $('#movementForm').onsubmit=async e=>{e.preventDefault();const amount=Number($('#mvAmount').value),account=state.accounts.find(a=>String(a.id)===String($('#mvAccount').value));if(!account||amount<=0)return;account.balance+=type==='income'?amount:-amount;await FinanceDB.put('accounts',account);let cat='',bid=null;if(type==='expense'&&$('#mvBudget')?.value){bid=Number($('#mvBudget').value);const b=state.budgets.find(x=>x.id===bid);if(b){b.spent=Number(b.spent||0)+amount;cat=b.name;await FinanceDB.put('budgets',b)}}await FinanceDB.add('movements',{type,date:$('#mvDate').value,title:$('#mvTitle').value.trim(),amount,accountId:account.id,budgetId:bid,category:cat});await refresh('Movimento salvato');};
  }
  function transferForm(){
    if(state.accounts.length<2){toast('Servono almeno due conti.');return;}
    openSheet('TRASFERIMENTO','Sposta denaro',`<form id="transferForm" class="form"><div class="field"><label>Da</label><select id="trFrom">${accountOptions(state.accounts[0].id)}</select></div><div class="field"><label>A</label><select id="trTo">${accountOptions(state.accounts[1].id)}</select></div><div class="field"><label>Importo</label><input id="trAmount" type="number" min="0.01" step="0.01" required></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Trasferisci</button></div></form>`);
    $('#transferForm').onsubmit=async e=>{e.preventDefault();const f=state.accounts.find(a=>String(a.id)===String($('#trFrom').value)),t=state.accounts.find(a=>String(a.id)===String($('#trTo').value)),amount=Number($('#trAmount').value);if(!f||!t||f.id===t.id||amount<=0||f.balance<amount){toast('Dati non validi o saldo insufficiente.');return;}f.balance-=amount;t.balance+=amount;await FinanceDB.put('accounts',f);await FinanceDB.put('accounts',t);await FinanceDB.add('movements',{type:'transfer',date:today(),title:`Trasferimento ${f.name} → ${t.name}`,amount,accountId:f.id,toAccountId:t.id});await refresh('Trasferimento registrato');};
  }
  function commitmentForm(){
    openSheet('SCADENZA','Nuovo impegno',`<form id="commitmentForm" class="form"><div class="field"><label>Nome</label><input id="cmName" required></div><div class="form-row"><div class="field"><label>Importo</label><input id="cmAmount" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Data</label><input id="cmDate" type="date" value="${today()}" required></div></div><div class="field"><label>Nota</label><input id="cmNote"></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Aggiungi</button></div></form>`);
    $('#commitmentForm').onsubmit=async e=>{e.preventDefault();await FinanceDB.add('commitments',{name:$('#cmName').value.trim(),amount:Number($('#cmAmount').value),dueDate:$('#cmDate').value,cadence:'Una tantum',estimated:false,active:true,note:$('#cmNote').value.trim()});await refresh('Scadenza aggiunta');};
  }
  function salaryForm(){
    const current=getSetting('nextSalaryDate','');
    openSheet('PIANIFICAZIONE','Prossimo stipendio',`<div class="sheet-caption">Serve per calcolare un budget giornaliero realistico. Puoi cambiarla in qualsiasi momento.</div><form id="salaryForm" class="form"><div class="field"><label>Data</label><input id="salaryDate" type="date" value="${current}"></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Salva</button></div></form>`);
    $('#salaryForm').onsubmit=async e=>{e.preventDefault();const value=$('#salaryDate').value;await FinanceDB.put('settings',{key:'nextSalaryDate',value});setSettingLocal('nextSalaryDate',value);renderDashboard();renderDrawerMeta();closeSheet();toast('Data stipendio aggiornata');};
  }
  function goalDetail(id){
    const g=state.goals.find(x=>String(x.id)===String(id));if(!g)return;
    const s=goalStats(g),cls=s.status==='Completato'||s.status==='In anticipo'?'good':s.status==='Da recuperare'?'warn':'';
    const tip=s.monthly?`Devi conservare circa <strong>${money(s.monthly)}</strong> al mese per raggiungere il tuo obiettivo.${s.weekly?` Sono circa ${money(s.weekly)} a settimana.`:''}`:'Imposta un target e una data per ottenere una previsione.';
    openSheet('OBIETTIVO',g.name,`<span class="status-pill ${cls}">${s.status}</span><div class="sheet-body-value">${money(s.current)} <span style="font-size:17px;color:var(--muted)">/ ${money(s.target)}</span></div><div class="progress"><i style="width:${s.pct}%"></i></div><div class="section-caption">${Math.round(s.pct)}% completato · ${goalDate(g)}</div><div class="info-grid"><div><small>Mancano</small><strong>${money(s.remaining)}</strong></div><div><small>Tempo</small><strong>${s.months?`${s.months} mesi`:'—'}</strong></div><div class="wide"><small>Quota mensile consigliata</small><strong>${s.monthly?money(s.monthly):'—'}</strong></div></div><div class="tip-card"><span>${svg('target')}</span><p>${tip}</p></div><form id="goalEdit" class="form"><div class="form-row"><div class="field"><label>Già accantonato</label><input id="goalCurrent" type="number" min="0" step="0.01" value="${Number(g.current||0).toFixed(2)}"></div><div class="field"><label>Target</label><input id="goalTarget" type="number" min="0" step="0.01" value="${Number(g.target||0).toFixed(2)}"></div></div><div class="field"><label>Data obiettivo</label><input id="goalDate" type="date" value="${g.targetDate||''}"></div><button class="primary-button">Aggiorna obiettivo</button></form>`);
    $('#goalEdit').onsubmit=async e=>{e.preventDefault();g.current=Math.max(0,Number($('#goalCurrent').value||0));g.target=Math.max(0,Number($('#goalTarget').value||0));g.targetDate=$('#goalDate').value;g.completed=g.target>0&&g.current>=g.target;await FinanceDB.put('goals',g);render();goalDetail(g.id);toast('Obiettivo aggiornato');};
  }
  function newGoal(){
    openSheet('OBIETTIVO','Nuovo traguardo',`<form id="newGoalForm" class="form"><div class="field"><label>Nome</label><input id="ngName" required></div><div class="form-row"><div class="field"><label>Target</label><input id="ngTarget" type="number" min="0" step="0.01" required></div><div class="field"><label>Già accantonato</label><input id="ngCurrent" type="number" min="0" step="0.01" value="0"></div></div><div class="field"><label>Data obiettivo</label><input id="ngDate" type="date"></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Crea</button></div></form>`);
    $('#newGoalForm').onsubmit=async e=>{e.preventDefault();await FinanceDB.add('goals',{name:$('#ngName').value.trim(),target:Number($('#ngTarget').value),current:Number($('#ngCurrent').value||0),targetDate:$('#ngDate').value,createdAt:today(),priority:'Media',completed:false,note:''});await refresh('Obiettivo creato');};
  }
  function liabilityDetail(id){
    const l=state.liabilities.find(x=>String(x.id)===String(id));if(!l)return;
    const c=configFor(l.name),end=l.finalDueDate||l.recurrenceEnd||l.endDate||l.finalPaymentDate||'',count=l.installmentsRemaining;
    openSheet('FINANZIAMENTO',l.name,`<span class="status-pill ${l.completed?'good':''}">${l.completed?'Concluso':'Attivo'}</span><div class="sheet-body-value">${money(l.monthly||c?.monthly||0)} <span style="font-size:17px;color:var(--muted)">/ mese</span></div><div class="info-grid"><div><small>Prossima rata</small><strong>${l.nextDueDate?dateFmt.format(parse(l.nextDueDate)):'—'}</strong></div><div><small>Fine prevista</small><strong>${end?monthFmt.format(parse(end)).replace('.',''):'Da definire'}</strong></div>${count!=null?`<div><small>Rate rimaste</small><strong>${count}</strong></div>`:''}${l.remaining!=null?`<div><small>Residuo stimato</small><strong>${money(l.remaining)}</strong></div>`:''}${l.finalPayment?`<div class="wide"><small>Maxirata</small><strong>${money(l.finalPayment)}</strong></div>`:''}</div><div class="tip-card"><span>${svg('calendar')}</span><p>${esc(l.scheduleNote||c?.note||l.note||'')}</p></div>`);
  }
  function accountDetail(id){
    const a=state.accounts.find(x=>String(x.id)===String(id));if(!a)return;
    openSheet('CONTO',a.name,`<div class="sheet-body-value">${money(a.balance)}</div><div class="sheet-caption">${esc(a.kind||'Conto')}${a.protected?' · Liquidità protetta':''}</div><form id="accountEdit" class="form"><div class="field"><label>Saldo reale</label><input id="accountBalance" type="number" step="0.01" value="${Number(a.balance||0).toFixed(2)}"></div><div class="field"><label>Nome</label><input id="accountName" value="${esc(a.name)}"></div><button class="primary-button">Salva rettifica</button></form>`);
    $('#accountEdit').onsubmit=async e=>{e.preventDefault();const old=Number(a.balance||0),next=Number($('#accountBalance').value||0),diff=next-old;a.balance=next;a.name=$('#accountName').value.trim()||a.name;await FinanceDB.put('accounts',a);if(Math.abs(diff)>.001)await FinanceDB.add('movements',{type:'adjustment',date:today(),title:`Rettifica ${a.name}`,amount:Math.abs(diff),accountId:a.id,note:`Saldo precedente ${money(old)}`});await refresh('Saldo aggiornato');};
  }
  function newAccount(){
    openSheet('CONTO','Nuovo conto',`<form id="newAccountForm" class="form"><div class="field"><label>Nome</label><input id="naName" required></div><div class="form-row"><div class="field"><label>Saldo</label><input id="naBalance" type="number" step="0.01" value="0" required></div><div class="field"><label>Tipo</label><select id="naKind"><option>Conto corrente</option><option>Prepagata</option><option>Contanti</option><option>Risparmio</option></select></div></div><div class="field"><label>Trattamento</label><select id="naProtected"><option value="false">Disponibile</option><option value="true">Protetto</option></select></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Aggiungi</button></div></form>`);
    $('#newAccountForm').onsubmit=async e=>{e.preventDefault();await FinanceDB.add('accounts',{name:$('#naName').value.trim(),balance:Number($('#naBalance').value),kind:$('#naKind').value,protected:$('#naProtected').value==='true',order:state.accounts.length});await refresh('Conto aggiunto');};
  }
  function budgetDetail(id){
    const b=state.budgets.find(x=>String(x.id)===String(id));if(!b)return;
    openSheet('BUDGET',b.name,`<div class="sheet-body-value">${money(Math.max(0,Number(b.budget)-Number(b.spent)))}</div><div class="sheet-caption">Disponibile nel periodo corrente.</div><form id="budgetEdit" class="form"><div class="form-row"><div class="field"><label>Budget</label><input id="bdBudget" type="number" min="0" step="0.01" value="${Number(b.budget||0).toFixed(2)}"></div><div class="field"><label>Già speso</label><input id="bdSpent" type="number" min="0" step="0.01" value="${Number(b.spent||0).toFixed(2)}"></div></div><button class="primary-button">Aggiorna</button></form>`);
    $('#budgetEdit').onsubmit=async e=>{e.preventDefault();b.budget=Number($('#bdBudget').value||0);b.spent=Number($('#bdSpent').value||0);await FinanceDB.put('budgets',b);render();budgetDetail(b.id);toast('Budget aggiornato');};
  }
  function expectedForm(){
    openSheet('ENTRATA ATTESA','Nuova previsione',`<form id="expectedForm" class="form"><div class="field"><label>Nome</label><input id="exName" required></div><div class="form-row"><div class="field"><label>Minimo</label><input id="exMin" type="number" min="0" step="0.01" required></div><div class="field"><label>Massimo</label><input id="exMax" type="number" min="0" step="0.01" required></div></div><div class="field"><label>Periodo / nota</label><input id="exPeriod"></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Aggiungi</button></div></form>`);
    $('#expectedForm').onsubmit=async e=>{e.preventDefault();await FinanceDB.add('expectedIncomes',{name:$('#exName').value.trim(),min:Number($('#exMin').value),max:Number($('#exMax').value),period:$('#exPeriod').value.trim(),status:'Atteso',note:''});await refresh('Entrata attesa aggiunta');};
  }
  function receiveIncome(id){
    const i=state.expectedIncomes.find(x=>String(x.id)===String(id));if(!i||!state.accounts.length)return;
    openSheet('ENTRATA','Segna come ricevuta',`<form id="receiveForm" class="form"><div class="field"><label>Importo ricevuto</label><input id="rcAmount" type="number" step="0.01" value="${Number(i.min||0).toFixed(2)}" required></div><div class="field"><label>Conto</label><select id="rcAccount">${accountOptions(state.accounts[0].id)}</select></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Conferma</button></div></form>`);
    $('#receiveForm').onsubmit=async e=>{e.preventDefault();const amount=Number($('#rcAmount').value),a=state.accounts.find(x=>String(x.id)===String($('#rcAccount').value));if(!a||amount<=0)return;a.balance+=amount;i.status='Ricevuto';i.receivedAmount=amount;i.receivedDate=today();await FinanceDB.put('accounts',a);await FinanceDB.put('expectedIncomes',i);await FinanceDB.add('movements',{type:'income',date:today(),title:i.name,amount,accountId:a.id,category:'Entrata attesa'});await refresh('Entrata registrata');};
  }
  async function payCommitment(id){
    const item=state.commitments.find(x=>String(x.id)===String(id));if(!item||!state.accounts.length)return;
    openSheet('SCADENZA','Segna come pagata',`<form id="payForm" class="form"><div class="field"><label>Importo</label><input id="payAmount" type="number" step="0.01" value="${Number(item.amount).toFixed(2)}" required></div><div class="field"><label>Conto</label><select id="payAccount">${accountOptions(state.accounts[0].id)}</select></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Conferma</button></div></form>`);
    $('#payForm').onsubmit=async e=>{e.preventDefault();const amount=Number($('#payAmount').value),a=state.accounts.find(x=>String(x.id)===String($('#payAccount').value));if(!a||amount<=0||a.balance<amount){toast('Saldo insufficiente.');return;}a.balance-=amount;item.active=false;item.paidDate=today();item.paidAmount=amount;await FinanceDB.put('accounts',a);await FinanceDB.put('commitments',item);await FinanceDB.add('movements',{type:'expense',date:today(),title:item.name,amount,accountId:a.id,category:'Scadenza'});await processRecurring(item,amount);await refresh('Scadenza registrata');};
  }
  async function processRecurring(item,paid){
    const c=configFor(item.name);if(!c)return;
    const l=state.liabilities.find(x=>configFor(x.name)?.key===c.key);if(!l)return;
    if(l.remaining!=null&&Number.isFinite(Number(l.remaining)))l.remaining=Math.max(0,+(Number(l.remaining)-paid).toFixed(2));
    if(l.installmentsRemaining!=null)l.installmentsRemaining=Math.max(0,Number(l.installmentsRemaining)-1);
    l.completedInstallments=Number(l.completedInstallments||0)+1;
    const next=addMonth(item.dueDate),end=l.finalDueDate||l.recurrenceEnd||null;
    const stop=(l.installmentsRemaining!=null&&l.installmentsRemaining<=0)||(end&&next>end);
    if(stop){l.nextDueDate=null;if(c.key!=='clio')l.completed=true}
    else{
      l.nextDueDate=next;
      let amount=Number(l.monthly||c.monthly||paid);
      if(Number(l.installmentsRemaining)===1&&Number(l.remaining)>0)amount=Number(l.remaining);
      if(!state.commitments.some(x=>x.active&&configFor(x.name)?.key===c.key&&x.dueDate===next))await FinanceDB.add('commitments',{name:c.key==='bank'?'Rimborso anticipo banca':l.name,amount:+amount.toFixed(2),dueDate:next,cadence:'Mensile',estimated:false,active:true,recurring:true,generated:true,liabilityKey:c.key,note:end&&next===end?'Ultima rata':'Rata generata automaticamente'});
    }
    await FinanceDB.put('liabilities',l);
  }
  async function backup(){const p=await FinanceDB.exportAll(),u=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=`finanze-backup-${today()}.json`;a.click();URL.revokeObjectURL(u);toast('Backup esportato');}
  async function importBackup(e){const f=e.target.files?.[0];if(!f)return;try{const p=JSON.parse(await f.text());if(confirm('Importare il backup? I dati attuali verranno sostituiti.')){await FinanceDB.importAll(p);await refresh('Backup importato');applyMigrationsInMemory();render();setTimeout(persistMigrations,0)}}catch{toast('Backup non valido')}e.target.value='';}
  async function hash(s){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
  function pinForm(){
    openSheet('SICUREZZA','PIN',`<form id="pinForm" class="form"><div class="field"><label>PIN 4–6 cifre</label><input id="pin1" type="password" inputmode="numeric" maxlength="6" required></div><div class="field"><label>Conferma</label><input id="pin2" type="password" inputmode="numeric" maxlength="6" required></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Salva</button></div></form>`);
    $('#pinForm').onsubmit=async e=>{e.preventDefault();const a=$('#pin1').value,b=$('#pin2').value;if(!/^\d{4,6}$/.test(a)||a!==b){toast('PIN non valido.');return;}await FinanceDB.put('settings',{key:'pinHash',value:await hash(a)});closeSheet();toast('PIN aggiornato');};
  }
  async function lockIfNeeded(){const p=await FinanceDB.get('settings','pinHash');if(p?.value)$('#lockScreen').hidden=false}
  async function unlock(){const p=await FinanceDB.get('settings','pinHash');if(!p?.value||await hash($('#pinInput').value)===p.value){$('#lockScreen').hidden=true;$('#pinError').textContent=''}else $('#pinError').textContent='PIN non corretto.'}
  async function reset(){if(confirm('Svuotare tutti i dati locali? Questa operazione non è reversibile senza backup.')){await FinanceDB.clearAll();await refresh('Dati locali azzerati')}}
  async function refresh(msg){closeSheet();await loadData();applyMigrationsInMemory();render();if(msg)toast(msg)}

  function detail(type){const c=calc();if(type==='free')openSheet('DISPONIBILITÀ','Libero davvero',`<div class="sheet-body-value">${money(c.free)}</div><div class="sheet-caption">Liquidità ordinaria meno budget residuo e scadenze già pianificate. È il margine che non serve per ciò che hai già deciso di coprire.</div><div class="info-grid"><div><small>Disponibili</small><strong>${money(c.ordinary)}</strong></div><div><small>Budget residuo</small><strong>${money(c.remainingBudget)}</strong></div><div class="wide"><small>Scadenze</small><strong>${money(c.committed)}</strong></div></div>`);else openSheet('IMPEGNI','Già impegnato',`<div class="sheet-body-value">${money(c.committed)}</div><div class="sheet-caption">Somma delle scadenze attive. Quando una rata viene pagata, l’app genera automaticamente la successiva se prevista.</div>`)}

  function bind(){
    document.addEventListener('click',e=>{
      const close=e.target.closest('[data-close]');if(close){close.dataset.close==='drawer'?closeDrawer():closeSheet();return}
      const tab=e.target.closest('.tab');if(tab){showView(tab.dataset.view,tab.dataset.title);return}
      const go=e.target.closest('[data-go]');if(go){const t=$(`.tab[data-view="${go.dataset.go}"]`);if(t)t.click();return}
      if(e.target.closest('#menuBtn')){openDrawer();return}
      if(e.target.closest('#quickAddBtn')){movementForm('expense');return}
      if(e.target.closest('#spendTodayCard')){salaryForm();return}
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(action){({expense:()=>movementForm('expense'),income:()=>movementForm('income'),transfer:transferForm,commitment:commitmentForm,newGoal,newExpected:expectedForm,newAccount,salaryDate:salaryForm,backup,pin:pinForm,reset}[action]||(()=>{}))();return}
      const g=e.target.closest('[data-goal]');if(g){goalDetail(g.dataset.goal);return}
      const l=e.target.closest('[data-liability]');if(l){liabilityDetail(l.dataset.liability);return}
      const a=e.target.closest('[data-account]');if(a){accountDetail(a.dataset.account);return}
      const b=e.target.closest('[data-budget]');if(b){budgetDetail(b.dataset.budget);return}
      const r=e.target.closest('[data-receive]');if(r){receiveIncome(r.dataset.receive);return}
      const p=e.target.closest('[data-pay]');if(p){payCommitment(p.dataset.pay);return}
      const d=e.target.closest('[data-detail]');if(d){detail(d.dataset.detail);return}
      const f=e.target.closest('[data-filter]');if(f){movementFilter=f.dataset.filter;$$('#movementFilter button').forEach(x=>x.classList.toggle('active',x===f));renderMovements();return}
    });
    $('#drawerBackdrop').onclick=closeDrawer;
    $('#sheetBackdrop').onclick=closeSheet;
    $('#importBackupInput').onchange=importBackup;
    $('#unlockBtn').onclick=unlock;
    $('#pinInput').onkeydown=e=>{if(e.key==='Enter')unlock()};
  }

  async function init(){
    iconize();bind();
    try{
      await loadData();
      applyMigrationsInMemory();
      render();
      $('#app').setAttribute('aria-busy','false');
      $('#boot').classList.add('done');
      setTimeout(()=>$('#boot').remove(),220);
      await lockIfNeeded();
      setTimeout(persistMigrations,0);
      if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
    }catch(err){console.error(err);$('#boot .boot-copy').textContent='Non riesco a leggere i dati. Riapri l’app.';}
  }
  return{init};
})();
document.addEventListener('DOMContentLoaded',FinanceApp.init);
