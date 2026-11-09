(()=>{
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));

  function derivedSalaryDate(settings=[],now=new Date()){
    const read=(key,fallback)=>settings.find(x=>x.key===key)?.value??fallback;
    const day=clamp(Number(read('salaryDay',read('salaryLatestDay',10)))||10,1,28);
    let d=new Date(now.getFullYear(),now.getMonth(),day,12);
    if(now.getDate()>day)d=new Date(now.getFullYear(),now.getMonth()+1,day,12);
    return iso(d);
  }

  function applySpendableGuard(engine){
    if(!engine||engine.__spendableGuardApplied)return engine;
    const originalCalculate=engine.calculate.bind(engine);
    engine.calculate=function(snapshot={},now=new Date()){
      const result=originalCalculate(snapshot,now);
      const accounts=snapshot.accounts||[],settings=snapshot.settings||[],commitments=snapshot.commitments||[],liabilities=snapshot.liabilities||[];
      const configuredPrimary=Number(settings.find(x=>x.key==='primaryAccountId')?.value||0);
      const primary=accounts.find(a=>Number(a.id)===configuredPrimary&&!a.protected)||accounts.find(a=>!a.protected)||null;
      const primaryBalance=primary?Number(primary.balance||0):0;

      // A manually stored nextSalaryDate must never shorten the safety window below
      // the configured salary day. A later explicit date is kept because it is safer.
      const derivedSalary=derivedSalaryDate(settings,now);
      const engineSalary=String(result.salary||'');
      const horizon=!engineSalary||engineSalary<derivedSalary?derivedSalary:engineSalary;

      const activeDue=engine.scheduledCommitments(commitments,now,6,liabilities).filter(c=>String(c.dueDate)<=horizon);
      const due=activeDue.reduce((sum,c)=>sum+Number(c.amount||0),0);
      const ordinary=Number(result.ordinary||0);
      const overallShortfall=Math.max(0,due-ordinary);
      const primaryReserveShortfall=Math.max(0,due-primaryBalance);
      const blockingShortfall=Math.max(Number(result.blockingShortfall||0),overallShortfall,primaryReserveShortfall);
      const afterDue=Math.max(0,ordinary-due-Number(result.unbankedSavingsReserve||0));
      const spendable=blockingShortfall>0?0:Math.max(0,Math.min(Number(result.budgetRemaining||0),afterDue));
      const days=Math.max(1,Math.ceil((engine.parse(horizon)-engine.parse(iso(now)))/86400000)+1);

      return{
        ...result,
        salary:horizon,
        activeDue,
        due,
        overallShortfall,
        primary,
        primaryDue:due,
        primaryShortfall:Math.max(Number(result.primaryShortfall||0),primaryReserveShortfall),
        primaryReserveShortfall,
        blockingShortfall,
        afterDue,
        spendable,
        days,
        daily:spendable/days,
        conservativeHorizon:horizon
      };
    };
    engine.__spendableGuardApplied=true;
    return engine;
  }

  if(typeof module!=='undefined'&&module.exports)module.exports=applySpendableGuard;
  else if(typeof FinanceEngine!=='undefined')applySpendableGuard(FinanceEngine);
})();
