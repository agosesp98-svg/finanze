const assert=require('node:assert/strict');
const FinanceDB=require('../db.js');
// Synthetic finance data; real user accounts, names and balances stay private.
const copy=o=>JSON.parse(JSON.stringify(o));
const tables={
  weddingProjects:[],
  commitments:[
    {id:1,name:'Storage cloud',amount:.99,dueDate:'2026-11-11',
      active:false,paidDate:'2026-11-13',cadence:'Mensile',recurring:true},
    {id:2,name:'Storage cloud',amount:.99,dueDate:'2026-12-11',
      active:true,cadence:'Mensile',recurring:true},
    {id:3,name:'Therapy test',amount:49,dueDate:'2026-11-30',
      active:false,paidDate:'2026-11-10',cadence:'Una tantum',recurring:false},
    {id:4,name:'Therapy test',amount:49,dueDate:'2026-11-30',
      active:true,cadence:'Ogni 21 giorni',recurring:true},
    {id:5,name:'Old provider',amount:43.89,dueDate:'2026-11-09',
      active:false,paidDate:'2026-11-09',cadence:'Mensile',recurring:true},
    {id:6,name:'Old provider',amount:43.89,dueDate:'2026-12-09',
      active:true,cadence:'Mensile',recurring:true}
  ],
  movements:[{id:1,type:'expense',amount:49,date:'2026-11-10',title:'Therapy test'}],
  accounts:[{id:3,name:'Checking',balance:1000}],
  goals:[{id:4,name:'Target',current:1200}]
};
const baseline=copy({accounts:tables.accounts,movements:tables.movements,goals:tables.goals});
const fakeDb={transaction(names,mode){
 assert.equal(mode,'readwrite');
 assert.deepEqual(names,['weddingProjects','commitments','movements']);
 const staged=copy(tables);
 let inflight=0,closed=false;
 const tx={oncomplete:null,onerror:null,onabort:null,error:null,
  abort(){closed=true;queueMicrotask(()=>tx.onabort?.())},
  objectStore(name){
   const arr=staged[name];
   const request=value=>{
    inflight++;
    const r={onsuccess:null};
    queueMicrotask(()=>{
      if(closed)return;
      r.onsuccess?.({target:{result:copy(value)}});
      inflight--;
      queueMicrotask(()=>{
        if(!closed&&inflight===0){
          closed=true;Object.assign(tables,staged);tx.oncomplete?.()
        }
      });
    });return r;
   };
   return{
     get(id){return request(arr.find(x=>x.id===id))},
     getAll(){return request(arr)},
     put(value){const n=arr.findIndex(x=>x.id===value.id);
       if(n<0)arr.push(copy(value));else arr[n]=copy(value)},
     add(value){const id=1+Math.max(0,...arr.map(x=>Number(x.id)||0));arr.push({...copy(value),id});return request(id)}
   };
  }};
 return tx;
}};
globalThis.indexedDB={open(){
 const req={result:fakeDb,onsuccess:null};
 queueMicrotask(()=>req.onsuccess?.());return req;
}};
const patch={
 kind:'finanze-unified-reconciliation',version:1,
 patchId:'test-unified-1',projectId:'wedding-main',asOf:'2026-11-27',
 weddingProjectTemplate:{id:'wedding-main',suppliers:[],
   forecast:{monthlyBase:1230.2,extraExpenses:{'2026-12':39},reservePerMonth:100,incomes:{'2026-12':2200}}},
 automatedSavings:{monthlyAmount:100,dayOfMonth:17,buckets:[
   {label:'A',purpose:'wedding',share:.5},{label:'B',purpose:'emergency',share:.5}]},
 weddingRecurrence:{id:'therapy',label:'Therapy test',amount:49,
   firstDue:'2026-12-21',everyDays:21},
 upsertCommitments:[
   {name:'Storage cloud',amount:2.99,dueDate:'2026-12-23',cadence:'Mensile',
     allowedPreviousDates:['2026-12-11','2026-12-23'],allowLaterSameDay:true},
   {name:'Therapy test',amount:49,dueDate:'2026-12-21',
     cadence:'Ogni 21 giorni',allowedPreviousDates:['2026-11-30','2026-12-21']},
   {name:'Phone bill',amount:7.9,dueDate:'2026-12-19',
     cadence:'Mensile',allowedPreviousDates:['2026-12-19'],allowLaterSameDay:true},
   {name:'Trainer',amount:200,dueDate:'2026-12-10',
     cadence:'Mensile',allowedPreviousDates:['2026-12-10'],estimated:true,variableAmount:true}
 ],
 archiveRecurring:[{name:'Old provider',note:'Ended'}],
 oneOffCommitments:[{name:'Annual fee',amount:75,dueDate:'2026-12-20',cadence:'Una tantum'}],
 forecastCorrection:{baselineCandidates:[1230.2,1232.2,1240.1],
   targetMonthlyBase:1240.1,oneOffMonth:'2026-12',
   oneOffCandidates:[39,114],targetOneOffExpense:114},
 verifiedExisting:[],requiresReview:[]
};
async function main(){
 const r=await FinanceDB.applyUnifiedReconciliation(patch);
 assert.equal(r.skipped,false);
 assert.deepEqual(tables.accounts,baseline.accounts);
 assert.deepEqual(tables.movements,baseline.movements);
 assert.deepEqual(tables.goals,baseline.goals);
 const commitment=(name,predicate=()=>true)=>
   tables.commitments.find(x=>x.name===name&&predicate(x));
 assert.equal(commitment('Storage cloud',x=>x.active).amount,2.99);
 assert.equal(commitment('Storage cloud',x=>x.active).dueDate,'2026-12-23');
 assert.equal(commitment('Storage cloud',x=>x.paidDate).amount,.99,
   'Do not rewrite already paid bill');
 assert.equal(commitment('Therapy test',x=>x.active).dueDate,'2026-12-21');
 assert.equal(commitment('Therapy test',x=>x.paidDate).dueDate,'2026-11-30');
 assert.equal(commitment('Old provider',x=>x.paidDate).archived,true);
 assert.equal(commitment('Old provider',x=>x.dueDate==='2026-12-09').active,false);
 assert.equal(commitment('Phone bill').amount,7.9);
 assert.equal(commitment('Trainer').amount,200);
 assert.equal(commitment('Annual fee').amount,75);
 assert.equal(tables.weddingProjects.length,1,'Seed from private template if missing');
 const p=tables.weddingProjects[0];
 assert.equal(p.forecast.monthlyBase,1240.1);
 assert.equal(p.forecast.extraExpenses['2026-12'],114);
 assert.equal(p.forecast.extraRecurrences.length,1);
 assert.equal(p.automatedSavings.buckets[0].share,.5);
 const priorLength=tables.commitments.length;
 const second=await FinanceDB.applyUnifiedReconciliation(patch);
 assert.equal(second.skipped,true);
 assert.equal(tables.commitments.length,priorLength,'Import twice creates no doubles');
 assert.equal(tables.weddingProjects.length,1);
 p.automatedSavings.buckets[0].share=.65;
 p.automatedSavings.buckets[1].share=.35;
 const other=await FinanceDB.applyUnifiedReconciliation({...patch,patchId:'test-unified-2'});
 assert.equal(other.skipped,false);
 assert.equal(tables.weddingProjects[0].automatedSavings.buckets[0].share,.65,
   'Keep actual user-chosen XME percentages');
 assert.equal(tables.commitments.length,priorLength);
 await assert.rejects(()=>FinanceDB.applyUnifiedReconciliation({...patch,
   patchId:'bad',upsertCommitments:[{name:'Bad',amount:-1,dueDate:'2026-12-01',cadence:'Mensile'}]}),/non valida/);
 assert.deepEqual(tables.accounts,baseline.accounts);
 assert.deepEqual(tables.movements,baseline.movements);
 console.log('Unified reconciliation, paid-history preservation, no duplicate movement, self-contained seed: OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
