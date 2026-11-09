/* Non-optimistic goal allocation: month-by-month, by rank, until each real deadline. */
const FinanceGoalPriority=(()=>{
  const norm=v=>String(v||'').toLowerCase().trim();
  const monthKey=v=>String(v||'').slice(0,7);
  const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const round=v=>Math.round((Number(v)||0)*100)/100;
  const rank=g=>Number.isInteger(Number(g.priorityRank))?Number(g.priorityRank):
    norm(g.priority)==='alta'?1:norm(g.priority)==='media'?2:3;
  function eligible(g,month,salaryDay){
    if(!g.targetDate)return true;
    if(month<monthKey(g.targetDate))return true;
    if(month>monthKey(g.targetDate))return false;
    return Number(g.targetDate.slice(8,10))>=salaryDay;
  }
  function project(snapshot,now=new Date(),monthCount=36){
    const engine=typeof FinanceEngine!=='undefined'?FinanceEngine:require('./engine.js');
    const goals=(snapshot.goals||[]).filter(g=>!g.completed&&!g.archived&&Number(g.target)>Number(g.current||0))
      .sort((a,b)=>rank(a)-rank(b)||String(a.targetDate||'9999').localeCompare(String(b.targetDate||'9999')));
    const settings=snapshot.settings||[];
    const read=(key,fallback)=>settings.find(x=>x.key===key)?.value??fallback;
    const salaryDay=Math.max(1,Math.min(28,Number(read('salaryDay',10)||10)));
    const salaryLow=Number(read('salaryNet',0)),salaryHigh=Math.max(salaryLow,Number(read('salaryNetUpper',salaryLow)));
    // Exclude the current partial month: its salary may already have been spent or received.
    const start=new Date(now.getFullYear(),now.getMonth()+1,1,12);
    const count=Math.max(1,Math.min(48,Math.floor(Number(monthCount)||36)));

    function scenario(salaryNet){
      const adjusted={...snapshot,settings:[...settings.filter(x=>x.key!=='salaryNet'),{key:'salaryNet',value:salaryNet}]};
      const balances=new Map(goals.map(g=>[g.id,Number(g.current||0)]));
      const months=[];
      for(let index=0;index<count;index++){
        const date=new Date(start.getFullYear(),start.getMonth()+index,1,12);
        const key=monthKey(iso(date));
        const b=engine.monthBreakdown(adjusted,key,date);
        let available=round(b.capacity);
        const allocations=[];
        for(const g of goals){
          // Unmet higher-priority goals keep absorbing surplus after their deadline.
          // Late money cannot retroactively make a missed deadline feasible.
          // This also prevents later goals appearing funded while earlier obligations remain unpaid.
          const required=Math.max(0,Number(g.target)-balances.get(g.id));
          const added=round(Math.min(required,available));
          if(added>0){
            available=round(available-added);
            balances.set(g.id,round(balances.get(g.id)+added));
            allocations.push({id:g.id,name:g.name,amount:added});
          }
        }
        months.push({month:key,capacity:round(b.capacity),allocations,unallocated:available,
          fixed:round(b.fixedTotal),budget:round(b.budgetTotal)});
      }
      return goals.map(g=>{
        const due=g.targetDate||null;
        const byDeadline=due?months.filter(m=>eligible(g,m.month,salaryDay)):months;
        const forecast=round(Number(g.current||0)+byDeadline.reduce((sum,m)=>sum+
          m.allocations.filter(a=>a.id===g.id).reduce((sum,a)=>sum+a.amount,0),0));
        const gap=round(Math.max(0,Number(g.target)-forecast));
        return{
          id:g.id,name:g.name,rank:rank(g),target:round(g.target),current:round(g.current),
          deadline:due,deadlinePrecision:g.deadlinePrecision||'day',forecast,gap,
          feasible:gap<0.005
        };
      });
    }
    const cautious=scenario(salaryLow),higher=scenario(salaryHigh);
    return{
      startMonth:iso(start).slice(0,7),endMonth:iso(new Date(start.getFullYear(),start.getMonth()+count-1,1)).slice(0,7),
      salaryLow,salaryHigh,
      monthlyMethod:'Capacita mensile del motore, al netto di budget e rate; solo dal mese successivo, senza premi, 13/14 o crediti non incassati. Un obiettivo scaduto e non coperto continua ad assorbire margine, ma la somma tardiva non riduce il gap alla data di scadenza.',
      continuationAssumption:String(read('employmentContinuation','unconfirmed')),
      goals:cautious.map((g,i)=>({...g,optimisticForecast:higher[i]?.forecast??g.forecast,optimisticGap:higher[i]?.gap??g.gap})),
      nextMonths:(()=>{
        const adjusted={...snapshot,settings:[...settings.filter(x=>x.key!=='salaryNet'),{key:'salaryNet',value:salaryLow}]};
        return Array.from({length:6},(_,i)=>{
          const date=new Date(start.getFullYear(),start.getMonth()+i,1,12);
          const m=engine.monthBreakdown(adjusted,monthKey(iso(date)),date);
          return{month:m.month,capacity:round(m.capacity),fixed:round(m.fixedTotal),budget:round(m.budgetTotal)};
        });
      })()
    };
  }
  return{project,eligible};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinanceGoalPriority;
