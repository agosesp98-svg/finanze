const assert=require('node:assert/strict');
const AI=require('../ai-context.js');
const Chat=require('../ai-chat.js');

{
  const now=new Date(2026,10,5,12,0,0);
  const snapshot={
    accounts:[{id:1,name:'Conto principale',balance:24.35,protected:false},{id:2,name:'Fondo protetto',balance:150,protected:true}],
    budgets:[{id:1,name:'Spesa',targetBudget:200,spent:30}],
    commitments:[{id:1,name:'Servizio mensile',amount:43.89,dueDate:'2026-11-09',cadence:'Mensile',active:true,recurring:true}],
    liabilities:[],goals:[{id:1,name:'Obiettivo',target:1000,current:120,targetDate:'2027-11-01'}],
    movements:[{id:1,title:'NOT_FOR_AI',type:'expense',amount:52.4,category:'Alimentari',date:'2026-11-03',accountId:1},{id:2,type:'expense',amount:10.1,category:'Alimentari',date:'2026-10-20',accountId:1},{id:3,type:'income',amount:5000,category:'Accredito',date:'2026-11-04',accountId:1}],
    expectedIncomes:[{id:1,name:'Compenso atteso',amount:250,expectedDate:'2026-12-01',status:'In attesa'}],
    settings:[{key:'salaryNet',value:1500},{key:'salaryDay',value:10},{key:'primaryAccountId',value:1}]
  };
  const c=AI.build(snapshot,now);
  assert.equal(c.accounts[0].balance,24.35);
  assert.equal(c.budgets[0].remaining,170);
  assert.equal(c.upcoming.find(x=>x.date==='2026-12-09').projected,true,'recurring forecast must be present in AI context');
  assert.ok(c.thisCycle.shortfallBeforeSalary>=19.54-0.005);
  assert.ok(!JSON.stringify(c).includes('NOT_FOR_AI'),'no raw transaction/movement history should be sent');
  assert.equal(c.sixMonthPlan.length,6);
  assert.equal(c.last90DaysOfRecordedSpending.byCategory[0].category,'Alimentari');
  assert.equal(c.last90DaysOfRecordedSpending.byCategory[0].amount,62.5);
  assert.equal(c.last90DaysOfRecordedSpending.totalSpent,62.5,'non contare entrate tra spese');
  assert.equal(c.expectedIncomes[0].status,'In attesa');
  assert.equal(c.thisCycle.currentLiquidBalance,24.35);
  assert.equal(c.last90DaysOfRecordedSpending.expenseCount,2);
}
{
  assert.equal(Chat.normalizeWorkerUrl('https://finanze-ai.example.workers.dev'),'https://finanze-ai.example.workers.dev/chat');
  assert.equal(Chat.normalizeWorkerUrl('https://finanze-ai.example.workers.dev/chat'),'https://finanze-ai.example.workers.dev/chat');
  assert.throws(()=>Chat.normalizeWorkerUrl('http://finanze-ai.example.workers.dev'));
  assert.throws(()=>Chat.normalizeWorkerUrl('https://example.com/collect'));
  assert.throws(()=>Chat.normalizeWorkerUrl('https://user:pass@finanze-ai.example.workers.dev'));
}
{
  const old=[{role:'user',content:'Primo messaggio'},{role:'assistant',content:'Prima risposta'}];
  const active=[...old,{role:'user',content:'Domanda in corso',status:'sending'}];
  assert.equal(Chat.requestMessages(active).at(-1).content,'Domanda in corso',
    'the currently pending message must reach Cloudflare');
  const errors=[...old,{role:'user',content:'Richiesta precedente',status:'failed'},{role:'user',content:'Domanda nuova',status:'sending'}];
  assert.deepEqual(Chat.requestMessages(errors).map(x=>x.content),
    ['Primo messaggio','Prima risposta','Domanda nuova'],
    'a failed message should not be sent again in a new question');
  const restored=Chat.normalizeHistory([{role:'user',content:'Messaggio perso durante refresh',status:'sending'}]);
  assert.equal(restored[0].status,'failed','interrupted messages must offer retry after reload');
  assert.equal(Chat.requestMessages([{role:'user',content:'Messaggio non valido',status:'skipped'}]).length,0);
}
console.log('Finanze AI context tests: OK');
