const FinanceEngineV35=(()=>{
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parse=s=>s?new Date(`${s}T12:00:00`):null;
  const daysBetween=(a,b)=>Math.max(0,Math.ceil((parse(b)-parse(a))/86400000));
  const setting=(settings,key,fallback=null)=>settings.find(x=>x.key===key)?.value??fallback;
  const budgetTarget=b=>Number(b.targetBudget??b.budget??0);

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

  function fixedMonthly(liabilities,commitments){
    const liabilityMonthly=liabilities.filter(l=>!l.completed&&Number(l.monthly||0)>0).reduce((s,l)=>s+Number(l.monthly||0),0);
    const recurring=new Map();
    for(const c of commitments){
      if(c.liabilityId||c.liabilityKey)continue;
      const cadence=norm(c.cadence);
      if(!(c.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman')))continue;
      const key=norm(c.name);if(!key)continue;
      const old=recurring.get(key);
      if(!old||String(c.dueDate||'')>String(old.dueDate||''))recurring.set(key,c);
    }
    return liabilityMonthly+[...recurring.values()].reduce((s,c)=>s+monthlyEquivalent(c),0);
  }

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
    const fixed=fixedMonthly(liabilities,commitments);
    const goalCapacity=Math.max(0,salaryNet-monthlyBudget-fixed);
    const goal=primaryGoal(goals,now),goalNeed=goal?goalStats(goal,now).monthly:null;
    return{today,salary,total,protectedTotal,ordinary,activeDue,due,overallShortfall,primaryShortfall,blockingShortfall,primary,primaryDue,budgetRemaining,afterDue,spendable,days,daily:spendable/days,salaryNet,monthlyBudget,fixed,goalCapacity,goal,goalNeed,goalGap:goalNeed?Math.max(0,goalNeed-goalCapacity):0};
  }

  async function syncBudgetCycle(db,{budgets=[],settings=[]},now=new Date()){
    const current=cycleStart(settings,now),stored=String(setting(settings,'activeBudgetCycle','')||'');
    if(!stored){await db.put('settings',{key:'activeBudgetCycle',value:current});return{changed:false,initialized:true,current}}
    if(stored===current)return{changed:false,current};
    const history=Array.isArray(setting(settings,'budgetCycleHistory',[]))?setting(settings,'budgetCycleHistory',[]):[];
    history.unshift({cycle:stored,closedAt:iso(now),budgets:budgets.map(b=>({id:b.id,name:b.name,target:budgetTarget(b),spent:Number(b.spent||0)}))});
    await db.put('settings',{key:'budgetCycleHistory',value:history.slice(0,12)});
    for(const b of budgets)await db.put('budgets',{...b,spent:0});
    await db.put('settings',{key:'activeBudgetCycle',value:current});
    return{changed:true,previous:stored,current};
  }

  return{calculate,salaryDate,cycleStart,budgetTarget,monthlyEquivalent,fixedMonthly,goalStats,primaryGoal,syncBudgetCycle};
})();
