(()=>{
  function applySpendableGuard(engine){
    if(!engine||engine.__spendableGuardApplied)return engine;
    const originalCalculate=engine.calculate.bind(engine);
    engine.calculate=function(snapshot={},now=new Date()){
      const result=originalCalculate(snapshot,now);
      const accounts=snapshot.accounts||[],settings=snapshot.settings||[];
      const configuredPrimary=Number(settings.find(x=>x.key==='primaryAccountId')?.value||0);
      const primary=accounts.find(a=>Number(a.id)===configuredPrimary)||accounts.find(a=>!a.protected)||null;
      const primaryBalance=primary&&!primary.protected?Number(primary.balance||0):0;
      const primaryReserveShortfall=Math.max(0,Number(result.due||0)-primaryBalance);
      const blockingShortfall=Math.max(Number(result.blockingShortfall||0),primaryReserveShortfall);
      const spendable=blockingShortfall>0?0:Math.max(0,Math.min(Number(result.budgetRemaining||0),Number(result.afterDue||0)));
      return{
        ...result,
        primaryDue:Number(result.due||0),
        primaryShortfall:Math.max(Number(result.primaryShortfall||0),primaryReserveShortfall),
        primaryReserveShortfall,
        blockingShortfall,
        spendable,
        daily:spendable/Math.max(1,Number(result.days||1))
      };
    };
    engine.__spendableGuardApplied=true;
    return engine;
  }

  if(typeof module!=='undefined'&&module.exports)module.exports=applySpendableGuard;
  else if(typeof FinanceEngine!=='undefined')applySpendableGuard(FinanceEngine);
})();
