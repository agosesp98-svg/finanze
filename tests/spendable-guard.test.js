const assert=require('node:assert/strict');
const E=require('../engine.js');
const applySpendableGuard=require('../spendable-guard.js');
applySpendableGuard(E);

const now=new Date(2026,10,3,12,0,0);
const settings=[{key:'salaryNet',value:1500},{key:'salaryDay',value:10},{key:'primaryAccountId',value:1}];

{
  const m=E.calculate({
    accounts:[
      {id:1,name:'Conto principale',balance:24,protected:false},
      {id:2,name:'Altro conto',balance:34,protected:false}
    ],
    budgets:[{id:1,budget:200,spent:0}],
    commitments:[
      {id:1,name:'Uscita A',amount:30,dueDate:'2026-11-05',active:true,accountId:1},
      {id:2,name:'Uscita B',amount:30,dueDate:'2026-11-06',active:true,accountId:2}
    ],
    liabilities:[],goals:[],settings
  },now);

  assert.equal(m.due,60);
  assert.equal(m.ordinary,58);
  assert.equal(m.overallShortfall,2);
  assert.equal(m.primaryReserveShortfall,36,'il conto principale deve poter coprire tutte le uscite fino allo stipendio');
  assert.equal(m.blockingShortfall,36);
  assert.equal(m.spendable,0);
}

{
  const earlySettings=[...settings,{key:'nextSalaryDate',value:'2026-11-05'}];
  const m=E.calculate({
    accounts:[
      {id:1,name:'Conto principale',balance:24.35,protected:false},
      {id:2,name:'Altro conto',balance:100,protected:false}
    ],
    budgets:[{id:1,budget:200,spent:0}],
    commitments:[
      {id:1,name:'Uscita del 9',amount:43.89,dueDate:'2026-11-09',active:true,estimated:true}
    ],
    liabilities:[],goals:[],settings:earlySettings
  },now);

  assert.equal(m.salary,'2026-11-10','una nextSalaryDate anticipata non deve accorciare la finestra prudenziale sotto il salaryDay');
  assert.equal(m.due,43.89,'la scadenza del 9 deve entrare nel calcolo prima dello stipendio del 10');
  assert.ok(Math.abs(m.primaryReserveShortfall-19.54)<0.005,`deficit atteso 19.54, ricevuto ${m.primaryReserveShortfall}`);
  assert.ok(Math.abs(m.blockingShortfall-19.54)<0.005);
  assert.equal(m.spendable,0);
}

{
  const nowDecember=new Date(2026,11,6,12);
  const snapshot={
    accounts:[{id:1,balance:100,protected:false}],
    budgets:[{id:1,budget:200,spent:0}],
    commitments:[{id:89,name:'Abbonamento generico',amount:26.41,dueDate:'2026-11-08',cadence:'Mensile',recurring:true,active:true}],
    liabilities:[],goals:[],settings
  };
  const result=E.calculate(snapshot,nowDecember);
  const decemberDue=result.activeDue.filter(c=>c.dueDate==='2026-12-08');
  assert.equal(decemberDue.length,1,'la ricorrenza prevista prima dello stipendio entra nello spendibile');
  assert.equal(decemberDue[0].projected,true);
  assert.ok(Math.abs(result.due-52.82)<0.005,'si riservano sia la scadenza scaduta sia quella in arrivo se la precedente non e stata pagata');
}

console.log('Spendable guard tests: OK');
