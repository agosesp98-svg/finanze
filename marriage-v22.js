(()=>{
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n||0));
  const money2=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n||0));
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const heart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 8.6c0 5-8.5 10.2-8.5 10.2S3.5 13.6 3.5 8.6A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.5 2.5Z"/></svg>';
  const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const plus='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  let timer=null;

  function installStructure(){
    const hero=$('#view-dashboard .balance-hero');
    if(hero&&!$('#marriageHomeCard'))hero.insertAdjacentHTML('afterend',`<button id="marriageHomeCard" class="marriage-home-card" type="button" data-go="marriage"><span class="marriage-home-icon">${heart}</span><span class="marriage-home-main"><small>ACCANTONAMENTO MATRIMONIO</small><strong id="marriageHomeCurrent">—</strong><em id="marriageHomeTarget">Carico il piano…</em><span class="marriage-home-progress"><i id="marriageHomeProgress"></i></span><span class="marriage-home-meta"><b id="marriageHomeRemaining">—</b><b id="marriageHomeMonthly">—</b></span></span><span class="marriage-home-arrow">${arrow}</span></button>`);

    const accountsView=$('#view-accounts');
    if(accountsView&&!$('#view-marriage'))accountsView.insertAdjacentHTML('afterend',`<section id="view-marriage" class="view marriage-view">
      <div class="section-head-page marriage-page-head"><div><small>NOZZE</small><h2>Fondo matrimonio</h2></div><button id="marriageEditBtn" class="small-pill" type="button">Modifica</button></div>
      <section id="marriageHero" class="marriage-hero">
        <div class="marriage-hero-top"><span class="marriage-heart">${heart}</span><span id="marriageStatus" class="marriage-status">Piano in corso</span></div>
        <small>ACCANTONATO</small><strong id="marriageCurrent">—</strong><p id="marriageTargetCopy">su —</p>
        <div class="marriage-big-progress"><i id="marriageProgress"></i></div>
        <div class="marriage-progress-row"><span id="marriagePct">0%</span><span id="marriageDate">—</span></div>
      </section>
      <section class="marriage-stats">
        <article><small>MANCANO</small><strong id="marriageRemaining">—</strong><span>al target</span></article>
        <article><small>AL MESE</small><strong id="marriageMonthly">—</strong><span>quota consigliata</span></article>
        <article><small>A SETTIMANA</small><strong id="marriageWeekly">—</strong><span>ritmo equivalente</span></article>
      </section>
      <section class="section-card marriage-save-card">
        <div class="section-title-row"><div><small>AGGIORNA IL FONDO</small><h2>Registra un accantonamento</h2></div><span class="marriage-mini-icon">${plus}</span></div>
        <form id="marriageAddForm" class="marriage-add-form"><div class="field"><label>Quanto hai accantonato</label><div class="marriage-input-wrap"><span>€</span><input id="marriageAddAmount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0,00" required></div></div><button class="primary-button">Aggiungi al fondo</button></form>
        <p class="marriage-note">Aggiorna il fondo monitorato nell’app. Non sposta automaticamente denaro tra i tuoi conti.</p>
      </section>
      <section id="marriageEditPanel" class="section-card marriage-edit-panel" hidden>
        <div class="section-title-row"><div><small>PIANO</small><h2>Modifica obiettivo</h2></div></div>
        <form id="marriageEditForm" class="form"><div class="form-row"><div class="field"><label>Target</label><input id="marriageTargetInput" type="number" min="0" step="0.01"></div><div class="field"><label>Accantonato</label><input id="marriageCurrentInput" type="number" min="0" step="0.01"></div></div><div class="field"><label>Data obiettivo</label><input id="marriageDateInput" type="date"></div><button class="primary-button">Salva piano</button></form>
      </section>
      <section class="section-card marriage-advice-card">
        <div class="section-title-row"><div><small>PIANO DI RISPARMIO</small><h2>Suggerimenti per arrivarci</h2></div></div>
        <div id="marriageAdvice" class="marriage-advice-list"></div>
      </section>
      <section class="section-card marriage-scenarios-card">
        <div class="section-title-row"><div><small>SCENARI</small><h2>Se aumenti il ritmo</h2></div></div>
        <div id="marriageScenarios" class="marriage-scenarios"></div>
      </section>
    </section>`);

    const accountTab=$('.tab[data-view="accounts"]');
    if(accountTab&&!$('.tab[data-view="marriage"]'))accountTab.insertAdjacentHTML('afterend',`<button class="tab marriage-tab" data-view="marriage" data-title="Matrimonio"><span>${heart}</span><b>Nozze</b></button>`);
  }

  function daysUntil(date){
    if(!date)return 0;
    const now=new Date();now.setHours(12,0,0,0);
    const end=new Date(`${date}T12:00:00`);
    return Math.max(0,Math.ceil((end-now)/86400000));
  }
  function dateLabel(date){
    if(!date)return'Data da impostare';
    return new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00`));
  }
  function findMarriage(goals){return goals.find(g=>norm(g.name).includes('matrimonio'))||null}
  function pct(current,target){return target>0?Math.min(100,Math.max(0,current/target*100)):0}

  function makeAdvice(goal,budgets,expected,stats){
    if(!goal)return `<div class="marriage-advice-item"><span>1</span><div><strong>Imposta prima l'obiettivo</strong><p>Definisci target e data: da lì posso calcolare una quota mensile realistica.</p></div></div>`;
    if(stats.remaining<=0)return `<div class="marriage-advice-item good"><span>✓</span><div><strong>Obiettivo coperto</strong><p>Il fondo ha raggiunto il target. Mantienilo separato dalle spese quotidiane.</p></div></div>`;
    const pieces=[];
    if(stats.monthly>0)pieces.push(`<div class="marriage-advice-item primary"><span>1</span><div><strong>Accantona ${money(stats.monthly)} appena arriva lo stipendio</strong><p>Trattalo come una rata verso te stesso: prima il matrimonio, poi il resto delle spese discrezionali.</p></div></div>`);
    const available=budgets.map(b=>({name:b.name,left:Math.max(0,Number(b.budget||0)-Number(b.spent||0))})).sort((a,b)=>b.left-a.left)[0];
    if(available&&available.left>0)pieces.push(`<div class="marriage-advice-item"><span>2</span><div><strong>Recupera gli avanzi del budget</strong><p>A fine periodo, se resta qualcosa in “${esc(available.name)}”, sposta il 50% dell'avanzo nel fondo invece di considerarlo subito spendibile.</p></div></div>`);
    const expMin=expected.filter(x=>x.status==='Atteso').reduce((s,x)=>s+Number(x.min||0),0);
    if(expMin>0){const share=Math.min(stats.remaining,expMin*.25);pieces.push(`<div class="marriage-advice-item"><span>3</span><div><strong>Usa una quota delle entrate extra</strong><p>Hai almeno ${money(expMin)} di entrate attese: destinandone il 25% al matrimonio aggiungeresti circa ${money(share)} senza caricare tutto sullo stipendio.</p></div></div>`)}
    pieces.push(`<div class="marriage-advice-item"><span>${pieces.length+1}</span><div><strong>Ragiona a settimane, non a fine mese</strong><p>Il ritmo necessario equivale a circa ${money(stats.weekly)} a settimana. Controllarlo ogni 7 giorni rende più facile correggere gli eccessi prima che si accumulino.</p></div></div>`);
    return pieces.join('');
  }

  function makeScenarios(stats){
    if(stats.remaining<=0)return '<div class="empty">Target raggiunto.</div>';
    const values=[50,100,150];
    return values.map(extra=>{
      const rate=Math.max(1,stats.monthly+extra);
      const months=Math.ceil(stats.remaining/rate);
      return `<div class="marriage-scenario"><span>+${money(extra)}/mese</span><strong>${months} mesi</strong><small>per coprire il residuo al ritmo indicato</small></div>`;
    }).join('');
  }

  async function render(){
    installStructure();
    if(typeof FinanceDB==='undefined')return;
    try{
      const [goals,budgets,expected]=await Promise.all([FinanceDB.getAll('goals'),FinanceDB.getAll('budgets'),FinanceDB.getAll('expectedIncomes')]);
      const goal=findMarriage(goals);
      if(!goal){
        $('#marriageHomeCurrent').textContent='Da impostare';$('#marriageHomeTarget').textContent='Crea il piano matrimonio';$('#marriageHomeProgress').style.width='0%';$('#marriageHomeRemaining').textContent='Target da definire';$('#marriageHomeMonthly').textContent='Apri Nozze';
        $('#marriageCurrent').textContent='—';$('#marriageTargetCopy').textContent='Obiettivo da impostare';$('#marriageRemaining').textContent='—';$('#marriageMonthly').textContent='—';$('#marriageWeekly').textContent='—';$('#marriageProgress').style.width='0%';$('#marriagePct').textContent='0%';$('#marriageDate').textContent='Data da impostare';$('#marriageAdvice').innerHTML=makeAdvice(null,[],[],{});$('#marriageScenarios').innerHTML='<div class="empty">Imposta target e data per vedere gli scenari.</div>';
        return;
      }
      const current=Number(goal.current||0),target=Number(goal.target||0),remaining=Math.max(0,target-current),days=daysUntil(goal.targetDate),months=Math.max(1,days/30.4375),monthly=days>0?remaining/months:remaining,weekly=days>0?remaining/Math.max(1,days/7):remaining,p=pct(current,target);
      const stats={current,target,remaining,days,months,monthly,weekly,pct:p};

      $('#marriageHomeCurrent').textContent=money2(current);
      $('#marriageHomeTarget').textContent=`su ${money(target)} · ${dateLabel(goal.targetDate)}`;
      $('#marriageHomeProgress').style.width=`${p}%`;
      $('#marriageHomeRemaining').textContent=remaining>0?`Mancano ${money(remaining)}`:'Target raggiunto';
      $('#marriageHomeMonthly').textContent=remaining>0?`${money(monthly)}/mese`:'100% coperto';

      $('#marriageCurrent').textContent=money2(current);
      $('#marriageTargetCopy').textContent=`su ${money(target)}`;
      $('#marriageProgress').style.width=`${p}%`;
      $('#marriagePct').textContent=`${Math.round(p)}% completato`;
      $('#marriageDate').textContent=dateLabel(goal.targetDate);
      $('#marriageRemaining').textContent=money(remaining);
      $('#marriageMonthly').textContent=remaining>0?money(monthly):'—';
      $('#marriageWeekly').textContent=remaining>0?money(weekly):'—';
      const status=$('#marriageStatus');
      if(status){status.textContent=remaining<=0?'Obiettivo raggiunto':days===0?'Data da aggiornare':days<180?'Fase finale':'Piano in corso';status.classList.toggle('good',remaining<=0);status.classList.toggle('warn',remaining>0&&days<180)}
      $('#marriageAdvice').innerHTML=makeAdvice(goal,budgets,expected,stats);
      $('#marriageScenarios').innerHTML=makeScenarios(stats);
      $('#marriageTargetInput').value=target||'';$('#marriageCurrentInput').value=current||0;$('#marriageDateInput').value=goal.targetDate||'';
      $('#marriageAddForm').dataset.goalId=goal.id;$('#marriageEditForm').dataset.goalId=goal.id;
    }catch(e){console.warn('Marriage V22',e)}
  }

  async function ensureGoalFromEdit(){
    const id=$('#marriageEditForm')?.dataset.goalId;
    const target=Math.max(0,Number($('#marriageTargetInput')?.value||0)),current=Math.max(0,Number($('#marriageCurrentInput')?.value||0)),targetDate=$('#marriageDateInput')?.value||'';
    if(id){const goals=await FinanceDB.getAll('goals');const g=goals.find(x=>String(x.id)===String(id));if(g){g.target=target;g.current=current;g.targetDate=targetDate;g.completed=target>0&&current>=target;await FinanceDB.put('goals',g);return g}}
    const g={name:'Matrimonio',target,current,targetDate,createdAt:new Date().toISOString().slice(0,10),priority:'Alta',completed:target>0&&current>=target,note:'Fondo matrimonio'};g.id=await FinanceDB.add('goals',g);return g;
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#marriageEditBtn')){const p=$('#marriageEditPanel');if(p){p.hidden=!p.hidden;if(!p.hidden)p.scrollIntoView({behavior:'smooth',block:'nearest'})}return}
    const tab=e.target.closest('.tab');if(tab&&(tab.dataset.view==='marriage'||tab.dataset.view==='dashboard'))setTimeout(render,80);
  });

  document.addEventListener('submit',async e=>{
    if(e.target.id==='marriageAddForm'){
      e.preventDefault();const id=e.target.dataset.goalId,amount=Number($('#marriageAddAmount').value||0);if(!id||amount<=0)return;
      const goals=await FinanceDB.getAll('goals'),g=goals.find(x=>String(x.id)===String(id));if(!g)return;g.current=Math.max(0,Number(g.current||0)+amount);g.completed=Number(g.target||0)>0&&g.current>=Number(g.target||0);await FinanceDB.put('goals',g);$('#marriageAddAmount').value='';await render();return;
    }
    if(e.target.id==='marriageEditForm'){
      e.preventDefault();await ensureGoalFromEdit();$('#marriageEditPanel').hidden=true;await render();return;
    }
  });

  function schedule(){clearTimeout(timer);timer=setTimeout(render,90)}
  document.addEventListener('DOMContentLoaded',()=>{installStructure();render();setTimeout(render,450);setTimeout(render,1200);const gl=$('#goalsList');if(gl)new MutationObserver(schedule).observe(gl,{childList:true,subtree:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});window.addEventListener('pageshow',schedule,{passive:true})});
})();
