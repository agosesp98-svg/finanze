const assert=require('node:assert/strict');
const E=require('../engine.js');
const now=new Date(2026,9,26,12,0,0);
const settings=[{key:'salaryNet',value:1500},{key:'salaryDay',value:10},{key:'primaryAccountId',value:1}];

async function main(){
  {
    const m=E.calculate({
      accounts:[{id:1,balance:100,protected:false},{id:2,balance:500,protected:false}],
      budgets:[{id:1,budget:200,spent:0}],
      commitments:[{id:1,name:'Addebito',amount:150,dueDate:'2026-11-01',active:true,accountId:1}],
      liabilities:[],goals:[],settings
    },now);
    assert.equal(m.overallShortfall,0);
    assert.equal(m.primaryShortfall,50);
    assert.equal(m.spendable,0);
  }

  {
    const m=E.calculate({
      accounts:[{id:1,balance:1000,protected:false}],budgets:[],commitments:[],goals:[],settings,
      liabilities:[
        {id:1,name:'Gia attiva',monthly:40,completed:false,completedInstallments:1,nextDueDate:'2026-11-01'},
        {id:2,name:'Futura',monthly:100,completed:false,completedInstallments:0,nextDueDate:'2026-12-15'}
      ]
    },now);
    assert.equal(m.fixed,40,'una rata futura non deve pesare prima della prima scadenza');
  }

  {
    const m=E.calculate({
      accounts:[{id:1,balance:1000,protected:false}],
      budgets:[{id:1,targetBudget:400,spent:0},{id:2,targetBudget:60,spent:0},{id:3,targetBudget:30,spent:0}],
      commitments:[],
      liabilities:[{id:1,monthly:300,completed:false,completedInstallments:2,nextDueDate:'2026-11-01'}],
      goals:[{id:1,name:'Obiettivo',target:5000,current:500,targetDate:'2027-10-01',priority:'Alta'}],settings
    },now);
    assert.equal(m.monthlyBudget,490);
    assert.equal(m.fixed,300);
    assert.equal(m.goalCapacity,710);
  }

  {
    const p=E.projection({
      accounts:[],budgets:[{id:1,targetBudget:400}],commitments:[],goals:[],settings,
      liabilities:[{id:1,monthly:100,completed:false,completedInstallments:0,firstDueDate:'2026-12-15',finalDueDate:'2027-01-15'}]
    },4,now);
    assert.equal(p[0].month,'2026-10');
    assert.equal(p[0].fixed,0);
    assert.equal(p[1].fixed,0);
    assert.equal(p[2].fixed,100);
    assert.equal(p[3].fixed,100);
  }

  {
    assert.equal(E.salaryDate([{key:'salaryDay',value:10}],new Date(2026,9,26,12)),'2026-11-10');
    assert.equal(E.cycleStart([{key:'salaryDay',value:10}],new Date(2026,9,26,12)),'2026-10-10');
  }

  {
    const added=[];
    const db={put:async()=>{},add:async(store,value)=>{added.push({store,value});return added.length}};
    await E.repairSchedules(db,{
      liabilities:[],
      commitments:[{id:1,name:'Ricorrente',amount:20,dueDate:'2026-10-01',cadence:'Mensile',recurring:true,active:true}]
    },now);
    assert.equal(added.length,0,'una ricorrenza scaduta ma non pagata non deve generare la successiva');
  }

  {
    const added=[];
    const db={put:async()=>{},add:async(store,value)=>{added.push({store,value});return added.length}};
    await E.repairSchedules(db,{
      liabilities:[],
      commitments:[{id:1,name:'Ricorrente',amount:20,dueDate:'2026-10-01',cadence:'Mensile',recurring:true,active:false,paidDate:'2026-10-01'}]
    },now);
    assert.equal(added.length,1,'una ricorrenza pagata deve generare la scadenza successiva');
    assert.equal(added[0].value.dueDate,'2026-11-01');
  }

  console.log('Financial engine tests: OK');
}

main().catch(err=>{console.error(err);process.exit(1)});
