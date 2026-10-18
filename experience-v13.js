(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const shortDate=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long'});
  const parse=s=>new Date(`${s}T12:00:00`);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today=()=>iso(new Date());
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let snapshot=null,timer=null,busy=false;

  function fallbackSalaryDate(){
    const n=new Date();
    let y=n.getFullYear(),m=n.getMonth();
    if(n.getDate()>10){m+=1;if(m>11){m=0;y+=1}}
    return `${y}-${String(m+1).padStart(2,'0')}-10`;
  }

  function liabilityMatchesCommitment(l,c){
    if(String(c.liabilityId||'')&&String(c.liabilityId||'')===String(l.id||''))return true;
    if(l.scheduleKey&&c.liabilityKey&&String(l.scheduleKey)===String(c.liabilityKey))return true;
    const ln=norm(l.name),cn=norm(c.name);
    return !!ln&&ln===cn;
  }

  async function loadSnapshot(){
    if(busy)return snapshot;
    busy=true;
    try{
      const [accounts,budgets,commitments,liabilities,settings]=await Promise.all([
        FinanceDB.getAll('accounts'),FinanceDB.getAll('budgets'),FinanceDB.getAll('commitments'),FinanceDB.getAll('liabilities'),FinanceDB.getAll('settings')
      ]);
      const setting=settings.find(x=>x.key==='nextSalaryDate')?.value;
      const salary=(setting&&setting>=today())?setting:fallbackSalaryDate();
      const ordinaryAccounts=accounts.filter(a=>!a.protected).map(a=>({name:a.name||'Conto',balance:Number(a.balance||0)}));
      const ordinary=ordinaryAccounts.reduce((s,a)=>s+a.balance,0);
      const protectedAmount=accounts.filter(a=>a.protected).reduce((s,a)=>s+Number(a.balance||0),0);
      const remainingCategories=budgets.map(b=>({name:b.name||'Categoria',remaining:Math.max(0,Number(b.budget||0)-Number(b.spent||0)),budget:Number(b.budget||0),spent:Number(b.spent||0)}));
      const remainingBudget=remainingCategories.reduce((s,b)=>s+b.remaining,0);

      const dueCommitments=commitments
        .filter(c=>c.active&&c.dueDate&&c.dueDate<=salary)
        .map(c=>({name:c.name||'Scadenza',amount:Number(c.amount||0),date:c.dueDate,source:'commitment',raw:c}));

      const uncoveredRates=liabilities
        .filter(l=>!l.completed&&l.nextDueDate&&l.nextDueDate<=salary&&Number(l.monthly||0)>0)
        .filter(l=>!dueCommitments.some(x=>liabilityMatchesCommitment(l,x.raw)))
        .map(l=>({name:l.name||'Rata',amount:Number(l.monthly||0),date:l.nextDueDate,source:'liability',raw:l}));

      const dueItems=[...dueCommitments,...uncoveredRates].filter(x=>x.amount>0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      const dueBeforeSalary=dueItems.reduce((s,c)=>s+c.amount,0);
      const rawAfterBills=ordinary-dueBeforeSalary;
      const shortfall=Math.max(0,-rawAfterBills);
      const afterBills=Math.max(0,rawAfterBills);
      const spendUntilSalary=shortfall>0?0:Math.max(0,Math.min(remainingBudget,afterBills));
      const extra=shortfall>0?0:Math.max(0,afterBills-remainingBudget);
      const days=Math.max(1,Math.ceil((parse(salary)-parse(today()))/86400000)+1);
      const daily=spendUntilSalary/days;
      const coverage=dueBeforeSalary>0?Math.min(100,Math.max(0,ordinary/dueBeforeSalary*100)):100;

      snapshot={salary,ordinary,ordinaryAccounts,protectedAmount,remainingBudget,dueBeforeSalary,dueItems,rawAfterBills,shortfall,afterBills,spendUntilSalary,extra,days,daily,coverage,remainingCategories};
      return snapshot;
    }finally{busy=false}
  }

  function ensureClarityCard(){
    if($('#v13Clarity'))return;
    const metrics=$('.metric-grid');
    if(!metrics)return;
    metrics.insertAdjacentHTML('afterend',`<section id="v13Clarity" class="v13-clarity" aria-live="polite">
      <div class="v13-clarity-head"><div><small>IL TUO MARGINE</small><h2>Quanto puoi davvero spendere</h2></div><button id="v13Explain" type="button">Come lo calcolo</button></div>
      <div id="v13Risk" class="v13-risk" hidden><span>ATTENZIONE</span><strong id="v13RiskTitle"></strong><small id="v13RiskText"></small></div>
      <div class="v13-equation">
        <div><span>Disponibile sui conti</span><strong id="v13Ordinary">—</strong></div>
        <i>−</i>
        <div><span>Scadenze prima dello stipendio</span><strong id="v13Bills">—</strong></div>
        <i>=</i>
        <div class="is-result"><span>Saldo dopo le scadenze</span><strong id="v13AfterBills">—</strong></div>
      </div>
      <div class="v13-spend-strip"><div><small>PER SPESA, BAR, USCITE, BENZINA…</small><strong id="v13UntilSalary">—</strong><span id="v13UntilSalaryDate"></span></div><div><small>MEDIA AL GIORNO</small><strong id="v13Daily">—</strong><span id="v13Days"></span></div></div>
      <div id="v13Categories" class="v13-categories"></div>
      <div class="v13-extra"><span id="v13ExtraLabel">Extra non assegnato</span><strong id="v13Extra">—</strong><small id="v13ExtraText">Resta libero anche dopo budget quotidiano e scadenze.</small></div>
    </section>`);
  }

  function updateHome(s){
    ensureClarityCard();
    const risk=$('#v13Risk');
    const clarity=$('#v13Clarity');
    if(risk){
      risk.hidden=s.shortfall<=0;
      if(s.shortfall>0){
        $('#v13RiskTitle').textContent=`Ti mancano ${money(s.shortfall)}`;
        $('#v13RiskText').textContent=`Le uscite già previste fino al ${shortDate.format(parse(s.salary))} superano la liquidità disponibile.`;
      }
    }
    clarity?.classList.toggle('is-shortfall',s.shortfall>0);

    const smartLabel=$('#spendTodayCard .smart-copy small');
    if(smartLabel)smartLabel.textContent=s.shortfall>0?'PRIMA COPRI LE SCADENZE':'PER SPESE QUOTIDIANE · OGGI';
    const smartValue=$('#spendTodayValue');if(smartValue)smartValue.textContent=money(s.daily);
    const smartText=$('#spendTodayText');
    if(smartText)smartText.textContent=s.shortfall>0
      ?`Deficit ${money(s.shortfall)} prima del ${shortDate.format(parse(s.salary))}`
      :`${money(s.spendUntilSalary)} fino al ${shortDate.format(parse(s.salary))} · ${s.days} giorni`;

    const freeCard=$('[data-detail="free"]');
    if(freeCard){
      const sm=$('small',freeCard),st=$('strong',freeCard),sp=$('span',freeCard);
      if(sm)sm.textContent=s.shortfall>0?'Spendibile adesso':'Spendibile fino allo stipendio';
      if(st)st.textContent=money(s.spendUntilSalary);
      if(sp)sp.textContent=s.shortfall>0?`Prima mancano ${money(s.shortfall)} per le scadenze`:'Spesa, bar, ristoranti, benzina…';
      freeCard.classList.toggle('is-risk',s.shortfall>0);
    }
    const committed=$('[data-detail="committed"]');
    if(committed){
      const sm=$('small',committed),st=$('strong',committed),sp=$('span',committed);
      if(sm)sm.textContent='Da coprire entro lo stipendio';if(st)st.textContent=money(s.dueBeforeSalary);if(sp)sp.textContent=`Entro il ${shortDate.format(parse(s.salary))}`;
    }

    const map={v13Ordinary:s.ordinary,v13Bills:s.dueBeforeSalary,v13AfterBills:s.rawAfterBills,v13UntilSalary:s.spendUntilSalary,v13Daily:s.daily};
    Object.entries(map).forEach(([id,v])=>{const el=$(`#${id}`);if(el)el.textContent=money(v)});
    const result=$('#v13AfterBills')?.closest('.is-result');result?.classList.toggle('is-negative',s.rawAfterBills<0);
    const sd=$('#v13UntilSalaryDate');if(sd)sd.textContent=`fino al ${shortDate.format(parse(s.salary))}`;
    const d=$('#v13Days');if(d)d.textContent=`per ${s.days} giorni`;
    const cats=$('#v13Categories');if(cats)cats.innerHTML=s.remainingCategories.map(b=>`<button type="button" data-go-budget="1"><span>${esc(b.name)}</span><strong>${money(b.remaining)}</strong></button>`).join('');

    const extraLabel=$('#v13ExtraLabel'),extraVal=$('#v13Extra'),extraText=$('#v13ExtraText');
    if(s.shortfall>0){
      if(extraLabel)extraLabel.textContent='Deficit da coprire';if(extraVal)extraVal.textContent=money(s.shortfall);if(extraText)extraText.textContent='Prima di considerare nuove spese quotidiane.';
    }else{
      if(extraLabel)extraLabel.textContent='Extra non assegnato';if(extraVal)extraVal.textContent=money(s.extra);if(extraText)extraText.textContent='Resta libero anche dopo budget quotidiano e scadenze.';
    }
  }

  function openBreakdown(s){
    const body=$('#sheetBody'),sheet=$('#sheet'),back=$('#sheetBackdrop');if(!body||!sheet||!back)return;
    $('#sheetKicker').textContent=s.shortfall>0?'COPERTURA':'COME LO CALCOLO';$('#sheetTitle').textContent=s.shortfall>0?'Prima copri le uscite':'Quanto puoi spendere';
    const dueList=s.dueItems.length?s.dueItems.map(x=>`<div><span><b>${esc(x.name)}</b><small>${shortDate.format(parse(x.date))}</small></span><strong>${money(x.amount)}</strong></div>`).join(''):'<div><span>Nessuna scadenza registrata</span><strong>€ 0,00</strong></div>';
    const accountList=s.ordinaryAccounts.length?s.ordinaryAccounts.map(a=>`<div><span>${esc(a.name)}</span><strong>${money(a.balance)}</strong></div>`).join(''):'<div><span>Nessun conto disponibile</span><strong>€ 0,00</strong></div>';
    body.innerHTML=`<div class="v13-sheet-hero ${s.shortfall>0?'is-risk':''}"><small>${s.shortfall>0?'MARGINE ATTUALE':'OGGI'}</small><strong>${money(s.daily)}</strong><span>${s.shortfall>0?`Le uscite previste superano la liquidità di ${money(s.shortfall)}. Finché non copri questo importo, lo spendibile prudenziale è zero.`:`È la media giornaliera sostenibile per le spese quotidiane fino al ${shortDate.format(parse(s.salary))}.`}</span></div>
      <div class="v13-sheet-formula">
        <div><span>Disponibile non protetto</span><strong>${money(s.ordinary)}</strong></div>
        <div><span>− Uscite entro lo stipendio</span><strong>− ${money(s.dueBeforeSalary)}</strong></div>
        <div class="${s.rawAfterBills<0?'negative':''}"><span>= Saldo dopo le uscite</span><strong>${money(s.rawAfterBills)}</strong></div>
        <div><span>Budget quotidiano ancora disponibile</span><strong>${money(s.remainingBudget)}</strong></div>
        <div class="result ${s.shortfall>0?'negative':''}"><span>Spendibile fino allo stipendio</span><strong>${money(s.spendUntilSalary)}</strong></div>
      </div>
      <p class="v13-sheet-note">Il calcolo usa il giorno 10 come data prudenziale dello stipendio. Le entrate attese non vengono conteggiate finché non risultano effettivamente ricevute. Le rate attive vengono considerate anche se non è ancora stata generata la relativa scadenza.</p>
      <div class="v13-sheet-cats v13-due-list"><small>USCITE DA COPRIRE ENTRO IL ${shortDate.format(parse(s.salary)).toUpperCase()}</small>${dueList}</div>
      <div class="v13-sheet-cats v13-account-list"><small>CONTI CONSIDERATI DISPONIBILI</small>${accountList}</div>
      <div class="v13-sheet-cats"><small>BUDGET QUOTIDIANO RESIDUO</small>${s.remainingCategories.map(b=>`<div><span>${esc(b.name)}</span><strong>${money(b.remaining)}</strong></div>`).join('')}</div>
      <div class="v13-sheet-extra ${s.shortfall>0?'is-risk':''}"><span>${s.shortfall>0?'Deficit da coprire':'Extra non assegnato'}</span><strong>${money(s.shortfall>0?s.shortfall:s.extra)}</strong><small>${s.shortfall>0?'È la differenza tra liquidità disponibile e uscite già previste.':'Non serve a coprire né budget quotidiano né scadenze prima dello stipendio.'}</small></div>`;
    back.hidden=false;requestAnimationFrame(()=>{back.classList.add('open');sheet.classList.add('open');sheet.setAttribute('aria-hidden','false')});sheet.scrollTop=0;
  }

  async function refresh(){try{const s=await loadSnapshot();if(s)updateHome(s)}catch(e){console.warn('V13 spend clarity',e)}}
  function schedule(){clearTimeout(timer);timer=setTimeout(refresh,80)}

  document.addEventListener('click',e=>{
    if(e.target.closest('#spendTodayCard')||e.target.closest('#v13Explain')||e.target.closest('[data-detail="free"]')){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      loadSnapshot().then(openBreakdown);
      return;
    }
    if(e.target.closest('[data-go-budget]')){e.preventDefault();document.querySelector('.tab[data-view="budget"]')?.click()}
  },true);

  document.addEventListener('DOMContentLoaded',()=>{
    ensureClarityCard();refresh();
    const roots=['totalLiquidity','budgetSummary','commitmentsList','accountsList','liabilitiesList'];
    roots.forEach(id=>{const el=$(`#${id}`);if(el)new MutationObserver(schedule).observe(el,{subtree:true,childList:true,characterData:true})});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
    setTimeout(refresh,350);setTimeout(refresh,1200);
  });
})();