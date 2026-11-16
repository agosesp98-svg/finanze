const assert=require('node:assert/strict');
global.FinanceEngine=require('../engine.js');
const FinanceDB=require('../db.js');

const clone=v=>JSON.parse(JSON.stringify(v));
const tables={
 accounts:[{id:6,name:'ISP',balance:1293.75,archived:false,protected:false}],
 commitments:[{id:22,name:'Renault Clio',amount:287.92,dueDate:'2026-11-15',
   active:true,archived:false,liabilityId:8,accountId:6,cadence:'Mensile',recurring:true}],
 liabilities:[{id:8,name:'Renault Clio',monthly:287.92,completedInstallments:0,
   nextDueDate:'2026-11-15',recurrenceEnd:'2028-12-15',finalPayment:15219,
   finalPaymentDate:'2029-01-01',archived:false,completed:false}],
 movements:[]
};
let pending=0,aborted=false;

const db={
 transaction(names,mode){
  assert.equal(mode,'readwrite');
  assert.deepEqual(names,['accounts','commitments','liabilities','movements']);
  const staged=Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,clone(v)]));
  let awaiting=0,dead=false;
  const tx={
    oncomplete:null,onabort:null,onerror:null,error:null,
    abort(){
      dead=true;aborted=true;
      queueMicrotask(()=>tx.onabort?.());
    },
    objectStore(key){
      const list=staged[key];
      const request=(value)=>{
        awaiting++;
        const req={onsuccess:null};
        queueMicrotask(()=>{
          if(dead)return;
          req.onsuccess?.({target:{result:clone(value)}});
          awaiting--;
          if(awaiting===0)queueMicrotask(()=>{
            if(dead||awaiting)return;
            for(const name of Object.keys(staged))tables[name]=staged[name];
            tx.oncomplete?.();
          });
        });
        return req;
      };
      return{
        get(id){return request(list.find(x=>x.id===id))},
        getAll(){return request(list)},
        put(value){
          const idx=list.findIndex(x=>x.id===value.id);
          if(idx>=0)list[idx]=clone(value);else list.push(clone(value));
        },
        add(value){list.push({...clone(value),id:Math.max(0,...list.map(x=>Number(x.id)||0))+1})}
      };
    }
  };
  return tx;
 }
};
global.indexedDB={
 open(){
  const r={result:db,onsuccess:null,onerror:null};
  queueMicrotask(()=>r.onsuccess?.());
  return r;
 }
};

async function main(){
 await FinanceDB.payScheduledCommitment(22,6,287.92,'2026-11-16');
 assert.equal(tables.accounts[0].balance,1005.83);
 assert.equal(tables.movements.length,1);
 assert.equal(tables.movements[0].date,'2026-11-16');
 assert.equal(tables.movements[0].liabilityId,8);
 assert.equal(tables.commitments[0].active,false);
 assert.equal(tables.commitments[0].paidDate,'2026-11-16');
 assert.equal(tables.liabilities[0].nextDueDate,'2026-12-15');
 assert.equal(tables.liabilities[0].completedInstallments,1);
 assert.equal(tables.liabilities[0].monthly,287.92);
 await assert.rejects(()=>FinanceDB.payScheduledCommitment(22,6,287.92,'2026-11-16'),
   /già pagata|disattivata/);
 assert.equal(tables.accounts[0].balance,1005.83,
   'A repeated payment must not subtract money twice');
 assert.equal(tables.movements.length,1);
 assert.equal(aborted,true);
 console.log('Atomic installment payment and double-charge prevention: OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
