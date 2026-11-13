const assert=require('node:assert/strict');
const DB=require('../db.js');
const stores=DB.S;
let transactions=0,applied=[];
const fakeDb={
 transaction(names,mode){
   transactions++;
   assert.deepEqual(names,stores);
   assert.equal(mode,'readwrite');
   const operations=[];
   const tx={
     oncomplete:null,onerror:null,onabort:null,
     objectStore(key){
       assert.ok(stores.includes(key),'unknown store '+key);
       return{
         clear(){operations.push({type:'clear',store:key})},
         put(value){operations.push({type:'put',store:key,value})}
       };
     }
   };
   Promise.resolve().then(()=>{
     applied=operations;
     tx.oncomplete?.();
   });
   return tx;
 }
};
globalThis.indexedDB={
 open(){
   const request={result:fakeDb,onsuccess:null,onerror:null,onupgradeneeded:null};
   Promise.resolve().then(()=>request.onsuccess?.());
   return request;
 }
};

async function main(){
 await assert.rejects(()=>DB.importAll({version:1,stores:{accounts:[]}}),
   /Backup incompleto o non valido/,'Never import truncated backups');
 assert.equal(transactions,0,'Incomplete backup must not touch IndexedDB');
 const payload={version:1,stores:Object.fromEntries(
   stores.map(key=>[key,[key==='settings'?{key:'salaryDay',value:10}:{id:1,name:'Dato di prova'}]])
 )};
 await DB.importAll(payload);
 assert.equal(transactions,1,'Backup restore must be one atomic transaction');
 assert.equal(applied.filter(a=>a.type==='clear').length,stores.length);
 assert.equal(applied.filter(a=>a.type==='put').length,stores.length);
 await assert.rejects(()=>DB.importAll({...payload,stores:{...payload.stores,movements:[{}]}}),
   /Backup incompleto o non valido/,'Financial movements must have stable IDs');
 assert.equal(transactions,1,'Malformed payload must be rejected before writing');
 console.log('Atomic backup import and validation: OK');
}
main().catch(err=>{console.error(err);process.exitCode=1});
