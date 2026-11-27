const assert=require('node:assert/strict');
const FinanceDB=require('../db.js');
// Synthetic records only: no personal service names, balances or bucket names.
const clone=x=>JSON.parse(JSON.stringify(x));
const tables={
  weddingProjects:[{id:'wedding-main',forecast:{incomes:{'2026-12':1000}},suppliers:[]}],
  commitments:[{id:3,name:'Example recurring',amount:20,dueDate:'2026-11-30',
    active:false,paidDate:'2026-11-10',recurring:false,accountId:6}],
  accounts:[{id:6,balance:900}],
  movements:[{id:1,type:'expense',amount:20}]
};
function fakeDatabase(){
 return{transaction(names,mode){
  assert.equal(mode,'readwrite');
  assert.deepEqual(names,['weddingProjects','commitments']);
  const staged=clone(tables),tx={oncomplete:null,onabort:null,onerror:null};
  let pending=0,done=false;
  const notify=()=>{
    queueMicrotask(()=>{
      if(pending||done)return;
      done=true;Object.assign(tables,staged);tx.oncomplete?.();
    });
  };
  tx.abort=()=>{done=true;queueMicrotask(()=>tx.onabort?.())};
  tx.objectStore=store=>{
    const arr=staged[store];
    function response(value){
      pending++;const req={result:undefined,onsuccess:null};
      queueMicrotask(()=>{
        if(done)return;
        req.result=clone(value);
        req.onsuccess?.({target:{result:req.result}});
        pending--;notify();
      });
      return req;
    }
    return{
      get(id){return response(arr.find(x=>x.id===id))},
      getAll(){return response(arr)},
      put(value){const idx=arr.findIndex(x=>x.id===value.id);
        if(idx>=0)arr[idx]=clone(value);else arr.push(clone(value))},
      add(value){const id=1+Math.max(0,...arr.map(x=>x.id||0));arr.push({...clone(value),id});return response(id)}
    };
  };
  return tx;
 }};
}
globalThis.indexedDB={open(){
 const req={result:fakeDatabase(),onsuccess:null};
 queueMicrotask(()=>req.onsuccess?.());return req;
}};
const patch={
 kind:'finanze-wedding-adjustment',version:1,patchId:'synthetic-patch-1',projectId:'wedding-main',
 automatedSavings:{monthlyAmount:100,dayOfMonth:17,startMonth:'2026-12',
   buckets:[{label:'A',purpose:'wedding',share:.5},{label:'B',purpose:'emergency',share:.5}]},
 extraRecurrences:[{id:'every-three-weeks',label:'Example recurring',amount:20,
   firstDue:'2026-11-30',everyDays:21}],
 recurringCommitment:{name:'Example recurring',amount:20,dueDate:'2026-11-30',
   cadence:'Ogni 21 giorni'}
};
async function main(){
 const before=clone({accounts:tables.accounts,movements:tables.movements});
 let res=await FinanceDB.applyWeddingAdjustment(patch);
 assert.equal(res.skipped,false);
 assert.deepEqual(tables.accounts,before.accounts,'Accounts cannot be touched');
 assert.deepEqual(tables.movements,before.movements,'No duplicate movement');
 assert.equal(tables.commitments.length,2,'Preserve paid historic row; append active schedule');
 assert.ok(tables.commitments.find(x=>x.id===3).paidDate);
 assert.equal(tables.commitments.find(x=>x.active===true).cadence,'Ogni 21 giorni');
 assert.equal(tables.weddingProjects[0].automatedSavings.buckets[0].share,.5);
 assert.equal(tables.weddingProjects[0].forecast.extraRecurrences.length,1);
 res=await FinanceDB.applyWeddingAdjustment(patch);
 assert.equal(res.skipped,true,'Identical import is idempotent');
 assert.equal(tables.commitments.length,2);
 await assert.rejects(()=>FinanceDB.applyWeddingAdjustment({...patch,
   patchId:'invalid-split',automatedSavings:{...patch.automatedSavings,
     buckets:[{label:'A',share:.6},{label:'B',share:.5}]}}),/non è valida/);
 assert.equal(tables.commitments.length,2);
 console.log('Atomic partial wedding adjustment, old paid row and no duplicate money: OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
