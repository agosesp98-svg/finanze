/* Salary-day instructions are computed locally. No remote sync, no automatic transfers. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Math.round((Number(n)||0)*100)/100);
const round=n=>Math.round((Number(n)||0)*100)/100;
const today=()=>FinanceEngine.iso(new Date());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setting=(arr,key,d)=>arr.find(x=>x.key===key)?.value??d;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
let draft=null,busy=false;

async function snapshot(){
 const names=FinanceDB.S,values=await Promise.all(names.map(n=>FinanceDB.getAll(n)));
 return Object.fromEntries(names.map((n,i)=>[n,values[i]]));
}
function salaryWindow(settings,now=new Date()){
 const day=Math.max(1,Math.min(28,Number(setting(settings,'salaryDay',setting(settings,'salaryLatestDay',10)))||10));
 // Audit includes the previous salary cycle, but only unpaid obligations reserve money.
 const previous=new Date(now.getFullYear(),now.getMonth()-1,day,12);
 const next=new Date(now.getFullYear(),now.getMonth()+1,day,12);
 return{start:FinanceEngine.iso(previous),end:FinanceEngine.iso(next),day};
}
function calc(s,amount,sourceId,spendingId,at=new Date()){
 const accounts=s.accounts.filter(x=>!x.archived);
 const source=accounts.find(x=>String(x.id)===String(sourceId));
 const spending=accounts.find(x=>String(x.id)===String(spendingId));
 if(!source)throw Error('Seleziona il conto su cui ricevi lo stipendio.');
 const {start,end}=salaryWindow(s.settings,at);
 // Review the whole requested window (previous 10th to next 10th).
 // Active unpaid overdue items remain due; inactive/paid records never reserve cash.
 const due=FinanceEngine.scheduledCommitments(s.commitments,at,3,s.liabilities)
   .filter(x=>x.dueDate>=start&&x.dueDate<end&&x.active!==false&&!x.archived
     &&!x.paidDate&&!x.fundedByGoal);
 const byAccount=new Map(), seen=new Set();
 for(const item of due){
  const key=[item.liabilityId||item.liabilityKey||item.sourceCommitmentId||item.id||item.name,item.dueDate,item.amount].join('|');
  if(seen.has(key))continue;seen.add(key);
  const linked=s.liabilities.find(l=>String(l.id)===String(item.liabilityId)||item.liabilityKey&&l.scheduleKey===item.liabilityKey);
  const id=Number(item.accountId||linked?.accountId||source.id);
  const record=byAccount.get(id)||{name:accounts.find(a=>Number(a.id)===id)?.name||source.name,amount:0,id};
  record.amount=round(record.amount+Number(item.amount||0));byAccount.set(id,record);
 }
 // Only actual unpaid dated obligations count. A generic calendar-month fixed
 // baseline would re-introduce bills already paid inside the salary cycle.
 const datedTotal=round([...byAccount.values()].reduce((n,x)=>n+x.amount,0));
 const fixed=datedTotal;
 const budgets=s.budgets.filter(x=>!x.archived);
 const budget=round(budgets.reduce((n,x)=>n+Math.max(0,FinanceEngine.budgetTarget(x)-Number(x.spent||0)),0));
 const available=round(Math.max(0,amount));
 const bills=round(Math.min(available,fixed));
 const life=round(Math.min(Math.max(0,available-bills),budget));
 let remaining=round(Math.max(0,available-bills-life));
 const goals=s.goals.filter(g=>!g.archived&&!g.completed&&Number(g.target||0)>Number(g.current||0)).sort((a,b)=>{
  const rank=x=>Number(x.priorityRank)||({'Alta':1,'Media':2,'Bassa':3}[x.priority]||3);
  return rank(a)-rank(b)||String(a.targetDate||'9999').localeCompare(String(b.targetDate||'9999'));
 });
 const allocations=[];
 for(const g of goals){
  if(remaining<=0)break;
  const required=Math.max(0,Number(g.target||0)-Number(g.current||0));
  const months=FinanceEngine.goalStats(g,at).months;
  // Keep remaining available for later priorities whenever a target has a monthly installment.
  const share=round(Math.min(required,remaining,months?Math.ceil(required/months*100)/100:remaining));
  if(share>0){allocations.push({id:g.id,name:g.name,amount:share});remaining=round(remaining-share)}
 }
 // Audit of loan metadata: explain missing scheduled installments rather than silently dropping them.
 const audit=s.liabilities.filter(l=>!l.archived).map(l=>{
  const covered=due.some(d=>String(d.liabilityId)===String(l.id)||(l.scheduleKey&&d.liabilityKey===l.scheduleKey)
    ||norm(d.name)===norm(l.name));
  const next=l.nextDueDate||l.firstDueDate||'';
  const final=l.recurrenceEnd||l.finalDueDate||'';
  const paid=s.commitments.some(x=>!x.archived&&x.active===false&&x.paidDate&&
    (String(x.liabilityId)===String(l.id)||(l.scheduleKey&&x.liabilityKey===l.scheduleKey))&&
    x.dueDate>=start&&x.dueDate<end);
  let status=covered?'Inclusa nel calcolo'
    :l.completed?'Finanziamento segnato come completato'
    :l.monthlyPhaseComplete||Number(l.monthly||0)<=0?'Rata mensile disattivata'
    :next&&next>=end?'Prossima scadenza dopo il periodo'
    :next&&next<start?'Scadenza precedente al ciclo: verifica avanzamento rate'
    :paid?'Rata precedente pagata; verifica la prossima scadenza'
    :'Nessuna rata non pagata generata nel periodo';
  return{name:l.name,status,covered,next,final,monthly:Number(l.monthly||0)};
 });
 // Remaining surplus is a cautious unassigned reserve, not automatically spent.
 return{source,spending,available,bills,life,fixed,budget,datedTotal,audit,due:[...byAccount.values()],dueItems:due.map(x=>({name:x.name,amount:Number(x.amount||0),date:x.dueDate,estimated:!!x.estimated})),goals:allocations,reserve:remaining,
  shortfall:round(Math.max(0,fixed+budget-available)),start,end};
}
function renderInstructions(plan){
 const host=$('salaryGuideResults');if(!host)return;
 const allocations=plan.goals.map(g=>'<li><span>Accantona per '+esc(g.name)+'</span><strong>'+money(g.amount)+'</strong></li>').join('');
 const targets=plan.due.filter(x=>x.id!==Number(plan.source.id)&&x.amount>0)
  .map(x=>'<li><span>Verifica copertura addebiti su '+esc(x.name)+'</span><strong>'+money(x.amount)+'</strong></li>').join('');
 const dueDetails=plan.dueItems.map(x=>'<li><span>'+esc(x.name)+' · '+esc(x.date)+(x.estimated?' · stimata':'')+'</span><strong>'+money(x.amount)+'</strong></li>').join('');
 const loanAudit=plan.audit.map(l=>'<li><span>'+esc(l.name)+'<small class="salary-guide-reason">'+esc(l.status)+(l.next?' · prossima '+esc(l.next):'')+'</small></span><strong>'+((l.covered&&l.monthly>0)?money(l.monthly):'—')+'</strong></li>').join('');
 const missingLoans=plan.audit.filter(l=>!l.covered&&!l.status.startsWith('Prossima scadenza dopo'));
 const transfer=plan.spending&&plan.spending.id!==plan.source.id&&plan.life>0
  ?'<li><span>Sposta su '+esc(plan.spending.name)+' per le spese quotidiane</span><strong>'+money(plan.life)+'</strong></li>'
  :'<li><span>Tieni per le spese quotidiane su '+esc(plan.spending?.name||plan.source.name)+'</span><strong>'+money(plan.life)+'</strong></li>';
 host.innerHTML='<div class="salary-guide-status" role="status">Ripartizione indicativa dello stipendio di '+money(plan.available)+'.</div>'+
  '<p class="salary-guide-note">Periodo verificato: '+esc(plan.start)+' → '+esc(plan.end)+' (escluso il giorno finale). Sono conteggiate solo le uscite non segnate come pagate.</p>'+
  '<ul class="salary-guide-steps">'+
  '<li><span>Riserva per rate e spese fisse fino al prossimo stipendio</span><strong>'+money(plan.bills)+'</strong></li>'+
  transfer+allocations+
  (plan.reserve>0?'<li><span>Margine non assegnato · tienilo come riserva</span><strong>'+money(plan.reserve)+'</strong></li>':'')+
  '</ul>'+
  '<details open><summary>Scadenze non pagate nel ciclo ('+plan.dueItems.length+')</summary>'+(dueDetails?'<ul class="salary-guide-steps">'+dueDetails+'</ul>':'<p>Nessuna scadenza non pagata registrata nel periodo.</p>')+'</details>'+
  (loanAudit?'<details><summary>Verifica finanziamenti ('+plan.audit.length+')</summary><ul class="salary-guide-steps">'+loanAudit+'</ul></details>':'')+
  (missingLoans.length?'<p class="salary-guide-alert">Alcuni finanziamenti non risultano nel totale delle scadenze. Apri “Verifica finanziamenti” e controlla lo stato e la data della prossima rata prima di usare il margine per i risparmi.</p>':'')+
  (targets?'<details><summary>Conti con addebiti programmati</summary><ul class="salary-guide-steps">'+targets+'</ul><p>Controlla i saldi effettivi prima di trasferire: gli importi indicati sono addebiti previsti, non trasferimenti aggiuntivi.</p></details>':'')+
  (plan.shortfall>0?'<p class="salary-guide-alert">Attenzione: mancano '+money(plan.shortfall)+' per coprire budget e uscite previste. Riduci il budget o rivedi il piano prima di accantonare.</p>':'')+
  '<p class="salary-guide-note">Le spese ricorrenti senza una scadenza registrata non sono quantificabili con certezza: controlla che tutte le bollette e gli abbonamenti abbiano una data.</p>'+
  '<p class="salary-guide-note">Sono suggerimenti, non bonifici eseguiti. Gli accantonamenti agli obiettivi non sono registrati automaticamente. Le spese pagate fuori dall’app potrebbero essere ancora conteggiate finché non le segni come pagate.</p>';
 host.hidden=false;
}
async function render(){
 const host=$('salaryGuide');if(!host)return;
 const s=await snapshot(),accounts=s.accounts.filter(x=>!x.archived&&!x.protected);
 const salary=Number(setting(s.settings,'salaryNet',0));
 const incomes=s.movements.filter(x=>x.type==='income'&&x.salaryGuide===true).sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.id)-Number(a.id));
 const newest=incomes[0];
 const select=(id,list,preferred)=>{const el=$(id),old=el.value;el.replaceChildren();for(const a of list){const option=document.createElement('option');option.value=String(a.id);option.textContent=a.name;el.appendChild(option)}if(list.some(a=>String(a.id)===old))el.value=old;else if(preferred&&list.some(a=>String(a.id)===String(preferred)))el.value=String(preferred)};
 select('salaryGuideAccount',accounts,setting(s.settings,'primaryAccountId',accounts[0]?.id));
 const daily=accounts.find(x=>/postepay|poste pay|prepagat/i.test(x.name+' '+(x.kind||'')));
 select('salaryGuideSpend',accounts,daily?.id||accounts[0]?.id);
 const amount=$('salaryGuideAmount');if(!amount.value&&salary>0)amount.value=String(salary);
 $('salaryGuideSubmit').disabled=!accounts.length;
 $('salaryGuideEmpty').hidden=!!accounts.length;
 if(newest){
  $('salaryGuideLast').textContent='Ultimo stipendio registrato: '+newest.date+' · '+money(newest.amount);
  $('salaryGuideLast').hidden=false;
  const eventSource=accounts.find(a=>Number(a.id)===Number(newest.accountId));
  if(eventSource){select('salaryGuideAccount',accounts,eventSource.id);$('salaryGuideAccount').value=String(eventSource.id)}
  // Reconstruct last plan from stored salary event, never add the income twice on refresh.
  const priorSpending=setting(s.settings,'salaryGuideSpendingAccount',daily?.id||newest.accountId);
  if(accounts.some(a=>String(a.id)===String(priorSpending)))$('salaryGuideSpend').value=String(priorSpending);
  renderInstructions(calc(s,Number(newest.amount),newest.accountId,$('salaryGuideSpend').value,new Date()));
 }
}
async function submit(e){
 e.preventDefault();if(busy)return;
 const feedback=$('salaryGuideFeedback'),btn=$('salaryGuideSubmit');
 const value=Number($('salaryGuideAmount').value),sourceId=Number($('salaryGuideAccount').value),spendingId=Number($('salaryGuideSpend').value);
 if(!Number.isFinite(value)||value<=0){feedback.textContent='Inserisci un importo positivo.';return}
 busy=true;btn.disabled=true;feedback.textContent='Verifica del piano in corso…';
 try{
  const s=await snapshot();
  const plan=calc(s,value,sourceId,spendingId);
  // Explicit check prevents duplicate salary credits; user may still record a correction manually.
  const duplicate=s.movements.some(m=>m.type==='income'&&m.salaryGuide===true&&m.date===today());
  if(duplicate)throw Error('Hai già registrato uno stipendio oggi con questa funzione. Controlla Movimenti per evitare duplicati.');
  if(!window.confirm('Registrare '+money(value)+' come stipendio ricevuto su '+plan.source.name+'? Il saldo verrà aumentato. I trasferimenti suggeriti non saranno eseguiti.')){feedback.textContent='Registrazione annullata: nessun dato modificato.';return}
  feedback.textContent='Registrazione dello stipendio…';
  await FinanceDB.recordSalary(value,plan.source.id,spendingId,today());
  feedback.textContent='Stipendio registrato. Piano operativo pronto.';
  // Show actual proposal immediately and update all main displays on reload.
  renderInstructions(plan);
  setTimeout(()=>location.reload(),750);
 }catch(err){feedback.textContent=err.message||'Impossibile registrare lo stipendio.'}
 finally{busy=false;btn.disabled=false}
}
document.addEventListener('DOMContentLoaded',()=>{
 const host=$('salaryGuide');if(!host)return;
 $('salaryGuideForm').addEventListener('submit',submit);
 $('salaryGuideSpend').addEventListener('change',async()=>{
  const s=await snapshot();const income=s.movements.filter(m=>m.salaryGuide===true&&m.type==='income').sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.id)-Number(a.id))[0];
  if(income)renderInstructions(calc(s,Number(income.amount),income.accountId,$('salaryGuideSpend').value,new Date()));
 });
 render().catch(e=>{$('salaryGuideFeedback').textContent='Impossibile preparare il piano: '+e.message});
});
})();