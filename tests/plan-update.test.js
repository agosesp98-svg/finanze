const assert=require('node:assert/strict');
const E=require('../engine.js'),Plan=require('../plan-patch.js'),Goals=require('../goal-priority.js');
const cents=(a,b,msg)=>assert.ok(Math.abs(a-b)<0.005,msg||String(a)+' != '+String(b));

const previous={
  accounts:[{id:5,name:'Main Account',balance:900,protected:false},{id:6,name:'Old savings',balance:50,protected:true}],
  budgets:[{id:11,name:'Food',targetBudget:200,budget:200,spent:25}],
  liabilities:[{id:17,name:'Previous Loan',monthly:170,nextDueDate:'2026-12-05',completed:false}],
  commitments:[{id:40,name:'Old subscription',amount:20,dueDate:'2026-11-12',cadence:'Mensile',active:true,recurring:true},
    {id:41,name:'Old paid record',amount:20,dueDate:'2026-10-12',cadence:'Mensile',active:false,recurring:true,paidDate:'2026-10-12'}],
  goals:[{id:60,name:'Old Goal',target:800,current:100,priority:'Alta'}],
  expectedIncomes:[{id:80,name:'Previous credit',amount:2000,status:'pending'}],
  movements:[{id:90,type:'expense',date:'2026-10-04',amount:20,accountId:5}],
  settings:[{key:'salaryNet',value:999},{key:'salaryDay',value:12}]
};

const plan={
  kind:'finanze-plan-update',version:1,id:'synthetic-test-1',asOf:'2026-11-09',primaryAccount:'Main',
  salary:{netLow:1400,netHigh:1450,salaryDay:10,employmentStartDate:'2026-08-01',confirmedThrough:'2026-12-31',continuation:'probable'},
  accounts:[{name:'Main',balance:150,matchAliases:['Main Account']}],
  budgets:[{name:'Groceries',target:370,matchAliases:['Food']}],
  liabilities:[
    {name:'Ending payment',monthly:17.29,nextDueDate:'2026-12-01',firstDueDate:'2026-12-01',
      finalDueDate:'2026-12-01',recurrenceEnd:'2026-12-01'},
    {name:'Future loan',monthly:80,nextDueDate:'2027-01-01',firstDueDate:'2027-01-01',
      recurrenceEnd:'2029-12-01',finalDueDate:'2029-12-01',rateChanges:[{date:'2029-11-01',amount:16.12}]},
    {name:'Balloon loan',monthly:100,nextDueDate:'2026-11-15',firstDueDate:'2026-11-15',
      recurrenceEnd:'2028-12-15',finalPayment:36000,finalPaymentDate:'2029-01-01',fundedByGoal:true}
  ],
  recurring:[{name:'Test recurring',amount:33.3,dueDate:'2026-11-09',cadence:'Mensile',estimated:true}],
  expectedIncomes:[{name:'Client A',amount:500,expectedDate:''}],
  goals:[
    {name:'First goal',target:5000,current:0,targetDate:'2028-05-26',priorityRank:1},
    {name:'Final loan',target:36000,current:0,targetDate:'2029-01-01',deadlinePrecision:'month',priorityRank:2},
    {name:'Emergency reserve',target:2000,current:0,targetDate:'',priorityRank:3}
  ]
};

const {stores,preview}=Plan.prepare(previous,plan);
assert.equal(preview.preservedMovements,1);
assert.equal(preview.accounts,1);
assert.equal(stores.accounts.find(x=>x.name==='Main').id,5,'reuse existing account ID');
assert.equal(stores.accounts.find(x=>x.name==='Old savings').balance,0,'archive retired savings without inventing money');
assert.equal(stores.accounts.find(x=>x.name==='Old savings').archived,true);
assert.equal(stores.budgets.find(x=>x.name==='Groceries').id,11);
assert.equal(stores.budgets.find(x=>x.name==='Groceries').spent,25,'preserve already tracked spending');
assert.equal(stores.commitments.find(x=>x.id===41).paidDate,'2026-10-12','preserve old paid history');
assert.equal(stores.commitments.find(x=>x.id===41).archived,true);
assert.equal(stores.commitments.find(x=>x.id===40).active,false,'stop old subscription');
assert.equal(stores.liabilities.filter(x=>!x.archived).length,3);
assert.equal(stores.goals.filter(x=>!x.archived).length,3);
assert.equal(stores.expectedIncomes.find(x=>x.name==='Client A').status,'pending');
assert.equal(stores.settings.find(x=>x.key==='salaryNet').value,1400);
assert.equal(stores.settings.find(x=>x.key==='primaryAccountId').value,5);
assert.equal(stores.movements,undefined,'migration cannot rewrite historical movements');
assert.throws(()=>Plan.prepare({...previous,settings:stores.settings},plan),/già stato applicato/);
assert.throws(()=>Plan.validate({...plan,accounts:[{name:'Bad',balance:-2}]}),/Importo non valido/i);
assert.throws(()=>Plan.validate({...plan,expectedIncomes:[{name:'Dated',amount:100,expectedDate:'2026-12-03'}]}),/senza data/);

const snapshot={...stores,movements:previous.movements};
// The month label is a payday cycle, not a calendar month: 10th to 9th.
cents(E.monthBreakdown(snapshot,'2026-11').rateTotal,117.29,
  'the installment due December 1 belongs to November payday cycle');
cents(E.monthBreakdown(snapshot,'2026-12').rateTotal,180,
  'January 1 payment belongs to December payday cycle');
cents(E.monthBreakdown(snapshot,'2027-01').rateTotal,180);
cents(E.monthBreakdown(snapshot,'2029-10').rateTotal,16.12);
cents(E.monthBreakdown(snapshot,'2029-11').rateTotal,16.12);
cents(E.monthBreakdown(snapshot,'2029-12').rateTotal,0,
  'last December 1 installment is already covered by November payday');
cents(E.monthBreakdown(snapshot,'2030-01').rateTotal,0,'no ghost installments after final date');
assert.equal(E.scheduledCommitments(snapshot.commitments,new Date(2026,10,9,12),4,snapshot.liabilities)
  .filter(x=>x.name==='Ending payment'&&x.dueDate==='2027-01-01').length,0,'one-time payment must stop at end date');
assert.equal(E.scheduledCommitments(snapshot.commitments,new Date(2026,10,9,12),4,snapshot.liabilities)
  .filter(x=>x.name==='Future loan'&&x.dueDate==='2027-01-01').length,1);
assert.equal(E.scheduledCommitments(snapshot.commitments,new Date(2026,10,9,12),4,snapshot.liabilities)
  .filter(x=>x.name==='Old subscription').length,0,'retired commitments must not reappear');

const funding=Goals.project(snapshot,new Date(2026,10,9,12),36);
assert.equal(funding.goals[0].name,'First goal');
assert.equal(funding.goals[1].name,'Final loan');
assert.equal(funding.goals[2].name,'Emergency reserve');
assert.ok(funding.goals[1].gap>0,'large balloon cannot be shown as fully covered');
assert.equal(funding.startMonth,'2026-12','current partial month is not counted as certain surplus');
assert.equal(Goals.eligible({targetDate:'2029-01-01'},'2029-01',10),false,'cannot use Jan 10 salary for Jan 1 due');
console.log('Private plan migration, rate phases, priorities and no-double-count tests: OK');
