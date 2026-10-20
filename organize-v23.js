(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  let organizing=false;

  function showBudget(){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    $('#view-budget')?.classList.add('active');
    $('.tab[data-view="plan"]')?.classList.add('active');
    const title=$('#pageTitle');if(title)title.textContent='Budget';
    window.scrollTo({top:0,behavior:'auto'});
  }

  function sectionOf(id){return $(id)?.closest('.section-card')||null}

  function placeInOrder(parent,elements){
    const wanted=elements.filter(Boolean);
    if(!wanted.length)return;
    const current=wanted.filter(el=>el.parentElement===parent);
    const already=current.length===wanted.length&&wanted.every((el,i)=>current[i]===el);
    if(already)return;
    let anchor=null;
    for(let i=wanted.length-1;i>=0;i--){
      const el=wanted[i];
      if(el.parentElement!==parent||el.nextElementSibling!==anchor)parent.insertBefore(el,anchor);
      anchor=el;
    }
  }

  function organizeHome(){
    const dash=$('#view-dashboard');if(!dash)return;
    document.body.classList.add('v23-organized');

    const hero=$('.balance-hero',dash);
    const marriage=$('#marriageHomeCard',dash);
    const spend=$('#spendTodayCard',dash);
    const upcoming=$('#v8Upcoming',dash);
    const budget=sectionOf('#budgetSummary');

    [
      $('.metric-grid',dash),
      $('.quick-card',dash),
      sectionOf('#forecastOut'),
      sectionOf('#homeGoals'),
      sectionOf('#expectedIncomeList'),
      $('#v8Insight',dash),
      $('#v8Recent',dash)
    ].forEach(el=>el?.classList.add('v23-home-hidden'));

    if(budget){
      budget.classList.add('v23-budget-card');
      const h=budget.querySelector('h2');if(h&&h.textContent!=='Budget quotidiano')h.textContent='Budget quotidiano';
      const small=budget.querySelector('.section-title-row small');if(small&&small.textContent!=='SPESA, BAR, RISTORANTI E ALTRO')small.textContent='SPESA, BAR, RISTORANTI E ALTRO';
      const link=budget.querySelector('[data-go="budget"], [data-v23-budget]');
      if(link&&!link.hasAttribute('data-v23-budget')){
        link.removeAttribute('data-go');link.setAttribute('data-v23-budget','');link.innerHTML='Apri categorie <span aria-hidden="true">›</span>';
      }
    }

    placeInOrder(dash,[hero,marriage,spend,upcoming,budget]);
  }

  function organizeDock(){
    const budgetTab=$('.tab[data-view="budget"]');
    if(budgetTab&&!budgetTab.classList.contains('v23-tab-hidden')){
      budgetTab.classList.add('v23-tab-hidden');budgetTab.setAttribute('aria-hidden','true');budgetTab.tabIndex=-1;
    }
    const plan=$('.tab[data-view="plan"] b');if(plan&&plan.textContent!=='Piano')plan.textContent='Piano';
    const marriage=$('.tab[data-view="marriage"] b');if(marriage&&marriage.textContent!=='Nozze')marriage.textContent='Nozze';
  }

  function organizePlan(){
    const view=$('#view-plan');if(!view)return;
    const head=$('.section-head-page',view);
    if(head){const small=head.querySelector('small');const h=head.querySelector('h2');if(small&&small.textContent!=='PIANO')small.textContent='PIANO';if(h&&h.textContent!=='Organizza i tuoi soldi')h.textContent='Organizza i tuoi soldi';}
    if(!$('#v23PlanBudget')){
      head?.insertAdjacentHTML('afterend',`<button id="v23PlanBudget" class="v23-plan-entry" type="button" data-v23-budget>
        <span class="v23-plan-entry-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 3.5a8 8 0 0 1 5.5 5.5H15V3.5Z"/></svg></span>
        <span class="v23-plan-entry-copy"><small>BUDGET QUOTIDIANO</small><strong id="v23PlanBudgetValue">—</strong><em>Spesa, bar, ristoranti, carburante e altre categorie</em><span class="v23-plan-progress"><i id="v23PlanBudgetProgress"></i></span></span>
        <span class="v23-plan-chevron">›</span>
      </button>`);
    }
    const budgetView=$('#view-budget');
    const budgetHead=$('.section-head-page',budgetView);
    if(budgetHead&&!$('#v23BudgetBack'))budgetHead.insertAdjacentHTML('beforeend','<button id="v23BudgetBack" class="small-pill" type="button">Piano</button>');
  }

  function syncPlanBudget(){
    const value=$('#budgetRemainingText')?.textContent?.replace(/^Restano\s*/i,'').replace(/\.$/,'')||'—';
    const pct=$('#budgetProgress')?.style.width||'0%';
    const out=$('#v23PlanBudgetValue');if(out)out.textContent=`${value} rimasti`;
    const bar=$('#v23PlanBudgetProgress');if(bar&&bar.style.width!==pct)bar.style.width=pct;
  }

  function organize(){
    if(organizing)return;organizing=true;
    try{organizeDock();organizePlan();organizeHome();syncPlanBudget();}
    finally{organizing=false;}
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('[data-v23-budget]')){e.preventDefault();e.stopPropagation();showBudget();return;}
    if(e.target.closest('#v23BudgetBack')){e.preventDefault();$('.tab[data-view="plan"]')?.click();return;}
  },true);

  document.addEventListener('DOMContentLoaded',()=>{
    organize();
    // Delayed passes only: no broad MutationObserver, which could retrigger itself while moving Home cards.
    setTimeout(organize,120);
    setTimeout(organize,500);
    setTimeout(organize,1200);
    const budget=$('#budgetRemainingText');
    if(budget)new MutationObserver(()=>syncPlanBudget()).observe(budget,{childList:true,subtree:true,characterData:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)organize()});
  });
})();
