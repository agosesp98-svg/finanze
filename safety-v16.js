(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const shortDate=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long'});
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today=()=>iso(new Date());
  const parse=s=>new Date(`${s}T12:00:00`);
  let refreshTimer=null;

  function salaryFallback(){
    const n=new Date();let y=n.getFullYear(),m=n.getMonth();
    if(n.getDate()>10){m++;if(m>11){m=0;y++;}}
    return `${y}-${String(m+1).padStart(2,'0')}-10`;
  }

  function matches(l,c){
    if(String(c.liabilityId||'')&&String(c.liabilityId)===String(l.id||''))return true;
    if(l.scheduleKey&&c.liabilityKey&&String(l.scheduleKey)===String(c.liabilityKey))return true;
    return norm(l.name)&&norm(l.name)===norm(c.name);
  }

  function primaryAccount(accounts){
    const usable=accounts.filter(a=>!a.protected);
    return usable.find(a=>norm(a.kind).includes('conto')||norm(a.kind).includes('corrente'))||usable[0]||null;
  }

  async function snapshot(){
    const [accounts,budgets,commitments,liabilities,settings]=await Promise.all([
      FinanceDB.getAll('accounts'),FinanceDB.getAll('budgets'),FinanceDB.getAll('commitments'),FinanceDB.getAll('liabilities'),FinanceDB.getAll('settings')
    ]);
    const salarySetting=settings.find(x=>x.key==='nextSalaryDate')?.value;
    const salary=salarySetting&&salarySetting>=today()?salarySetting:salaryFallback();
    const usable=accounts.filter(a=>!a.protected);
    const primary=primaryAccount(accounts);
    const ordinary=usable.reduce((s,a)=>s+Number(a.balance||0),0);
    const remainingBudget=budgets.reduce((s,b)=>s+Math.max(0,Number(b.budget||0)-Number(b.spent||0)),0);

    const due=[];
    for(const c of commitments.filter(c=>c.active&&c.dueDate&&c.dueDate<=salary&&Number(c.amount||0)>0)){
      const l=liabilities.find(l=>matches(l,c));
      const accountId=c.accountId??l?.accountId??primary?.id??null;
      due.push({name:c.name||'Scadenza',amount:Number(c.amount||0),date:c.dueDate,accountId,source:'commitment'});
    }
    for(const l of liabilities.filter(l=>!l.completed&&l.nextDueDate&&l.nextDueDate<=salary&&Number(l.monthly||0)>0)){
      if(commitments.some(c=>c.active&&c.dueDate&&c.dueDate<=salary&&matches(l,c)))continue;
      due.push({name:l.name||'Rata',amount:Number(l.monthly||0),date:l.nextDueDate,accountId:l.accountId??primary?.id??null,source:'rate'});
    }
    due.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const dueTotal=due.reduce((s,x)=>s+x.amount,0);
    const overallShortfall=Math.max(0,dueTotal-ordinary);
    const primaryDue=primary?due.filter(x=>String(x.accountId||'')===String(primary.id)).reduce((s,x)=>s+x.amount,0):0;
    const primaryBalance=Number(primary?.balance||0);
    const primaryShortfall=primary?Math.max(0,primaryDue-primaryBalance):0;
    const blockingShortfall=Math.max(overallShortfall,primaryShortfall);
    const afterAll=ordinary-dueTotal;
    const spendable=blockingShortfall>0?0:Math.max(0,Math.min(remainingBudget,afterAll));
    const days=Math.max(1,Math.ceil((parse(salary)-parse(today()))/86400000)+1);
    const daily=spendable/days;
    return{salary,primary,primaryBalance,primaryDue,ordinary,due,dueTotal,overallShortfall,primaryShortfall,blockingShortfall,remainingBudget,afterAll,spendable,daily,days};
  }

  function ensureAlert(){
    let el=$('#v16SafetyAlert');
    if(el)return el;
    const hero=$('.balance-hero');if(!hero)return null;
    el=document.createElement('section');
    el.id='v16SafetyAlert';el.className='v16-safety';el.setAttribute('aria-live','assertive');el.hidden=true;
    el.innerHTML=`<div class="v16-safety-top"><span>ATTENZIONE CONTO</span><b>Spese bloccate</b></div><strong id="v16SafetyTitle">Copertura insufficiente</strong><p id="v16SafetyText"></p><div class="v16-safety-grid"><div><small>SUL CONTO</small><b id="v16PrimaryBalance">—</b></div><div><small>DA PAGARE</small><b id="v16PrimaryDue">—</b></div><div><small>MANCANO</small><b id="v16Shortfall">—</b></div></div><button id="v16SafetyDetails" type="button">Vedi cosa deve uscire</button>`;
    hero.insertAdjacentElement('afterend',el);
    return el;
  }

  function openDetails(s){
    const body=$('#sheetBody'),sheet=$('#sheet'),back=$('#sheetBackdrop');if(!body||!sheet||!back)return;
    $('#sheetKicker').textContent='COPERTURA CONTO';$('#sheetTitle').textContent='Uscite fino allo stipendio';
    const rows=s.due.length?s.due.map(x=>`<div class="v16-due-row"><span><b>${String(x.name).replace(/[&<>"']/g,'')}</b><small>${shortDate.format(parse(x.date))}</small></span><strong>${money(x.amount)}</strong></div>`).join(''):'<div class="v16-due-row"><span>Nessuna uscita registrata</span><strong>€ 0,00</strong></div>';
    body.innerHTML=`<div class="v16-sheet-risk"><small>${s.primary?.name||'Conto principale'}</small><strong>${money(s.primaryShortfall||s.overallShortfall)}</strong><span>${s.primaryShortfall>0?`Mancano sul conto usato come riferimento per coprire le uscite previste.`:`Mancano complessivamente per coprire le uscite previste.`}</span></div><div class="v16-sheet-formula"><div><span>Saldo conto principale</span><strong>${money(s.primaryBalance)}</strong></div><div><span>Uscite attribuite al conto</span><strong>− ${money(s.primaryDue)}</strong></div><div class="danger"><span>Margine conto</span><strong>${money(s.primaryBalance-s.primaryDue)}</strong></div><div><span>Liquidità totale non protetta</span><strong>${money(s.ordinary)}</strong></div><div><span>Uscite totali fino al ${shortDate.format(parse(s.salary))}</span><strong>${money(s.dueTotal)}</strong></div></div><div class="v16-due-list"><small>USCITE PREVISTE</small>${rows}</div><p class="v16-note">Per prudenza, le uscite senza un conto di addebito specificato vengono attribuite al conto corrente principale. Se un pagamento parte da un altro conto, assegnalo nella sezione Rate/Scadenze.</p>`;
    back.hidden=false;requestAnimationFrame(()=>{back.classList.add('open');sheet.classList.add('open');sheet.setAttribute('aria-hidden','false')});sheet.scrollTop=0;
  }

  async function refresh(){
    try{
      const s=await snapshot();const alert=ensureAlert();if(!alert)return;
      const risk=s.blockingShortfall>0;
      alert.hidden=!risk;alert.classList.toggle('show',risk);
      if(risk){
        $('#v16SafetyTitle').textContent=s.primaryShortfall>0?`Sul conto mancano ${money(s.primaryShortfall)}`:`Mancano ${money(s.overallShortfall)} per le uscite`;
        $('#v16SafetyText').textContent=s.primaryShortfall>0?`Hai ${money(s.primaryBalance)} sul conto principale e circa ${money(s.primaryDue)} di uscite attribuite entro il ${shortDate.format(parse(s.salary))}. Finché non copri la differenza, lo spendibile prudenziale è € 0.`:`Le uscite previste entro il ${shortDate.format(parse(s.salary))} superano la liquidità disponibile. Lo spendibile prudenziale è € 0.`;
        $('#v16PrimaryBalance').textContent=money(s.primaryBalance);$('#v16PrimaryDue').textContent=money(s.primaryDue);$('#v16Shortfall').textContent=money(s.primaryShortfall||s.overallShortfall);
      }
      const spend=$('#spendTodayValue'),txt=$('#spendTodayText');
      if(spend)spend.textContent=money(s.daily);
      if(txt)txt.textContent=risk?`Prima copri ${money(s.blockingShortfall)} · poi ricalcolo il budget`:`${money(s.spendable)} fino al ${shortDate.format(parse(s.salary))} · ${s.days} giorni`;
      const free=$('[data-detail="free"]');if(free&&risk){free.classList.add('is-risk');const st=free.querySelector('strong'),sp=free.querySelector('span'),sm=free.querySelector('small');if(sm)sm.textContent='Spendibile adesso';if(st)st.textContent='€ 0,00';if(sp)sp.textContent=`Prima copri ${money(s.blockingShortfall)}`;}
      alert.onclick=e=>{if(e.target.closest('#v16SafetyDetails')||e.target===alert||e.target.closest('.v16-safety-grid'))openDetails(s)};
    }catch(e){console.error('Safety V16',e)}
  }

  function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,70)}
  document.addEventListener('DOMContentLoaded',()=>{ensureAlert();refresh();setTimeout(refresh,300);setTimeout(refresh,1100);['totalLiquidity','accountsList','commitmentsList','liabilitiesList'].forEach(id=>{const el=$(`#${id}`);if(el)new MutationObserver(schedule).observe(el,{subtree:true,childList:true,characterData:true})})});
  window.addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();