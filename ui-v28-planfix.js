(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  function arrangePlan(){
    const plan=$('#view-plan');if(!plan)return;
    const budget=$('#v23PlanBudget'),rates=$('#v14RateEntry');
    if(!budget&&!rates)return;
    let grid=$('#v27PlanGrid');
    if(!grid){grid=document.createElement('div');grid.id='v27PlanGrid';grid.setAttribute('role','group');grid.setAttribute('aria-label','Budget e rate');$('.section-head-page',plan)?.insertAdjacentElement('afterend',grid)}
    [budget,rates].filter(Boolean).forEach(el=>{if(el.parentElement!==grid)grid.appendChild(el)});
  }
  function a11y(){
    $$('.tabbar .tab').forEach(t=>t.classList.contains('active')?t.setAttribute('aria-current','page'):t.removeAttribute('aria-current'));
  }
  function sync(){arrangePlan();a11y()}
  document.addEventListener('DOMContentLoaded',()=>{sync();[150,450,900,1600,2600].forEach(ms=>setTimeout(sync,ms))});
  document.addEventListener('click',e=>{if(e.target.closest('.tab,[data-open-rates],[data-v23-budget],#v14Back,#v23BudgetBack'))setTimeout(sync,60)},true);
})();