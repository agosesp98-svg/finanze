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
    movements:[{id:1,title:'NOT_FOR_AI',accountId:1}],
    settings:[{key:'salaryNet',value:1500},{key:'salaryDay',value:10},{key:'primaryAccountId',value:1}]
  };
  const c=AI.build(snapshot,now);
  assert.equal(c.accounts[0].balance,24.35);
  assert.equal(c.budgets[0].remaining,170);
  assert.equal(c.upcoming.find(x=>x.date==='2026-12-09').projected,true,'recurring forecast must be present in AI context');
  assert.ok(c.thisCycle.shortfallBeforeSalary>=19.54-0.005);
  assert.ok(!JSON.stringify(c).includes('NOT_FOR_AI'),'no raw transaction/movement history should be sent');
  assert.equal(c.sixMonthPlan.length,6);
}
{
  assert.equal(Chat.normalizeWorkerUrl('https://finanze-ai.example.workers.dev'),'https://finanze-ai.example.workers.dev/chat');
  assert.equal(Chat.normalizeWorkerUrl('https://finanze-ai.example.workers.dev/chat'),'https://finanze-ai.example.workers.dev/chat');
  assert.throws(()=>Chat.normalizeWorkerUrl('http://finanze-ai.example.workers.dev'));
  assert.throws(()=>Chat.normalizeWorkerUrl('https://example.com/collect'));
  assert.throws(()=>Chat.normalizeWorkerUrl('https://user:pass@finanze-ai.example.workers.dev'));
}
console.log('Finanze AI context tests: OK');
