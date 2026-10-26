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
      if(c.liabilityId||c.liabilityKey)continue;
      const cadence=norm(c.cadence);
      if(!(c.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman')))continue;
      const key=norm(c.name);if(!key)continue;
      const old=recurring.get(key);
      if(!old||String(c.dueDate||'')>String(old.dueDate||''))recurring.set(key,c);
    }
    return [...recurring.values()];
  }

  function fixedBreakdown(liabilities=[],commitments=[]){
    const liabilityItems=liabilities.filter(l=>!l.completed&&Number(l.monthly||0)>0).map(l=>({kind:'liability',id:l.id,name:l.name,amount:Number(l.monthly||0)}));
    const recurringItems=recurringCommitments(commitments).map(c=>({kind:'recurring',id:c.id,name:c.name,amount:monthlyEquivalent(c)}));
    const items=[...liabilityItems,...recurringItems];
    return{items,total:items.reduce((s,x)=>s+x.amount,0)};
  }

  function fixedMonthly(liabilities,commitments){return fixedBreakdown(liabilities,commitments).total}

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

  function calculate({accounts=[],budgets=[],commitments=[],liabilities=[],goals=[],settings=[]},now=new Date()){
    const today=iso(now),salary=salaryDate(settings,now);
    const total=accounts.reduce((s,a)=>s+Number(a.balance||0),0);
    const protectedTotal=accounts.filter(a=>a.protected).reduce((s,a)=>s+Number(a.balance||0),0);
    const ordinary=total-protectedTotal;
    const activeDue=commitments.filter(c=>c.active!==false&&c.dueDate&&String(c.dueDate)<=salary);
    const due=activeDue.reduce((s,c)=>s+Number(c.amount||0),0);
    const overallShortfall=Math.max(0,due-ordinary);
    const primaryId=Number(setting(settings,'primaryAccountId',accounts.find(a=>!a.protected)?.id||0));
    const primary=accounts.find(a=>Number(a.id)===primaryId)||accounts.find(a=>!a.protected)||null;
    const primaryDue=activeDue.reduce((s,c)=>{
      let accountId=c.accountId;
      if(!accountId&&(c.liabilityId||c.liabilityKey)){
        const l=liabilities.find(x=>Number(x.id)===Number(c.liabilityId)||(c.liabilityKey&&x.scheduleKey===c.liabilityKey));
        accountId=l?.accountId;
      }
      if(!accountId)accountId=primary?.id;
      return Number(accountId)===Number(primary?.id)?s+Number(c.amount||0):s;
    },0);
    const primaryShortfall=primary?Math.max(0,primaryDue-Number(primary.balance||0)):0;
    const blockingShortfall=Math.max(overallShortfall,primaryShortfall);
    const budgetRemaining=budgets.reduce((s,b)=>s+Math.max(0,budgetTarget(b)-Number(b.spent||0)),0);
    const afterDue=Math.max(0,ordinary-due);
    const spendable=blockingShortfall>0?0:Math.max(0,Math.min(budgetRemaining,afterDue));
    const days=Math.max(1,daysBetween(today,salary)+1);
    const salaryNet=Number(setting(settings,'salaryNet',0)||0);
    const monthlyBudget=budgets.reduce((s,b)=>s+budgetTarget(b),0);
    const fixedData=fixedBreakdown(liabilities,commitments),fixed=fixedData.total;
    const goalCapacity=Math.max(0,salaryNet-monthlyBudget-fixed);
    const goal=primaryGoal(goals,now),goalNeed=goal?goalStats(goal,now).monthly:null;
    return{today,salary,total,protectedTotal,ordinary,activeDue,due,overallShortfall,primaryShortfall,blockingShortfall,primary,primaryDue,budgetRemaining,afterDue,spendable,days,daily:spendable/days,salaryNet,monthlyBudget,fixed,fixedItems:fixedData.items,goalCapacity,goal,goalNeed,goalGap:goalNeed?Math.max(0,goalNeed-goalCapacity):0};
  }

  function monthSequence(now=new Date(),count=6){
    const out=[];
    for(let i=0;i<count;i++){
      const d=new Date(now.getFullYear(),now.getMonth()+i,1,12);
      out.push({key:iso(d).slice(0,7),date:d});
    }
    return out;
  }

  function projection(snapshot,months=6,now=new Date()){
    const {budgets=[],liabilities=[],commitments=[],settings=[],goals=[]}=snapshot;
    const salaryNet=Number(setting(settings,'salaryNet',0)||0),monthlyBudget=budgets.reduce((s,b)=>s+budgetTarget(b),0);
    const standalone=recurringCommitments(commitments);
    const goal=primaryGoal(goals,now);
    return monthSequence(now,months).map(({key,date})=>{
      const liabilityFixed=liabilities.filter(l=>{
        if(l.completed||Number(l.monthly||0)<=0)return false;
        const start=monthKey(l.firstDueDate||l.nextDueDate||'');
        const end=monthKey(l.recurrenceEnd||l.finalDueDate||'');
        if(start&&key<start)return false;
        if(end&&key>end)return false;
        return true;
      }).reduce((s,l)=>s+Number(l.monthly||0),0);
      const recurringFixed=standalone.filter(c=>!c.dueDate||key>=monthKey(c.dueDate)).reduce((s,c)=>s+monthlyEquivalent(c),0);
      const fixed=liabilityFixed+recurringFixed;
      const capacity=Math.max(0,salaryNet-monthlyBudget-fixed);
      const need=goal?goalStats(goal,date).monthly:null;
      return{month:key,date,fixed,monthlyBudget,salaryNet,capacity,goalNeed:need,gap:need?Math.max(0,need-capacity):0};
    });
  }

  function nextDateByCadence(date,cadence){
    if(!date)return null;const d=parse(date),c=norm(cadence);if(!d)return null;
    if(c.includes('14 giorni'))d.setDate(d.getDate()+14);
    else if(c.includes('settiman'))d.setDate(d.getDate()+7);
    else if(c.includes('mensil')){const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));}
    else return null;
    return iso(d);
  }

  async function syncBudgetCycle(db,snapshot,now=new Date()){
    const {budgets=[],settings=[]}=snapshot,current=cycleStart(settings,now),stored=String(setting(settings,'activeBudgetCycle','')||'');
    if(!stored){await db.put('settings',{key:'activeBudgetCycle',value:current});return{changed:false,initialized:true,current}}
    if(stored===current)return{changed:false,current};
    const history=Array.isArray(setting(settings,'budgetCycleHistory',[]))?setting(settings,'budgetCycleHistory',[]):[];
    const model=calculate(snapshot,now);
    history.unshift({cycle:stored,closedAt:iso(now),salary:model.salaryNet,budgetTarget:model.monthlyBudget,budgetSpent:budgets.reduce((s,b)=>s+Number(b.spent||0),0),fixed:model.fixed,goalCapacity:model.goalCapacity,budgets:budgets.map(b=>({id:b.id,name:b.name,target:budgetTarget(b),spent:Number(b.spent||0)}))});
    await db.put('settings',{key:'budgetCycleHistory',value:history.slice(0,12)});
    for(const b of budgets)await db.put('budgets',{...b,spent:0});
    await db.put('settings',{key:'activeBudgetCycle',value:current});
    return{changed:true,previous:stored,current};
  }

  async function repairSchedules(db,snapshot,now=new Date()){
    const {liabilities=[],commitments=[]}=snapshot;let changed=false;
    for(const original of liabilities){
      const l={...original};
      const linked=commitments.filter(c=>Number(c.liabilityId)===Number(l.id)||(l.scheduleKey&&c.liabilityKey===l.scheduleKey));
      const noBalloon=!Number(l.finalPayment||0);
      const finishedByCount=l.installmentsRemaining!=null&&Number(l.installmentsRemaining)<=0;
      const finishedByResidual=l.remaining!=null&&Number(l.remaining)<=0;
      if(!l.completed&&noBalloon&&(finishedByCount||finishedByResidual)){l.completed=true;l.monthly=0;l.nextDueDate='';await db.put('liabilities',l);changed=true;}
      if(l.completed){for(const c of linked.filter(c=>c.active!==false)){await db.put('commitments',{...c,active:false,note:[c.note,'Piano completato'].filter(Boolean).join(' · ')});changed=true;}continue;}
      if(l.recurrenceEnd&&l.nextDueDate&&String(l.nextDueDate)>String(l.recurrenceEnd)&&Number(l.finalPayment||0)>0){l.regularMonthly=l.regularMonthly??l.monthly;l.monthly=0;l.monthlyPhaseComplete=true;l.nextDueDate=l.finalPaymentDate||'';await db.put('liabilities',l);changed=true;}
      const cutoff=l.recurrenceEnd||l.finalDueDate||'';
      for(const c of linked.filter(c=>c.active!==false&&c.dueDate)){
        const isFinal=Number(l.finalPayment||0)>0&&l.finalPaymentDate&&String(c.dueDate)===String(l.finalPaymentDate)&&Number(c.amount||0)===Number(l.finalPayment||0);
        if(cutoff&&String(c.dueDate)>String(cutoff)&&!isFinal){await db.put('commitments',{...c,active:false});changed=true;}
      }
      if(Number(l.finalPayment||0)>0&&l.monthlyPhaseComplete&&l.finalPaymentDate){
        const exists=linked.some(c=>c.active!==false&&String(c.dueDate)===String(l.finalPaymentDate)&&Number(c.amount||0)===Number(l.finalPayment||0));
        if(!exists){await db.add('commitments',{name:l.name||'Pagamento finale',amount:Number(l.finalPayment),dueDate:l.finalPaymentDate,cadence:'Una tantum',estimated:false,active:true,recurring:false,generated:true,liabilityId:l.id,liabilityKey:l.scheduleKey||'',note:'Pagamento finale collegato al finanziamento'});changed=true;}
      }else if(Number(l.monthly||0)>0&&l.nextDueDate){
        const beyond=cutoff&&String(l.nextDueDate)>String(cutoff);
        const exists=linked.some(c=>c.active!==false&&String(c.dueDate)===String(l.nextDueDate));
        if(!beyond&&!exists){await db.add('commitments',{name:l.name,amount:Number(l.monthly),dueDate:l.nextDueDate,cadence:'Mensile',estimated:false,active:true,recurring:true,generated:true,liabilityId:l.id,liabilityKey:l.scheduleKey||'',note:'Scadenza collegata al piano rate'});changed=true;}
      }
    }
    const groups=new Map();
    for(const c of commitments){
      if(c.liabilityId||c.liabilityKey)continue;const cadence=norm(c.cadence);
      if(!(c.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman')))continue;
      const key=norm(c.name);if(!key)continue;const old=groups.get(key);if(!old||String(c.dueDate||'')>String(old.dueDate||''))groups.set(key,c);
    }
    const today=iso(now);
    for(const latest of groups.values()){
      if(latest.active!==false&&latest.dueDate>=today)continue;
      let next=nextDateByCadence(latest.dueDate,latest.cadence);if(!next)continue;
      while(next<today)next=nextDateByCadence(next,latest.cadence);
      if(commitments.some(c=>c.active!==false&&norm(c.name)===norm(latest.name)&&c.dueDate===next))continue;
      const copy={...latest};delete copy.id;delete copy.paidDate;delete copy.paidAmount;copy.dueDate=next;copy.active=true;copy.generated=true;copy.recurring=true;copy.estimated=false;await db.add('commitments',copy);changed=true;
    }
    return{changed};
  }

  return{norm,iso,parse,calculate,salaryDate,cycleStart,budgetTarget,budgetCeiling,monthlyEquivalent,fixedMonthly,fixedBreakdown,goalStats,primaryGoal,projection,nextDateByCadence,syncBudgetCycle,repairSchedules};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinanceEngine;
