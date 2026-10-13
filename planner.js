(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const monthFmt=new Intl.DateTimeFormat('it-IT',{month:'short',year:'numeric'});
  const dateFmt=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric'});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const parse=s=>new Date(`${s}T12:00:00`);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addMonth=s=>{const d=parse(s),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));return iso(d);};
  const monthIndex=d=>d.getFullYear()*12+d.getMonth();

  const icons={
    target:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>',
    heart:'<svg viewBox="0 0 24 24"><path d="M20.5 8.6c0 5-8.5 10.2-8.5 10.2S3.5 13.6 3.5 8.6A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.5 2.5Z"/></svg>',
    shield:'<svg viewBox="0 0 24 24"><path d="M12 3.5 19 6v5.3c0 4.6-2.8 7.6-7 9.2-4.2-1.6-7-4.6-7-9.2V6l7-2.5Z"/><path d="m8.8 12 2.1 2.1 4.4-4.5"/></svg>',
    diamond:'<svg viewBox="0 0 24 24"><path d="m4 8 4-4h8l4 4-8 12L4 8Z"/><path d="M4 8h16M8 4l4 4 4-4"/></svg>',
    car:'<svg viewBox="0 0 24 24"><path d="m5 10 1.6-4h10.8l1.6 4"/><path d="M4 10h16a1.5 1.5 0 0 1 1.5 1.5V17H19v2h-3v-2H8v2H5v-2H2.5v-5.5A1.5 1.5 0 0 1 4 10Z"/><circle cx="6.5" cy="13.5" r="1"/><circle cx="17.5" cy="13.5" r="1"/></svg>',
    calendar:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/></svg>',
    chevron:'<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>'
  };

  const configs=[
    {key:'clio',match:['clio'],next:'2026-10-15',end:'2028-12-15',balloon:'2029-01-01',monthly:287.92,note:'Le rate mensili proseguono fino alla fase finale. La maxirata è prevista a gennaio 2029.'},
    {key:'dyson',match:['dyson'],next:'2026-11-01',final:'2026-12-01',monthly:44,total:2,remaining:88,note:'Dopo la rata di dicembre 2026 il finanziamento viene chiuso automaticamente nell’app.'},
    {key:'ninja',match:['ninja creami','ninja'],next:'2026-11-03',final:'2026-12-03',monthly:64.99,total:2,remaining:129.99,note:'Restano due rate tra novembre e dicembre 2026. L’ultima viene generata automaticamente.'},
    {key:'bank',match:['anticipo banca','rimborso anticipo banca'],next:'2026-11-01',final:'2029-10-01',monthly:15.99,total:36,remaining:575.64,note:'36 rate mensili da €15,99, con fine stimata a ottobre 2029.'},
    {key:'iphone',match:['iphone compass','iphone'],next:'2026-12-15',monthly:98.07,note:'Prima rata prevista il 15 dicembre. L’estinzione anticipata resta da valutare.'}
  ];
  const configFor=s=>{const n=norm(s);return configs.find(c=>c.match.some(m=>n.includes(m)));};
  const commitmentName=l=>configFor(l.name)?.key==='bank'?'Rimborso anticipo banca':l.name;

  const native={
    getAll:FinanceDB.getAll.bind(FinanceDB),get:FinanceDB.get.bind(FinanceDB),put:FinanceDB.put.bind(FinanceDB),add:FinanceDB.add.bind(FinanceDB),importAll:FinanceDB.importAll.bind(FinanceDB)
  };

  async function migrate(){
    const goals=await native.getAll('goals');
    for(const g of goals){
      let changed=false;
      if(norm(g.name).includes('matrimonio')){
        if(Number(g.target)!==13000){g.target=13000;changed=true;}
        if(g.targetDate!=='2028-05-31'){g.targetDate='2028-05-31';changed=true;}
        if(!g.createdAt){g.createdAt='2026-10-13';changed=true;}
        if(!g.note||norm(g.note).includes('5000')){g.note='Obiettivo matrimonio · Maggio 2028';changed=true;}
      }else if(!g.createdAt){g.createdAt='2026-10-13';changed=true;}
      if(changed)await native.put('goals',g);
    }

    const liabilities=await native.getAll('liabilities');
    for(const l of liabilities){
      const c=configFor(l.name);if(!c)continue;let changed=false;
      if(!has(l,'scheduleKey')){l.scheduleKey=c.key;changed=true;}
      if(!has(l,'recurrence')){l.recurrence='monthly';changed=true;}
      if(!has(l,'nextDueDate')){l.nextDueDate=c.next;changed=true;}
      if(c.final&&!has(l,'finalDueDate')){l.finalDueDate=c.final;changed=true;}
      if(c.end&&!has(l,'recurrenceEnd')){l.recurrenceEnd=c.end;changed=true;}
      if(c.balloon&&!has(l,'finalPaymentDate')){l.finalPaymentDate=c.balloon;changed=true;}
      if(c.total&&!has(l,'installmentsRemaining')){l.installmentsRemaining=c.total;changed=true;}
      if(c.total&&!has(l,'installmentsTotal')){l.installmentsTotal=c.total;changed=true;}
      if(c.remaining!=null&&(l.remaining==null||!Number.isFinite(Number(l.remaining)))){l.remaining=c.remaining;changed=true;}
      if(!l.scheduleNote){l.scheduleNote=c.note;changed=true;}
      if(changed)await native.put('liabilities',l);
    }

    const commitments=await native.getAll('commitments');
    for(const x of commitments){const c=configFor(x.name);if(!c)continue;let changed=false;if(!x.liabilityKey){x.liabilityKey=c.key;changed=true;}if(!has(x,'recurring')){x.recurring=true;changed=true;}if(changed)await native.put('commitments',x);}
    await ensureUpcoming();
  }

  async function ensureUpcoming(){
    const liabilities=await native.getAll('liabilities'),commitments=await native.getAll('commitments');
    const horizon=new Date();horizon.setDate(horizon.getDate()+35);
    for(const l of liabilities){
      if(l.completed||!l.nextDueDate||l.recurrence!=='monthly')continue;
      if(parse(l.nextDueDate)>horizon)continue;
      const c=configFor(l.name);if(!c)continue;
      if(commitments.some(x=>x.active&&configFor(x.name)?.key===c.key&&x.dueDate===l.nextDueDate))continue;
      let amount=Number(l.monthly||c.monthly||0);if(Number(l.installmentsRemaining)===1&&Number(l.remaining)>0)amount=Number(l.remaining);
      if(amount>0)await native.add('commitments',{name:commitmentName(l),amount:+amount.toFixed(2),dueDate:l.nextDueDate,cadence:'Mensile',estimated:false,active:true,recurring:true,generated:true,liabilityKey:c.key,note:'Rata generata automaticamente'});
    }
  }

  async function processPaid(item){
    if(item.recurrenceProcessed)return;
    const liabilities=await native.getAll('liabilities'),c=configFor(item.name);if(!c)return;
    const l=liabilities.find(x=>configFor(x.name)?.key===c.key);if(!l)return;
    const paid=Number(item.paidAmount||item.amount||0);
    if(l.remaining!=null&&Number.isFinite(Number(l.remaining)))l.remaining=Math.max(0,+(Number(l.remaining)-paid).toFixed(2));
    if(has(l,'installmentsRemaining'))l.installmentsRemaining=Math.max(0,Number(l.installmentsRemaining)-1);
    l.completedInstallments=Number(l.completedInstallments||0)+1;
    const next=addMonth(item.dueDate),end=l.finalDueDate||l.recurrenceEnd||null;
    const stop=(has(l,'installmentsRemaining')&&Number(l.installmentsRemaining)<=0)||(end&&next>end);
    if(stop){l.nextDueDate=null;if(c.key!=='clio')l.completed=true;}
    else{
      l.nextDueDate=next;
      const all=await native.getAll('commitments');
      if(!all.some(x=>x.active&&configFor(x.name)?.key===c.key&&x.dueDate===next)){
        let amount=Number(l.monthly||c.monthly||paid);if(Number(l.installmentsRemaining)===1&&Number(l.remaining)>0)amount=Number(l.remaining);
        await native.add('commitments',{name:commitmentName(l),amount:+amount.toFixed(2),dueDate:next,cadence:'Mensile',estimated:false,active:true,recurring:true,generated:true,liabilityKey:c.key,note:end&&next===end?'Ultima rata':'Rata generata automaticamente'});
      }
    }
    item.recurrenceProcessed=true;item.recurrenceProcessedAt=new Date().toISOString();
    await native.put('commitments',item);await native.put('liabilities',l);
  }

  let ready=migrate();
  FinanceDB.getAll=async s=>{await ready;return native.getAll(s);};
  FinanceDB.get=async(s,k)=>{await ready;return native.get(s,k);};
  FinanceDB.put=async(s,v)=>{await ready;const r=await native.put(s,v);if(s==='commitments'&&v?.active===false&&v?.paidDate&&!v?.recurrenceProcessed)await processPaid(v);return r;};
  FinanceDB.importAll=async p=>{const r=await native.importAll(p);ready=migrate();await ready;return r;};

  function goalStats(g){
    const target=Number(g.target||0),current=Number(g.current||0),remaining=Math.max(0,target-current),pct=target?Math.min(100,current/target*100):0;
    const now=new Date(),targetDate=g.targetDate?parse(g.targetDate):null,created=g.createdAt?parse(g.createdAt):now;
    const months=targetDate?Math.max(1,monthIndex(targetDate)-monthIndex(now)):null,monthly=months?remaining/months:null,weekly=monthly?monthly*12/52:null;
    let status='In corso';
    if(target&&current>=target)status='Completato';
    else if(targetDate){const total=Math.max(1,monthIndex(targetDate)-monthIndex(created)),elapsed=Math.max(0,monthIndex(now)-monthIndex(created)),expected=target*Math.min(1,elapsed/total);if(elapsed===0)status='Partenza';else if(current>=expected*1.1)status='In anticipo';else if(current>=expected*.9)status='In linea';else status='Da recuperare';}
    return{target,current,remaining,pct,months,monthly,weekly,status,targetDate};
  }
  const targetLabel=g=>g.targetDate?monthFmt.format(parse(g.targetDate)).replace('.',''):'Nessuna data';
  const goalIcon=name=>{const n=norm(name);if(n.includes('matrimonio'))return icons.heart;if(n.includes('anello'))return icons.diamond;if(n.includes('clio'))return icons.car;if(n.includes('tranquillita'))return icons.shield;return icons.target;};

  function injectStyles(){
    if($('#plannerV5Styles'))return;const s=document.createElement('style');s.id='plannerV5Styles';s.textContent=`
      .planner-v5-backdrop{position:fixed;inset:0;z-index:88;background:rgba(0,0,0,.3);opacity:0;pointer-events:none;transition:opacity .28s ease;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}.planner-v5-backdrop.is-open{opacity:1;pointer-events:auto}
      .planner-v5-sheet{position:fixed;z-index:89;left:50%;bottom:0;transform:translate(-50%,105%);width:min(760px,100%);max-height:88vh;overflow:auto;background:var(--panel);border-radius:28px 28px 0 0;padding:10px 18px calc(26px + var(--sb));box-shadow:0 -18px 50px rgba(0,0,0,.16);transition:transform .4s var(--spring)}.planner-v5-sheet.is-open{transform:translate(-50%,0)}
      .planner-v5-grab{width:36px;height:5px;border-radius:999px;background:color-mix(in srgb,var(--muted) 32%,transparent);margin:0 auto 15px}.planner-v5-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.planner-v5-kicker{font-size:11px;letter-spacing:.07em;font-weight:650;color:var(--muted)}.planner-v5-head h2{margin:3px 0 0;font-size:26px;line-height:1.05;letter-spacing:-.035em}.planner-v5-close{width:42px;height:42px;border:0;border-radius:50%;background:var(--panel2);color:var(--muted);font-size:23px}
      .planner-v5-status{display:inline-flex;margin-top:22px;padding:6px 10px;border-radius:999px;background:var(--panel2);color:var(--muted);font-size:11px;font-weight:650}.planner-v5-status.good{background:color-mix(in srgb,var(--green) 12%,var(--panel));color:var(--green)}.planner-v5-status.warn{background:color-mix(in srgb,var(--orange) 13%,var(--panel));color:var(--orange)}
      .planner-v5-big{font-size:38px;line-height:1;font-weight:760;letter-spacing:-.045em;margin:14px 0;font-variant-numeric:tabular-nums}.planner-v5-big span{font-size:17px;color:var(--muted);font-weight:600;letter-spacing:-.01em}.planner-v5-progress{height:8px;background:var(--panel2);border-radius:999px;overflow:hidden}.planner-v5-progress i{display:block;height:100%;background:var(--blue);border-radius:inherit;transition:width .5s var(--spring)}.planner-v5-caption{display:flex;justify-content:space-between;gap:12px;margin:8px 0 20px;color:var(--muted);font-size:11.5px}
      .planner-v5-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.planner-v5-grid>div{background:var(--panel2);border-radius:16px;padding:14px;min-width:0}.planner-v5-grid .wide{grid-column:1/-1}.planner-v5-grid small{display:block;color:var(--muted);font-size:11px;margin-bottom:5px}.planner-v5-grid strong{display:block;font-size:17px;line-height:1.2;font-weight:700;letter-spacing:-.02em;overflow-wrap:anywhere}
      .planner-v5-tip{display:grid;grid-template-columns:40px 1fr;gap:10px;align-items:start;margin-top:12px;padding:14px;background:rgba(0,122,255,.08);border-radius:17px}.planner-v5-tip span{width:36px;height:36px;border-radius:11px;background:var(--panel);color:var(--blue);display:grid;place-items:center}.planner-v5-tip svg,.planner-goal-chevron svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.planner-v5-tip p{margin:0;font-size:13px;line-height:1.45}.planner-v5-tip strong{color:var(--blue)}
      .planner-v5-update{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}.planner-v5-update label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin-bottom:7px}.planner-v5-update-row{display:grid;grid-template-columns:1fr auto;gap:8px}.planner-v5-update input{min-width:0;height:48px;border:0;border-radius:13px;background:var(--panel2);color:var(--text);font:inherit;font-size:16px;padding:0 12px}.planner-v5-update button{min-height:48px;border:0;border-radius:13px;background:var(--blue);color:#fff;font-weight:650;padding:0 18px}.planner-v5-update small{display:block;margin-top:7px;color:var(--muted);font-size:10.5px;line-height:1.4}
      #goalsList>div.planner-goal{cursor:pointer;padding-right:28px;border-radius:14px;margin-left:-8px;margin-right:-8px;padding-left:58px;transition:background .15s ease,transform .15s ease}#goalsList>div.planner-goal:active{background:var(--panel2);transform:scale(.992)}.planner-goal-chevron{position:absolute;right:2px;top:20px;color:var(--muted);display:grid;place-items:center}.planner-goal-chevron svg{width:17px;height:17px}.planner-goal-progress{height:4px;background:var(--panel2);border-radius:999px;overflow:hidden;margin-top:9px}.planner-goal-progress i{display:block;height:100%;background:var(--blue);border-radius:inherit;transition:width .5s var(--spring)}.planner-rate-meta{margin-top:5px!important;color:var(--blue)!important}
      @media(prefers-reduced-motion:reduce){.planner-v5-sheet,.planner-v5-backdrop,.planner-v5-progress i,.planner-goal-progress i{transition:none!important}}
    `;document.head.appendChild(s);
  }

  function createSheet(){
    if($('#plannerV5Sheet'))return;document.body.insertAdjacentHTML('beforeend',`<div id="plannerV5Backdrop" class="planner-v5-backdrop"></div><section id="plannerV5Sheet" class="planner-v5-sheet"><div class="planner-v5-grab"></div><div class="planner-v5-head"><div><div id="plannerV5Kicker" class="planner-v5-kicker">OBIETTIVO</div><h2 id="plannerV5Title">Dettaglio</h2></div><button id="plannerV5Close" class="planner-v5-close">×</button></div><div id="plannerV5Body"></div></section>`);$('#plannerV5Backdrop').onclick=closeSheet;$('#plannerV5Close').onclick=closeSheet;
  }
  function openSheet(){document.body.classList.add('sheet-open');$('#plannerV5Backdrop').classList.add('is-open');$('#plannerV5Sheet').classList.add('is-open');}
  function closeSheet(){document.body.classList.remove('sheet-open');$('#plannerV5Backdrop')?.classList.remove('is-open');$('#plannerV5Sheet')?.classList.remove('is-open');}

  async function openGoal(id){
    const goals=await FinanceDB.getAll('goals'),g=goals.find(x=>String(x.id)===String(id));if(!g)return;const st=goalStats(g);$('#plannerV5Kicker').textContent='OBIETTIVO';$('#plannerV5Title').textContent=g.name;
    const cls=st.status==='Completato'||st.status==='In anticipo'?'good':st.status==='Da recuperare'?'warn':'';
    const tip=st.monthly?`Devi conservare circa <strong>${money(st.monthly)}</strong> al mese per raggiungere il tuo obiettivo.${st.weekly?` Sono circa ${money(st.weekly)} a settimana.`:''}`:(st.target?'Aggiungi una data obiettivo per calcolare il ritmo mensile.':'Definisci un importo target per ricevere una previsione.');
    $('#plannerV5Body').innerHTML=`<div class="planner-v5-status ${cls}">${esc(st.status)}</div><div class="planner-v5-big">${money(st.current)} <span>/ ${money(st.target)}</span></div><div class="planner-v5-progress"><i style="width:${st.pct}%"></i></div><div class="planner-v5-caption"><span>${Math.round(st.pct)}% completato</span><span>${esc(targetLabel(g))}</span></div><div class="planner-v5-grid"><div><small>Mancano</small><strong>${money(st.remaining)}</strong></div><div><small>Tempo</small><strong>${st.months?`${st.months} mesi`:'—'}</strong></div><div class="wide"><small>Quota mensile consigliata</small><strong>${st.monthly?money(st.monthly):'—'}</strong></div></div><div class="planner-v5-tip"><span>${icons.target}</span><p>${tip}</p></div><div class="planner-v5-update"><label>Importo già accantonato</label><div class="planner-v5-update-row"><input id="plannerGoalCurrent" type="number" min="0" step="0.01" value="${st.current.toFixed(2)}"><button id="plannerGoalSave">Aggiorna</button></div><small>Modifica solo il progresso dell’obiettivo, senza cambiare i saldi dei conti.</small></div>`;openSheet();
    $('#plannerGoalSave').onclick=async()=>{g.current=Math.max(0,+Number($('#plannerGoalCurrent').value||0).toFixed(2));g.completed=Number(g.target)>0&&g.current>=Number(g.target);await FinanceDB.put('goals',g);await enhanceGoals();if(norm(g.name).includes('tranquillita'))updateTranquility(g);await openGoal(g.id);};
  }

  async function openRate(name){
    const list=await FinanceDB.getAll('liabilities'),l=list.find(x=>norm(x.name)===norm(name));if(!l)return;const c=configFor(l.name),end=l.finalDueDate||l.recurrenceEnd||l.endDate||null,count=has(l,'installmentsRemaining')?Number(l.installmentsRemaining):null;$('#plannerV5Kicker').textContent='FINANZIAMENTO';$('#plannerV5Title').textContent=l.name;
    const next=l.nextDueDate?dateFmt.format(parse(l.nextDueDate)):'—',endText=end?monthFmt.format(parse(end)).replace('.',''):(l.finalPaymentDate?monthFmt.format(parse(l.finalPaymentDate)).replace('.',''):'Da definire');
    let tip=l.completed?'Finanziamento concluso. Non verranno generate altre rate.':(l.scheduleNote||c?.note||'');
    $('#plannerV5Body').innerHTML=`<div class="planner-v5-status ${l.completed?'good':''}">${l.completed?'Concluso':'Attivo'}</div><div class="planner-v5-big">${money(l.monthly||c?.monthly||0)} <span>/ mese</span></div><div class="planner-v5-grid"><div><small>Prossima rata</small><strong>${esc(next)}</strong></div><div><small>Fine prevista</small><strong>${esc(endText)}</strong></div>${count!=null?`<div><small>Rate rimaste</small><strong>${count}</strong></div>`:''}${l.remaining!=null?`<div><small>Residuo stimato</small><strong>${money(l.remaining)}</strong></div>`:''}${l.finalPayment?`<div class="wide"><small>Maxirata</small><strong>${money(l.finalPayment)}</strong></div>`:''}</div><div class="planner-v5-tip"><span>${icons.calendar}</span><p>${esc(tip)}</p></div>`;openSheet();
  }

  function updateTranquility(g){const target=Number(g.target||0),current=Number(g.current||0),p=target?Math.min(100,current/target*100):0;if($('#tranquilityPercent'))$('#tranquilityPercent').textContent=`${Math.round(p)}%`;if($('#tranquilityProgress'))$('#tranquilityProgress').style.width=`${p}%`;if($('#tranquilityText'))$('#tranquilityText').textContent=`${money(current)} / ${money(target)}`;}

  async function enhanceGoals(){
    const box=$('#goalsList');if(!box)return;const goals=await FinanceDB.getAll('goals');
    $$('#goalsList>div').forEach(row=>{const title=$('.row-between strong',row)?.textContent?.trim(),g=goals.find(x=>norm(x.name)===norm(title));if(!g)return;const st=goalStats(g);row.classList.add('planner-goal');row.dataset.goalId=g.id;let sym=$(':scope>.row-symbol',row);if(sym)sym.innerHTML=goalIcon(g.name);const subs=$$('.list-sub',row);if(subs[0])subs[0].textContent=g.target?`${money(g.current)} / ${money(g.target)} · ${targetLabel(g)}`:'Target da definire';let pr=$('.planner-goal-progress',row);if(!pr){pr=document.createElement('div');pr.className='planner-goal-progress';pr.innerHTML='<i></i>';row.appendChild(pr);}pr.querySelector('i').style.width=`${st.pct}%`;if(!$('.planner-goal-chevron',row)){const ch=document.createElement('span');ch.className='planner-goal-chevron';ch.innerHTML=icons.chevron;row.appendChild(ch);}if(!row.dataset.plannerBound){row.dataset.plannerBound='1';row.addEventListener('click',e=>{if(!e.target.closest('button,input'))openGoal(row.dataset.goalId);});}});
  }

  async function enhanceRates(){
    const box=$('#liabilitiesList');if(!box)return;const liabilities=await FinanceDB.getAll('liabilities');
    $$('#liabilitiesList .list-row').forEach(row=>{const title=$('.list-title',row)?.childNodes[0]?.textContent?.trim()||$('.list-title',row)?.textContent?.trim(),l=liabilities.find(x=>norm(x.name)===norm(title));if(!l)return;row.classList.add('interactive-row');const c=configFor(l.name),count=has(l,'installmentsRemaining')?Number(l.installmentsRemaining):null,end=l.finalDueDate||l.recurrenceEnd||null;let meta=$('.planner-rate-meta',row);if(!meta){meta=document.createElement('div');meta.className='list-sub planner-rate-meta';const main=row.children[1]||row.children[0];main?.appendChild(meta);}const bits=[];if(count!=null)bits.push(`${count} ${count===1?'rata rimasta':'rate rimaste'}`);if(end)bits.push(`termina ${monthFmt.format(parse(end)).replace('.','')}`);else if(l.finalPaymentDate)bits.push(`maxirata ${monthFmt.format(parse(l.finalPaymentDate)).replace('.','')}`);if(c?.key==='iphone'&&!l.completed)bits.push('estinzione da valutare');meta.textContent=bits.join(' · ');if(!row.dataset.plannerRateBound){row.dataset.plannerRateBound='1';row.addEventListener('click',e=>{if(!e.target.closest('button'))openRate(l.name);});}});
  }

  function watch(){['goalsList','liabilitiesList'].forEach(id=>{const el=$(`#${id}`);if(el)new MutationObserver(()=>setTimeout(()=>{enhanceGoals();enhanceRates();},0)).observe(el,{childList:true,subtree:true});});}

  document.addEventListener('DOMContentLoaded',()=>{injectStyles();createSheet();watch();setTimeout(()=>{enhanceGoals();enhanceRates();},90);});
})();
