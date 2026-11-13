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
    const day=clamp(Number(setting(settings,'salaryDay',setting(settings,'salaryLatestDay',10)))||10,1,28);
    let d=new Date(now.getFullYear(),now.getMonth(),day,12);
    if(now.getDate()>day)d=new Date(now.getFullYear(),now.getMonth()+1,day,12);
    const derived=iso(d);
    // An early manually-entered date cannot shorten the protected payroll cycle.
    return configured&&configured>=today&&configured>derived?configured:derived;
  }

  function cycleStart(settings,now=new Date()){
    const day=clamp(Number(setting(settings,'salaryDay',setting(settings,'salaryLatestDay',10)))||10,1,28);
    let d=new Date(now.getFullYear(),now.getMonth(),day,12);
    if(now.getDate()<day)d=new Date(now.getFullYear(),now.getMonth()-1,day,12);
    return iso(d);
  }

  function recurrenceDays(value){
    const c=norm(value);
    if(c.includes('21 giorni')||c.includes('3 settiman'))return 21;
    if(c.includes('14 giorni')||c.includes('2 settiman'))return 14;
    if(c.includes('settiman'))return 7;
    return 0;
  }
  function isRecurringCadence(cadence){
    const c=norm(cadence);
    return recurrenceDays(c)>0||c.includes('mensil')||c.includes('ogni mese');
  }
  function monthlyEquivalent(c){
    const cadence=norm(c.cadence),amount=Number(c.amount||0);
    const days=recurrenceDays(cadence);
    if(days)return amount*365.25/days/12;
    if(cadence.includes('mensil')||cadence.includes('ogni mese'))return amount;
    return 0;
  }

  function recurringCommitments(commitments){
    const recurring=new Map();
    for(const c of commitments){
      if(c.archived||c.liabilityId||c.liabilityKey)continue;
      const cadence=norm(c.cadence);
      if(!(c.recurring===true||isRecurringCadence(cadence)))continue;
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
    const actual=commitments.filter(c=>!c.archived&&c.active!==false&&!c.paidDate&&c.dueDate);
    const identity=c=>c.liabilityId!=null?'loan:'+String(c.liabilityId):
      c.sourceLiabilityId!=null?'loan:'+String(c.sourceLiabilityId):
      c.liabilityKey?'loan-key:'+String(c.liabilityKey):'rec:'+norm(c.name);
    // Paid-in-advance installments remain covered even when their old rows are
    // archived, otherwise the projection generates the same bill again.
    const seen=new Set(commitments.filter(c=>c.dueDate)
      .map(c=>identity(c)+'|'+c.dueDate));
    const forecasts=[];
    for(const latest of recurringCommitments(commitments)){
      if(!latest.dueDate)continue;
      let next=nextDateByCadence(latest.dueDate,latest.cadence);
      for(let steps=0;next&&next<horizon&&steps<400;steps++){
        const key=identity(latest)+'|'+next;
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
      if(l.completed||l.archived)continue;
      let due=l.nextDueDate||l.firstDueDate;
      const end=l.recurrenceEnd||l.finalDueDate||'';
      for(let step=0;Number(l.monthly||0)>0&&!l.monthlyPhaseComplete&&due&&due<horizon&&step<240;step++){
        if(end&&due>end)break;
        const amount=liabilityAmountForMonth(l,monthKey(due)),key='loan:'+String(l.id)+'|'+due;
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
        const key='loan-final:'+String(l.id)+'|'+l.finalPaymentDate;
        const recordedFinal=commitments.some(c=>!c.archived&&c.dueDate===l.finalPaymentDate&&
          (Number(c.liabilityId)===Number(l.id)||(l.scheduleKey&&c.liabilityKey===l.scheduleKey))&&
          Math.abs(Number(c.amount||0)-Number(l.finalPayment||0))<0.005);
        if(!recordedFinal&&!seen.has(key)){
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

  // The label identifies the payday cycle: [10th, 10th of next month).
  function salaryCycleBounds(key,settings=[]){
    const match=/^(\d{4})-(\d{2})$/.exec(String(key||''));
    if(!match)throw Error('Mese del ciclo non valido.');
    const year=Number(match[1]),month=Number(match[2]);
    if(month<1||month>12)throw Error('Mese del ciclo non valido.');
    const day=clamp(Number(setting(settings,'salaryDay',setting(settings,'salaryLatestDay',10)))||10,1,28);
    return{start:iso(new Date(year,month-1,day,12)),end:iso(new Date(year,month,day,12)),day};
  }

  function monthBreakdown(snapshot,key,now=new Date()){
    const {budgets=[],liabilities=[],commitments=[],settings=[],goals=[]}=snapshot;
    const date=parse(key+'-01')||now;
    const {start,end,day}=salaryCycleBounds(key,settings);
    const currentKey=monthKey(cycleStart(settings,now));
    const budgetItems=budgets.filter(b=>!b.archived&&budgetTarget(b)>0)
      .map(b=>({kind:'budget',id:b.id,name:b.name,
        amount:key===currentKey?Math.max(0,budgetTarget(b)-Number(b.spent||0)):budgetTarget(b)}));
    const budgetTotal=budgetItems.reduce((s,x)=>s+x.amount,0);
    const scheduled=scheduledCommitments(commitments,parse(start),3,liabilities);
    const pending=scheduled.filter(x=>!x.archived&&x.active!==false&&!x.paidDate
      &&x.dueDate>=start&&x.dueDate<end);
    const toItem=x=>({id:x.id??x.sourceCommitmentId??x.liabilityId,name:x.name,
      amount:Number(x.amount||0),date:x.dueDate,accountId:x.accountId,
      projected:!!x.projected,estimated:!!x.estimated,
      liabilityId:x.liabilityId??x.sourceLiabilityId??null,liabilityKey:x.liabilityKey??null,
      sourceCommitmentId:x.sourceCommitmentId??null,
      fundedByGoal:!!x.fundedByGoal,balloon:!!x.balloon,
      kind:x.liabilityId||x.liabilityKey?'liability':(x.recurring===true||isRecurringCadence(x.cadence)?'recurring':'oneoff')});
    const classified=pending.map(toItem);
    const rateItems=classified.filter(x=>x.kind==='liability');
    const recurringItems=classified.filter(x=>x.kind==='recurring');
    const oneOffItems=classified.filter(x=>x.kind==='oneoff');
    const rateTotal=rateItems.filter(x=>!x.fundedByGoal).reduce((s,x)=>s+x.amount,0);
    const recurringTotal=recurringItems.reduce((s,x)=>s+x.amount,0);
    const oneOffTotal=oneOffItems.reduce((s,x)=>s+x.amount,0);
    // The current cycle carries unpaid bills from the previous 10-to-10 cycle.
    // Future cycles do not repeatedly reserve the same arrears.
    const currentCycle=cycleStart(settings,now);
    const previous=iso(new Date(Number(start.slice(0,4)),Number(start.slice(5,7))-2,day,12));
    const overdueItems=key===monthKey(currentCycle)
      ?scheduled.filter(x=>!x.projected&&!x.archived&&x.active!==false&&!x.paidDate
        &&x.dueDate>=previous&&x.dueDate<start).map(toItem)
      :[];
    const overdueTotal=overdueItems.filter(x=>!x.fundedByGoal).reduce((s,x)=>s+x.amount,0);
    const fixedTotal=rateTotal+recurringTotal+oneOffTotal+overdueTotal;
    const salaryNet=Number(setting(settings,'salaryNet',0)||0);
    const plannedOutflow=budgetTotal+fixedTotal;
    const capacity=Math.max(0,salaryNet-plannedOutflow);
    const goal=primaryGoal(goals,date),goalNeed=goal?goalStats(goal,date).monthly:null;
    const excludedGoalTotal=rateItems.filter(x=>x.fundedByGoal).reduce((s,x)=>s+x.amount,0);
    return{month:key,date,cycleStart:start,cycleEnd:end,salaryNet,
      budgetItems,budgetTotal,rateItems,rateTotal,recurringItems,recurringTotal,
      oneOffItems,oneOffTotal,overdueItems,overdueTotal,excludedGoalTotal,
      fixedTotal,plannedOutflow,capacity,goal,goalNeed,
      gap:goalNeed?Math.max(0,goalNeed-capacity):0};
  }

  // Read-only explanation of all loans that are (or are not) in a payday cycle.
  // No liability is reactivated and no payment is created by this audit.
  function loanCycleAudit(snapshot,key,now=new Date()){
    const {liabilities=[],commitments=[],settings=[]}=snapshot;
    const breakdown=monthBreakdown(snapshot,key,now);
    const {start,end}=salaryCycleBounds(key,settings);
    const matches=(record,l)=>Number(record.liabilityId||record.sourceLiabilityId)===Number(l.id)
      ||!!(l.scheduleKey&&record.liabilityKey===l.scheduleKey);
    const current=new Date(now);
    return liabilities.map(l=>{
      const related=commitments.filter(c=>matches(c,l));
      const unpaid=breakdown.rateItems.filter(x=>matches(x,l));
      const overdue=breakdown.overdueItems.filter(x=>matches(x,l));
      const inCycle=related.filter(c=>c.dueDate>=start&&c.dueDate<end);
      const paid=inCycle.filter(c=>c.paidDate||c.active===false&&!c.archived);
      const next=l.nextDueDate||l.firstDueDate||'';
      const final=l.finalPaymentDate||'';
      const open=unpaid.length+overdue.length>0;
      let reason='Nessuna scadenza generata nel ciclo: controlla il piano';
      let code='missing';
      if(open){reason='Rata compresa nel ciclo';code='included'}
      else if(l.archived){reason='Finanziamento archiviato';code='archived'}
      else if(l.completed){reason='Finanziamento segnato come completato';code='completed'}
      else if(paid.length){reason='Scadenza del ciclo segnata come pagata o disattivata';code='paid'}
      else if(l.monthlyPhaseComplete||Number(l.monthly||0)<=0){
        reason=final&&final>=start&&final<end?'Pagamento finale da verificare':'Rate ordinarie disattivate';
        code='phase';
      }
      else if(!next){reason='Manca la data della prossima rata';code='no-date'}
      else if((l.recurrenceEnd||l.finalDueDate||'')&&(l.recurrenceEnd||l.finalDueDate)<start){
        reason='Fine rate registrata prima del ciclo';code='ended';
      }
      else if(next>=end){reason='Prossima rata dopo la fine del ciclo';code='later'}
      else if(next<start){reason='Scadenza precedente al ciclo; verificare il calendario';code='stale'}
      const suspected=(!open&&code!=='later'&&code!=='paid'&&code!=='ended')||
        (open&&Number(l.installmentsRemaining)===0&&l.installmentsRemaining!=null);
      return{id:l.id,name:l.name||'Finanziamento senza nome',code,reason,open,
        archived:!!l.archived,completed:!!l.completed,monthly:Number(l.monthly||0),
        nextDueDate:next,finalDueDate:l.recurrenceEnd||l.finalDueDate||'',
        finalPaymentDate:final,linkedCount:related.length,paidCount:paid.length,
        due:unpaid.map(x=>({date:x.date,amount:x.amount,projected:x.projected})),
        overdue:overdue.map(x=>({date:x.date,amount:x.amount})),
        suspected,hasPreviousHistory:related.length>0};
    }).sort((a,b)=>Number(b.open)-Number(a.open)||
      Number(b.suspected)-Number(a.suspected)||String(a.name).localeCompare(String(b.name),'it'));
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

  function accountAvailability(snapshot={},now=new Date()){
    const {accounts=[],budgets=[],commitments=[],liabilities=[],settings=[]}=snapshot;
    const moneyRound=n=>Math.round((Number(n)||0)*100)/100;
    const openAccounts=accounts.filter(a=>!a.archived);
    const usable=openAccounts.filter(a=>!a.protected);
    const primaryId=Number(setting(settings,'primaryAccountId',0));
    const primary=usable.find(a=>Number(a.id)===primaryId)||usable[0]||null;
    const selectedSpending=Number(setting(settings,'spendingAccountId',
      setting(settings,'salaryGuideSpendingAccount',0)));
    const spending=usable.find(a=>Number(a.id)===selectedSpending)||
      usable.find(a=>norm(a.kind).includes('prepag'))||primary;
    const budgetTotal=moneyRound(budgets.filter(b=>!b.archived)
      .reduce((s,b)=>s+Math.max(0,budgetTarget(b)-Number(b.spent||0)),0));
    const salary=salaryDate(settings,now),today=iso(now);
    const obligations=scheduledCommitments(commitments,now,6,liabilities)
      .filter(c=>c.active!==false&&!c.archived&&!c.paidDate&&c.dueDate&&c.dueDate<salary
        &&!c.fundedByGoal);
    const linkedAccount=c=>{
      const linked=liabilities.find(l=>
        (c.liabilityId!=null&&Number(l.id)===Number(c.liabilityId))||
        (c.liabilityKey&&l.scheduleKey===c.liabilityKey));
      const requested=Number(c.accountId||linked?.accountId||0);
      const valid=usable.find(a=>Number(a.id)===requested);
      return{accountId:valid?.id??primary?.id??null,assumed:!valid};
    };
    const tagged=obligations.map(c=>({...c,...linkedAccount(c)}));
    const rows=openAccounts.map(a=>{
      const dueItems=tagged.filter(c=>Number(c.accountId)===Number(a.id));
      const reservedDue=moneyRound(dueItems.reduce((s,c)=>s+Number(c.amount||0),0));
      const budgetReserved=!a.protected&&spending&&Number(a.id)===Number(spending.id)
        ?budgetTotal:0;
      const balance=moneyRound(a.balance);
      const free=a.protected?0:moneyRound(Math.max(0,balance-reservedDue-budgetReserved));
      const shortfall=a.protected?0:moneyRound(Math.max(0,reservedDue+budgetReserved-balance));
      return{id:a.id,name:a.name||'Conto',protected:!!a.protected,balance,
        reservedDue,budgetReserved,free,shortfall,dueItems,
        availableForBudget:Math.max(0,Math.min(budgetReserved,
          moneyRound(balance-reservedDue))),
        isPrimary:!!primary&&Number(a.id)===Number(primary.id),
        isSpending:!!spending&&Number(a.id)===Number(spending.id)};
    });
    const sum=key=>moneyRound(rows.reduce((s,x)=>s+Number(x[key]||0),0));
    return{today,salary,cycleStart:cycleStart(settings,now),
      primaryAccountId:primary?.id??null,spendingAccountId:spending?.id??null,
      primary:rows.find(x=>x.isPrimary)||null,
      spending:rows.find(x=>x.isSpending)||null,accounts:rows,
      obligations:tagged,obligationsCount:tagged.length,
      totalBalance:sum('balance'),totalReserved:sum('reservedDue'),
      totalBudget:budgetTotal,totalFree:sum('free'),
      totalShortfall:sum('shortfall'),budgetsAssigned:!!spending,
      accountAssignmentInferred:tagged.some(c=>c.assumed),
      spendingAccountInferred:!usable.some(a=>Number(a.id)===selectedSpending),
      spendingAvailable:rows.find(x=>x.isSpending)?.availableForBudget||0};
  }

  function calculate(snapshot={},now=new Date()){
    const {accounts=[],budgets=[],liabilities=[],commitments=[],goals=[],settings=[]}=snapshot;
    const available=accountAvailability(snapshot,now);
    const {today,salary}=available;
    const total=accounts.reduce((s,a)=>s+Number(a.balance||0),0);
    const protectedTotal=accounts.filter(a=>a.protected&&!a.archived)
      .reduce((s,a)=>s+Number(a.balance||0),0);
    const ordinary=available.accounts.filter(a=>!a.protected).reduce((s,a)=>s+a.balance,0);
    const activeDue=available.obligations,due=available.totalReserved;
    const overallShortfall=Math.max(0,due-ordinary);
    const accountCoverage=available.accounts.filter(a=>!a.protected).map(a=>({
      accountId:a.id,accountName:a.name,due:a.reservedDue,balance:a.balance,
      shortfall:Math.max(0,a.reservedDue-a.balance)
    }));
    const fundingShortfall=accountCoverage.reduce((s,a)=>s+a.shortfall,0);
    const primaryAccount=accounts.find(a=>Number(a.id)===Number(available.primaryAccountId));
    const primaryDue=available.primary?.reservedDue||0;
    const primaryShortfall=Math.max(0,primaryDue-(available.primary?.balance||0));
    const blockingShortfall=Math.max(overallShortfall,fundingShortfall);
    const budgetRemaining=available.totalBudget;
    const afterDue=Math.max(0,ordinary-due);
    const spendable=available.spendingAvailable;
    const days=Math.max(1,daysBetween(today,salary)+1);
    const salaryNet=Number(setting(settings,'salaryNet',0)||0);
    const monthlyBudget=budgets.filter(b=>!b.archived)
      .reduce((s,b)=>s+budgetTarget(b),0);
    const fixedData=fixedBreakdown(liabilities,commitments,now),fixed=fixedData.total;
    const rateTotal=fixedData.items.filter(x=>x.kind==='liability').reduce((s,x)=>s+x.amount,0);
    const recurringTotal=fixedData.items.filter(x=>x.kind==='recurring').reduce((s,x)=>s+x.amount,0);
    const goalCapacity=Math.max(0,salaryNet-monthlyBudget-fixed);
    const goal=primaryGoal(goals,now),goalNeed=goal?goalStats(goal,now).monthly:null;
    return{today,salary,total,protectedTotal,ordinary,activeDue,due,overallShortfall,
      accountCoverage,fundingShortfall,primaryShortfall,primaryReserveShortfall:primaryShortfall,
      blockingShortfall,primary:primaryAccount||null,primaryDue,budgetRemaining,afterDue,
      // A goal's recorded progress is not proof of money held in any specific account.
      // Never subtract unlinked savings again from cash or from the bank's free margin.
      unbankedSavingsReserve:0,spendable,days,daily:spendable/days,
      salaryNet,monthlyBudget,fixed,rateTotal,recurringTotal,
      fixedItems:fixedData.items,goalCapacity,goal,goalNeed,
      goalGap:goalNeed?Math.max(0,goalNeed-goalCapacity):0,
      availability:available};
  }

  function monthSequence(now=new Date(),count=6){const out=[];for(let i=0;i<count;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1,12);out.push({key:iso(d).slice(0,7),date:d})}return out}
  function projection(snapshot,months=6,now=new Date()){
    return monthSequence(now,months).map(({key,date})=>{
      const b=monthBreakdown(snapshot,key,now);
      return{month:key,date,cycleStart:b.cycleStart,cycleEnd:b.cycleEnd,fixed:b.fixedTotal,rateTotal:b.rateTotal,recurringTotal:b.recurringTotal,oneOffTotal:b.oneOffTotal,overdueTotal:b.overdueTotal,monthlyBudget:b.budgetTotal,plannedOutflow:b.plannedOutflow,salaryNet:b.salaryNet,capacity:b.capacity,goalNeed:b.goalNeed,gap:b.gap,budgetItems:b.budgetItems,rateItems:b.rateItems,recurringItems:b.recurringItems,oneOffItems:b.oneOffItems,overdueItems:b.overdueItems};
    });
  }

  function nextDateByCadence(date,cadence){
    if(!date)return null;const d=parse(date),c=norm(cadence);if(!d)return null;
    const days=recurrenceDays(c);
    if(days)d.setDate(d.getDate()+days);
    else if(c.includes('mensil')||c.includes('ogni mese')){
      const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);
      const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));
    }else return null;
    return iso(d);
  }

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
      // Never auto-complete a loan while its next due date or an unpaid installment exists.
      // A stale zero residual/count alone is not proof that the final bill was paid.
      const openCommitment=linked.some(c=>!c.archived&&c.active!==false&&!c.paidDate);
      if(!l.completed&&noBalloon&&(finishedByCount||finishedByResidual)&&!l.nextDueDate&&!openCommitment){l.completed=true;l.monthly=0;await db.put('liabilities',l);changed=true}
      if(l.completed){for(const c of linked.filter(c=>c.active!==false)){await db.put('commitments',{...c,active:false,note:[c.note,'Piano completato'].filter(Boolean).join(' · ')});changed=true}continue}
      if(l.recurrenceEnd&&l.nextDueDate&&String(l.nextDueDate)>String(l.recurrenceEnd)&&Number(l.finalPayment||0)>0){l.regularMonthly=l.regularMonthly??l.monthly;l.monthly=0;l.monthlyPhaseComplete=true;l.nextDueDate=l.finalPaymentDate||'';await db.put('liabilities',l);changed=true}
      const cutoff=l.recurrenceEnd||l.finalDueDate||'';
      for(const c of linked.filter(c=>c.active!==false&&c.dueDate)){const isFinal=Number(l.finalPayment||0)>0&&l.finalPaymentDate&&String(c.dueDate)===String(l.finalPaymentDate)&&Number(c.amount||0)===Number(l.finalPayment||0);if(cutoff&&String(c.dueDate)>String(cutoff)&&!isFinal){await db.put('commitments',{...c,active:false});changed=true}}
      if(Number(l.finalPayment||0)>0&&l.monthlyPhaseComplete&&l.finalPaymentDate){const exists=linked.some(c=>c.active!==false&&String(c.dueDate)===String(l.finalPaymentDate)&&Number(c.amount||0)===Number(l.finalPayment||0));if(!exists){await db.add('commitments',{name:l.name||'Pagamento finale',amount:Number(l.finalPayment),dueDate:l.finalPaymentDate,cadence:'Una tantum',estimated:false,active:true,recurring:false,generated:true,liabilityId:l.id,liabilityKey:l.scheduleKey||'',note:'Pagamento finale collegato al finanziamento'});changed=true}}
      else if(Number(l.monthly||0)>0&&l.nextDueDate){const beyond=cutoff&&String(l.nextDueDate)>String(cutoff),exists=linked.some(c=>c.active!==false&&String(c.dueDate)===String(l.nextDueDate));if(!beyond&&!exists){await db.add('commitments',{name:l.name,amount:liabilityAmountForMonth(l,monthKey(l.nextDueDate)),dueDate:l.nextDueDate,cadence:'Mensile',estimated:false,active:true,recurring:true,generated:true,liabilityId:l.id,liabilityKey:l.scheduleKey||'',note:'Scadenza collegata al piano rate'});changed=true}}
    }
    const groups=new Map();for(const c of commitments){if(c.archived||c.liabilityId||c.liabilityKey)continue;const cadence=norm(c.cadence);if(!(c.recurring===true||isRecurringCadence(cadence)))continue;const key=norm(c.name);if(!key)continue;const old=groups.get(key);if(!old||String(c.dueDate||'')>String(old.dueDate||''))groups.set(key,c)}
    const today=iso(now);for(const latest of groups.values()){if(latest.active!==false)continue;let next=nextDateByCadence(latest.dueDate,latest.cadence);if(!next)continue;while(next<today)next=nextDateByCadence(next,latest.cadence);if(latest.recurrenceEnd&&next>latest.recurrenceEnd)continue;if(commitments.some(c=>c.active!==false&&norm(c.name)===norm(latest.name)&&c.dueDate===next))continue;const copy={...latest};delete copy.id;delete copy.paidDate;delete copy.paidAmount;copy.dueDate=next;copy.active=true;copy.generated=true;copy.recurring=true;copy.estimated=!!(latest.variableAmount||latest.estimated);await db.add('commitments',copy);changed=true}
    return{changed};
  }

  return{norm,iso,parse,calculate,accountAvailability,scheduledCommitments,loanCycleAudit,liabilityAmountForMonth,salaryDate,cycleStart,salaryCycleBounds,budgetTarget,budgetCeiling,monthlyEquivalent,fixedMonthly,fixedBreakdown,monthBreakdown,goalStats,primaryGoal,projection,nextDateByCadence,syncBudgetCycle,repairSchedules};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinanceEngine;
