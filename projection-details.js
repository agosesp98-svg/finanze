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
    `;document.head.appendChild(style);
  }

  async function snapshot(){
    const values=await Promise.all(STORES.map(s=>FinanceDB.getAll(s)));
    return Object.fromEntries(STORES.map((s,i)=>[s,values[i]||[]]));
  }

  function rows(items){
    return items.length?`<div class="allocation-list">${items.map(x=>`<div class="allocation-row"><span>${esc(x.name)}</span><strong>${money(x.amount)}</strong></div>`).join('')}</div>`:'<div class="empty">Nessuna voce in questo mese.</div>';
  }

  async function openMonth(key){
    const s=await snapshot(),b=FinanceEngine.monthBreakdown(s,key),title=monthLabel(key);
    $('#sheetTitle').textContent=title.charAt(0).toUpperCase()+title.slice(1);
    $('#sheetBody').innerHTML=`
      <div class="projection-detail-total">
        <div class="kpi"><small>Stipendio</small><strong>${money(b.salaryNet)}</strong></div>
        <div class="kpi"><small>Margine obiettivi</small><strong>${money(b.capacity)}</strong></div>
      </div>
      <div class="sheet-section"><h3>Budget mensili · ${money(b.budgetTotal)}</h3>${rows(b.budgetItems)}</div>
      <div class="sheet-section"><h3>Rate · ${money(b.rateTotal)}</h3>${rows(b.rateItems)}</div>
      <div class="sheet-section"><h3>Abbonamenti e ricorrenti · ${money(b.recurringTotal)}</h3>${rows(b.recurringItems)}</div>
      <div class="sheet-section"><h3>Riepilogo del mese</h3><div class="allocation-list">
        <div class="allocation-row"><span>Stipendio</span><strong>${money(b.salaryNet)}</strong></div>
        <div class="allocation-row"><span>Budget mensili</span><strong>− ${money(b.budgetTotal)}</strong></div>
        <div class="allocation-row"><span>Rate</span><strong>− ${money(b.rateTotal)}</strong></div>
        <div class="allocation-row"><span>Abbonamenti e ricorrenti</span><strong>− ${money(b.recurringTotal)}</strong></div>
        <div class="allocation-row fixed"><span>Totale pianificato</span><strong>${money(b.plannedOutflow)}</strong></div>
        <div class="allocation-row fixed"><span>Margine per obiettivi</span><strong>${money(b.capacity)}</strong></div>
      </div></div>`;
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
