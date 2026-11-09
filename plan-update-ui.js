/* Local import workflow and transparent forecasts. No personal numbers in public code. */
(()=>{
  const $=id=>document.getElementById(id);
  const cash=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n||0));
  const today=()=>FinanceEngine.iso(new Date());
  const node=(tag,cls,text)=>{
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(text!=null)e.textContent=String(text);
    return e;
  };
  const append=(parent,...items)=>{for(const item of items)if(item)parent.appendChild(item);return parent};
  const ptext=(s,cls='helper')=>node('p',cls,s);
  let patch=null,backupReady=false,renderTimer=null;

  async function snapshot(){
    const names=FinanceDB.S;
    const values=await Promise.all(names.map(k=>FinanceDB.getAll(k)));
    return Object.fromEntries(names.map((k,i)=>[k,values[i]]));
  }
  function sheet(title,content){
    $('sheetTitle').textContent=title;
    $('sheetBody').replaceChildren(content);
    $('sheetBackdrop').classList.add('open');
    $('sheet').classList.add('open');
    $('sheet').setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function section(title){
    const e=node('div','sheet-section');
    if(title)e.appendChild(node('h3','',title));
    return e;
  }
  function action(text,cls,handler){
    const b=node('button',cls,text);
    b.type='button';b.addEventListener('click',handler);
    return b;
  }
  function row(label,value){
    return append(node('div','allocation-row'),node('span','',label),node('strong','',value));
  }
  async function importFile(file){
    if(!file)return;
    patch=null;backupReady=false;
    const fileInput=$('planFileInput');
    fileInput.value='';
    try{
      if(file.size>140000)throw Error('Il piano supera la dimensione consentita.');
      const data=JSON.parse(await file.text());
      const prepared=FinancePlanPatch.prepare(await snapshot(),data);
      patch=data;
      const p=prepared.preview,body=document.createDocumentFragment(),top=section(p.name);
      append(top,ptext('Situazione dichiarata: '+p.asOf+'. L’importazione non invia dati a server esterni.'));
      const stale=(new Date(today())-new Date(p.asOf))/86400000;
      if(stale>2)top.appendChild(ptext('Attenzione: i saldi sono riferiti a una data precedente. Controllali prima di applicare.','plan-warning'));
      const kpis=node('div','kpi-grid');
      for(const [label,value] of [['Liquidità dichiarata',cash(p.liquid)],['Stipendio prudente',cash(p.salaryRange[0])]]){
        const card=node('div','kpi');
        append(card,node('small','',label),node('strong','',value));kpis.appendChild(card);
      }
      top.appendChild(kpis);
      const list=node('div','allocation-list');
      for(const [name,n] of [['Conti',p.accounts],['Budget',p.budgets],['Finanziamenti',p.loans],['Ricorrenze',p.recurring],['Entrate da incassare',p.expectedIncomes],['Obiettivi',p.goals]]){
        list.appendChild(row(name,n));
      }
      append(top,list,ptext('Le pianificazioni precedenti saranno archiviate; tutti i '+p.preservedMovements+' movimenti storici restano invariati.'));
      const confirmPanel=section('Salva prima un backup');
      append(confirmPanel,ptext('Il backup include i tuoi dati personali e la cronologia della chat. Conserva il file in privato.'));
      const stack=node('div','stack'),error=node('div','inline-error');
      error.setAttribute('role','alert');
      const applyButton=action('2. Applica il nuovo piano','primary-button',async()=>{
        if(!patch||!backupReady)return;
        if(!confirm('Hai salvato il backup e verificato i saldi? Il nuovo piano sostituirà le vecchie pianificazioni, conservando tutti i movimenti.'))return;
        applyButton.disabled=true;
        try{
          const latest=FinancePlanPatch.prepare(await snapshot(),patch);
          await FinanceDB.replacePlanningStores(latest.stores);
          patch=null;location.reload();
        }catch(e){applyButton.disabled=false;error.textContent=e.message||'Aggiornamento non riuscito.'}
      });
      applyButton.disabled=true;
      const backButton=action('1. Scarica backup attuale','secondary-button',async()=>{
        backButton.disabled=true;
        try{
          const data=await FinanceDB.exportAll();
          const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
          const url=URL.createObjectURL(blob),a=node('a');
          a.href=url;a.download='finanze-backup-prima-del-piano-'+today()+'.json';
          document.body.appendChild(a);a.click();a.remove();
          setTimeout(()=>URL.revokeObjectURL(url),60000);
          backupReady=true;applyButton.disabled=false;
          backButton.textContent='Backup preparato: verifica il download';
        }catch(e){backButton.disabled=false;error.textContent='Impossibile creare il backup. Nessuna modifica applicata.'}
      });
      append(stack,backButton,applyButton);append(confirmPanel,stack,error,ptext('La chiave Cloudflare e i messaggi già salvati non vengono modificati.'));
      append(body,top,confirmPanel);
      sheet('Verifica il piano',body);
    }catch(e){
      patch=null;
      const body=section('Nessuna modifica effettuata');
      body.appendChild(ptext(e.message||'File non valido.'));
      sheet('File non valido',body);
    }
  }

  function heading(title,meta){
    const row=node('div','plan-priority-title');
    append(row,node('h2','',title),node('span','',meta));
    return row;
  }
  function goalCard(g,highSalary){
    const card=node('div','plan-priority-item'),head=node('div','plan-priority-head');
    const label=g.deadline?(g.deadlinePrecision==='month'?g.deadline.slice(0,7):g.deadline):'Senza scadenza';
    append(head,node('span','plan-rank',g.rank),node('strong','',g.name),node('span','',label));
    const data=node('div','plan-priority-data');
    append(data,node('span','','Previsione '+cash(g.forecast)+' / '+cash(g.target)));
    append(data,node('strong',g.gap>0.01?'plan-danger':'plan-good',g.gap>0.01?'Mancano '+cash(g.gap):'Obiettivo coperto'));
    const progress=node('div','progress '+(g.gap>0.01?'blue':'green')),bar=node('i');
    bar.style.width=Math.max(0,Math.min(100,100*g.forecast/(g.target||1)))+'%';
    progress.appendChild(bar);
    append(card,head,data,progress);
    if(g.gap>0.01&&highSalary)card.appendChild(node('small','','Con stipendio alto: gap '+cash(g.optimisticGap)));
    return card;
  }
  async function renderSummary(){
    const goalsHost=$('planStrategy'),incomeHost=$('incomeList');
    if(!goalsHost||!incomeHost)return;
    try{
      const s=await snapshot();
      const updated=s.settings.some(x=>x.key==='planPatchAppliedId'&&x.value);
      goalsHost.hidden=!updated;incomeHost.hidden=!updated;
      if(!updated)return;
      const p=FinanceGoalPriority.project(s,new Date(),36);
      const surface=node('div','plan-priority-surface');
      p.goals.forEach(g=>surface.appendChild(goalCard(g,p.salaryHigh>p.salaryLow)));
      surface.appendChild(ptext('Proiezione da '+p.startMonth+'. Esclude il mese in corso, crediti non incassati, tredicesima e quattordicesima. La continuità lavorativa dopo la data confermata resta un’ipotesi.'));
      goalsHost.replaceChildren(heading('Priorità di risparmio','Scenario prudente'),surface);
      const pending=s.expectedIncomes.filter(x=>!x.archived&&x.status!=='received');
      const list=node('div','list-card');
      if(!pending.length)list.appendChild(node('div','empty','Nessun credito in attesa.'));
      for(const inc of pending){
        const b=node('button','list-row');b.type='button';b.dataset.receiveIncome=String(inc.id);
        const name=node('span','row-copy');append(name,node('b','',inc.name),node('span','','Data da definire · non disponibile'));
        append(b,name,node('span','row-value',cash(inc.amount)),node('span','chevron','›'));list.appendChild(b);
      }
      incomeHost.replaceChildren(heading('Entrate da incassare',pending.length+' in attesa'),list,
        ptext('Questi crediti non aumentano il saldo finché non registri l’incasso.'));
    }catch(e){console.warn('Piano obiettivi non aggiornato',e)}
  }
  function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(renderSummary,75)}

  function field(label,value,type='text'){
    const wrap=node('div','field'),text=node('label','',label),input=node('input');
    input.type=type;input.value=value;input.required=true;
    if(type==='number'){input.min='0.01';input.step='0.01';input.inputMode='decimal'}
    append(wrap,text,input);
    return{wrap,input};
  }
  async function receiveIncome(id){
    const s=await snapshot(),inc=s.expectedIncomes.find(x=>String(x.id)===String(id)&&!x.archived&&x.status!=='received');
    if(!inc)return;
    const body=section(inc.name),form=node('form','form');
    form.id='receiveIncomeForm';
    const amount=field('Somma effettivamente ricevuta',Number(inc.amount).toFixed(2),'number');
    const date=field('Data dell’accredito',today(),'date');
    const accountField=node('div','field'),accountLabel=node('label','', 'Conto accreditato'),select=node('select');
    const accounts=s.accounts.filter(x=>!x.archived&&!x.protected);
    accounts.forEach(a=>{const option=node('option','',a.name);option.value=String(a.id);select.appendChild(option)});
    append(accountField,accountLabel,select);
    const error=node('div','inline-error');error.setAttribute('role','alert');
    const submit=node('button','primary-button','Registra incasso ricevuto');submit.type='submit';
    append(form,amount.wrap,date.wrap,accountField,submit,error);
    form.addEventListener('submit',async event=>{
      event.preventDefault();submit.disabled=true;
      try{
        await FinanceDB.receiveExpectedIncome(inc.id,Number(select.value),Number(amount.input.value),date.input.value);
        location.reload();
      }catch(e){submit.disabled=false;error.textContent='Incasso non registrato: '+(e.message||'riprova')}
    });
    append(body,ptext('Registra solo pagamenti realmente incassati: il conto e i movimenti si aggiorneranno insieme.'),form);
    sheet('Conferma incasso',body);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const input=$('planFileInput');
    if(!input)return;
    input.addEventListener('change',event=>importFile(event.target.files?.[0]));
    document.addEventListener('click',event=>{
      if(event.target.closest('[data-import-plan]')){input.click();return}
      const income=event.target.closest('[data-receive-income]');
      if(income)receiveIncome(income.dataset.receiveIncome);
    });
    const host=$('planSummary');
    if(host)new MutationObserver(scheduleRender).observe(host,{childList:true});
    scheduleRender();
  });
})();
