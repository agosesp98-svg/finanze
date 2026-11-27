/* Wedding planner for Finanze. User-specific costs are NEVER shipped in this public file.
 * All wedding records live in IndexedDB and in user-controlled JSON exports. */
const FinanceWedding=(()=>{
  'use strict';
  const STORE='weddingProjects', PROJECT_ID='wedding-main';
  const ROOT=()=>document.getElementById('weddingRoot');
  const $=(selector,root=document)=>root.querySelector(selector);
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n||0));
  const fmtDate=d=>{if(!d)return 'Da definire';const parts=String(d).split('-');
    if(parts.length!==3)return d;
    return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric'})
      .format(new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2])))};
  const fmtMonth=m=>new Intl.DateTimeFormat('it-IT',{month:'short',year:'numeric'})
    .format(new Date(Number(m.slice(0,4)),Number(m.slice(5,7))-1,1));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const round=n=>Math.round((Number(n||0)+Number.EPSILON)*100)/100;
  const amount=n=>Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<=10000000;
  const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
    new Date(v+'T12:00:00').toString()!=='Invalid Date';
  const monthOK=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  const monthAfter=m=>{const y=+m.slice(0,4),n=+m.slice(5,7);return new Date(y,n,1).toISOString().slice(0,7)};
  const monthBefore=m=>{const y=+m.slice(0,4),n=+m.slice(5,7);return new Date(y,n-2,1).toISOString().slice(0,7)};
  const cycleOf=inst=>inst.due?(Number(inst.due.slice(8))<10?monthBefore(inst.due.slice(0,7)):inst.due.slice(0,7)):
    (inst.planningMonth||inst.dueMonth||null);
  const remains=inst=>inst.historical?0:Math.max(0,round(Number(inst.plannedMy||0)-Number(inst.paidByMe||0)));
  let project=null,accounts=[],movements=[],selectedTab='overview',initializing=false;

  function validate(payload){
    if(payload?.kind!=='finanze-wedding-plan'||payload.version!==1||!payload.project||
      payload.project.id!==PROJECT_ID||!Array.isArray(payload.project.suppliers))
      throw Error('Il file non è un piano Matrimonio compatibile con Finanze.');
    const p=typeof structuredClone==='function'?structuredClone(payload.project):
      JSON.parse(JSON.stringify(payload.project));
    if(p.suppliers.length>100||!dateOK(p.date))throw Error('Data del matrimonio o fornitori non validi.');
    const keys=new Set();
    for(const supplier of p.suppliers){
      if(!supplier||typeof supplier.id!=='string'||!supplier.id||keys.has(supplier.id)||
        typeof supplier.name!=='string'||!supplier.name||!amount(supplier.grossTotal)||
        !Array.isArray(supplier.installments)||supplier.installments.length>30)
        throw Error('Fornitore non valido o duplicato.');
      keys.add(supplier.id);
      const itemKeys=new Set();
      for(const i of supplier.installments){
        if(!i||typeof i.id!=='string'||!i.id||itemKeys.has(i.id)||
          !amount(i.gross)||!amount(i.plannedMy)||!amount(i.paidByMe||0)||
          Number(i.plannedMy)>Number(i.gross)+0.01||
          Number(i.paidByMe||0)>Number(i.gross)+0.01||
          (i.due&&!dateOK(i.due))||
          (i.dueMonth&&!monthOK(i.dueMonth))||
          (i.planningMonth&&!monthOK(i.planningMonth)))
          throw Error('Scadenza o importo non valido in '+supplier.name+'.');
        itemKeys.add(i.id);
      }
    }
    const f=p.forecast||{};
    if(!f.incomes||typeof f.incomes!=='object'||!amount(f.monthlyBase)||
      !amount(f.reservePerMonth)||!amount(p.safetyBuffer||0))
      throw Error('Previsione mensile mancante o non valida.');
    for(const v of Object.values(f.incomes))if(!amount(v))throw Error('Stipendio previsto non valido.');
    for(const v of Object.values(f.extraExpenses||{}))if(!amount(v))throw Error('Spesa straordinaria non valida.');
    return p;
  }

  async function reload(){
    const results=await Promise.all([
      FinanceDB.get(STORE,PROJECT_ID),FinanceDB.getAll('accounts'),FinanceDB.getAll('movements')
    ]);
    project=results[0]||null;accounts=results[1]||[];movements=results[2]||[];
  }
  async function persist(message){
    await FinanceDB.put(STORE,project);
    await reload();render();
    if(message)status(message);
  }
  function status(message){
    const target=$('#weddingStatus');
    if(target){target.hidden=false;target.textContent=message;target.setAttribute('role','status');}
  }
  function summary(){
    const all=project.suppliers.flatMap(s=>s.installments.map(i=>({...i,supplier:s})));
    const budgetItems=all.filter(i=>i.supplier.status!=='gift'&&i.supplier.status!=='historical');
    const excludedItems=all.filter(i=>i.supplier.status==='gift'||i.supplier.status==='historical');
    const myTotal=round(budgetItems.reduce((a,i)=>a+Number(i.plannedMy||0),0));
    const paidPlan=round(budgetItems.reduce((a,i)=>a+Number(i.paidByMe||0),0));
    const paidExcluded=round(excludedItems.reduce((a,i)=>a+Number(i.paidByMe||0),0));
    const paid=round(paidPlan+paidExcluded);
    const remaining=round(budgetItems.reduce((a,i)=>a+remains(i),0));
    const cashFund=accounts.find(a=>Number(a.id)===Number(project.savingsAccountId)&&a.protected&&!a.archived);
    return{all,myTotal,paid,paidPlan,paidExcluded,remaining,
      cashFund:cashFund?Math.max(0,Number(cashFund.balance||0)):0,
      cashFundName:cashFund?.name||null,overAdvance:round(budgetItems.reduce((a,i)=>
        a+Math.max(0,Number(i.paidByMe||0)-Number(i.plannedMy||0)),0))};
  }
  function byCycle(month){
    const planned=project.suppliers.flatMap(s=>s.installments.filter(i=>remains(i)>.001&&cycleOf(i)===month)
      .map(i=>({supplier:s.name,id:s.id,installment:i,amount:remains(i),
        provisional:!i.due||s.status==='estimate'})));
    // A completed payment stays in its actual financial cycle. Its remaining
    // forecast is removed, so it is counted exactly once, not made to disappear.
    const historical=project.suppliers.flatMap(s=>s.installments.flatMap(i=>
      (i.paymentMovementIds||[]).map(id=>({supplier:s.name,installment:i,
        movement:movements.find(m=>Number(m.id)===Number(id))}))
      .filter(x=>x.movement&&x.movement.type==='expense'&&
        cycleOf({due:x.movement.date})===month)
      .map(x=>({supplier:x.supplier,installment:i,
        amount:Number(x.movement.amount||0),provisional:false,actual:true}))));
    return [...planned,...historical];
  }
  function recurringForCycle(month){
    const recurrences=project.forecast?.extraRecurrences||[];
    const year=Number(month.slice(0,4)),m=Number(month.slice(5,7))-1;
    const start=Date.UTC(year,m,10),end=Date.UTC(year,m+1,10),day=86400000;
    return recurrences.flatMap(x=>{
      const first=Date.parse(String(x.firstDue||'')+'T12:00:00Z');
      const step=Number(x.everyDays)*day;
      if(!Number.isFinite(first)||!Number.isFinite(step)||step<=0)return[];
      const index=Math.max(0,Math.ceil((start-first)/step));
      let count=0;
      for(let due=first+index*step;due<end&&count<8;due+=step)count++;
      return count?[{label:x.label,count,amount:round(count*Number(x.amount||0))}]:[];
    });
  }
  function automaticForCycle(month){
    const auto=project.automatedSavings;
    if(!auto||(auto.startMonth&&month<auto.startMonth))return{total:0,wedding:0,emergency:0};
    const total=round(auto.monthlyAmount);
    const wedding=round(total*Number(auto.buckets.find(x=>x.purpose==='wedding')?.share||0));
    return{total,wedding,emergency:round(total-wedding)};
  }
  function forecast(){
    const f=project.forecast||{},months=Object.keys(f.incomes).sort();
    // This is a forecast from zero, never the real bank balance.
    let fund=0,emergencyFund=0;
    return months.map(month=>{
      const received=movements.filter(m=>m.type==='income'&&
        (m.salaryGuide===true||m.category==='Stipendio')&&m.date&&
        cycleOf({due:m.date})===month);
      const observed=received.length>0;
      const income=round(observed?received.reduce((a,m)=>a+Number(m.amount||0),0):
        Number(f.incomes[month]||0));
      const recurring=recurringForCycle(month);
      const recurringTotal=round(recurring.reduce((a,x)=>a+x.amount,0));
      const ordinary=round(Number(f.monthlyBase||0)+Number((f.extraExpenses||{})[month]||0)+recurringTotal);
      const bills=byCycle(month);
      const due=round(bills.reduce((a,x)=>a+x.amount,0));
      const free=Number(f.reservePerMonth||0);
      const automatic=automaticForCycle(month);
      // The monthly autopayment is already within the earmarked margin.
      // Credit only its wedding share back to the wedding projection.
      const reserved=Math.max(free,automatic.total);
      const available=round(income-ordinary-reserved+automatic.wedding);
      fund=round(fund+available-due);
      emergencyFund=round(emergencyFund+automatic.emergency);
      return{month,income,observed,ordinary,bills,due,free,reserved,automatic,
        recurring,recurringTotal,available,fund,emergencyFund};
    });
  }
  const button=(title,action,extra='')=>'<button type="button" data-wedding-action="'+esc(action)+'" class="'+extra+'">'+esc(title)+'</button>';
  function drawEmpty(){
    ROOT().innerHTML='<div class="wedding-empty"><div class="wedding-empty-icon">◈</div>'+
      '<h2>Il tuo matrimonio, dentro Finanze.</h2>'+
      '<p>Importa il piano privato per gestire fornitori, preventivi, acconti e risparmi. '+
      'Nessun dato personale viene incluso nel codice pubblico dell’app.</p>'+
      button('Importa piano Matrimonio','import','primary-button')+
      '<small>Il file JSON aggiunge soltanto il modulo Matrimonio. Non modifica conti o movimenti.</small></div>';
  }
  function card(label,value,extra=''){
    return '<div class="wedding-stat"><small>'+esc(label)+'</small><strong>'+money(value)+'</strong>'+
      (extra?'<span>'+esc(extra)+'</span>':'')+'</div>';
  }
  function overview(){
    const x=summary(),f=forecast(),last=f.find(r=>r.month==='2028-04');
    const automated=project.automatedSavings,monthSplit=automaticForCycle('2026-12');
    const upcoming=x.all.filter(i=>remains(i)>.001&&i.supplier.status!=='estimate')
      .sort((a,b)=>String(a.due||a.dueMonth||'9999').localeCompare(String(b.due||b.dueMonth||'9999')));
    const gap=Math.max(0,round(x.remaining+Number(project.safetyBuffer||0)-x.cashFund));
    const coverage=last?last.fund-x.all.filter(i=>remains(i)>.001&&
      !cycleOf(i)).reduce((a,i)=>a+remains(i),0):null;
    return '<div class="wedding-hero"><div class="wedding-eyebrow">IL TUO PIANO · '+esc(fmtDate(project.date))+'</div>'+
      '<h2>'+esc(project.name||'Matrimonio')+'</h2><p>Il ricevimento regalato e le spese personali del partner sono esclusi.</p>'+
      '<div class="wedding-stats">'+card('Pagamenti futuri previsti',x.remaining,'Importi effettivi da finanziare')+
      card('Fondo reale collegato',x.cashFund,x.cashFundName||'Nessun conto dedicato')+
      card('Già pagato da te',x.paid,
        x.paidExcluded?'Di cui '+money(x.paidExcluded)+' fuori budget':'Acconti e pagamenti già sostenuti')+
      card('Obiettivo residuo con riserva',gap,'Riserva '+money(project.safetyBuffer||0))+'</div>'+
      '<div class="wedding-progress"><span>Pagamenti sui costi ancora previsti</span><b>'+
      Math.round(x.paidPlan/(x.paidPlan+x.remaining||1)*100)+'%</b><div><i style="width:'+
      Math.min(100,100*x.paidPlan/(x.paidPlan+x.remaining||1))+'%"></i></div></div></div>'+
      '<div class="wedding-panel"><h3>La prossima scadenza</h3>'+
      (upcoming.length?'<div class="wedding-inline"><span><b>'+esc(upcoming[0].supplier.name)+'</b>'+
        '<small>'+esc(upcoming[0].due?fmtDate(upcoming[0].due):
          fmtMonth(upcoming[0].dueMonth||upcoming[0].planningMonth||'2028-05')+' · giorno da confermare')+
        '</small></span><strong>'+money(remains(upcoming[0]))+'</strong></div>':
        '<p class="wedding-muted">Nessun acconto confermato da pagare.</p>')+
      '</div>'+(automated?'<div class="wedding-panel"><h3>'+esc(automated.label||'Salvadanai')+
        ' · ripartizione provvisoria</h3><div class="wedding-inline"><span>Versamento automatico ogni '+
        Number(automated.dayOfMonth||17)+' del mese</span><strong>'+money(monthSplit.total)+'</strong></div>'+
        automated.buckets.map(b=>'<div class="wedding-inline"><span>'+esc(b.label)+
          '</span><strong>'+money(monthSplit.total*Number(b.share||0))+'</strong></div>').join('')+
        '<p class="wedding-muted">Arrotondamenti ripartiti allo stesso modo, ma esclusi dalle stime finché '+
        'non conosciamo i versamenti effettivi. Nessun trasferimento simulato modifica i conti.</p></div>':'')+
      '<div class="wedding-panel"><h3>Quanto mettere da parte</h3>'+
      '<p>Il fondo reale corrisponde soltanto al saldo di un conto di risparmio dedicato. '+
      'Gli accantonamenti previsti non vengono aggiunti automaticamente alla liquidità reale.</p>'+
      '<div class="wedding-inline"><span>Da accumulare, inclusa riserva</span><strong>'+
        money(gap)+'</strong></div>'+
      (last?'<div class="wedding-inline"><span>Fondo teorico accumulato entro il 9 maggio 2028</span><strong class="'+
        (coverage<0?'wedding-negative':'')+'">'+money(last.fund)+'</strong></div>':'')+
      '<p class="wedding-muted">Le previsioni dipendono da stipendio, rate, spese e date ipotizzate. '+
      'Non certificano la liquidità futura.</p></div>'+
      (x.paidExcluded>.01?'<div class="wedding-notice">Hai già sostenuto '+money(x.paidExcluded)+
        ' per spese storiche escluse dal budget futuro. Non vengono sottratte dai prossimi pagamenti.</div>':'')+
      (x.overAdvance>.01?'<div class="wedding-notice">Hai anticipato '+money(x.overAdvance)+
        ' oltre la tua quota sui pagamenti condivisi. Eventuali compensazioni non sono considerate incassate.</div>':'')+
      '<div class="wedding-panel"><h3>Attenzioni prima del matrimonio</h3>'+
      '<p>I preventivi non confermati hanno mesi di pianificazione provvisori, non scadenze contrattuali. '+
      'Verifica SIAE, oneri del rito, pasti fornitori ed eventuali extra. Le fedi sono considerate un regalo previsto.</p></div>';
  }
  function suppliers(){
    const list=[...project.suppliers].sort((a,b)=>{
      const rank=s=>s.status==='agreed'?0:s.status==='estimate'?1:2;
      return rank(a)-rank(b);
    });
    return '<div class="wedding-section-head"><h2>Fornitori e costi</h2><p>Accordi e stime sono separati. '+
      'Per i fornitori condivisi registri solo la tua quota prevista, salvo anticipi reali maggiori.</p></div>'+
      list.map(s=>{
        const paid=round(s.installments.reduce((a,i)=>a+Number(i.paidByMe||0),0));
        const own=round(s.installments.reduce((a,i)=>a+Number(i.plannedMy||0),0));
        const left=round(s.installments.reduce((a,i)=>a+remains(i),0));
        return '<details class="wedding-supplier"><summary><span><small>'+
        (s.status==='agreed'?'CONCORDATO':s.status==='gift'?'REGALATO / ESCLUSO':
          s.status==='historical'?'GIÀ PAGATO · FUORI BUDGET':'DA PREVENTIVARE')+
        '</small><b>'+esc(s.name)+'</b><em>'+esc(s.category||'')+'</em></span>'+
        '<span class="wedding-supplier-numbers"><strong>'+money(left)+'</strong><small>da pagare</small></span></summary>'+
        '<div class="wedding-supplier-detail">'+
        '<div class="wedding-inline"><span>Costo complessivo</span><strong>'+money(s.grossTotal)+'</strong></div>'+
        '<div class="wedding-inline"><span>Tuo budget stimato</span><strong>'+money(own)+'</strong></div>'+
        '<div class="wedding-inline"><span>Da te versato (anche anticipi)</span><strong>'+money(paid)+'</strong></div>'+
        s.installments.map(i=>'<div class="wedding-installment"><div><b>'+esc(i.label||'Pagamento')+'</b>'+
        '<small>'+esc(i.due?fmtDate(i.due):i.dueMonth?
          fmtMonth(i.dueMonth)+' · giorno da confermare':
          i.planningMonth?'Data da definire · ipotesi '+fmtMonth(i.planningMonth):
          'Data da definire')+'</small>'+
        (i.historical?'<small>Storico dichiarato · nessun nuovo addebito</small>':
          !i.due?'<small>Scadenza non contrattuale</small>':'')+
        '</div><div class="wedding-installment-side"><strong>'+money(remains(i))+'</strong>'+
        '<span>'+(remains(i)<.005?'Pagato o escluso':'Tua quota residua')+'</span>'+
        (i.historical&&!i.paymentMovementIds?.length?
          '<button type="button" data-wedding-link="'+esc(s.id)+'|'+esc(i.id)+'">Collega movimento</button>':
          remains(i)>.005?'<button type="button" data-wedding-pay="'+esc(s.id)+'|'+esc(i.id)+'">Registra / collega</button>':'')+
        '</div></div>').join('')+
        (s.status==='estimate'?'<button class="wedding-text-action" type="button" data-wedding-edit="'+
          esc(s.id)+'">Modifica preventivo e mese</button>':'')+
        '</div></details>';
      }).join('');
  }
  function months(){
    const rows=forecast(),unknown=summary().all.filter(i=>remains(i)>.001&&!cycleOf(i));
    return '<div class="wedding-section-head"><h2>Il piano mese per mese</h2>'+
      '<p>Cicli dal 10 al 9. “Fondo previsto” è una simulazione, non un saldo reale. '+
      'I mesi stimati si possono modificare dal dettaglio del fornitore.</p></div>'+
      (unknown.length?'<div class="wedding-notice">Da calendarizzare: '+
        money(unknown.reduce((a,i)=>a+remains(i),0))+
        '. Queste spese non sono ancora attribuite a un mese.</div>':'')+
      rows.map(r=>'<details class="wedding-cycle"><summary><span><b>'+fmtMonth(r.month)+
        '</b><small>Entrate '+money(r.income)+' · Spese '+money(r.ordinary)+
        '</small></span><span><strong class="'+(r.fund<0?'wedding-negative':'')+'">'+money(r.fund)+'</strong>'+
        '<small>fondo previsto</small></span></summary><div class="wedding-cycle-content">'+
        '<div class="wedding-inline"><span>'+(r.observed?'Entrate stipendio registrate':'Stipendio / mensilità aggiuntive previsti')+'</span><b>'+
          money(r.income)+'</b></div>'+
        '<div class="wedding-inline"><span>Spese mensili e una tantum</span><b>−'+money(r.ordinary)+'</b></div>'+
        r.recurring.map(x=>'<p class="wedding-muted">Di cui '+esc(x.label)+': '+x.count+
          ' × '+money(x.amount/x.count)+' = '+money(x.amount)+' (date indicative)</p>').join('')+
        '<div class="wedding-inline"><span>'+(r.automatic.total?'Margine riservato, inclusi salvadanai':'Margine personale non accantonato')+
        '</span><b>−'+money(r.reserved)+'</b></div>'+
        (r.automatic.total?'<div class="wedding-inline"><span>Quota automatica destinata al matrimonio</span><b>+'+
          money(r.automatic.wedding)+'</b></div><p class="wedding-muted">Quota emergenze: '+
          money(r.automatic.emergency)+' · Fondo emergenze teorico cumulato: '+
          money(r.emergencyFund)+'. Gli arrotondamenti non sono stimati.</p>':'')+
        (r.bills.length?r.bills.map(x=>'<div class="wedding-inline"><span>'+
          esc(x.supplier)+(x.provisional?' <small>(data ipotizzata)</small>':'')+
          '</span><b>−'+money(x.amount)+'</b></div>').join(''):
          '<p class="wedding-muted">Nessun fornitore attribuito a questo ciclo.</p>')+
        '<div class="wedding-inline wedding-total"><span>Variazione prevista del fondo</span><strong>'+
          money(round(r.available-r.due))+'</strong></div>'+
        '<div class="wedding-inline"><span>Fondo teorico a fine ciclo</span><strong class="'+
          (r.fund<0?'wedding-negative':'')+'">'+money(r.fund)+'</strong></div>'+
        '<button type="button" class="wedding-text-action" data-wedding-income="'+
          esc(r.month)+'">Modifica entrata prevista</button></div></details>').join('')+
      '<p class="wedding-muted wedding-bottom-note">La previsione si basa sulle entrate importate dal tuo piano privato. '+
      'Le mensilità aggiuntive non sono garantite e le imposte effettive possono differire. '+
      'La spesa di un fornitore è sottratta una sola volta: quando viene pagata, il fondo previsto si aggiorna. '+
      'Le quote nei salvadanai sono già comprese nel margine riservato.</p>';
  }
  function settings(){
    const f=project.forecast,active=accounts.filter(a=>a.protected&&!a.archived);
    return '<div class="wedding-section-head"><h2>Simulatore e impostazioni</h2><p>Modifica gli importi '+
      'del piano. Nessuna modifica crea automaticamente un movimento.</p></div>'+
      '<form id="weddingSettingsForm" class="wedding-settings">'+
      '<label>Riserva per gli imprevisti matrimoniali (€)<input name="safety" type="number" min="0" step=".01" value="'+
        Number(project.safetyBuffer||0)+'" required></label>'+
      '<label>Spese ordinarie mensili (€)<input name="base" type="number" min="0" step=".01" value="'+
        Number(f.monthlyBase||0)+'" required></label>'+
      '<label>Margine personale libero al mese (€)<input name="free" type="number" min="0" step=".01" value="'+
        Number(f.reservePerMonth||0)+'" required></label>'+
      '<label>Conto di risparmio dedicato al matrimonio<select name="account">'+
        '<option value="">Nessun conto collegato</option>'+
        active.map(a=>'<option value="'+a.id+'" '+(Number(project.savingsAccountId)===Number(a.id)?'selected':'')+'>'+
          esc(a.name)+' · '+money(a.balance)+'</option>').join('')+'</select></label>'+
      '<p class="wedding-muted">Collega soltanto un conto protetto destinato esclusivamente al matrimonio. '+
      'Il suo saldo viene letto, non viene spostato né duplicato negli obiettivi.</p>'+
      '<button class="primary-button" type="submit">Salva impostazioni</button></form>'+
      (project.automatedSavings?'<div class="wedding-panel"><h3>Salvadanai e ripartizione</h3>'+
        '<p>Ripartizione indicativa del versamento automatico. Il saldo bancario non viene modificato.</p>'+
        '<form id="weddingAutoForm" class="wedding-settings">'+
        '<label>Versamento mensile (€)<input name="monthly" type="number" min="0" step=".01" value="'+
          Number(project.automatedSavings.monthlyAmount||0)+'" required></label>'+
        '<label>Quota matrimonio (%)<input name="share" type="number" min="0" max="100" step=".01" value="'+
          round(Number(project.automatedSavings.buckets.find(x=>x.purpose==='wedding')?.share||0)*100)+
          '" required></label><button class="primary-button">Salva ripartizione</button></form>'+
        '</div>':'')+
      '<div class="wedding-panel"><h3>Aggiornamenti senza sostituzione</h3>'+
      '<p>Importa una configurazione privata per aggiungere scadenze e automatismi, '+
        'senza sostituire i fornitori già modificati o i movimenti esistenti.</p>'+
      button('Importa aggiornamento parziale','import-adjustments','secondary-button')+'</div>'+
      '<div class="wedding-panel"><h3>I tuoi dati, sul dispositivo</h3>'+
      '<p>Puoi esportare e importare il piano privato in JSON. Anche il backup generale di Finanze '+
        'contiene il modulo Matrimonio. La sincronizzazione tra dispositivi non è automatica.</p>'+
      button('Esporta piano privato','export','secondary-button')+
      button('Importa un altro piano','import','secondary-button')+'</div>'+
      '<div class="wedding-panel"><h3>Nota sugli obiettivi precedenti</h3>'+
      '<p>Un eventuale vecchio obiettivo “Matrimonio” non viene sommato al fondo reale, '+
      'perché potrebbe includere depositi già versati. Prima di considerarlo risparmio, '+
      'riconciliamo il saldo con un conto bancario effettivo.</p></div>';
  }
  function render(){
    if(!ROOT())return;
    if(!project){drawEmpty();return}
    const tabs=[['overview','Panoramica'],['months','Mesi'],['suppliers','Fornitori'],['settings','Simulatore']];
    ROOT().innerHTML='<div id="weddingStatus" class="wedding-message" hidden></div>'+
      '<div class="wedding-tabbar">'+tabs.map(t=>'<button type="button" data-wedding-tab="'+t[0]+
        '" class="'+(t[0]===selectedTab?'active':'')+'">'+t[1]+'</button>').join('')+'</div>'+
      (selectedTab==='overview'?overview():selectedTab==='months'?months():
       selectedTab==='suppliers'?suppliers():settings());
  }
  function dialog(title,html){
    const element=$('#weddingDialog');if(!element)return null;
    element.innerHTML='<div class="wedding-dialog-head"><h2>'+esc(title)+
      '</h2><button type="button" data-wedding-close aria-label="Chiudi">×</button></div>'+html;
    if(!element.open)element.showModal();
    return element;
  }
  function accountOptions(){
    return accounts.filter(a=>!a.archived&&!a.protected).map(a=>
      '<option value="'+a.id+'">'+esc(a.name)+' · '+money(a.balance)+'</option>').join('');
  }
  function openPayment(sid,iid,linkOnly=false){
    const s=project.suppliers.find(x=>x.id===sid),i=s?.installments.find(x=>x.id===iid);
    if(!i)return;
    const defaultSum=remains(i);
    const linked=new Set(project.suppliers.flatMap(x=>x.installments.flatMap(j=>j.paymentMovementIds||[])).map(Number));
    const alternatives=movements.filter(m=>m.type==='expense'&&!linked.has(Number(m.id))&&
      Number(m.amount||0)>.001&&
      Number(m.amount||0)<=Number(i.gross||0)+.001).slice(0,250);
    const existing='<label>Movimento già registrato<select name="movement">'+
      '<option value="">Seleziona un movimento</option>'+
      alternatives.map(m=>'<option value="'+m.id+'">'+esc(fmtDate(m.date)+' · '+m.title+
        ' · '+money(m.amount))+'</option>').join('')+'</select></label>';
    const title=linkOnly?'Collega un acconto già pagato':'Registra pagamento · '+s.name;
    dialog(title,'<form id="weddingPaymentForm" class="wedding-settings">'+
      (!linkOnly?'<label>Modalità<select name="mode" id="weddingPaymentMode"><option value="new">Nuovo addebito sul conto</option>'+
        '<option value="existing">Collega un movimento già presente</option></select></label>':'')+
      '<div id="weddingNewPayment" '+(linkOnly?'hidden':'')+'>'+
      '<label>Importo pagato realmente (€)<input name="amount" type="number" min=".01" step=".01" max="'+
        round(Number(i.gross||0)-Number(i.paidByMe||0))+'" value="'+defaultSum+'"></label>'+
      '<label>Data del pagamento<input name="date" type="date" value="'+
        (new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+
        String(new Date().getDate()).padStart(2,'0'))+'"></label>'+
      '<label>Conto di addebito<select name="account">'+accountOptions()+'</select></label>'+
      '<p class="wedding-muted">Il conto sarà addebitato dell’intero importo realmente pagato, '+
      'anche se anticipi la quota del partner.</p></div>'+
      '<div id="weddingExistingPayment" '+(!linkOnly?'hidden':'')+'>'+existing+
      '<p class="wedding-muted">Collegare un movimento NON genera alcun nuovo addebito. '+
      (i.historical?'Il deposito risulta già versato e il suo importo non verrà sommato due volte.':
        'L’importo collegato sarà contato come già pagato a questo fornitore.')+'</p></div>'+
      '<p class="wedding-form-error" role="alert"></p>'+
      '<button type="submit" class="primary-button">Conferma</button></form>');
    const form=$('#weddingPaymentForm'),mode=$('#weddingPaymentMode');
    if(mode)mode.onchange=()=>{
      $('#weddingNewPayment').hidden=mode.value!=='new';
      $('#weddingExistingPayment').hidden=mode.value!=='existing';
    };
    form.onsubmit=async e=>{
      e.preventDefault();
      const submit=$('button[type="submit"]',form),error=$('.wedding-form-error',form);
      submit.disabled=true;error.textContent='';
      try{
        if(linkOnly||mode?.value==='existing'){
          const id=Number(form.elements.movement.value);
          const m=movements.find(x=>Number(x.id)===id);
          if(!m||m.type!=='expense')throw Error('Seleziona un movimento di uscita valido.');
          const already=project.suppliers.some(x=>x.installments.some(j=>
            (j.paymentMovementIds||[]).some(v=>Number(v)===id)));
          if(already)throw Error('Movimento già collegato a un altro pagamento.');
          if(!i.historical&&Number(i.paidByMe||0)+Number(m.amount||0)>
            Number(i.gross||0)+.001)throw Error('Movimento superiore al residuo della scadenza.');
          i.paymentMovementIds=[...(i.paymentMovementIds||[]),id];
          if(!i.historical){
            i.paidByMe=round(Number(i.paidByMe||0)+Number(m.amount||0));
            i.paidDate=m.date;
          }
          await FinanceDB.put(STORE,project);
        }else{
          await FinanceDB.recordWeddingPayment(project.id,sid,iid,
            Number(form.elements.account.value),Number(form.elements.amount.value),
            form.elements.date.value);
          document.dispatchEvent(new Event('finanze:finance-changed'));
        }
        $('#weddingDialog').close();await reload();render();
      }catch(err){error.textContent=err.message||'Impossibile salvare.';submit.disabled=false}
    };
  }
  function openEstimate(id){
    const s=project.suppliers.find(x=>x.id===id);
    if(!s||s.status!=='estimate'||s.installments.length!==1)return;
    const i=s.installments[0],fraction=Number(i.plannedMy||0)/Math.max(1,Number(i.gross||0));
    dialog('Aggiorna preventivo · '+s.name,
      '<form id="weddingEstimateForm" class="wedding-settings">'+
      '<label>Costo complessivo (€)<input name="gross" min="0" step=".01" type="number" value="'+
        Number(i.gross||0)+'" required></label>'+
      '<label>La tua quota (%)<input name="share" min="0" max="100" step=".01" type="number" value="'+
        Math.round(fraction*10000)/100+'" required></label>'+
      '<label>Mese di pagamento previsto<input name="month" type="month" value="'+
        esc(i.planningMonth||'')+'"></label>'+
      '<label>Data effettivamente concordata (opzionale)<input name="due" type="date" value="'+
        esc(i.due||'')+'"></label>'+
      '<p class="wedding-muted">Se non hai una data concordata, il mese serve solo alla '+
        'simulazione e non è una scadenza effettiva.</p>'+
      '<p class="wedding-form-error" role="alert"></p><button class="primary-button">Salva preventivo</button></form>');
    $('#weddingEstimateForm').onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget,error=$('.wedding-form-error',form);
      const gross=Number(form.elements.gross.value),share=Number(form.elements.share.value);
      if(!amount(gross)||share<0||share>100||!Number.isFinite(share)){
        error.textContent='Controlla costo e percentuale.';return}
      i.gross=round(gross);i.plannedMy=round(gross*share/100);
      if(Number(i.paidByMe||0)>i.gross){error.textContent='L’importo è inferiore ai pagamenti già registrati.';return}
      i.planningMonth=form.elements.month.value||null;i.due=form.elements.due.value||null;
      s.grossTotal=i.gross;
      await persist();$('#weddingDialog').close();
    };
  }
  function editIncome(month){
    const current=Number(project.forecast.incomes[month]||0);
    dialog('Entrata prevista · '+fmtMonth(month),
      '<form id="weddingIncomeForm" class="wedding-settings"><label>Entrata netta prevista (€)'+
      '<input type="number" min="0" step=".01" name="income" value="'+current+'" required></label>'+
      '<p class="wedding-muted">Modifica solo la previsione. Quando incassi davvero lo stipendio, '+
      'registralo normalmente in Finanze.</p><button type="submit" class="primary-button">Salva previsione</button></form>');
    $('#weddingIncomeForm').onsubmit=async e=>{
      e.preventDefault();const n=Number(e.currentTarget.elements.income.value);
      if(!amount(n))return;project.forecast.incomes[month]=round(n);
      await persist();$('#weddingDialog').close();
    };
  }
  async function importPlan(file){
    if(!file)return;
    try{
      if(file.size>1048576)throw Error('Il file supera 1 MB.');
      const raw=JSON.parse(await file.text()),next=validate(raw);
      if(project&&!confirm('Sostituire il piano Matrimonio esistente? Non verranno modificati conti o movimenti. Prima esporta il piano attuale.'))return;
      await FinanceDB.put(STORE,next);
      await reload();selectedTab='overview';render();status('Piano privato importato. Nessun conto è stato addebitato.');
    }catch(err){status(err.message||'Importazione non riuscita.')}
  }
  function exportPlan(){
    if(!project)return;
    const json=JSON.stringify({kind:'finanze-wedding-plan',version:1,project},null,2);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='finanze-matrimonio-privato.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('Piano esportato: conserva il JSON in privato.');
  }
  function bind(){
    document.addEventListener('click',e=>{
      const tab=e.target.closest('[data-wedding-tab]');
      if(tab){selectedTab=tab.dataset.weddingTab;render();return}
      const action=e.target.closest('[data-wedding-action]');
      if(action){
        if(action.dataset.weddingAction==='import')$('#weddingImportFile')?.click();
        if(action.dataset.weddingAction==='export')exportPlan();
        return;
      }
      const pay=e.target.closest('[data-wedding-pay]');
      if(pay){const [sid,iid]=pay.dataset.weddingPay.split('|');openPayment(sid,iid);return}
      const link=e.target.closest('[data-wedding-link]');
      if(link){const [sid,iid]=link.dataset.weddingLink.split('|');openPayment(sid,iid,true);return}
      const edit=e.target.closest('[data-wedding-edit]');
      if(edit){openEstimate(edit.dataset.weddingEdit);return}
      const income=e.target.closest('[data-wedding-income]');
      if(income){editIncome(income.dataset.weddingIncome);return}
      if(e.target.closest('[data-wedding-close]'))$('#weddingDialog')?.close();
      if(e.target.closest('[data-view="wedding"]'))reload().then(render).catch(console.error);
    });
    $('#weddingImportFile')?.addEventListener('change',e=>{
      importPlan(e.target.files?.[0]);e.target.value='';
    });
    document.addEventListener('submit',e=>{
      if(e.target.id!=='weddingSettingsForm')return;
      e.preventDefault();
      const form=e.target,f=project.forecast;
      const safety=Number(form.elements.safety.value),base=Number(form.elements.base.value),
        free=Number(form.elements.free.value);
      if(!amount(safety)||!amount(base)||!amount(free))return status('Controlla gli importi.');
      project.safetyBuffer=round(safety);f.monthlyBase=round(base);f.reservePerMonth=round(free);
      project.savingsAccountId=Number(form.elements.account.value)||null;
      persist('Previsioni aggiornate. I saldi dei conti non sono cambiati.').catch(console.error);
    });
    document.addEventListener('finanze:finance-changed',()=>{
      reload().then(render).catch(console.error);
    });
  }
  async function init(){
    if(initializing||!ROOT())return;initializing=true;
    try{await reload();render();bind()}catch(err){console.error('Modulo Matrimonio:',err);
      ROOT().innerHTML='<p class="wedding-notice">Impossibile caricare il piano. I dati restano nel dispositivo.</p>'}
  }
  return{init,validate,summary:()=>project?summary():null,forecast:()=>project?forecast():[]};
})();
document.addEventListener('DOMContentLoaded',FinanceWedding.init);
