(()=>{
  const STORES=['accounts','budgets','commitments','expectedIncomes','goals','liabilities','movements','settings'];
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(v||0));
  const monthLabel=key=>new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date(`${key}-01T12:00:00`));
  let enhanceTimer=null;

  function injectStyle(){
    if($('#projectionDetailsStyle'))return;
    const style=document.createElement('style');style.id='projectionDetailsStyle';style.textContent=`
      .projection-row[data-projection-month]{position:relative;padding-right:38px;cursor:pointer;user-select:none;-webkit-user-select:none}
      .projection-row[data-projection-month]::after{content:'›';position:absolute;right:15px;top:50%;transform:translateY(-50%);font-size:25px;line-height:1;color:var(--tertiary);transition:transform .28s var(--spring),color .2s var(--ease)}
      .projection-row[data-projection-month]:active::after{transform:translate(2px,-50%);color:var(--blue)}
      .projection-row[data-projection-month]:focus-visible{outline:3px solid color-mix(in srgb,var(--blue) 55%,transparent);outline-offset:3px}
      .projection-detail-total{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
      .projection-detail-total .kpi{min-width:0}
      .projection-detail-total .kpi strong{font-size:22px}
      .projection-cycle-caption{font-size:13px;line-height:1.5;color:var(--secondary);margin:4px 0 14px}
      .projection-detail-item{align-items:center;gap:10px}
      .projection-detail-item span{display:block;min-width:0;flex:1;overflow-wrap:anywhere}
      .projection-detail-item strong{flex:none;text-align:right;white-space:nowrap}
      .projection-detail-date{display:block;margin-top:4px;font-size:11px;line-height:1.35;color:var(--secondary);font-weight:500}
      .projection-detail-note{font-size:12px;line-height:1.55;color:var(--secondary);padding:1px 3px 12px}
      .projection-loan-warning{background:var(--orange-soft);color:var(--orange);font-size:12px;line-height:1.5;border-radius:14px;padding:12px}
      .projection-loan-link{width:100%;margin-bottom:10px}
      .loan-audit p{margin:0 0 11px;font-size:12px;line-height:1.55;color:var(--secondary)}
      .loan-audit-list{border-top:1px solid var(--separator)}
      .loan-audit-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--separator);padding:12px 0;min-width:0}
      .loan-audit-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
      .loan-audit-copy strong{font-size:14px;overflow-wrap:anywhere}
      .loan-audit-copy span{font-size:12px;color:var(--secondary);overflow-wrap:anywhere;line-height:1.35}
      .loan-audit-copy small{font-size:11px;color:var(--tertiary);overflow-wrap:anywhere;line-height:1.35}
      .loan-audit-check .loan-audit-state{font-weight:690;color:var(--orange)}
      .loan-audit-edit{flex:0 0 auto;min-height:36px;padding:6px 10px;font-size:12px;border-radius:10px}
      .loan-audit-archived{padding-top:12px;font-size:12px}
      .loan-audit-archived summary{cursor:pointer;padding:6px 0;color:var(--secondary);font-weight:700}
      .loan-audit-archived .loan-audit-list{margin-top:8px}
    
    
    `;document.head.appendChild(style);
  }

  async function snapshot(){
    const values=await Promise.all(STORES.map(s=>FinanceDB.getAll(s)));
    return Object.fromEntries(STORES.map((s,i)=>[s,values[i]||[]]));
  }

  const dateLabel=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return 'Data da verificare';
    return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value+'T12:00:00'));
  };
  function rows(items){
    return items.length?'<div class="allocation-list">'+items.map(x=>
      '<div class="allocation-row projection-detail-item"><span>'+esc(x.name)+
      (x.date?'<small class="projection-detail-date">'+esc(dateLabel(x.date))+
      (x.projected?' · prevista':'')+(x.estimated?' · stimata':'')+'</small>':'')+
      (x.fundedByGoal?'<small class="projection-detail-date">Coperta da obiettivo, non sottratta due volte</small>':'')+
      '</span><strong>'+money(x.amount)+'</strong></div>').join('')+'</div>'
      :'<div class="empty">Nessuna voce in questo ciclo.</div>';
  }
  function totalBox(name,amount,items){
    return '<div class="sheet-section"><h3>'+esc(name)+' · '+money(amount)+'</h3>'+rows(items)+'</div>';
  }
  function auditLoans(list){
    if(!list.length)return '';
    const current=list.filter(x=>!x.archived);
    const archived=list.filter(x=>x.archived);
    function cards(loans){
      return loans.map(l=>{
        const dates=[l.nextDueDate?'Prossima: '+dateLabel(l.nextDueDate):'Prossima: non impostata',
          l.finalDueDate?'Fine rate: '+dateLabel(l.finalDueDate):''];
        const due=l.due.map(d=>dateLabel(d.date)+' · '+money(d.amount)).join(', ');
        return '<div class="loan-audit-row'+(l.suspected?' loan-audit-check':'')+'">'+
          '<div class="loan-audit-copy"><strong>'+esc(l.name)+'</strong>'+
          '<span class="loan-audit-state">'+esc(l.reason)+'</span>'+
          '<small>'+esc(dates.filter(Boolean).join(' · '))+'</small>'+
          (due?'<small>Conteggiate: '+esc(due)+'</small>':'')+
          '</div><button class="secondary-button loan-audit-edit" type="button" data-liability="'+esc(l.id)+'" aria-label="Modifica '+esc(l.name)+'">Modifica</button></div>';
      }).join('');
    }
    return '<div class="sheet-section loan-audit">'+
      '<h3>Verifica tutti i finanziamenti</h3>'+
      '<p>Qui trovi anche le rate escluse. Se manca una rata, controlla lo stato e la prossima scadenza del finanziamento; non verrà aggiunta automaticamente.</p>'+
      (current.length?'<div class="loan-audit-list">'+cards(current)+'</div>':'<p>Nessun finanziamento attivo registrato.</p>')+
      (archived.length?'<details class="loan-audit-archived"><summary>Finanziamenti archiviati ('+archived.length+')</summary><div class="loan-audit-list">'+cards(archived)+'</div></details>':'')+
      '</div>';
  }

  async function openMonth(key){
    try{
      const s=await snapshot(),b=FinanceEngine.monthBreakdown(s,key),title=monthLabel(key);
      const loans=FinanceEngine.loanCycleAudit(s,key);
      const end=new Date(b.cycleEnd+'T12:00:00');end.setDate(end.getDate()-1);
      const endDay=FinanceEngine.iso(end);
      const openLoans='<button class="secondary-button projection-loan-link" type="button" data-jump-loans>Controlla le rate e le scadenze</button>';
      const staleLoanAlerts=(s.liabilities||[]).filter(l=>!l.archived&&!l.completed&&
        Number(l.monthly||0)>0&&l.nextDueDate&&l.nextDueDate<b.cycleStart);
      const pendingLoanAlert=(s.liabilities||[]).filter(l=>!l.archived&&
        (l.completed||l.monthlyPhaseComplete||!Number(l.monthly||0))&&
        (l.nextDueDate||l.finalPaymentDate||l.finalDueDate||'')>=b.cycleStart&&
        (l.nextDueDate||l.finalPaymentDate||l.finalDueDate||'')<b.cycleEnd);
      $('#sheetTitle').textContent=title.charAt(0).toUpperCase()+title.slice(1);
      $('#sheetBody').innerHTML=
        '<p class="projection-cycle-caption">Ciclo stipendio: <b>'+esc(dateLabel(b.cycleStart))+
        ' – '+esc(dateLabel(endDay))+'</b></p>'+
        '<div class="projection-detail-total">'+
          '<div class="kpi"><small>Stipendio</small><strong>'+money(b.salaryNet)+'</strong></div>'+
          '<div class="kpi"><small>Margine obiettivi</small><strong>'+money(b.capacity)+'</strong></div>'+
        '</div>'+
        totalBox('Budget per vivere',b.budgetTotal,b.budgetItems)+
        totalBox('Rate e finanziamenti',b.rateTotal,b.rateItems)+
        totalBox('Abbonamenti e ricorrenti',b.recurringTotal,b.recurringItems)+
        (b.oneOffItems.length?totalBox('Spese una tantum',b.oneOffTotal,b.oneOffItems):'')+
        (b.overdueItems.length?totalBox('Arretrati ancora da pagare',b.overdueTotal,b.overdueItems):'')+
        (pendingLoanAlert.length?'<p class="projection-loan-warning">Verifica questi finanziamenti: '+
          pendingLoanAlert.map(l=>esc(l.name)).join(', ')+
          '. Potrebbero essere contrassegnati come conclusi o con rata disattivata.</p>':'')+
        (staleLoanAlerts.length?'<p class="projection-loan-warning">Le prossime rate memorizzate per '+
          staleLoanAlerts.map(l=>esc(l.name)).join(', ')+
          ' risalgono a un ciclo precedente. Controlla le date e i pagamenti: le rate future mostrate possono essere previsioni.</p>':'')+
        '<div class="sheet-section"><h3>Riepilogo del ciclo</h3><div class="allocation-list">'+
          '<div class="allocation-row"><span>Stipendio previsto</span><strong>'+money(b.salaryNet)+'</strong></div>'+
          '<div class="allocation-row"><span>Budget di vivibilità</span><strong>− '+money(b.budgetTotal)+'</strong></div>'+
          '<div class="allocation-row"><span>Rate</span><strong>− '+money(b.rateTotal)+'</strong></div>'+
          '<div class="allocation-row"><span>Abbonamenti</span><strong>− '+money(b.recurringTotal)+'</strong></div>'+
          '<div class="allocation-row"><span>Una tantum</span><strong>− '+money(b.oneOffTotal)+'</strong></div>'+
          (b.overdueTotal?'<div class="allocation-row"><span>Arretrati</span><strong>− '+money(b.overdueTotal)+'</strong></div>':'')+
          '<div class="allocation-row fixed"><span>Totale da coprire</span><strong>'+money(b.plannedOutflow)+'</strong></div>'+
          '<div class="allocation-row fixed"><span>Margine per gli obiettivi</span><strong>'+money(b.capacity)+'</strong></div>'+
        '</div></div>'+
        '<p class="projection-detail-note">Sono considerate le rate con scadenza nel ciclo stipendio; quelle già segnate come pagate sono escluse. Le scadenze previste sono indicate come tali. Il giorno successivo alla fine del ciclo rientra nel successivo.</p>'+
        auditLoans(loans)+openLoans;
      $('#sheetBackdrop').classList.add('open');
      $('#sheet').classList.add('open');
      $('#sheet').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    }catch(err){console.error('Projection month detail',err);const toast=$('#toast');if(toast){toast.textContent='Impossibile aprire il dettaglio: '+(err.message||'errore');toast.classList.add('show')}}
  }

  async function enhance(){
    try{
      const host=$('#projectionList');if(!host)return;
      const s=await snapshot(),projection=FinanceEngine.projection(s,6),list=$$('.projection-row',host);
      list.forEach((row,i)=>{const p=projection[i];if(!p)return;row.dataset.projectionMonth=p.month;row.setAttribute('role','button');row.setAttribute('tabindex','0');row.setAttribute('aria-label',`Apri dettaglio di ${monthLabel(p.month)}`)});
    }catch(err){console.error('Projection details',err)}
  }
  function schedule(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,40)}

  document.addEventListener('click',e=>{const row=e.target.closest('[data-projection-month]');if(row)openMonth(row.dataset.projectionMonth)});
  document.addEventListener('keydown',e=>{const row=e.target.closest?.('[data-projection-month]');if(!row)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();openMonth(row.dataset.projectionMonth)}});
  const host=$('#projectionList');if(host)new MutationObserver(schedule).observe(host,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{injectStyle();schedule()});
  injectStyle();schedule();
})();
