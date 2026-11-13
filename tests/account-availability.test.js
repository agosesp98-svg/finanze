const assert=require('node:assert/strict');
const Engine=require('../engine.js');
const money=(value,expected,label)=>assert.ok(Math.abs(value-expected)<0.005,
  (label||'Importo')+': '+value+' anziché '+expected);

const now=new Date(2026,10,13,12);
const settings=[{key:'primaryAccountId',value:10},{key:'salaryDay',value:10}];
const accounts=[
 {id:10,name:'Banca',balance:840,kind:'Conto corrente',archived:false},
 {id:20,name:'Carta quotidiana',balance:300,kind:'Carta prepagata',archived:false},
 {id:30,name:'Vecchio conto',balance:5000,archived:true}
];
const commitments=[
 {id:1,name:'Prestito A',amount:250,dueDate:'2026-11-15',accountId:10,active:true},
 {id:2,name:'Prestito B',amount:40,dueDate:'2026-12-01',accountId:10,active:true},
 {id:3,name:'Abbonamento',amount:17,dueDate:'2026-12-09',accountId:10,active:true},
 {id:4,name:'Abbonamento pagato',amount:32,dueDate:'2026-11-12',
  accountId:10,active:false,paidDate:'2026-11-12'},
 {id:5,name:'Futura carta',amount:35,dueDate:'2026-12-11',accountId:20,active:true}
];
const snapshot={accounts,commitments,liabilities:[],
 budgets:[{id:1,targetBudget:350,spent:50}],settings,
 goals:[{id:1,name:'Obiettivo',target:9000,current:600}]};
const a=Engine.accountAvailability(snapshot,now);
assert.equal(a.salary,'2026-12-10');
assert.equal(a.obligationsCount,3);
money(a.primary.balance,840,'Saldo Banca');
money(a.primary.reservedDue,307,'Rate Banca');
money(a.primary.free,533,'Denaro non impegnato Banca');
money(a.spending.balance,300,'Saldo carta');
money(a.spending.budgetReserved,300,'Budget sulla carta');
money(a.spendingAvailable,300,'Budget spendibile');
money(a.spending.free,0,'Denaro libero fuori budget sulla carta');
money(a.totalFree,533,'Totale non impegnato');
assert.equal(a.accounts.length,2,'Conti archiviati fuori dai calcoli');
const calculated=Engine.calculate(snapshot,now);
money(calculated.spendable,300,'Importo disponibile per spese quotidiane');
money(calculated.availability.primary.free,533,'Margine bancario distinto');
assert.equal(calculated.unbankedSavingsReserve,0,
 'Progresso obiettivi non deve essere sottratto due volte');

const fundedAnother={...snapshot,accounts:[
 {...accounts[0],balance:200},
 {...accounts[1],balance:300}
]};
const short=Engine.accountAvailability(fundedAnother,now);
money(short.primary.shortfall,107,'Scoperto addebiti sul conto corretto');
money(short.spendingAvailable,300,'Il budget già finanziato non deve sparire');

const assigned=Engine.accountAvailability({...snapshot,settings:[
 ...settings,{key:'spendingAccountId',value:10}
]},now);
money(assigned.primary.reservedDue,307);
money(assigned.primary.budgetReserved,300,'Budget attribuito al conto scelto');
money(assigned.primary.free,233);
money(assigned.spendingAvailable,300,'Budget sul conto esplicitamente selezionato');

const prepaidLoan={
 id:18,name:'Rata già saldata',monthly:67,
 firstDueDate:'2026-12-01',nextDueDate:'2026-12-01',
 recurrenceEnd:'2026-12-01',completed:false
};
const paidEarly={id:51,liabilityId:18,name:'Rata già saldata',
 amount:67,dueDate:'2026-12-01',paidDate:'2026-11-11',
 active:false,archived:true};
const paid=Engine.accountAvailability({...snapshot,liabilities:[prepaidLoan],
 commitments:[...commitments,paidEarly]},now);
assert.ok(!paid.obligations.some(x=>x.liabilityId===18),
 'Una rata pagata in anticipo, anche se archiviata, non deve ricomparire');

const unlabeled=Engine.accountAvailability({...snapshot,commitments:[
 {id:78,name:'Addebito senza conto',amount:11,dueDate:'2026-11-19',active:true}
]},now);
money(unlabeled.primary.reservedDue,11);
assert.ok(unlabeled.accountAssignmentInferred,'L’attribuzione automatica deve essere visibile');

assert.equal(Engine.salaryDate(settings,new Date(2026,10,10,12)),'2026-12-10',
 'Il giorno stesso dell’accredito inaugura il nuovo ciclo stipendio');
assert.equal(Engine.salaryDate([...settings,{key:'nextSalaryDate',value:'2026-11-14'}],now),
 '2026-12-10','Una data anticipata non deve accorciare il ciclo');

console.log('Conti, scadenze, budget e saldo realmente libero: OK');