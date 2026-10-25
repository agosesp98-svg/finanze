(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n||0));
  const MARKER='budgetFoodRangeV29';
  const TARGET=400;
  const CEILING=450;
  let decorating=false;

  function isFood(name){
    const n=norm(name);
    return n==='spesa'||n.includes('spesa aliment')||n.includes('alimentar')||n.includes('supermerc')||n.includes('grocer');
  }

  async function migrate(){
    if(typeof FinanceDB==='undefined')return false;
    const settings=await FinanceDB.getAll('settings');
    if(settings.some(x=>x.key===MARKER&&x.value===true))return false;
    const budgets=await FinanceDB.getAll('budgets');
    const food=budgets.find(b=>isFood(b.name));
    let changed=false;
    if(food){
      const current=Number(food.budget||0);
      food.targetBudget=TARGET;
      food.ceilingBudget=CEILING;
      if(current<=300||current===0){food.budget=CEILING;changed=true;}
      await FinanceDB.put('budgets',food);
    }
    await FinanceDB.put('settings',{key:MARKER,value:true,updatedAt:new Date().toISOString()});
    return changed;
  }

  async function decorate(){
    if(decorating||typeof FinanceDB==='undefined')return;
    decorating=true;
    try{
      const budgets=await FinanceDB.getAll('budgets');
      const food=budgets.find(b=>isFood(b.name));
      if(!food)return;
      $$('#budgetCategories .budget-card').forEach(card=>{
        const name=$('.budget-name',card)?.textContent||'';
        if(!isFood(name))return;
        let note=$('.v29-budget-range',card);
        if(!note){note=document.createElement('div');note.className='v29-budget-range';card.appendChild(note);}
        const target=Number(food.targetBudget||TARGET),ceiling=Number(food.ceilingBudget||food.budget||CEILING),spent=Number(food.spent||0);
        const status=spent<=target?'In linea':spent<=ceiling?'Zona alta':'Oltre tetto';
        note.innerHTML=`<span>${status}</span><b>Target ${money(target)} · tetto ${money(ceiling)}</b>`;
        card.classList.toggle('v29-over-target',spent>target&&spent<=ceiling);
        card.classList.toggle('v29-over-ceiling',spent>ceiling);
      });
    }finally{decorating=false;}
  }

  async function init(){
    try{
      const changed=await migrate();
      if(changed){location.reload();return;}
      await decorate();
      const root=$('#budgetCategories');
      if(root)new MutationObserver(()=>setTimeout(decorate,30)).observe(root,{childList:true,subtree:true});
    }catch(e){console.warn('Budget V29',e)}
  }

  document.addEventListener('DOMContentLoaded',()=>{setTimeout(init,250);setTimeout(decorate,900)});
})();
