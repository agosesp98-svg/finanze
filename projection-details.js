(()=>{
  const STORES=['accounts','budgets','commitments','expectedIncomes','goals','liabilities','movements','settings'];
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm=FinanceEngine.norm;
  const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(v||0));
  const money0=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));
  const monthLabel=key=>new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date(`${key}-01T12:00:00`));
  const monthKey=v=>String(v||'').slice(0,7);
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
    `;document.head.appendChild(style);
  }

  async function snapshot(){
    const values=await Promise.all(STORES.map(s=>FinanceDB.getAll(s)));
    return Object.fromEntries(STORES.map((s,i)=>[s,values[i]||[]]));
  }

  function recurringItems(commitments=[]){
    const map=new Map();
    for(const c of commitments){
      if(c.liabilityId||c.liabilityKey)continue;
      const cadence=norm(c.cadence);
      if(!(c.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman')))continue;
      const key=norm(c.name);if(!key)continue;
      const old=map.get(key);
      if(!old||String(c.dueDate||'')>String(old.dueDate||''))map.set(key,c);
    }
    return [...map.values()];
  }

  function breakdownForMonth(s,key){
    const rates=s.liabilities.filter(l=>{
      if(l.completed||Number(l.monthly||0)<=0)return false;
      let start='';
      if(l.firstDueDate)start=monthKey(l.firstDueDate);
      else if(Number(l.completedInstallments||0)<=0&&l.nextDueDate)start=monthKey(l.nextDueDate);
      const end=monthKey(l.recurrenceEnd||l.finalDueDate||'');
      if(start&&key<start)return false;
      if(end&&key>end)return false;
      return true;
    }).map(l=>({name:l.name,amount:Number(l.monthly||0)}));
    const recurring=recurringItems(s.commitments)
      .filter(c=>!c.firstDueDate||key>=monthKey(c.firstDueDate))
      .map(c=>({name:c.name,amount:FinanceEngine.monthlyEquivalent(c)}));
    const rateTotal=rates.reduce((sum,x)=>sum+x.amount,0),recurringTotal=recurring.reduce((sum,x)=>sum+x.amount,0);
    return{rates,recurring,rateTotal,recurringTotal,total:rateTotal+recurringTotal};
  }

  function rows(items){
    return items.length?`<div class="allocation-list">${items.map(x=>`<div class="allocation-row"><span>${esc(x.name)}</span><strong>${money(x.amount)}</strong></div>`).join('')}</div>`:'<div class="empty">Nessuna voce in questo mese.</div>';
  }

  async function openMonth(key){
    const s=await snapshot(),b=breakdownForMonth(s,key),projection=FinanceEngine.projection(s,12),p=projection.find(x=>x.month===key);
    const title=monthLabel(key);$('#sheetTitle').textContent=title.charAt(0).toUpperCase()+title.slice(1);
    $('#sheetBody').innerHTML=`
      <div class="projection-detail-total">
        <div class="kpi"><small>Totale fisso</small><strong>${money(b.total)}</strong></div>
        <div class="kpi"><small>Margine obiettivi</small><strong>${p?money(p.capacity):'—'}</strong></div>
      </div>
      <div class="sheet-section"><h3>Rate · ${money(b.rateTotal)}</h3>${rows(b.rates)}</div>
      <div class="sheet-section"><h3>Abbonamenti e ricorrenti · ${money(b.recurringTotal)}</h3>${rows(b.recurring)}</div>
      <div class="sheet-section"><h3>Riepilogo</h3><div class="allocation-list"><div class="allocation-row"><span>Rate</span><strong>${money(b.rateTotal)}</strong></div><div class="allocation-row"><span>Abbonamenti e ricorrenti</span><strong>${money(b.recurringTotal)}</strong></div><div class="allocation-row fixed"><span>Totale fisso</span><strong>${money(b.total)}</strong></div>${p?`<div class="allocation-row fixed"><span>Margine per obiettivi</span><strong>${money(p.capacity)}</strong></div>`:''}</div></div>`;
    $('#sheetBackdrop').classList.add('open');$('#sheet').classList.add('open');$('#sheet').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
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
