const FinanceEngine=(()=>{
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parse=s=>s?new Date(`${s}T12:00:00`):null;
  const monthKey=s=>String(s||'').slice(0,7);
  const daysBetween=(a,b)=>Math.max(0,Math.ceil((parse(b)-parse(a))/86400000));
  const setting=(settings,key,fallback=null)=>settings.find(x=>x.key===key)?.value??fallback;
  const budgetTarget=b=>Number(b.targetBudget??b.budget??0);
  const budgetCeiling=b=>Number(b.ceilingBudget??b.budget??0);

  function salaryDate(settings,now=new Date()){
    const configured=String(setting(settings,'nextSalaryDate','')||'');
    const today=iso(now);
    if(configured&&configured>=today)return configured;
    const day=clamp(Number(setting(settings,'salaryDay',setting(settings,'salaryLatestDay',10)))||10,1,28);
    let d=new Date(now.getFullYear(),now.getMonth(),day,12);
    if(now.getDate()>day)d=new Date(now.getFullYear(),now.getMonth()+1,day,12);
    return iso(d);
  }

  function cycleStart(settings,now=new Date()){
    const day=clamp(Number(setting(settings,'salaryDay',setting(settings,'salaryLatestDay',10)))||10,1,28);
    let d=new Date(now.getFullYear(),now.getMonth(),day,12);
    if(now.getDate()<day)d=new Date(now.getFullYear(),now.getMonth()-1,day,12);
    return iso(d);
  }

  function monthlyEquivalent(c){
    const cadence=norm(c.cadence),amount=Number(c.amount||0);
    if(cadence.includes('14 giorni'))return amount*26/12;
    if(cadence.includes('settiman'))return amount*52/12;
    if(cadence.includes('mensil'))return amount;
    return 0;
  }

  function recurringCommitments(commitments){
    const recurring=new Map();
    for(const c of commitments){
      if(c.archived||c.liabilityId||c.liabilityKey)continue;
      const cadence=norm(c.cadence);
      if(!(c.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman')))continue;
      const key=norm(c.name);if(!key)continue;
      const old=recurring.get(key);
      if(!old||String(c.dueDate||'')>String(old.dueDate||''))recurring.set(key,c);
    }
    return [...recurring.values()];
  }

  // Future occurrences are projections, not persisted debts or paid movements.
  // Only real commitments may be paid; projected entries become real when
  // the preceding installment is marked paid by the existing app workflow.
  function scheduledCommitments(commitments=[],now=new Date(),months=6,liabilities=[]){
    const today=iso(now),span=clamp(Math.floor(Number(months)||6),1,24);
    const horizon=iso(new Date(now.getFullYear(),now.getMonth()+span,1,12));
    const actual=commitments.filter(c=>!c.archived&&c.active!==false&&c.dueDate);
    const seen=new Set(commitments.filter(c=>!c.archived&&c.dueDate).map(c=>`${norm(c.name)}|${c.dueDate}`));
    const forecasts=[];
    for(const latest of recurringCommitments(commitments)){
      if(!latest.dueDate)continue;
      let next=nextDateByCadence(latest.dueDate,latest.cadence);
      for(let steps=0;next&&next<horizon&&steps<150;steps++){
        const key=`${norm(latest.name)}|${next}`;
        if(latest.recurrenceEnd&&next>latest.recurrenceEnd)break;
        if(next>=today&&!seen.has(key)){
          forecasts.push({
            name:latest.name,amount:Number(latest.amount||0),dueDate:next,
            cadence:latest.cadence,accountId:latest.accountId,
            active:true,estimated:!!latest.estimated,projected:true,
            sourceCommitmentId:latest.id,sourceDueDate:latest.dueDate
          });
          seen.add(key);
        }
        const following=nextDateByCadence(next,latest.cadence);
        if(!following||following<=next)break;
        next=following;
      }
    }
    // Only virtual future installments; the already recorded due date wins when present.
    for(const l of liabilities){
      if(l.completed||l.archived||Number(l.monthly||0)<=0)continue;
      let due=l.nextDueDate||l.firstDueDate;
      if(!due)continue;
      const end=l.recurrenceEnd||l.finalDueDate||'';
      for(let step=0;due&&due<horizon&&step<span+4;step++){
        if(end&&due>end)break;
        const amount=liabilityAmountForMonth(l,monthKey(due)),key=`${norm(l.name)}|${due}`;
        if(due>=today&&amount>0&&!seen.has(key)){
          forecasts.push({name:l.name,amount,dueDate:due,active:true,projected:true,estimated:false,cadence:'Mensile',
            accountId:l.accountId,liabilityId:l.id,liabilityKey:l.scheduleKey||'',sourceLiabilityId:l.id});
          seen.add(key);
        }
        const next=nextDateByCadence(due,'Mensile');
        if(!next||next<=due)break;
        due=next;
      }
      if(Number(l.finalPayment||0)>0&&l.finalPaymentDate&&l.finalPaymentDate>=today&&l.finalPaymentDate<horizon){
        const key=`${norm(l.name)}|${l.finalPaymentDate}`;
        if(!seen.has(key)){
          forecasts.push({name:l.name+' · pagamento finale',amount:Number(l.finalPayment),dueDate:l.finalPaymentDate,
            cadence:'Una tantum',active:true,projected:true,estimated:!!l.finalPaymentDateEstimated,
            accountId:l.accountId,liabilityId:l.id,sourceLiabilityId:l.id,balloon:true,fundedByGoal:!!l.fundedByGoal});
          seen.add(key);
        }
      }
    }
    return [...actual,...forecasts].sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))||(a.projected?1:-1));
  }

  function liabilityStarted(l,now=new Date()){
    const current=monthKey(iso(now));
    if(l.firstDueDate)return current>=monthKey(l.firstDueDate);
    if(Number(l.completedInstallments||0)<=0&&l.nextDueDate&&monthKey(l.nextDueDate)>current)return false;
    return true;
  }

  function recurringStarted(c,now=new Date()){
    if(!c.firstDueDate)return true;
    return monthKey(iso(now))>=monthKey(c.firstDueDate);
  }

  function liabilityAmountForMonth(l,key){
    if(!l||l.completed||l.archived)return 0;
    const start=monthKey(l.firstDueDate||((Number(l.completedInstallments||0)<=0)?l.nextDueDate:'')||'');
    const end=monthKey(l.recurrenceEnd||l.finalDueDate||'');
    if(start&&key<start)return 0;
    if(end&&key>end)return 0;
    if(l.monthlyPhaseComplete)return 0;
    let amount=Number(l.baseMonthly??l.monthly??0);
    if(Array.isArray(l.rateChanges)){
      for(const change of [...l.rateChanges].sort((a,b)=>String(a.date).localeCompare(String(b.date)))){
        if(change.date&&monthKey(change.date)<=key)amount=Number(change.amount||0);
      }
    }
    return Math.max(0,amount);
  }

  function fixedBreakdown(liabilities=[],commitments=[],now=new Date()){
    const key=monthKey(iso(now));
    const liabilityItems=liabilities.filter(l=>!l.archived&&liabilityAmountForMonth(l,key)>0&&liabilityStarted(l,now))
      .map(l=>({kind:'liability',id:l.id,name:l.name,amount:liabilityAmountForMonth(l,key)}));
    const recurringItems=recurringCommitments(commitments)
      .filter(c=>recurringStarted(c,now)&&(!c.recurrenceEnd||monthKey(c.recurrenceEnd)>=key))
      .map(c=>({kind:'recurring',id:c.id,name:c.name,amount:monthlyEquivalent(c)}));
    const items=[...liabilityItems,...recurringItems];
    return{items,total:items.reduce((s,x)=>s+x.amount,0)};
  }

  function fixedMonthly(liabilities,commitments,now=new Date()){return fixedBreakdown(liabilities,commitments,now).total}

  function monthsUntil(date,now=new Date()){
    if(!date)return null;const b=parse(date);if(!b||Number.isNaN(b.getTime()))return null;
    let months=(b.getFullYear()-now.getFullYear())*12+(b.getMonth()-now.getMonth());
    if(b.getDate()>now.getDate())months+=1;
    return Math.max(1,months);
  }

  function goalStats(g,now=new Date()){
    const target=Number(g.target||0),current=Number(g.current||0),remaining=Math.max(0,target-current),pct=target?clamp(current/target*100,0,100):0;
    const months=monthsUntil(g.targetDate,now),monthly=months?remaining/months:null;
    return{target,current,remaining,pct,months,monthly};
  }

  function primaryGoal(goals,now=new Date()){
    const rank=v=>norm(v)==='alta'?0:norm(v)==='media'?1:2;
    return goals.filter(g=>!g.completed&&Number(g.target||0)>Number(g.current||0)).sort((a,b)=>rank(a.priority)-rank(b.priority)||String(a.targetDate||'9999').localeCompare(String(b.targetDate||'9999')))[0]||null;
  }

  function monthBreakdown(snapshot,key,now=new Date()){
    const {budgets=[],liabilities=[],commitments=[],settings=[],goals=[]}=snapshot;
    const date=parse(`${key}-01`)||now;
    const budgetItems=budgets.filter(b=>budgetTarget(b)>0).map(b=>({kind:'budget',id:b.id,name:b.name,amount:budgetTarget(b)}));
    const budgetTotal=budgetItems.reduce((s,x)=>s+x.amount,0);
    const rateItems=liabilities.filter(l=>liabilityAmountForMonth(l,key)>0)
      .map(l=>({kind:'liability',id:l.id,name:l.name,amount:liabilityAmountForMonth(l,key)}));
    const recurringItems=recurringCommitments(commitments)
      .filter(c=>(!c.firstDueDate||key>=monthKey(c.firstDueDate))&&(!c.recurrenceEnd||key<=monthKey(c.recurrenceEnd)))
      .map(c=>({kind:'recurring',id:c.id,name:c.name,amount:monthlyEquivalent(c)}));
    const rateTotal=rateItems.reduce((s,x)=>s+x.amount,0),recurringTotal=recurringItems.reduce((s,x)=>s+x.amount,0),fixedTotal=rateTotal+recurringTotal;
    const salaryNet=Number(setting(settings,'salaryNet',0)||0),plannedOutflow=budgetTotal+fixedTotal,capacity=Math.max(0,salaryNet-plannedOutflow),goal=primaryGoal(goals,date),goalNeed=goal?goalStats(goal,date).monthly:null;
    return{month:key,date,salaryNet,budgetItems,budgetTotal,rateItems,rateTotal,recurringItems,recurringTotal,fixedTotal,plannedOutflow,capacity,goal,goalNeed,gap:goalNeed?Math.max(0,goalNeed-capacity):0};
  }

  function commitmentAccountId(c,liabilities,primary){
    let accountId=c.accountId;
    if(!accountId&&(c.liabilityId||c.liabilityKey)){
      const l=liabilities.find(x=>Number(x.id)===Number(c.liabilityId)||(c.liabilityKey&&x.scheduleKey===c.liabilityKey));
      accountId=l?.accountId;
    }
    return Number(accountId||primary?.id||0)||0;
  }

  function accountFunding(activeDue,accounts,liabilities,primary){
    const dueByAccount=new Map();
    for(const c of activeDue){
      const accountId=commitmentAccountId(c,liabilities,primary),key=accountId||'unassigned';
      dueByAccount.set(key,(dueByAccount.get(key)||0)+Number(c.amount||0));
    }
    return [...dueByAccount.entries()].map(([key,due])=>{
      const account=key==='unassigned'?null:accounts.find(a=>Number(a.id)===Number(key));
      const balance=account&&!account.protected?Number(account.balance||0):0;
      return{accountId:account?.id??null,accountName:account?.name||'Conto da finanziare',due,balance,shortfall:Math.max(0,due-balance)};
    });
  }

  function calculate({accounts=[],budgets=[],commitments=[],liabilities=[],goals=[],settings=[]},now=new Date()){
    const today=iso(now),salary=salaryDate(settings,now);
    const total=accounts.reduce((s,a)=>s+Number(a.balance||0),0);
    const protectedTotal=accounts.filter(a=>a.protected).reduce((s,a)=>s+Number(a.balance||0),0);
    const ordinary=total-protectedTotal;
    const activeDue=scheduledCommitments(commitments,now,6,liabilities).filter(c=>String(c.dueDate)<=salary);
    const due=activeDue.reduce((s,c)=>s+Number(c.amount||0),0);
    const overallShortfall=Math.max(0,due-ordinary);
    const primaryId=Number(setting(settings,'primaryAccountId',accounts.find(a=>!a.protected)?.id||0));
    const primary=accounts.find(a=>Number(a.id)===primaryId)||accounts.find(a=>!a.protected)||null;
    const accountCoverage=accountFunding(activeDue,accounts,liabilities,primary);
    const fundingShortfall=accountCoverage.reduce((s,x)=>s+Number(x.shortfall||0),0);
    const primaryCoverage=accountCoverage.find(x=>Number(x.accountId)===Number(primary?.id));
    const primaryDue=Number(primaryCoverage?.due||0);
    const primaryShortfall=Number(primaryCoverage?.shortfall||0);
    const blockingShortfall=Math.max(overallShortfall,fundingShortfall);
    const budgetRemaining=budgets.reduce((s,b)=>s+Math.max(0,budgetTarget(b)-Number(b.spent||0)),0);
    const afterDue=Math.max(0,ordinary-due);
    const spendable=blockingShortfall>0?0:Math.max(0,Math.min(budgetRemaining,afterDue));
    const days=Math.max(1,daysBetween(today,salary)+1);
    const salaryNet=Number(setting(settings,'salaryNet',0)||0);
    const monthlyBudget=budgets.reduce((s,b)=>s+budgetTarget(b),0);
    const fixedData=fixedBreakdown(liabilities,commitments,now),fixed=fixedData.total;
    const rateTotal=fixedData.items.filter(x=>x.kind==='liability').reduce((s,x)=>s+x.amount,0),recurringTotal=fixedData.items.filter(x=>x.kind==='recurring').reduce((s,x)=>s+x.amount,0);
    const goalCapacity=Math.max(0,salaryNet-monthlyBudget-fixed);
    const goal=primaryGoal(goals,now),goalNeed=goal?goalStats(goal,now).monthly:null;
    return{today,salary,total,protectedTotal,ordinary,activeDue,due,overallShortfall,accountCoverage,fundingShortfall,primaryShortfall,blockingShortfall,primary,primaryDue,budgetRemaining,afterDue,spendable,days,daily:spendable/days,salaryNet,monthlyBudget,fixed,rateTotal,recurringTotal,fixedItems:fixedData.items,goalCapacity,goal,goalNeed,goalGap:goalNeed?Math.max(0,goalNeed-goalCapacity):0};
  }

  function monthSequence(now=new Date(),count=6){const out=[];for(let i=0;i<count;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1,12);out.push({key:iso(d).slice(0,7),date:d})}return out}
  function projection(snapshot,months=6,now=new Date()){
    return monthSequence(now,months).map(({key,date})=>{
      const b=monthBreakdown(snapshot,key,now);
      return{month:key,date,fixed:b.fixedTotal,rateTotal:b.rateTotal,recurringTotal:b.recurringTotal,monthlyBudget:b.budgetTotal,plannedOutflow:b.plannedOutflow,salaryNet:b.salaryNet,capacity:b.capacity,goalNeed:b.goalNeed,gap:b.gap,budgetItems:b.budgetItems,rateItems:b.rateItems,recurringItems:b.recurringItems};
    });
  }

  function nextDateByCadence(date,cadence){if(!date)return null;const d=parse(date),c=norm(cadence);if(!d)return null;if(c.includes('14 giorni'))d.setDate(d.getDate()+14);else if(c.includes('settiman'))d.setDate(d.getDate()+7);else if(c.includes('mensil')){const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max))}else return null;return iso(d)}

  async function syncBudgetCycle(db,snapshot,now=new Date()){
    const {budgets=[],settings=[]}=snapshot,current=cycleStart(settings,now),stored=String(setting(settings,'activeBudgetCycle','')||'');
    if(!stored){await db.put('settings',{key:'activeBudgetCycle',value:current});return{changed:false,initialized:true,current}}
    if(stored===current)return{changed:false,current};
    const history=Array.isArray(setting(settings,'budgetCycleHistory',[]))?setting(settings,'budgetCycleHistory',[]):[],model=calculate(snapshot,now);
    history.unshift({cycle:stored,closedAt:iso(now),salary:model.salaryNet,budgetTarget:model.monthlyBudget,budgetSpent:budgets.reduce((s,b)=>s+Number(b.spent||0),0),fixed:model.fixed,goalCapacity:model.goalCapacity,budgets:budgets.map(b=>({id:b.id,name:b.name,target:budgetTarget(b),spent:Number(b.spent||0)}))});
    await db.put('settings',{key:'budgetCycleHistory',value:history.slice(0,12)});for(const b of budgets)await db.put('budgets',{...b,spent:0});await db.put('settings',{key:'activeBudgetCycle',value:current});return{changed:true,previous:stored,current};
  }

  async function repairSchedules(db,snapshot,now=new Date()){
    const {liabilities=[],commitments=[]}=snapshot;let changed=false;
    for(const original of liabilities.filter(x=>!x.archived)){
      const l={...original},linked=commitments.filter(c=>Number(c.liabilityId)===Number(l.id)||(l.scheduleKey&&c.liabilityKey===l.scheduleKey)),noBalloon=!Number(l.finalPayment||0),finishedByCount=l.installmentsRemaining!=null&&Number(l.installmentsRemaining)<=0,finishedByResidual=l.remaining!=null&&Number(l.remaining)<=0;
      if(!l.completed&&noBalloon&&(finishedByCount||finishedByResidual)){l.completed=true;l.monthly=0;l.nextDueDate='';await db.put('liabilities',l);changed=true}
      if(l.completed){for(const c of linked.filter(c=>c.active!==false)){await db.put('commitments',{...c,active:false,note:[c.note,'Piano completato'].filter(Boolean).join(' · ')});changed=true}continue}
      if(l.recurrenceEnd&&l.nextDueDate&&String(l.nextDueDate)>String(l.recurrenceEnd)&&Number(l.finalPayment||0)>0){l.regularMonthly=l.regularMonthly??l.monthly;l.monthly=0;l.monthlyPhaseComplete=true;l.nextDueDate=l.finalPaymentDate||'';await db.put('liabilities',l);changed=true}
      const cutoff=l.recurrenceEnd||l.finalDueDate||'';
      for(const c of linked.filter(c=>c.active!==false&&c.dueDate)){const isFinal=Number(l.finalPayment||0)>0&&l.finalPaymentDate&&String(c.dueDate)===String(l.finalPaymentDate)&&Number(c.amount||0)===Number(l.finalPayment||0);if(cutoff&&String(c.dueDate)>String(cutoff)&&!isFinal){await db.put('commitments',{...c,active:false});changed=true}}
      if(Number(l.finalPayment||0)>0&&l.monthlyPhaseComplete&&l.finalPaymentDate){const exists=linked.some(c=>c.active!==false&&String(c.dueDate)===String(l.finalPaymentDate)&&Number(c.amount||0)===Number(l.finalPayment||0));if(!exists){await db.add('commitments',{name:l.name||'Pagamento finale',amount:Number(l.finalPayment),dueDate:l.finalPaymentDate,cadence:'Una tantum',estimated:false,active:true,recurring:false,generated:true,liabilityId:l.id,liabilityKey:l.scheduleKey||'',note:'Pagamento finale collegato al finanziamento'});changed=true}}
      else if(Number(l.monthly||0)>0&&l.nextDueDate){const beyond=cutoff&&String(l.nextDueDate)>String(cutoff),exists=linked.some(c=>c.active!==false&&String(c.dueDate)===String(l.nextDueDate));if(!beyond&&!exists){await db.add('commitments',{name:l.name,amount:liabilityAmountForMonth(l,monthKey(l.nextDueDate)),dueDate:l.nextDueDate,cadence:'Mensile',estimated:false,active:true,recurring:true,generated:true,liabilityId:l.id,liabilityKey:l.scheduleKey||'',note:'Scadenza collegata al piano rate'});changed=true}}
    }
    const groups=new Map();for(const c of commitments){if(c.archived||c.liabilityId||c.liabilityKey)continue;const cadence=norm(c.cadence);if(!(c.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman')))continue;const key=norm(c.name);if(!key)continue;const old=groups.get(key);if(!old||String(c.dueDate||'')>String(old.dueDate||''))groups.set(key,c)}
    const today=iso(now);for(const latest of groups.values()){if(latest.active!==false)continue;let next=nextDateByCadence(latest.dueDate,latest.cadence);if(!next)continue;while(next<today)next=nextDateByCadence(next,latest.cadence);if(latest.recurrenceEnd&&next>latest.recurrenceEnd)continue;if(commitments.some(c=>c.active!==false&&norm(c.name)===norm(latest.name)&&c.dueDate===next))continue;const copy={...latest};delete copy.id;delete copy.paidDate;delete copy.paidAmount;copy.dueDate=next;copy.active=true;copy.generated=true;copy.recurring=true;copy.estimated=false;await db.add('commitments',copy);changed=true}
    return{changed};
  }

  return{norm,iso,parse,calculate,scheduledCommitments,liabilityAmountForMonth,salaryDate,cycleStart,budgetTarget,budgetCeiling,monthlyEquivalent,fixedMonthly,fixedBreakdown,monthBreakdown,goalStats,primaryGoal,projection,nextDateByCadence,syncBudgetCycle,repairSchedules};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinanceEngine;
