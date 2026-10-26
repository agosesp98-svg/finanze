const assert=require('node:assert/strict');
const E=require('../engine.js');
const now=new Date(2026,9,26,12,0,0);
const settings=[{key:'salaryNet',value:1500},{key:'salaryDay',value:10},{key:'primaryAccountId',value:1}];
const cents=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<0.005,message||`${actual} ≠ ${expected}`);

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
    const p=E.projection({
      accounts:[],budgets:[],liabilities:[],goals:[],settings,
      commitments:[{id:1,name:'Servizio mensile',amount:25,dueDate:'2026-11-08',cadence:'Mensile',recurring:true,active:true}]
    },3,now);
    assert.deepEqual(p.map(x=>x.fixed),[25,25,25],'una ricorrenza gia attiva non deve iniziare dalla prossima dueDate');
    const m=E.calculate({accounts:[],budgets:[],liabilities:[],goals:[],settings,commitments:[{id:1,name:'Servizio mensile',amount:25,dueDate:'2026-11-08',cadence:'Mensile',recurring:true,active:true}]},now);
    assert.equal(m.fixed,25,'il mese tipo deve includere una ricorrenza gia attiva');
  }

  {
    const p=E.projection({
      accounts:[],budgets:[],liabilities:[],goals:[],settings,
      commitments:[{id:1,name:'Nuovo servizio',amount:30,dueDate:'2026-12-05',firstDueDate:'2026-12-05',cadence:'Mensile',recurring:true,active:true}]
    },4,now);
    assert.deepEqual(p.map(x=>x.fixed),[0,0,30,30],'una vera ricorrenza futura deve partire solo dalla firstDueDate');
    const m=E.calculate({accounts:[],budgets:[],liabilities:[],goals:[],settings,commitments:[{id:1,name:'Nuovo servizio',amount:30,dueDate:'2026-12-05',firstDueDate:'2026-12-05',cadence:'Mensile',recurring:true,active:true}]},now);
    assert.equal(m.fixed,0,'una ricorrenza futura non deve pesare nel mese tipo corrente');
  }

  {
    const snapshot={
      accounts:[],
      budgets:[{id:1,name:'Budget A',targetBudget:400},{id:2,name:'Budget B',targetBudget:130}],
      liabilities:[{id:1,name:'Rate',monthly:352.91,completed:false,completedInstallments:1,nextDueDate:'2026-11-01'}],
      commitments:[{id:1,name:'Ricorrenti',amount:187.54,dueDate:'2026-11-01',cadence:'Mensile',recurring:true,active:true}],
      goals:[],settings
    };
    const b=E.monthBreakdown(snapshot,'2026-10',now);
    assert.equal(b.salaryNet,1500);
    assert.equal(b.budgetTotal,530);
    cents(b.rateTotal,352.91);
    cents(b.recurringTotal,187.54);
    cents(b.fixedTotal,540.45);
    cents(b.plannedOutflow,1070.45);
    cents(b.capacity,429.55);
    const p=E.projection(snapshot,1,now)[0];
    assert.equal(p.monthlyBudget,b.budgetTotal);
    cents(p.rateTotal,b.rateTotal);
    cents(p.recurringTotal,b.recurringTotal);
    cents(p.capacity,b.capacity,'proiezione e dettaglio mensile devono usare la stessa fonte');
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
