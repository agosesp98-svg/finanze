/* Keep the payday safety rule without reassigning other accounts' bills to ISP.
   The financial engine is now the single source for per-account reserves. */
(()=>{
  function applySpendableGuard(engine){
    if(!engine||engine.__spendableGuardApplied)return engine;
    const original=engine.calculate.bind(engine);
    engine.calculate=function(snapshot={},now=new Date()){
      const result=original(snapshot,now);
      return{...result,conservativeHorizon:result.salary,
        primaryReserveShortfall:result.primaryShortfall};
    };
    engine.__spendableGuardApplied=true;
    return engine;
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=applySpendableGuard;
  else if(typeof FinanceEngine!=='undefined')applySpendableGuard(FinanceEngine);
})();
