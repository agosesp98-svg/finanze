const FinanzeAIContext=(()=>{
  const round=v=>Math.round((Number(v)||0)*100)/100;
  const text=(v,n=70)=>String(v??'').slice(0,n);
  const dateKey=v=>String(v||'').slice(0,10);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  function recentSpending(movements=[],now=new Date()){
    const today=iso(now),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-89,12);
    const from=iso(start);
    const grouped=new Map(),monthly=new Map();
    let expenseCount=0,totalSpent=0;
    for(const m of movements){
      if(m.type!=='expense')continue;
      const date=dateKey(m.date),amount=Number(m.amount||0);
      if(!date||date<from||date>today||!Number.isFinite(amount)||amount<=0)continue;
      expenseCount++;totalSpent+=amount;
      const category=text(m.category||'Da classificare',55)||'Da classificare';
      const item=grouped.get(category)||{category,total:0,count:0};
      item.total+=amount;item.count++;grouped.set(category,item);
      const month=date.slice(0,7);monthly.set(month,(monthly.get(month)||0)+amount);
    }
    return{
      windowStart:from,windowEnd:today,expenseCount,totalSpent:round(totalSpent),
      byCategory:[...grouped.values()].sort((a,b)=>b.total-a.total).slice(0,16)
        .map(x=>({category:x.category,amount:round(x.total),transactions:x.count})),
      monthlyTotals:[...monthly].sort(([a],[b])=>a.localeCompare(b)).map(([month,total])=>({month,spent:round(total)}))
    };
  }

  function build(snapshot={},now=new Date()){
    if(typeof FinanceEngine==='undefined'&&typeof require!=='function')throw new Error('Motore finanziario non disponibile');
    const engine=typeof FinanceEngine!=='undefined'?FinanceEngine:require('./engine.js');
    const accounts=snapshot.accounts||[],budgets=snapshot.budgets||[],goals=snapshot.goals||[];
    const commitments=snapshot.commitments||[],liabilities=snapshot.liabilities||[];
    const movements=snapshot.movements||[],expectedIncomes=snapshot.expectedIncomes||[];
    const model=engine.calculate(snapshot,now);
    const goalPlanner=typeof FinanceGoalPriority!=='undefined'?FinanceGoalPriority:(typeof require==='function'?require('./goal-priority.js'):null);
    const feasibility=goalPlanner?goalPlanner.project(snapshot,now,36):null;
    const upcoming=engine.scheduledCommitments(commitments,now,3,liabilities)
      .filter(c=>c.dueDate>=engine.iso(now)).slice(0,24);
    const fixedBreakdown=engine.fixedBreakdown(liabilities,commitments,now);
    return {
      snapshotDate:engine.iso(now),
      disclaimer:'Dati locali indicativi. Le scadenze projected sono previsioni, non pagamenti gia eseguiti. Non sommare la spesa storica alle rate future come se fossero nuove spese.',
      accounts:accounts.filter(a=>!a.archived).slice(0,12).map(a=>({
        name:text(a.name),balance:round(a.balance),protected:!!a.protected
      })),
      thisCycle:{
        salaryNet:round(model.salaryNet),
        salaryExpectedDate:model.salary,
        monthlyBudgets:round(model.monthlyBudget),
        monthlyFixed:round(model.fixed),
        goalCapacityPerMonth:round(model.goalCapacity),
        spendableBeforeSalary:round(model.spendable),
        committedOutflowsBeforeSalary:round(model.due),
        shortfallBeforeSalary:round(model.blockingShortfall),
        currentLiquidBalance:round(model.ordinary),
        protectedSavings:round(model.protectedTotal),
        goalFundsReservedOnOrdinaryAccounts:round(model.unbankedSavingsReserve),
        budgetRemaining:round(model.budgetRemaining)
      },
      budgets:budgets.filter(b=>!b.archived&&engine.budgetTarget(b)>0).slice(0,18).map(b=>({
        name:text(b.name),monthlyLimit:round(engine.budgetTarget(b)),
        spentInCurrentCycle:round(b.spent),
        remaining:round(Math.max(0,engine.budgetTarget(b)-Number(b.spent||0)))
      })),
      recurringAndFixedCosts:fixedBreakdown.items.slice(0,24).map(item=>({
        name:text(item.name),kind:item.kind,monthlyEquivalent:round(item.amount)
      })),
      liabilities:liabilities.filter(l=>!l.completed&&!l.archived).slice(0,20).map(l=>({
        name:text(l.name),monthlyPayment:round(l.monthly),
        remainingBalance:l.remaining===null||l.remaining===undefined?null:round(l.remaining),
        installmentsRemaining:l.installmentsRemaining??null,
        nextDueDate:dateKey(l.nextDueDate),finalDueDate:dateKey(l.finalDueDate),
        finalPayment:l.finalPayment?round(l.finalPayment):null,
        finalPaymentDate:dateKey(l.finalPaymentDate)
      })),
      upcoming:upcoming.map(c=>({
        name:text(c.name),amount:round(c.amount),date:c.dueDate,
        recurrence:text(c.cadence,30),projected:!!c.projected,
        estimated:!!c.estimated
      })),
      expectedIncomes:expectedIncomes.slice(0,12).map(x=>({
        name:text(x.name||x.title||x.source,65),amount:round(x.amount),
        expectedDate:dateKey(x.expectedDate||x.dueDate||x.date),
        status:text(x.status||'Non confermato',30),
        note:'Entrata attesa: non considerare gia incassata'
      })),
      goals:goals.filter(g=>!g.completed&&!g.archived).slice(0,8).map(g=>({
        name:text(g.name),target:round(g.target),saved:round(g.current),
        deadline:text(g.targetDate,10),
        indicativeMonthlyNeed:round(engine.goalStats(g,now).monthly)
      })),
      prioritizedGoalFeasibility:feasibility?{
        method:feasibility.monthlyMethod,
        employmentExtensionAssumed:feasibility.continuationAssumption,
        goals:feasibility.goals.slice(0,5).map(g=>({name:g.name,priority:g.rank,deadline:g.deadline,forecast:g.forecast,shortfall:g.gap,optimisticShortfall:g.optimisticGap}))
      }:null,
      last90DaysOfRecordedSpending:recentSpending(movements,now),
      sixMonthPlan:engine.projection(snapshot,6,now).map(m=>({
        month:m.month,monthlyBudget:round(m.monthlyBudget),
        fixed:round(m.fixed),potentialSavings:round(m.capacity)
      }))
    };
  }
  return{build,recentSpending};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinanzeAIContext;
