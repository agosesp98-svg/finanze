(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n||0));
  const parse=s=>s?new Date(`${s}T12:00:00`):null;
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const addMonth=s=>{const d=parse(s),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const monthsUntil=s=>{if(!s)return null;const a=new Date(),b=parse(s);let m=(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth());if(b.getDate()>a.getDate())m+=1;return Math.max(1,m)};
  let busy=false;

  function monthlyEquivalent(c){
    const cadence=norm(c.cadence);
    const amount=Number(c.amount||0);
    if(cadence.includes('14 giorni'))return amount*26/12;
    if(cadence.includes('settiman'))return amount*52/12;
    if(cadence.includes('mensil'))return amount;
    return 0;
  }

  async function ensureRecurring(){
    if(typeof FinanceDB==='undefined')return;
    const rows=await FinanceDB.getAll('commitments');
    const groups=new Map();
    rows.filter(c=>c.recurring===true&&!c.liabilityKey).forEach(c=>{
      const key=norm(c.name);if(!key)return;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);
    });
    const horizon=addDays(today(),45);
    for(const group of groups.values()){
      group.sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')));
      const latest=group[group.length-1];
      if(!latest?.dueDate||latest.active)continue;
      const cadence=norm(latest.cadence);
      let next=latest.dueDate;
      const advance=()=>cadence.includes('14 giorni')?addDays(next,14):cadence.includes('mensil')?addMonth(next):null;
      next=advance();
      if(!next)continue;
      while(next<=today()){
        const n=advance();if(!n||n===next)break;next=n;
      }
      if(next>horizon)continue;
      if(group.some(x=>x.active&&x.dueDate===next))continue;
      const copy={...latest};delete copy.id;delete copy.paidDate;delete copy.paidAmount;
      copy.dueDate=next;copy.active=true;copy.estimated=false;copy.generated=true;copy.note=copy.note||'Scadenza ricorrente generata automaticamente';
      await FinanceDB.add('commitments',copy);
    }
  }

  function ensureCard(){
    if($('#v31MonthlyPlan'))return;
    const view=$('#view-plan'),head=$('.section-head-page',view);if(!view||!head)return;
    head.insertAdjacentHTML('afterend',`<section id="v31MonthlyPlan" class="v31-plan" aria-live="polite">
      <div class="v31-plan-head"><div><small>PIANO MENSILE</small><h2>Stipendio → spese → obiettivi</h2></div><span id="v31PlanStatus">—</span></div>
      <div class="v31-plan-grid"><div><small>STIPENDIO</small><strong id="v31Salary">—</strong></div><div><small>RATE + RICORRENTI</small><strong id="v31Fixed">—</strong></div><div><small>BUDGET TARGET</small><strong id="v31Budget">—</strong></div><div class="wide"><small>CAPACITÀ PER OBIETTIVI</small><strong id="v31Capacity">—</strong></div></div>
      <div id="v31GoalRows" class="v31-goals"></div>
      <div id="v31Gap" class="v31-gap"></div>
    </section>`);
  }

  async function render(){
    if(busy||typeof FinanceDB==='undefined')return;busy=true;
    try{
      ensureCard();if(!$('#v31MonthlyPlan'))return;
      const [settings,budgets,liabilities,commitments,goals,expected]=await Promise.all([
        FinanceDB.getAll('settings'),FinanceDB.getAll('budgets'),FinanceDB.getAll('liabilities'),FinanceDB.getAll('commitments'),FinanceDB.getAll('goals'),FinanceDB.getAll('expectedIncomes')
      ]);
      const salary=Number(settings.find(x=>x.key==='salaryNet')?.value||0);
      const budgetTarget=budgets.reduce((s,b)=>s+Number(b.targetBudget??b.budget??0),0);
      const liabilityMonthly=liabilities.filter(l=>!l.completed&&Number(l.monthly||0)>0).reduce((s,l)=>s+Number(l.monthly||0),0);
      const groups=new Map();
      commitments.filter(c=>c.recurring===true&&!c.liabilityKey).forEach(c=>{const k=norm(c.name);if(!k)return;const old=groups.get(k);if(!old||String(c.dueDate||'')>String(old.dueDate||''))groups.set(k,c)});
      const recurringMonthly=[...groups.values()].reduce((s,c)=>s+monthlyEquivalent(c),0);
      const fixed=liabilityMonthly+recurringMonthly;
      const capacity=Math.max(0,salary-fixed-budgetTarget);
      const activeGoals=goals.filter(g=>!g.completed&&Number(g.target||0)>Number(g.current||0));
      const goalRows=activeGoals.map(g=>{
        const remaining=Math.max(0,Number(g.target||0)-Number(g.current||0));
        const months=monthsUntil(g.targetDate);
        const need=months?remaining/months:null;
        return{g,remaining,months,need};
      });
      const required=goalRows.reduce((s,x)=>s+Number(x.need||0),0);
      const gap=Math.max(0,required-capacity);
      const extra=expected.filter(x=>x.status==='Atteso').reduce((s,x)=>s+Number(x.min||0),0);

      $('#v31Salary').textContent=salary?money(salary):'Da impostare';
      $('#v31Fixed').textContent=money(fixed);
      $('#v31Budget').textContent=money(budgetTarget);
      $('#v31Capacity').textContent=salary?money(capacity):'—';
      const status=$('#v31PlanStatus');
      if(status){status.textContent=!salary?'Imposta stipendio':gap>0?'Da correggere':'Sostenibile';status.classList.toggle('danger',gap>0);status.classList.toggle('good',salary>0&&gap===0)}
      const rows=$('#v31GoalRows');
      rows.innerHTML=goalRows.length?goalRows.map(x=>`<div><span><b>${String(x.g.name||'Obiettivo').replace(/[&<>]/g,'')}</b><small>${x.months?`${money(x.remaining)} da coprire · ${x.months} mesi`:`${money(x.remaining)} da coprire · senza scadenza`}</small></span><strong>${x.need?`${money(x.need)}/mese`:'—'}</strong></div>`).join(''):'<p>Nessun obiettivo attivo.</p>';
      const gapEl=$('#v31Gap');
      if(!salary){gapEl.innerHTML='<strong>Manca lo stipendio mensile</strong><span>Importalo nel backup o impostalo nel piano per valutare la sostenibilità.</span>';gapEl.className='v31-gap danger';}
      else if(gap>0){gapEl.innerHTML=`<strong>Mancano ${money(gap)}/mese per rispettare tutte le scadenze degli obiettivi</strong><span>Le entrate extra attese (${money(extra)}) possono ridurre il divario, ma non vengono trattate come stipendio ricorrente.</span>`;gapEl.className='v31-gap danger';}
      else{gapEl.innerHTML=`<strong>Il piano mensile copre gli obiettivi datati</strong><span>Le entrate extra attese (${money(extra)}) restano acceleratori e non aumentano il budget ordinario.</span>`;gapEl.className='v31-gap good';}
    }catch(e){console.warn('Planner V31',e)}finally{busy=false}
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    try{await ensureRecurring()}catch(e){console.warn('Recurring V31',e)}
    setTimeout(render,450);setTimeout(render,1300);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
  });
})();
