const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// All fixtures in this test are synthetic. Real wedding data is never committed.
const project={
  id:'wedding-main',name:'Sample event',date:'2028-05-26',safetyBuffer:100,
  savingsAccountId:null,
  forecast:{monthlyBase:200,reservePerMonth:50,extraExpenses:{},
    incomes:{'2026-12':500,'2027-01':500,'2027-02':500}},
  suppliers:[
    {id:'supplier',name:'Example supplier',grossTotal:400,status:'agreed',installments:[
      {id:'old',label:'Previously paid',gross:100,plannedMy:50,paidByMe:100,
        historical:true,dueMonth:'2026-11'},
      {id:'first',label:'Due before payday',gross:300,plannedMy:150,paidByMe:0,
        due:'2027-01-09'}]},
    {id:'personal',name:'Personal costs',grossTotal:200,status:'estimate',
      installments:[{id:'estimate',gross:200,plannedMy:200,paidByMe:0,
        planningMonth:'2027-02'}]},
    {id:'past',name:'Past contribution outside budget',grossTotal:20,status:'historical',
      installments:[{id:'paid',gross:20,plannedMy:0,paidByMe:20,historical:true}]}
  ]
};
const callbacks={};
const root={innerHTML:''};
const storage={
  'wedding-main':JSON.parse(JSON.stringify(project))
};
const context={
  document:{
    getElementById:id=>id==='weddingRoot'?root:null,
    addEventListener:(name,fn)=>{callbacks[name]=fn},
    querySelector:()=>null
  },
  FinanceDB:{
    get:async (_,id)=>storage[id],
    getAll:async store=>store==='accounts'?[]:[],
    put:async (_,value)=>{storage[value.id]=value}
  },
  Intl,Date,Number,Math,JSON,String,Object,Set,Promise,Error,
  structuredClone,console
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('wedding.js','utf8'),context);
const wedding=vm.runInContext('FinanceWedding',context);

async function main(){
  const payload={kind:'finanze-wedding-plan',version:1,project};
  assert.equal(wedding.validate(payload).suppliers.length,3);
  assert.throws(()=>wedding.validate({...payload,project:{...project,id:'wrong'}}),
    /compatibile/);
  assert.throws(()=>wedding.validate({...payload,project:{...project,suppliers:[
    project.suppliers[0],project.suppliers[0]]}}),/duplicato/);
  assert.throws(()=>wedding.validate({...payload,project:{...project,suppliers:[
    {...project.suppliers[0],installments:[{id:'oops',gross:-1,plannedMy:0,paidByMe:0}]}
  ]}}),/non valido/);
  await callbacks.DOMContentLoaded();
  const s=wedding.summary();
  assert.equal(s.myTotal,400,'Split historical share + personal estimates');
  assert.equal(s.paid,120,'All historical personal payments are counted');
  assert.equal(s.paidPlan,100,'Plan progress excludes costs outside the future budget');
  assert.equal(s.paidExcluded,20,'Past contributions are tracked separately from supplier deposits');
  assert.equal(s.remaining,350,'Already-paid deposits are excluded from future bills');
  assert.equal(s.overAdvance,50,'Outside-budget past costs are not misclassified as partner advances');
  assert.equal(s.cashFund,0,'Do not invent saving balance from old deposits');
  const rows=wedding.forecast();
  assert.equal(rows[0].month,'2026-12');
  assert.equal(rows[0].due,150,'A due date before payday 10 goes to previous cycle');
  assert.equal(rows[0].fund,100);
  assert.equal(rows[1].fund,350);
  assert.equal(rows[2].due,200,'Estimated, editable month is included once');
  assert.equal(rows[2].fund,400);
  assert.equal(root.innerHTML.includes('Panoramica'),true);
  console.log('Wedding plan validation, due cycles and no-phantom-savings forecast: OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
