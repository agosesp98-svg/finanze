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
  let patch=null,backupReady=false,renderTimer=null,importBusy=false;
  const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  function setImportStatus(el,message,state='progress'){
    el.textContent=message;
    el.className='plan-import-feedback '+state;
    el.setAttribute('aria-busy',state==='progress'?'true':'false');
  }

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
    if(!file||importBusy)return;
    importBusy=true;
    patch=null;backupReady=false;
    const fileInput=$('planFileInput');
    fileInput.value='';
    const loading=section('Importazione del piano');
    const loadingStatus=node('p','plan-import-feedback progress');
    loadingStatus.setAttribute('role','status');
    loadingStatus.setAttribute('aria-live','polite');
    append(loading,node('strong','',file.name),loadingStatus);
    setImportStatus(loadingStatus,'Lettura del file JSON in corso…');
    sheet('Importazione in corso',loading);
    try{
      await nextPaint();
      if(!/\.json$/i.test(file.name))throw Error('Seleziona un file con estensione .json.');
      if(file.size>140000)throw Error('Il piano supera la dimensione consentita.');
      if(!file.size)throw Error('Il file selezionato è vuoto.');
      let data;
      try{data=JSON.parse(await file.text())}catch{throw Error('JSON non leggibile o non valido. Verifica il file e riprova.')}
      setImportStatus(loadingStatus,'Verifica della struttura e dei dati del piano…');
      await nextPaint();
      const prepared=FinancePlanPatch.prepare(await snapshot(),data);
      patch=data;
      setImportStatus(loadingStatus,'File verificato. Preparazione del riepilogo…');
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
      const confirmPanel=section('Verifica e applica');
      append(confirmPanel,ptext('Prima scarica un backup. Contiene dati personali e cronologia chat: conservalo in privato.'));
      const stack=node('div','stack'),error=node('div','inline-error'),feedback=node('p','plan-import-feedback');
      error.setAttribute('role','alert');
      feedback.setAttribute('role','status');
      feedback.setAttribute('aria-live','polite');
      setImportStatus(feedback,'File JSON verificato correttamente. Passaggio 1 di 2: scarica il backup attuale.','success');
      const ackBox=node('div','plan-confirmation');
      ackBox.hidden=true;
      const checkRow=node('label','plan-confirmation-check');
      const checkbox=node('input');checkbox.type='checkbox';
      const checkText=node('span','','Ho verificato che il backup è stato salvato e che i saldi indicati nel piano sono corretti.');
      append(checkRow,checkbox,checkText);
      const finalButton=action('Conferma e aggiorna Finanze','primary-button',async()=>{
        if(!patch||!backupReady||!checkbox.checked){
          setImportStatus(feedback,'Verifica il backup e seleziona la casella di conferma.','warning');
          return;
        }
        finalButton.disabled=true;
        applyButton.disabled=true;
        backButton.disabled=true;
        error.textContent='';
        setImportStatus(feedback,'Salvataggio del piano in corso… Non chiudere l’app.');
        await nextPaint();
        try{
          const latest=FinancePlanPatch.prepare(await snapshot(),patch);
          await FinanceDB.replacePlanningStores(latest.stores);
          setImportStatus(feedback,'Verifica del salvataggio…');
          const saved=await FinanceDB.get('settings','planPatchAppliedId');
          if(saved?.value!==patch.id)throw Error('Non riesco a verificare che il piano sia stato salvato.');
          setImportStatus(feedback,'Piano importato e salvato correttamente. Aggiornamento della schermata…','success');
          try{sessionStorage.setItem('finanze-plan-update-success','1')}catch{}
          patch=null;
          setTimeout(()=>location.reload(),550);
        }catch(e){
          finalButton.disabled=false;
          applyButton.disabled=false;
          backButton.disabled=false;
          setImportStatus(feedback,'Importazione non completata. Controlla il messaggio qui sotto e riprova.','warning');
          error.textContent=e.message||'Errore durante il salvataggio. I dati restano invariati.';
          console.error('Errore importazione piano:',e);
        }
      });
      finalButton.disabled=true;
      checkbox.addEventListener('change',()=>{
        finalButton.disabled=!checkbox.checked;
        setImportStatus(feedback,checkbox.checked
          ?'Pronto: premi «Conferma e aggiorna Finanze».'
          :'Per continuare, conferma di aver verificato il backup.',checkbox.checked?'success':'warning');
      });
      append(ackBox,ptext('Passaggio 2 di 2: conferma esplicita, senza finestre del browser.'),
        checkRow,finalButton);
      const applyButton=action('2. Applica il nuovo piano','primary-button',()=>{
        error.textContent='';
        if(!backupReady){
          setImportStatus(feedback,'Prima devi scaricare il backup con il pulsante 1.','warning');
          backButton.focus();
          return;
        }
        ackBox.hidden=false;
        setImportStatus(feedback,'Controlla la casella e conferma qui sotto.');
        ackBox.scrollIntoView({block:'nearest',behavior:'smooth'});
      });
      const backButton=action('1. Scarica backup attuale','secondary-button',async()=>{
        if(!patch)return;
        backButton.disabled=true;
        setImportStatus(feedback,'Preparazione del backup…');
        error.textContent='';
        try{
          const data=await FinanceDB.exportAll();
          const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
          const url=URL.createObjectURL(blob),a=node('a');
          a.href=url;a.download='finanze-backup-prima-del-piano-'+today()+'.json';
          document.body.appendChild(a);a.click();a.remove();
          setTimeout(()=>URL.revokeObjectURL(url),60000);
          backupReady=true;
          backButton.disabled=false;
          backButton.textContent='1. Riscarica backup';
          setImportStatus(feedback,'Backup preparato. Verifica che sia stato salvato, poi premi «Applica il nuovo piano».','success');
        }catch(e){
          backButton.disabled=false;
          setImportStatus(feedback,'Non riesco a preparare il backup.','warning');
          error.textContent='Nessuna modifica applicata: '+(e.message||'errore di esportazione');
        }
      });
      append(stack,backButton,applyButton);
      append(confirmPanel,stack,feedback,ackBox,error,
        ptext('Lo storico dei movimenti viene mantenuto. La configurazione Cloudflare resta invariata.'));
      append(body,top,confirmPanel);
      sheet('Verifica il piano',body);
    }catch(e){
      patch=null;
      const body=section('Importazione non riuscita');
      const message=node('p','plan-import-feedback warning');
      message.setAttribute('role','alert');
      message.textContent=e.message||'File non valido.';
      append(body,message,ptext('Il piano non è stato applicato. Puoi selezionare un altro file JSON.'),action('Riprova con un altro file','secondary-button',()=>fileInput.click()));
      sheet('Importazione non riuscita',body);
    }finally{importBusy=false}
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
      surface.appendChild(ptext('Proiezione da '+p.startMonth+'. Esclude il mese in corso, crediti non incassati, tredicesima e quattordicesima. Un obiettivo scaduto resta prioritario: i risparmi successivi non possono renderlo coperto in tempo. La prosecuzione del lavoro resta un’ipotesi.'));
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
    try{
      if(sessionStorage.getItem('finanze-plan-update-success')==='1'){
        sessionStorage.removeItem('finanze-plan-update-success');
        const banner=node('div','plan-success-toast','✓ Piano JSON importato correttamente. I dati sono stati salvati.');
        banner.setAttribute('role','status');
        document.body.appendChild(banner);
        setTimeout(()=>banner.remove(),10000);
      }
    }catch(e){console.warn('Feedback importazione non disponibile',e)}
  });
})();
