const FinanceDB=(()=>{
  const N='finanze-pwa',V=1,S=['accounts','budgets','commitments','expectedIncomes','goals','liabilities','movements','settings'];
  let dbPromise=null;
  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((r,j)=>{
      const q=indexedDB.open(N,V);
      q.onupgradeneeded=()=>{const d=q.result;for(const s of S)if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:s==='settings'?'key':'id',autoIncrement:s!=='settings'});};
      q.onsuccess=()=>{const d=q.result;d.onversionchange=()=>{d.close();dbPromise=null;};r(d);};
      q.onerror=()=>{dbPromise=null;j(q.error);};
    });
    return dbPromise;
  }
  function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function nextSalaryDate(day=10){
    const now=new Date();
    const safeDay=Math.min(28,Math.max(1,Number(day)||10));
    let d=new Date(now.getFullYear(),now.getMonth(),safeDay,12,0,0,0);
    if(now.getDate()>safeDay)d=new Date(now.getFullYear(),now.getMonth()+1,safeDay,12,0,0,0);
    return iso(d);
  }
  async function rawGetAll(s){const d=await open();return new Promise((r,j)=>{const q=d.transaction(s,'readonly').objectStore(s).getAll();q.onsuccess=()=>r(q.result||[]);q.onerror=()=>j(q.error);});}
  async function getAll(s){
    const rows=await rawGetAll(s);
    if(s!=='settings')return rows;
    const salaryDay=Number(rows.find(x=>x.key==='salaryDay')?.value||10);
    const salaryDate=nextSalaryDate(salaryDay);
    const upsert=(key,value)=>{const x=rows.find(r=>r.key===key);if(x)x.value=value;else rows.push({key,value});};
    upsert('salaryDay',salaryDay);
    upsert('salaryRule','monthly_by_day');
    upsert('nextSalaryDate',salaryDate);
    Promise.all([
      put('settings',{key:'salaryDay',value:salaryDay}),
      put('settings',{key:'salaryRule',value:'monthly_by_day'}),
      put('settings',{key:'nextSalaryDate',value:salaryDate})
    ]).catch(()=>{});
    return rows;
  }
  async function get(s,k){const d=await open();return new Promise((r,j)=>{const q=d.transaction(s,'readonly').objectStore(s).get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}
  async function put(s,v){const d=await open();return new Promise((r,j)=>{const q=d.transaction(s,'readwrite').objectStore(s).put(v);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}
  async function add(s,v){const d=await open();return new Promise((r,j)=>{const q=d.transaction(s,'readwrite').objectStore(s).add(v);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}
  async function clear(s){const d=await open();return new Promise((r,j)=>{const q=d.transaction(s,'readwrite').objectStore(s).clear();q.onsuccess=()=>r();q.onerror=()=>j(q.error);});}
  async function clearAll(){for(const s of S)await clear(s);}
  async function exportAll(){const o={version:1,exportedAt:new Date().toISOString(),stores:{}};for(const s of S)o.stores[s]=await getAll(s);return o;}
  async function importAll(p){if(!p?.stores)throw Error('Backup non valido');await clearAll();for(const s of S)for(const v of(Array.isArray(p.stores[s])?p.stores[s]:[]))await put(s,v);}
  return{S,open,getAll,get,put,add,clear,clearAll,exportAll,importAll};
})();