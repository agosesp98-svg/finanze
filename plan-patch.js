/* Generic, private-on-device plan import. No user's financial records are embedded in this public script. */
const FinancePlanPatch=(()=>{
  const STORES=['accounts','budgets','commitments','expectedIncomes','goals','liabilities','settings'];
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const money=n=>Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<=100000000;
  const isDate=v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+'T12:00:00').getTime()));
  const goodName=x=>typeof x==='string'&&x.trim().length>0&&x.length<=100;
  function validate(p){
    if(!p||typeof p!=='object'||p.kind!=='finanze-plan-update'||p.version!==1||!goodName(p.id))
      throw Error('Formato del piano non riconosciuto.');
    if(!isDate(p.asOf)||!p.asOf)throw Error('Data del piano non valida.');
    for(const key of ['accounts','budgets','liabilities','recurring','expectedIncomes','goals'])
      if(!Array.isArray(p[key])||p[key].length>40)throw Error('Sezione non valida: '+key);
    if(!p.accounts.length||!p.budgets.length||!p.goals.length)throw Error('Il piano deve contenere conti, budget e obiettivi.');
    for(const [key,items] of Object.entries({accounts:p.accounts,budgets:p.budgets,liabilities:p.liabilities,recurring:p.recurring,expectedIncomes:p.expectedIncomes,goals:p.goals})){
      const seen=new Set();
      for(const row of items){
        if(!row||!goodName(row.name)||seen.has(norm(row.name)))throw Error('Nome mancante o duplicato in '+key);
        seen.add(norm(row.name));
        for(const field of ['balance','target','amount','monthly','finalPayment','current'])
          if(row[field]!==undefined&&!money(row[field]))throw Error('Importo non valido in '+row.name);
        for(const field of ['firstDueDate','nextDueDate','finalDueDate','recurrenceEnd','finalPaymentDate','dueDate','targetDate','expectedDate'])
          if(row[field]!==undefined&&!isDate(row[field]))throw Error('Data non valida in '+row.name);
        if(row.rateChanges!==undefined){
          if(!Array.isArray(row.rateChanges)||row.rateChanges.length>24||row.rateChanges.some(r=>!r||!isDate(r.date)||!r.date||!money(r.amount)))throw Error('Variazioni rate non valide.');
        }
      }
    }
    if(!p.salary||!money(p.salary.netLow)||!money(p.salary.netHigh)||p.salary.netHigh<p.salary.netLow)
      throw Error('Stipendio prudenziale non valido.');
    if(!Number.isInteger(p.salary.salaryDay)||p.salary.salaryDay<1||p.salary.salaryDay>28)
      throw Error('Giorno di accredito non valido.');
    if(!goodName(p.primaryAccount)||!p.accounts.some(x=>norm(x.name)===norm(p.primaryAccount)))
      throw Error('Conto principale non riconosciuto.');
    if(p.goals.some((g,i)=>!money(g.target)||g.target<=0||!Number.isInteger(g.priorityRank)||g.priorityRank<1||g.priorityRank>10))
      throw Error('Obiettivi o priorità non validi.');
    if(p.liabilities.some(l=>!money(l.monthly)||!l.nextDueDate))throw Error('Finanziamento senza rata o prossima scadenza.');
    if(p.recurring.some(c=>!money(c.amount)||!c.dueDate||c.amount<=0))throw Error('Ricorrenza senza importo o scadenza.');
    if(p.expectedIncomes.some(x=>!money(x.amount)||x.amount<=0||x.expectedDate))throw Error('Le entrate senza data devono restare non pianificate.');
    return p;
  }

  function prepare(snapshot,raw){
    const p=validate(raw),prev=(snapshot.settings||[]).find(x=>x.key==='planPatchAppliedId')?.value;
    if(prev===p.id)throw Error('Questo piano è già stato applicato. Non importarlo una seconda volta.');
    const stores=Object.fromEntries(STORES.map(k=>[k,(snapshot[k]||[]).map(x=>({...x}))]));
    const nextIds={};
    for(const key of STORES.filter(k=>k!=='settings'))
      nextIds[key]=Math.max(0,...stores[key].map(x=>Number(x.id||0)))+1;
    const add=(key,row)=>{const out={...row,id:nextIds[key]++};stores[key].push(out);return out};
    const identify=(row,item)=>[item.name,...(item.matchAliases||[])].some(alias=>norm(alias)===norm(row.name));
    const usedAccounts=new Set();
    for(const item of p.accounts){
      const old=stores.accounts.find(a=>!usedAccounts.has(a.id)&&identify(a,item));
      if(old){
        usedAccounts.add(old.id);Object.assign(old,{name:item.name,balance:Number(item.balance),kind:item.kind||old.kind||'Conto',protected:!!item.protected,archived:false});
      }else{
        const created=add('accounts',{name:item.name,balance:Number(item.balance),kind:item.kind||'Conto',protected:!!item.protected,archived:false,order:stores.accounts.length});
        usedAccounts.add(created.id);
      }
    }
    for(const old of stores.accounts)if(!usedAccounts.has(old.id)){old.balance=0;old.archived=true}
    const primary=stores.accounts.find(a=>!a.archived&&norm(a.name)===norm(p.primaryAccount));
    if(!primary)throw Error('Conto principale non trovato.');

    // Reuse category ids when possible, preserving historical movement links and tracked spending.
    const usedBudgets=new Set();
    for(const [i,item] of p.budgets.entries()){
      const old=stores.budgets.find(b=>!usedBudgets.has(b.id)&&identify(b,item));
      if(old){
        usedBudgets.add(old.id);
        Object.assign(old,{name:item.name,budget:Number(item.target),targetBudget:Number(item.target),
          ceilingBudget:Number(item.ceiling||item.target),order:i,archived:false});
      }else{
        const created=add('budgets',{name:item.name,budget:Number(item.target),targetBudget:Number(item.target),
          ceilingBudget:Number(item.ceiling||item.target),spent:0,order:i,archived:false});
        usedBudgets.add(created.id);
      }
    }
    for(const b of stores.budgets)if(!usedBudgets.has(b.id)){
      b.archived=true;b.targetBudget=0;b.budget=0;b.ceilingBudget=0;
    }

    // Preserve past paid commitments, but stop retired schedules from returning as forecasts.
    for(const c of stores.commitments){
      c.archived=true;c.active=false;c.recurring=false;c.cadence='Una tantum';
    }
    for(const l of stores.liabilities){
      l.archived=true;l.completed=true;l.monthly=0;l.nextDueDate='';
    }
    for(const g of stores.goals){g.archived=true;g.completed=true}
    for(const x of stores.expectedIncomes){x.archived=true}
    for(const [i,l] of p.liabilities.entries()){
      const loan=add('liabilities',{
        name:l.name,monthly:Number(l.monthly),remaining:l.remaining??null,
        firstDueDate:l.firstDueDate||l.nextDueDate,nextDueDate:l.nextDueDate,
        finalDueDate:l.finalDueDate||l.recurrenceEnd||'',
        recurrenceEnd:l.recurrenceEnd||l.finalDueDate||'',
        installmentsRemaining:l.installmentsRemaining??null,
        installmentsTotal:l.installmentsTotal??null,completedInstallments:0,completed:false,
        finalPayment:Number(l.finalPayment||0),finalPaymentDate:l.finalPaymentDate||'',
        finalPaymentDateEstimated:!!l.finalPaymentDateEstimated,
        fundedByGoal:!!l.fundedByGoal,
        rateChanges:Array.isArray(l.rateChanges)?l.rateChanges.map(r=>({date:r.date,amount:Number(r.amount)})):[],
        accountId:primary.id,scheduleKey:'plan-'+p.id+'-'+i,
        note:l.note||'',archived:false
      });
      add('commitments',{
        name:loan.name,amount:Number(loan.monthly),dueDate:loan.nextDueDate,cadence:'Mensile',estimated:false,
        active:true,recurring:true,generated:true,liabilityId:loan.id,liabilityKey:loan.scheduleKey,
        accountId:primary.id,firstDueDate:loan.firstDueDate
      });
    }
    for(const c of p.recurring){
      add('commitments',{
        name:c.name,amount:Number(c.amount),dueDate:c.dueDate,firstDueDate:c.firstDueDate||c.dueDate,
        recurrenceEnd:c.recurrenceEnd||'',cadence:c.cadence||'Mensile',recurring:true,estimated:!!c.estimated,
        active:true,accountId:primary.id,note:c.note||''
      });
    }
    for(const x of p.expectedIncomes){
      add('expectedIncomes',{name:x.name,amount:Number(x.amount),expectedDate:'',status:'pending',
        receivedDate:'',accountId:null,archived:false,note:'Data di incasso non confermata'});
    }
    const priorities=['Alta','Media','Bassa'];
    for(const g of p.goals){
      add('goals',{name:g.name,target:Number(g.target),current:Number(g.current||0),
        targetDate:g.targetDate||'',deadlinePrecision:g.deadlinePrecision||'day',
        priorityRank:g.priorityRank,priority:priorities[Math.min(2,g.priorityRank-1)],
        completed:false,archived:false,createdAt:p.asOf,note:g.note||''});
    }
    const settings=new Map(stores.settings.map(x=>[x.key,x]));
    const set=(key,value)=>settings.set(key,{key,value});
    set('salaryNet',Number(p.salary.netLow));
    set('salaryNetUpper',Number(p.salary.netHigh));
    set('salaryDay',p.salary.salaryDay);
    set('nextSalaryDate','');
    set('primaryAccountId',primary.id);
    set('employmentStartDate',p.salary.employmentStartDate||'');
    set('employmentConfirmedThrough',p.salary.confirmedThrough||'');
    set('employmentContinuation',p.salary.continuation||'unconfirmed');
    set('extraSalaryTreatment','Exclude unconfirmed 13th/14th payments from spendable and forecasts');
    set('planPatchAppliedId',p.id);
    set('planAsOf',p.asOf);
    set('planAppliedAt',new Date().toISOString());
    stores.settings=[...settings.values()];
    return{
      stores,
      preview:{
        name:p.label||'Nuovo piano finanziario',
        asOf:p.asOf,
        accounts:p.accounts.length,budgets:p.budgets.length,loans:p.liabilities.length,
        recurring:p.recurring.length,expectedIncomes:p.expectedIncomes.length,goals:p.goals.length,
        preservedMovements:(snapshot.movements||[]).length,
        archivedAccounts:stores.accounts.filter(x=>x.archived).length,
        archivedCommitments:stores.commitments.filter(x=>x.archived).length,
        salaryRange:[p.salary.netLow,p.salary.netHigh],
        liquid:p.accounts.reduce((sum,x)=>sum+(!x.protected?Number(x.balance):0),0)
      }
    };
  }
  return{validate,prepare};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinancePlanPatch;
