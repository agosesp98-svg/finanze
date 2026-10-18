(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const dateFmt=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric'});
  const monthFmt=new Intl.DateTimeFormat('it-IT',{month:'short',year:'numeric'});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const parse=s=>s?new Date(`${s}T12:00:00`):null;
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today=()=>iso(new Date());
  const addMonth=s=>{const d=parse(s||today()),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));return iso(d)};
  const svg=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const icons={
    back:'<path d="m15 5-7 7 7 7"/>',plus:'<path d="M12 5v14M5 12h14"/>',card:'<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M3.5 9.5h17M7 15h4"/>',check:'<path d="m5 12 4.2 4.2L19 6.5"/>',chev:'<path d="m9 6 6 6-6 6"/>',calendar:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/>',edit:'<path d="M4 20h4l11-11-4-4L4 16v4ZM13.5 6.5l4 4"/>',wallet:'<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M15 10.5h5.5v4H15a2 2 0 0 1 0-4Z"/>'
  };
  let liabilities=[],accounts=[],commitments=[];

  function matchCommit(c,l){
    if(String(c.liabilityId||'')===String(l.id||''))return true;
    if(l.scheduleKey&&c.liabilityKey===l.scheduleKey)return true;
    return norm(c.name)===norm(l.name);
  }
  function progress(l){
    const total=Math.max(0,Number(l.installmentsTotal||0));
    let remaining=l.installmentsRemaining!=null?Math.max(0,Number(l.installmentsRemaining)):null;
    const completed=Math.max(0,Number(l.completedInstallments||0));
    if(total&&remaining==null)remaining=Math.max(0,total-completed);
    const paid=total?Math.max(0,total-Number(remaining||0)):completed;
    return{total,remaining,paid,pct:total?Math.max(0,Math.min(100,paid/total*100)):0};
  }
  function nextLiability(){
    return liabilities.filter(l=>!l.completed&&l.nextDueDate).sort((a,b)=>String(a.nextDueDate).localeCompare(String(b.nextDueDate)))[0]||null;
  }
  function summary(){
    const active=liabilities.filter(l=>!l.completed);
    const monthly=active.reduce((s,l)=>s+Number(l.monthly||0),0);
    const residual=active.reduce((s,l)=>s+(Number.isFinite(Number(l.remaining))?Number(l.remaining):0),0);
    return{active,monthly,residual,next:nextLiability()};
  }

  function ensurePlanEntry(){
    const plan=$('#view-plan');if(!plan||$('#v14RateEntry'))return;
    const first=plan.querySelector('.section-card');
    const entry=document.createElement('button');entry.id='v14RateEntry';entry.type='button';entry.className='v14-rate-entry';entry.setAttribute('data-open-rates','1');
    entry.innerHTML=`<span class="v14-rate-entry-icon">${svg(icons.card)}</span><span class="v14-rate-entry-copy"><small>RATE</small><strong>Rate e finanziamenti</strong><em id="v14RateEntryMeta">Gestisci pagamenti, scadenze e avanzamento</em></span><span class="v14-rate-entry-arrow">${svg(icons.chev)}</span>`;
    first?plan.insertBefore(entry,first):plan.appendChild(entry);
    const old=$('#liabilitiesList')?.closest('.section-card');if(old)old.classList.add('v14-old-finance-section');
  }

  function ensureView(){
    if($('#view-rates'))return;
    const plan=$('#view-plan');if(!plan)return;
    plan.insertAdjacentHTML('afterend',`<section id="view-rates" class="view v14-rates-view">
      <div class="v14-rates-head"><button id="v14Back" class="v14-icon-button" type="button" aria-label="Torna al piano">${svg(icons.back)}</button><div><small>PIANO</small><h2>Rate</h2></div><button id="v14NewRate" class="v14-new-button" type="button">${svg(icons.plus)}<span>Nuova</span></button></div>
      <section class="v14-rates-hero"><div><small>IMPEGNO MENSILE</small><strong id="v14Monthly">€ 0,00</strong><span>Somma delle rate attive</span></div><div class="v14-rates-orb">${svg(icons.card)}</div></section>
      <div class="v14-rate-stats"><div><small>ATTIVE</small><strong id="v14Active">0</strong></div><div><small>RESIDUO NOTO</small><strong id="v14Residual">€ 0,00</strong></div><div><small>PROSSIMA</small><strong id="v14Next">—</strong></div></div>
      <div class="v14-rates-section-head"><div><small>I TUOI PIANI</small><h3>Avanzamento</h3></div><span id="v14RateCount"></span></div>
      <div id="v14RatesList" class="v14-rates-list"></div>
    </section>`);
  }

  async function load(){
    [liabilities,accounts,commitments]=await Promise.all([FinanceDB.getAll('liabilities'),FinanceDB.getAll('accounts'),FinanceDB.getAll('commitments')]);
    liabilities.sort((a,b)=>(a.completed===b.completed?String(a.nextDueDate||'9999').localeCompare(String(b.nextDueDate||'9999')):(a.completed?1:-1)));
    render();
  }

  function render(){
    ensurePlanEntry();ensureView();
    const s=summary();
    $('#v14Monthly').textContent=money(s.monthly);$('#v14Active').textContent=String(s.active.length);$('#v14Residual').textContent=money(s.residual);
    $('#v14Next').textContent=s.next?.nextDueDate?dateFmt.format(parse(s.next.nextDueDate)).replace('.',''):'—';
    $('#v14RateCount').textContent=`${s.active.length} attive`;
    const em=$('#v14RateEntryMeta');if(em)em.textContent=s.active.length?`${money(s.monthly)}/mese · ${s.active.length} ${s.active.length===1?'piano attivo':'piani attivi'}`:'Nessuna rata attiva';
    const box=$('#v14RatesList');if(!box)return;
    if(!liabilities.length){box.innerHTML='<div class="v14-empty"><span>✓</span><strong>Nessuna rata</strong><p>Aggiungi un finanziamento o una rateizzazione per monitorarla qui.</p><button type="button" data-v14-new>Nuova rata</button></div>';return;}
    box.innerHTML=liabilities.map(l=>{
      const p=progress(l),activeCommit=commitments.find(c=>c.active&&matchCommit(c,l));
      const next=l.nextDueDate||activeCommit?.dueDate||'';const amount=Number(l.monthly||activeCommit?.amount||0);const end=l.finalDueDate||l.recurrenceEnd||l.endDate||'';
      const status=l.completed?'Concluso':(!next&&l.finalPayment?'Fase finale':'Attivo');
      const progressText=p.total?`${p.paid} di ${p.total} pagate`:(l.completed?'Completato':'Inserisci il numero di rate per vedere l’avanzamento');
      return `<article class="v14-rate-card ${l.completed?'is-completed':''}" data-v14-rate="${l.id}">
        <div class="v14-rate-top"><span class="v14-rate-icon">${svg(l.completed?icons.check:icons.card)}</span><div class="v14-rate-title"><span>${status}</span><h3>${esc(l.name||'Rateizzazione')}</h3></div><button class="v14-edit" type="button" data-v14-edit="${l.id}" aria-label="Modifica">${svg(icons.edit)}</button></div>
        <div class="v14-rate-money"><strong>${amount?money(amount):'—'}</strong><span>${amount?'/ mese':''}</span></div>
        <div class="v14-rate-progress-head"><span>Avanzamento</span><strong>${p.total?`${Math.round(p.pct)}%`:'—'}</strong></div>
        <div class="v14-rate-progress"><i style="width:${p.pct}%"></i></div>
        <div class="v14-rate-progress-copy"><span>${progressText}</span>${l.remaining!=null?`<strong>${money(l.remaining)} residui</strong>`:''}</div>
        <div class="v14-rate-meta"><div><small>Prossima rata</small><strong>${next?dateFmt.format(parse(next)).replace('.',''):'—'}</strong></div><div><small>Fine prevista</small><strong>${end?monthFmt.format(parse(end)).replace('.',''):'—'}</strong></div></div>
        ${l.finalPayment?`<div class="v14-balloon"><span>Pagamento finale</span><strong>${money(l.finalPayment)}</strong>${l.finalPaymentDate?`<small>${dateFmt.format(parse(l.finalPaymentDate)).replace('.','')}</small>`:''}</div>`:''}
        ${!l.completed?`<div class="v14-rate-actions"><button type="button" data-v14-pay="${l.id}">${svg(icons.check)} Segna rata pagata</button><button type="button" data-v14-edit="${l.id}">Dettagli</button></div>`:''}
      </article>`;
    }).join('');
  }

  function openRates(){
    $$('.view').forEach(v=>v.classList.remove('active'));$('#view-rates')?.classList.add('active');
    $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view==='plan'));
    const title=$('#pageTitle');if(title)title.textContent='Rate';window.scrollTo({top:0,behavior:'auto'});load();
  }
  function backPlan(){
    $$('.view').forEach(v=>v.classList.remove('active'));$('#view-plan')?.classList.add('active');
    $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view==='plan'));
    const title=$('#pageTitle');if(title)title.textContent='Piano';window.scrollTo({top:0,behavior:'auto'});
  }
  function openSheet(kicker,title,html){
    const body=$('#sheetBody'),sheet=$('#sheet'),back=$('#sheetBackdrop');if(!body||!sheet||!back)return;
    $('#sheetKicker').textContent=kicker;$('#sheetTitle').textContent=title;body.innerHTML=html;back.hidden=false;
    requestAnimationFrame(()=>{back.classList.add('open');sheet.classList.add('open');sheet.setAttribute('aria-hidden','false')});sheet.scrollTop=0;
  }
  function closeSheet(){const b=$('#sheetBackdrop'),s=$('#sheet');b?.classList.remove('open');s?.classList.remove('open');s?.setAttribute('aria-hidden','true');setTimeout(()=>{if(b)b.hidden=true},220)}
  function accountOptions(){return accounts.map(a=>`<option value="${a.id}">${esc(a.name)} — ${money(a.balance)}</option>`).join('')}

  function editForm(id=null){
    const l=id?liabilities.find(x=>String(x.id)===String(id)):null;
    openSheet(l?'MODIFICA RATA':'NUOVA RATA',l?.name||'Nuova rateizzazione',`<form id="v14RateForm" class="form v14-rate-form">
      <div class="field"><label>Nome</label><input id="v14Name" value="${esc(l?.name||'')}" placeholder="Es. Auto, telefono, elettrodomestico" required></div>
      <div class="form-row"><div class="field"><label>Rata mensile</label><input id="v14MonthlyInput" type="number" min="0" step="0.01" value="${l?.monthly!=null?Number(l.monthly).toFixed(2):''}" required></div><div class="field"><label>Prossima rata</label><input id="v14NextInput" type="date" value="${esc(l?.nextDueDate||'')}"></div></div>
      <div class="v14-form-section"><small>AVANZAMENTO</small><div class="form-row"><div class="field"><label>Rate totali</label><input id="v14TotalInput" type="number" min="0" step="1" value="${l?.installmentsTotal??''}"></div><div class="field"><label>Rate rimanenti</label><input id="v14RemainingCountInput" type="number" min="0" step="1" value="${l?.installmentsRemaining??''}"></div></div><div class="field"><label>Debito residuo</label><input id="v14ResidualInput" type="number" min="0" step="0.01" value="${l?.remaining!=null?Number(l.remaining).toFixed(2):''}" placeholder="Facoltativo"></div></div>
      <div class="v14-form-section"><small>FINE PIANO</small><div class="form-row"><div class="field"><label>Fine prevista</label><input id="v14EndInput" type="date" value="${esc(l?.finalDueDate||l?.recurrenceEnd||'')}"></div><div class="field"><label>Stato</label><select id="v14StatusInput"><option value="active" ${!l?.completed?'selected':''}>Attivo</option><option value="completed" ${l?.completed?'selected':''}>Concluso</option></select></div></div><div class="form-row"><div class="field"><label>Pagamento finale</label><input id="v14FinalInput" type="number" min="0" step="0.01" value="${l?.finalPayment?Number(l.finalPayment).toFixed(2):''}" placeholder="Facoltativo"></div><div class="field"><label>Data finale</label><input id="v14FinalDateInput" type="date" value="${esc(l?.finalPaymentDate||'')}"></div></div></div>
      <div class="field"><label>Nota</label><textarea id="v14NoteInput" rows="3" placeholder="Note sul finanziamento">${esc(l?.scheduleNote||l?.note||'')}</textarea></div>
      <div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Salva</button></div>
    </form>`);
    $('#v14RateForm').onsubmit=async e=>{e.preventDefault();await saveRate(l)};
  }

  async function saveRate(existing){
    const totalRaw=$('#v14TotalInput').value,remainRaw=$('#v14RemainingCountInput').value,resRaw=$('#v14ResidualInput').value,finalRaw=$('#v14FinalInput').value;
    const l=existing?{...existing}:{recurrence:'monthly',completedInstallments:0};
    l.name=$('#v14Name').value.trim();l.monthly=Number($('#v14MonthlyInput').value||0);l.nextDueDate=$('#v14NextInput').value||null;l.recurrence='monthly';
    l.installmentsTotal=totalRaw===''?null:Math.max(0,Number(totalRaw));l.installmentsRemaining=remainRaw===''?null:Math.max(0,Number(remainRaw));
    l.remaining=resRaw===''?null:Math.max(0,Number(resRaw));l.finalDueDate=$('#v14EndInput').value||null;l.recurrenceEnd=l.finalDueDate;
    l.finalPayment=finalRaw===''?null:Math.max(0,Number(finalRaw));l.finalPaymentDate=$('#v14FinalDateInput').value||null;l.completed=$('#v14StatusInput').value==='completed';l.scheduleNote=$('#v14NoteInput').value.trim();
    if(!l.name||l.monthly<0)return;
    if(existing){await FinanceDB.put('liabilities',l)}else{l.id=await FinanceDB.add('liabilities',l);l.scheduleKey=l.scheduleKey||`liability-${l.id}`;await FinanceDB.put('liabilities',l)}
    await syncCommitment(l);
    sessionStorage.setItem('finanze-open-rates','1');closeSheet();setTimeout(()=>location.reload(),180);
  }

  async function syncCommitment(l){
    const matches=commitments.filter(c=>c.active&&matchCommit(c,l));
    if(l.completed||!l.nextDueDate||Number(l.monthly||0)<=0){for(const c of matches){c.active=false;c.cancelled=true;await FinanceDB.put('commitments',c)}return;}
    const c=matches[0]||{name:l.name,active:true,cadence:'Mensile',estimated:false,recurring:true,note:'Rata collegata al piano'};
    c.name=l.name;c.amount=Number(l.monthly);c.dueDate=l.nextDueDate;c.liabilityId=l.id;c.liabilityKey=l.scheduleKey||c.liabilityKey||`liability-${l.id}`;c.active=true;c.recurring=true;
    if(c.id)await FinanceDB.put('commitments',c);else{c.id=await FinanceDB.add('commitments',c)}
    for(const extra of matches.slice(1)){extra.active=false;extra.cancelled=true;await FinanceDB.put('commitments',extra)}
  }

  function paymentForm(id){
    const l=liabilities.find(x=>String(x.id)===String(id));if(!l)return;if(!accounts.length){alert('Aggiungi prima un conto.');return;}
    const active=commitments.find(c=>c.active&&matchCommit(c,l));const amount=Number(active?.amount||l.monthly||0);
    openSheet('PAGAMENTO',l.name,`<form id="v14PayForm" class="form v14-rate-form"><div class="v14-pay-hero"><small>RATA DA REGISTRARE</small><strong>${money(amount)}</strong><span>${l.nextDueDate?`Scadenza ${dateFmt.format(parse(l.nextDueDate)).replace('.','')}`:'Pagamento corrente'}</span></div><div class="field"><label>Importo pagato</label><input id="v14PayAmount" type="number" min="0.01" step="0.01" value="${amount.toFixed(2)}" required></div><div class="field"><label>Conto</label><select id="v14PayAccount">${accountOptions()}</select></div><div class="field"><label>Data</label><input id="v14PayDate" type="date" value="${today()}" required></div><div class="form-actions"><button type="button" class="secondary-button" data-close="sheet">Annulla</button><button class="primary-button">Registra pagamento</button></div></form>`);
    $('#v14PayForm').onsubmit=async e=>{e.preventDefault();await registerPayment(l,active)};
  }

  async function registerPayment(l,activeCommit){
    const amount=Number($('#v14PayAmount').value),account=accounts.find(a=>String(a.id)===String($('#v14PayAccount').value)),date=$('#v14PayDate').value;
    if(!account||amount<=0)return;if(Number(account.balance||0)<amount){alert('Saldo insufficiente sul conto selezionato.');return;}
    account.balance=Number(account.balance||0)-amount;await FinanceDB.put('accounts',account);
    await FinanceDB.add('movements',{type:'expense',date,title:l.name,amount,accountId:account.id,category:'Rata',liabilityId:l.id});
    if(activeCommit){activeCommit.active=false;activeCommit.paidDate=date;activeCommit.paidAmount=amount;activeCommit.liabilityId=l.id;await FinanceDB.put('commitments',activeCommit)}
    if(l.remaining!=null&&Number.isFinite(Number(l.remaining)))l.remaining=Math.max(0,+(Number(l.remaining)-amount).toFixed(2));
    if(l.installmentsRemaining!=null)l.installmentsRemaining=Math.max(0,Number(l.installmentsRemaining)-1);
    l.completedInstallments=Number(l.completedInstallments||0)+1;
    const base=l.nextDueDate||activeCommit?.dueDate||date,next=addMonth(base),end=l.finalDueDate||l.recurrenceEnd||null;
    const stopByCount=l.installmentsRemaining!=null&&Number(l.installmentsRemaining)<=0;const stopByDate=end&&next>end;
    if(stopByCount||stopByDate){l.nextDueDate=null;l.completed=!Number(l.finalPayment||0)}else l.nextDueDate=next;
    await FinanceDB.put('liabilities',l);
    if(!l.completed&&l.nextDueDate)await syncCommitment(l);
    sessionStorage.setItem('finanze-open-rates','1');closeSheet();setTimeout(()=>location.reload(),180);
  }

  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-open-rates]');if(open){e.preventDefault();e.stopPropagation();openRates();return}
    if(e.target.closest('#v14Back')){e.preventDefault();backPlan();return}
    if(e.target.closest('#v14NewRate')||e.target.closest('[data-v14-new]')){e.preventDefault();editForm();return}
    const edit=e.target.closest('[data-v14-edit]');if(edit){e.preventDefault();e.stopPropagation();editForm(edit.dataset.v14Edit);return}
    const pay=e.target.closest('[data-v14-pay]');if(pay){e.preventDefault();e.stopPropagation();paymentForm(pay.dataset.v14Pay);return}
  },true);

  document.addEventListener('DOMContentLoaded',()=>{ensurePlanEntry();ensureView();load().then(()=>{if(sessionStorage.getItem('finanze-open-rates')==='1'){sessionStorage.removeItem('finanze-open-rates');setTimeout(openRates,180)}});setTimeout(load,700)});
})();