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
    if(!payload?.stores)throw new Error('Backup non valido');
    await clearAll();
    for(const store of S){
      for(const value of(Array.isArray(payload.stores[store])?payload.stores[store]:[]))await put(store,value);
    }
  }

  return{S,open,getAll,get,put,add,remove,clear,clearAll,exportAll,importAll};
})();
