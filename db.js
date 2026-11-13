const FinanceDB=(()=>{
  const N='finanze-pwa',V=1;
  const S=['accounts','budgets','commitments','expectedIncomes','goals','liabilities','movements','settings'];
  let dbPromise=null;

  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(N,V);
      request.onupgradeneeded=()=>{
        const db=request.result;
        for(const store of S){
          if(!db.objectStoreNames.contains(store)){
            db.createObjectStore(store,{keyPath:store==='settings'?'key':'id',autoIncrement:store!=='settings'});
          }
        }
      };
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{db.close();dbPromise=null;};
        resolve(db);
      };
      request.onerror=()=>{dbPromise=null;reject(request.error);};
    });
    return dbPromise;
  }

  async function getAll(store){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(store,'readonly').objectStore(store).getAll();
      request.onsuccess=()=>resolve(request.result||[]);
      request.onerror=()=>reject(request.error);
    });
  }

  async function get(store,key){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(store,'readonly').objectStore(store).get(key);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }

  async function put(store,value){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(store,'readwrite').objectStore(store).put(value);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }

  async function add(store,value){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(store,'readwrite').objectStore(store).add(value);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }

  async function remove(store,key){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(store,'readwrite').objectStore(store).delete(key);
      request.onsuccess=()=>resolve();
      request.onerror=()=>reject(request.error);
    });
  }

  async function clear(store){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(store,'readwrite').objectStore(store).clear();
      request.onsuccess=()=>resolve();
      request.onerror=()=>reject(request.error);
    });
  }

  async function clearAll(){for(const store of S)await clear(store);}

  async function exportAll(){
    const payload={version:1,exportedAt:new Date().toISOString(),stores:{}};
    for(const store of S)payload.stores[store]=await getAll(store);
    return payload;
  }

  async function importAll(payload){
    // Never clear real financial data before checking the complete backup.
    if(payload?.version!==1||!payload.stores||
      S.some(store=>!Array.isArray(payload.stores[store])||
        payload.stores[store].some(entry=>!entry||typeof entry!=='object'||
          entry[store==='settings'?'key':'id']==null))){
      throw new Error('Backup incompleto o non valido. Nessun dato è stato modificato.');
    }
    // One transaction for every store: an error aborts the entire restore.
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(S,'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Ripristino non riuscito.'));
      tx.onabort=()=>reject(tx.error||new Error('Ripristino annullato: dati originali conservati.'));
      for(const key of S){
        const store=tx.objectStore(key);
        store.clear();
        for(const record of payload.stores[key])store.put(record);
      }
    });
  }

  // One IndexedDB transaction guarantees a complete plan migration or no changes.
  // Movements are NEVER cleared, preserving the historic ledger.
  async function replacePlanningStores(data){
    const keys=S.filter(k=>k!=='movements');
    if(!data||keys.some(k=>!Array.isArray(data[k])))throw Error('Piano incompleto.');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(keys,'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Aggiornamento non completato.'));
      tx.onabort=()=>reject(tx.error||new Error('Aggiornamento annullato.'));
      for(const key of keys){
        const store=tx.objectStore(key);
        store.clear();
        for(const entry of data[key])store.put(entry);
      }
    });
  }

  async function receiveExpectedIncome(id,accountId,amount,date){
    const sum=Number(amount);
    if(!Number.isFinite(sum)||sum<=0||!Number.isInteger(Number(id))||!Number.isInteger(Number(accountId))||
       !/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Dati incasso non validi.');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['accounts','expectedIncomes','movements'],'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Salvataggio non completato.'));
      tx.onabort=()=>reject(tx.error||new Error('Incasso annullato.'));
      const incomes=tx.objectStore('expectedIncomes'),accounts=tx.objectStore('accounts');
      let income=null,account=null;
      const r1=incomes.get(Number(id));
      r1.onsuccess=()=>{
        income=r1.result;
        if(!income||income.archived||income.status==='received'){tx.abort();return}
        const r2=accounts.get(Number(accountId));
        r2.onsuccess=()=>{
          account=r2.result;
          if(!account||account.archived||account.protected){tx.abort();return}
          account.balance=Number(account.balance||0)+sum;
          income.status='received';income.receivedDate=date;income.accountId=account.id;income.receivedAmount=sum;
          accounts.put(account);incomes.put(income);
          tx.objectStore('movements').add({
            type:'income',date,title:income.name,amount:sum,accountId:account.id,
            category:'Incasso credito',expectedIncomeId:income.id
          });
        };
      };
    });
  }

  // The receipt and balance update are one transaction: no partial salary credit.
  async function recordSalary(amount,accountId,spendingAccountId,date){
    const sum=Math.round(Number(amount)*100)/100,accountKey=Number(accountId);
    if(!Number.isFinite(sum)||sum<=0||!Number.isInteger(accountKey)||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw Error('Dati stipendio non validi.');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['accounts','movements','settings'],'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Salvataggio non completato.'));
      tx.onabort=()=>reject(tx.error||new Error('Operazione annullata o stipendio già registrato.'));
      const movements=tx.objectStore('movements'),accounts=tx.objectStore('accounts');
      const r=movements.getAll();
      r.onsuccess=()=>{
        if(r.result.some(x=>x.type==='income'&&x.salaryGuide===true&&x.date===date)){tx.abort();return}
        const accountRequest=accounts.get(accountKey);
        accountRequest.onsuccess=()=>{
          const account=accountRequest.result;
          if(!account||account.archived||account.protected){tx.abort();return}
          account.balance=Math.round((Number(account.balance||0)+sum)*100)/100;
          accounts.put(account);
          movements.add({type:'income',date,title:'Stipendio',category:'Stipendio',
            amount:sum,accountId:account.id,salaryGuide:true});
          if(Number.isInteger(Number(spendingAccountId)))
            tx.objectStore('settings').put({key:'salaryGuideSpendingAccount',value:Number(spendingAccountId)});
        };
      };
    });
  }

  return{S,open,getAll,get,put,add,remove,clear,clearAll,exportAll,importAll,replacePlanningStores,receiveExpectedIncome,recordSalary};
})();
