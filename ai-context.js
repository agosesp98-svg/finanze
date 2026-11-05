const FinanzeAIContext=(()=>{
  const round=v=>Math.round((Number(v)||0)*100)/100;
  const text=(v,n=70)=>String(v??'').slice(0,n);
  function build(snapshot={},now=new Date()){
    if(typeof FinanceEngine==='undefined'&&typeof require!=='function')throw new Error('Motore finanziario non disponibile');
    const engine=typeof FinanceEngine!=='undefined'?FinanceEngine:require('./engine.js');
    const accounts=snapshot.accounts||[],budgets=snapshot.budgets||[],goals=snapshot.goals||[];
    const commitments=snapshot.commitments||[],settings=snapshot.settings||[];
    const model=engine.calculate(snapshot,now);
    const upcoming=engine.scheduledCommitments(commitments,now,3)
      .filter(c=>c.dueDate>=engine.iso(now)).slice(0,18);
    return {
      snapshotDate:engine.iso(now),
      disclaimer:'Dati locali indicativi. Le scadenze future possono essere previsioni, non pagamenti avvenuti.',
      accounts:accounts.slice(0,12).map(a=>({
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
        shortfallBeforeSalary:round(model.blockingShortfall)
      },
      budgets:budgets.slice(0,18).map(b=>({
        name:text(b.name),monthlyLimit:round(engine.budgetTarget(b)),
        spentInCurrentCycle:round(b.spent),
        remaining:round(Math.max(0,engine.budgetTarget(b)-Number(b.spent||0)))
      })),
      upcoming:upcoming.map(c=>({
        name:text(c.name),amount:round(c.amount),date:c.dueDate,
        recurrence:text(c.cadence,30),projected:!!c.projected
      })),
      goals:goals.filter(g=>!g.completed).slice(0,8).map(g=>({
        name:text(g.name),target:round(g.target),saved:round(g.current),
        deadline:text(g.targetDate,10)
      })),
      sixMonthPlan:engine.projection(snapshot,6,now).map(m=>({
        month:m.month,monthlyBudget:round(m.monthlyBudget),
        fixed:round(m.fixed),potentialSavings:round(m.capacity)
      }))
    };
  }
  return{build};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinanzeAIContext;
