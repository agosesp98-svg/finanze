const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class FakeNode {
  constructor(tag='div'){
    this.tagName=tag;this.children=[];this.listeners=new Map();this.dataset={};
    this.className='';this.textContent='';this.disabled=false;this.hidden=false;this.style={};
    this.classList={
      add:()=>{},remove:()=>{},toggle:()=>{}
    };
  }
  appendChild(element){this.children.push(element);return element}
  replaceChildren(...elements){this.children=[...elements]}
  setAttribute(name,value){this[name]=value}
  addEventListener(name,fn){this.listeners.set(name,fn)}
  async fire(name,event={}){
    const fn=this.listeners.get(name);
    if(!fn)throw Error('Missing '+name+' handler for '+this.textContent);
    return fn({target:this,preventDefault(){},...event});
  }
  click(){const fn=this.listeners.get('click');return fn?fn({target:this,preventDefault(){}}):undefined}
  remove(){}
  focus(){}
  scrollIntoView(){}
}
function find(root,txt){
  if(root.textContent===txt)return root;
  for(const child of root.children||[]){const v=find(child,txt);if(v)return v}
  return null;
}
async function test(){
  const ids=['planFileInput','planSummary','planStrategy','incomeList','sheetTitle','sheetBody','sheetBackdrop','sheet'];
  const elements=Object.fromEntries(ids.map(id=>[id,new FakeNode()]));
  elements.sheetBody.className='sheet-body';
  const documentCallbacks={};
  const document={
    body:new FakeNode(),
    createElement:tag=>new FakeNode(tag),
    createDocumentFragment:()=>new FakeNode('#fragment'),
    getElementById:id=>elements[id]||null,
    addEventListener:(type,fn)=>documentCallbacks[type]=fn
  };
  const settings=new Map(),writes=[];
  const FinanceDB={
    S:['accounts','budgets','commitments','expectedIncomes','goals','liabilities','movements','settings'],
    getAll:async()=>[],
    exportAll:async()=>({version:1,stores:{}}),
    replacePlanningStores:async data=>{writes.push(data);settings.set('planPatchAppliedId','test-private-patch')},
    get:async()=>({value:settings.get('planPatchAppliedId')})
  };
  const FinancePlanPatch={prepare:(_,data)=>({
    stores:{accounts:[],budgets:[],goals:[],settings:[]},
    preview:{name:'Synthetic private update',asOf:'2026-11-09',liquid:100,
      salaryRange:[1500,1550],accounts:3,budgets:4,loans:5,recurring:2,
      expectedIncomes:2,goals:3,preservedMovements:10}
  })};
  const storage=new Map(),callbacks=[];
  const context={
    document,FinanceDB,FinancePlanPatch,
    FinanceEngine:{iso:()=> '2026-11-09'},
    FinanceGoalPriority:{project:()=>({goals:[],salaryHigh:1550,salaryLow:1500,startMonth:'2026-12'})},
    Blob,Date,JSON,Intl,console,Number,Object,Math,String,
    URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},
    setTimeout:fn=>{callbacks.push(fn);return callbacks.length},
    requestAnimationFrame:fn=>fn(),
    clearTimeout:()=>{},
    MutationObserver:class {observe(){}},
    location:{reload:()=>{throw Error('reload must occur only after requested delay')}},
    sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},
    confirm:()=>{throw Error('iOS-blocked native confirm should not be required')}
  };
  vm.runInNewContext(fs.readFileSync('plan-update-ui.js','utf8'),context);
  documentCallbacks.DOMContentLoaded();
  const file={name:'piano-prova.json',size:2500,text:async()=>JSON.stringify({kind:'finanze-plan-update',id:'test-private-patch'})};
  await elements.planFileInput.fire('change',{target:{files:[file]}});
  const body=elements.sheetBody;
  const apply=find(body,'2. Applica il nuovo piano');
  const backup=find(body,'1. Scarica backup attuale');
  assert.ok(apply,'apply button is visible. Sheet: '+elements.sheetTitle.textContent+
    '. Rendered: '+(function walk(x){return [String(x.textContent||'').slice(0,140),...(x.children||[]).flatMap(walk)].filter(Boolean)})(body).join(' | '));
  assert.ok(backup,'backup button is visible');
  assert.equal(apply.disabled,false,'apply must not silently ignore clicks while backup absent');
  await apply.click();
  const confirmation=find(body,'Passaggio 2 di 2: conferma esplicita, senza finestre del browser.');
  assert.ok(confirmation,'an in-app confirmation section exists');
  assert.match(find(body,'Prima devi scaricare il backup con il pulsante 1.').textContent,/Prima devi scaricare/);
  await backup.click();
  assert.ok(!backup.disabled,'backup button restores after download');
  await apply.click();
  const check=find(body,'Ho verificato che il backup è stato salvato e che i saldi indicati nel piano sono corretti.');
  assert.ok(check,'the user must expressly confirm backup and balances');
  const final=find(body,'Conferma e aggiorna Finanze');
  assert.ok(final&&final.disabled,'final action is locked until acknowledgement');
  const box=final; // explicit confirmation lives alongside final
  const all=[];
  (function visit(x){all.push(x);for(const c of x.children||[])visit(c)})(body);
  const checkbox=all.find(x=>x.type==='checkbox');
  assert.ok(checkbox,'acknowledgement checkbox exists');
  checkbox.checked=true;await checkbox.fire('change');
  assert.equal(final.disabled,false);
  await final.click();
  assert.equal(writes.length,1,'one atomic local update');
  assert.ok(storage.get('finanze-plan-update-success'),'success confirmation survives app reload');
  assert.ok(find(body,'Piano importato e salvato correttamente. Aggiornamento della schermata…'));
}
test().then(()=>console.log('Private import UX confirmation tests: OK')).catch(e=>{console.error(e);process.exit(1)});
