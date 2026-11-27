const FinanceDB=(()=>{
  const N='finanze-pwa',V=2;
  const S=['accounts','budgets','commitments','expectedIncomes','goals','liabilities','movements','settings','weddingProjects'];
  let dbPromise=null;

  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(N,V);
      request.onupgradeneeded=()=>{
        const db=request.result;
        for(const store of S){
          if(!db.objectStoreNames.contains(store)){
            db.createObjectStore(store,{keyPath:store==='settings'?'key':'id',autoIncrement:store!=='settings'&&store!=='weddingProjects'});
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
    // Never clear real financial data before checking the complete backup.
    if(payload?.version!==1||!payload.stores||
      S.some(store=>(store!=='weddingProjects'||payload.stores[store]!==undefined)&&
        (!Array.isArray(payload.stores[store])||
        payload.stores[store].some(entry=>!entry||typeof entry!=='object'||
          entry[store==='settings'?'key':'id']==null)))){
      throw new Error('Backup incompleto o non valido. Nessun dato è stato modificato.');
    }
    // One transaction for every store: an error aborts the entire restore.
    const db=await open();
    return new Promise((resolve,reject)=>{
      // Older version-1 backups have no weddingProjects store. Preserve its data
      // when restoring such a backup, rather than silently deleting it.
      const included=S.filter(key=>Array.isArray(payload.stores[key]));
      const tx=db.transaction(included,'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Ripristino non riuscito.'));
      tx.onabort=()=>reject(tx.error||new Error('Ripristino annullato: dati originali conservati.'));
      for(const key of included){
        const store=tx.objectStore(key);
        store.clear();
        for(const record of payload.stores[key])store.put(record);
      }
    });
  }

  // One IndexedDB transaction guarantees a complete plan migration or no changes.
  // Movements are NEVER cleared, preserving the historic ledger.
  async function replacePlanningStores(data){
    const keys=S.filter(k=>k!=='movements'&&k!=='weddingProjects');
    if(!data||keys.some(k=>!Array.isArray(data[k])))throw Error('Piano incompleto.');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(keys,'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Aggiornamento non completato.'));
      tx.onabort=()=>reject(tx.error||new Error('Aggiornamento annullato.'));
      for(const key of keys){
        const store=tx.objectStore(key);
        store.clear();
        for(const entry of data[key])store.put(entry);
      }
    });
  }

  async function receiveExpectedIncome(id,accountId,amount,date){
    const sum=Number(amount);
    if(!Number.isFinite(sum)||sum<=0||!Number.isInteger(Number(id))||!Number.isInteger(Number(accountId))||
       !/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Dati incasso non validi.');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['accounts','expectedIncomes','movements'],'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Salvataggio non completato.'));
      tx.onabort=()=>reject(tx.error||new Error('Incasso annullato.'));
      const incomes=tx.objectStore('expectedIncomes'),accounts=tx.objectStore('accounts');
      let income=null,account=null;
      const r1=incomes.get(Number(id));
      r1.onsuccess=()=>{
        income=r1.result;
        if(!income||income.archived||income.status==='received'){tx.abort();return}
        const r2=accounts.get(Number(accountId));
        r2.onsuccess=()=>{
          account=r2.result;
          if(!account||account.archived||account.protected){tx.abort();return}
          account.balance=Number(account.balance||0)+sum;
          income.status='received';income.receivedDate=date;income.accountId=account.id;income.receivedAmount=sum;
          accounts.put(account);incomes.put(income);
          tx.objectStore('movements').add({
            type:'income',date,title:income.name,amount:sum,accountId:account.id,
            category:'Incasso credito',expectedIncomeId:income.id
          });
        };
      };
    });
  }

  // The receipt and balance update are one transaction: no partial salary credit.
  async function recordSalary(amount,accountId,spendingAccountId,date){
    const sum=Math.round(Number(amount)*100)/100,accountKey=Number(accountId);
    if(!Number.isFinite(sum)||sum<=0||!Number.isInteger(accountKey)||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw Error('Dati stipendio non validi.');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['accounts','movements','settings'],'readwrite');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Salvataggio non completato.'));
      tx.onabort=()=>reject(tx.error||new Error('Operazione annullata o stipendio già registrato.'));
      const movements=tx.objectStore('movements'),accounts=tx.objectStore('accounts');
      const r=movements.getAll();
      r.onsuccess=()=>{
        if(r.result.some(x=>x.type==='income'&&x.salaryGuide===true&&x.date===date)){tx.abort();return}
        const accountRequest=accounts.get(accountKey);
        accountRequest.onsuccess=()=>{
          const account=accountRequest.result;
          if(!account||account.archived||account.protected){tx.abort();return}
          account.balance=Math.round((Number(account.balance||0)+sum)*100)/100;
          accounts.put(account);
          movements.add({type:'income',date,title:'Stipendio',category:'Stipendio',
            amount:sum,accountId:account.id,salaryGuide:true});
          if(Number.isInteger(Number(spendingAccountId)))
            tx.objectStore('settings').put({key:'salaryGuideSpendingAccount',value:Number(spendingAccountId)});
        };
      };
    });
  }

  // One transaction protects all four records from partial or duplicate payments.
  async function payScheduledCommitment(commitmentId,accountId,amount,date){
    const id=Number(commitmentId),aid=Number(accountId),sum=Math.round(Number(amount)*100)/100;
    if(!Number.isInteger(id)||id<=0||!Number.isInteger(aid)||aid<=0||
      !Number.isFinite(sum)||sum<=0||!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))
      throw Error('Dati pagamento non validi.');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['accounts','commitments','liabilities','movements'],'readwrite');
      const accounts=tx.objectStore('accounts'),commitments=tx.objectStore('commitments'),
        liabilities=tx.objectStore('liabilities'),movements=tx.objectStore('movements');
      let fault=null;
      const fail=msg=>{fault=new Error(msg);tx.abort()};
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>{if(!fault)fault=tx.error||Error('Pagamento non riuscito.')};
      tx.onabort=()=>reject(fault||tx.error||Error('Pagamento annullato senza modifiche.'));
      commitments.get(id).onsuccess=e=>{
        const item=e.target.result;
        if(!item||item.active===false||item.archived||item.paidDate)
          return fail('Questa rata risulta già pagata o disattivata.');
        accounts.get(aid).onsuccess=e=>{
          const account=e.target.result;
          if(!account||account.archived||account.protected)
            return fail('Seleziona un conto attivo.');
          if(Number(account.balance||0)+0.000001<sum)
            return fail('Saldo del conto insufficiente.');
          liabilities.getAll().onsuccess=e=>{
            const related=e.target.result.find(l=>
              (item.liabilityId!=null&&Number(l.id)===Number(item.liabilityId))||
              (item.liabilityKey&&l.scheduleKey===item.liabilityKey));
            commitments.getAll().onsuccess=e=>{
              const others=e.target.result;
              accounts.put({...account,balance:Math.round((Number(account.balance||0)-sum)*100)/100});
              commitments.put({...item,accountId:aid,active:false,paidDate:date,paidAmount:sum});
              movements.add({type:'expense',date,title:item.name||related?.name||'Scadenza',
                amount:sum,accountId:aid,category:related?'Rata':'Scadenza',
                commitmentId:id,...(related?{liabilityId:related.id}:{})});
              if(related){
                const l={...related};
                const final=Number(l.finalPayment||0)>0&&l.finalPaymentDate===item.dueDate&&
                  Math.abs(Number(item.amount||0)-Number(l.finalPayment||0))<.02;
                if(final){
                  l.completed=true;l.monthly=0;l.remaining=0;
                  l.installmentsRemaining=0;l.nextDueDate='';
                }else{
                  if(l.remaining!=null&&Number.isFinite(Number(l.remaining)))
                    l.remaining=Math.max(0,Number(l.remaining)-sum);
                  if(l.installmentsRemaining!=null)
                    l.installmentsRemaining=Math.max(0,Number(l.installmentsRemaining)-1);
                  l.completedInstallments=Number(l.completedInstallments||0)+1;
                  const byCount=l.installmentsRemaining!=null&&l.installmentsRemaining<=0;
                  const byResidual=l.remaining!=null&&l.remaining<=0;
                  const byEnd=l.recurrenceEnd&&item.dueDate>=l.recurrenceEnd;
                  if(Number(l.finalPayment||0)>0&&(byCount||byEnd)){
                    l.regularMonthly=l.regularMonthly??l.monthly;
                    l.monthly=0;l.monthlyPhaseComplete=true;
                    l.nextDueDate=l.finalPaymentDate||'';
                  }else if(!Number(l.finalPayment||0)&&(byCount||byResidual||
                    (l.finalDueDate&&item.dueDate>=l.finalDueDate))){
                    l.completed=true;l.monthly=0;l.nextDueDate='';
                  }else{
                    const next=FinanceEngine.nextDateByCadence(item.dueDate,'Mensile');
                    if(next)l.nextDueDate=next;
                  }
                }
                liabilities.put(l);
              }else if(item.recurring===true){
                const next=FinanceEngine.nextDateByCadence(item.dueDate,item.cadence);
                if(next&&!others.some(c=>!c.archived&&c.active!==false&&!c.paidDate&&
                  c.dueDate===next&&String(c.name)===String(item.name))){
                  const copy={...item};delete copy.id;delete copy.paidDate;
                  delete copy.paidAmount;copy.active=true;copy.generated=true;copy.dueDate=next;
                  commitments.add(copy);
                }
              }
            };
          };
        };
      };
    });
  }


  // Pay a wedding installment and debit the real account in one transaction.
  // Historical imported deposits are never replayed through this method.
  async function recordWeddingPayment(projectId,supplierId,installmentId,accountId,amount,date){
    const aid=Number(accountId),sum=Math.round(Number(amount)*100)/100;
    if(!Number.isInteger(aid)||aid<=0||!Number.isFinite(sum)||sum<=0||
       !/^\d{4}-\d{2}-\d{2}$/.test(String(date)))
      throw Error('Controlla importo, data e conto.');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['weddingProjects','accounts','movements'],'readwrite');
      const projects=tx.objectStore('weddingProjects'),accounts=tx.objectStore('accounts'),
        movements=tx.objectStore('movements');
      let fault=null;
      const fail=msg=>{fault=new Error(msg);tx.abort()};
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>{if(!fault)fault=tx.error||Error('Pagamento non riuscito.')};
      tx.onabort=()=>reject(fault||tx.error||Error('Pagamento annullato senza addebiti.'));
      projects.get(String(projectId)).onsuccess=e=>{
        const project=e.target.result;
        const supplier=project?.suppliers?.find(x=>x.id===supplierId);
        const installment=supplier?.installments?.find(x=>x.id===installmentId);
        if(!installment||installment.historical)return fail('Pagamento non disponibile.');
        const remaining=Math.round((Number(installment.gross||0)-
          Number(installment.paidByMe||0)-Number(installment.paidByOthers||0))*100)/100;
        if(sum>remaining+0.001)return fail('L’importo supera il residuo della scadenza.');
        accounts.get(aid).onsuccess=e=>{
          const account=e.target.result;
          if(!account||account.archived||account.protected)
            return fail('Seleziona un conto spendibile e attivo.');
          if(Number(account.balance||0)+0.00001<sum)
            return fail('Saldo insufficiente sul conto selezionato.');
          account.balance=Math.round((Number(account.balance||0)-sum)*100)/100;
          installment.paidByMe=Math.round((Number(installment.paidByMe||0)+sum)*100)/100;
          installment.paidDate=date;
          const req=movements.add({type:'expense',date,title:supplier.name+' · '+installment.label,
            amount:sum,accountId:aid,category:'Matrimonio',weddingProjectId:project.id,
            weddingSupplierId:supplierId,weddingInstallmentId:installmentId});
          req.onsuccess=()=>{
            installment.paymentMovementIds=[...(installment.paymentMovementIds||[]),req.result];
            accounts.put(account);projects.put(project);
          };
        };
      };
    });
  }


  // Local-only, atomic adjustment of an existing private wedding forecast and
  // one recurring expense. No changes to account balances, movements or goals.
  async function applyWeddingAdjustment(patch){
    if(!patch||patch.kind!=='finanze-wedding-adjustment'||patch.version!==1||
      typeof patch.patchId!=='string'||!patch.patchId||
      patch.projectId!=='wedding-main'||
      !Array.isArray(patch.extraRecurrences)||!patch.recurringCommitment)
      throw Error('Aggiornamento non valido.');
    const auto=patch.automatedSavings,c=patch.recurringCommitment;
    const finite=n=>Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<1000000;
    const date=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''));
    if((auto&&(!finite(auto.monthlyAmount)||Number(auto.dayOfMonth)<1||Number(auto.dayOfMonth)>28||
      !Array.isArray(auto.buckets)||auto.buckets.length!==2||
      auto.buckets.some(x=>typeof x.label!=='string'||!x.label||
        !finite(x.share)||Number(x.share)>1)||
      Math.abs(auto.buckets.reduce((a,x)=>a+Number(x.share),0)-1)>0.00001))||
      patch.extraRecurrences.some(x=>!x.id||!x.label||!finite(x.amount)||
        !date(x.firstDue)||!Number.isInteger(x.everyDays)||x.everyDays<7||x.everyDays>366)||
      typeof c.name!=='string'||!c.name||!finite(c.amount)||!date(c.dueDate)||
      typeof c.cadence!=='string'||c.cadence!=='Ogni 21 giorni'||
      (c.supersedesDueDate!=null&&(!date(c.supersedesDueDate)||
        c.supersedesDueDate===c.dueDate)))
      throw Error('La ripartizione o la ricorrenza non è valida.');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['weddingProjects','commitments'],'readwrite');
      const projects=tx.objectStore('weddingProjects'),commitments=tx.objectStore('commitments');
      let fault=null,skipped=false;
      const fail=message=>{fault=Error(message);tx.abort()};
      tx.oncomplete=()=>resolve({skipped});
      tx.onerror=()=>{if(!fault)fault=tx.error||Error('Aggiornamento non riuscito.')};
      tx.onabort=()=>reject(fault||tx.error||Error('Aggiornamento annullato.'));
      projects.get(patch.projectId).onsuccess=e=>{
        const project=e.target.result;
        if(!project)return fail('Importa prima il piano privato Matrimonio.');
        if((project.appliedAdjustmentIds||[]).includes(patch.patchId)){skipped=true;return}
        commitments.getAll().onsuccess=e=>{
          const items=e.target.result;
          const norm=x=>String(x||'').trim().toLocaleLowerCase('it-IT');
          const existing=items.filter(x=>norm(x.name)===norm(c.name)&&
            !x.archived&&!x.paidDate&&x.active!==false);
          if(existing.length>1)return fail('Scadenze attive duplicate. Controlla il piano.');
          if(existing.length===1&&existing[0].dueDate!==c.dueDate&&
            existing[0].dueDate!==c.supersedesDueDate)
            return fail('Esiste già una scadenza attiva con data diversa. Verificala prima di importare.');
          if(existing.length===1){
            const x=existing[0];
            // Reschedule only an unpaid active item explicitly identified by
            // supersedesDueDate. Paid history, movements and account balances
            // are not part of this transaction.
            commitments.put({...x,amount:Number(c.amount),dueDate:c.dueDate,
              cadence:c.cadence,recurring:true,estimated:true,
              note:[x.note,'Intervallo indicativo di 21 giorni'].filter(Boolean).join(' · ')});
          }else{
            const last=items.filter(x=>norm(x.name)===norm(c.name)&&x.accountId!=null)
              .sort((a,b)=>String(b.dueDate||'').localeCompare(String(a.dueDate||'')))[0];
            commitments.add({name:c.name,amount:Number(c.amount),dueDate:c.dueDate,
              cadence:c.cadence,recurring:true,active:true,estimated:true,
              accountId:last?.accountId||null,note:'Intervallo indicativo di 21 giorni'});
          }
          // A correction-only file must not overwrite an existing personalized
          // XME bucket allocation.
          if(auto)project.automatedSavings=auto;
          project.forecast=project.forecast||{};
          const previous=project.forecast.extraRecurrences||[];
          project.forecast.extraRecurrences=[
            ...previous.filter(x=>!patch.extraRecurrences.some(y=>y.id===x.id)),
            ...patch.extraRecurrences
          ];
          project.appliedAdjustmentIds=[...(project.appliedAdjustmentIds||[]),patch.patchId];
          projects.put(project);
        };
      };
    });
  }


  // Private, self-contained reconciliation from calendar + prior local export.
  // Intentionally does not open accounts, goals or movements for writing.
  // Importing twice must not reproduce bills or reset personal changes.
  async function applyUnifiedReconciliation(patch){
    const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
    const finite=n=>Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<1000000;
    const norm=s=>String(s||'').trim().toLocaleLowerCase('it-IT');
    if(!patch||patch.kind!=='finanze-unified-reconciliation'||patch.version!==1||
      patch.projectId!=='wedding-main'||typeof patch.patchId!=='string'||!patch.patchId||
      !Array.isArray(patch.upsertCommitments)||patch.upsertCommitments.length>20||
      !Array.isArray(patch.archiveRecurring)||patch.archiveRecurring.length>15||
      !Array.isArray(patch.oneOffCommitments)||patch.oneOffCommitments.length>20||
      !patch.weddingProjectTemplate||patch.weddingProjectTemplate.id!=='wedding-main'||
      !Array.isArray(patch.weddingProjectTemplate.suppliers)||
      !patch.weddingProjectTemplate.forecast?.incomes)
      throw Error('Il file non è un aggiornamento unico di Finanze valido.');
    const recur=patch.weddingRecurrence;
    if(!recur||!validDate(recur.firstDue)||!finite(recur.amount)||!recur.id||
      !Number.isInteger(recur.everyDays)||recur.everyDays<7||recur.everyDays>365)
      throw Error('Ricorrenza privata non valida.');
    for(const c of [...patch.upsertCommitments,...patch.oneOffCommitments]){
      if(!c.name||!validDate(c.dueDate)||!finite(c.amount)||
        !['Mensile','Ogni 21 giorni','Una tantum'].includes(c.cadence))
        throw Error('Scadenza non valida: '+String(c.name||'?'));
    }
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['weddingProjects','commitments','movements'],'readwrite');
      const projects=tx.objectStore('weddingProjects');
      const commitments=tx.objectStore('commitments');
      const movements=tx.objectStore('movements');
      let fault=null,skipped=false,added=0,updated=0,archived=0;
      const warnings=[];
      const fail=msg=>{fault=Error(msg);tx.abort()};
      tx.oncomplete=()=>resolve({skipped,added,updated,archived,warnings});
      tx.onerror=()=>{if(!fault)fault=tx.error||Error('Riconciliazione fallita.')};
      tx.onabort=()=>reject(fault||tx.error||Error('Importazione annullata senza modifiche.'));
      projects.get(patch.projectId).onsuccess=e=>{
        const project=e.target.result||structuredClone(patch.weddingProjectTemplate);
        if((project.appliedAdjustmentIds||[]).includes(patch.patchId)){skipped=true;return}
        commitments.getAll().onsuccess=e=>{
          const records=e.target.result;
          movements.getAll().onsuccess=e=>{
            const existingMovements=e.target.result;
            const matches=(item,names)=>names.some(name=>norm(item.name)===norm(name));
            const openMatches=names=>records.filter(c=>matches(c,names)&&
              !c.archived&&!c.paidDate&&c.active!==false);
            const historical=names=>records.filter(c=>matches(c,names)&&c.paidDate)
              .sort((a,b)=>String(b.paidDate||'').localeCompare(String(a.paidDate||'')));
            const put=c=>{commitments.put(c);updated++};
            const insert=c=>{commitments.add(c);added++};
            // Update one active instance by name. Refuse to guess between
            // multiple active entries; do not disable or modify paid history.
            for(const spec of patch.upsertCommitments){
              const names=[spec.name,...(spec.aliases||[])];
              const active=openMatches(names);
              if(active.length>1)return fail('Più scadenze aperte per '+spec.name+
                ': risolvi il duplicato prima di importare.');
              if(active.length){
                const c=active[0];
                const old=String(c.dueDate||'');
                const allowed=(spec.allowedPreviousDates||[]).includes(old)||
                  old===spec.dueDate||
                  (!!spec.allowLaterSameDay&&old>spec.dueDate&&old.slice(8)===spec.dueDate.slice(8));
                if(!allowed){
                  warnings.push('Scadenza personalizzata mantenuta: '+spec.name+' ('+old+')');
                  continue;
                }
                // For later, already-advanced installments do not regress date.
                const due=old>spec.dueDate?old:spec.dueDate;
                const amount=Number(spec.amount);
                const shouldUpdate=Number(c.amount||0)!==amount||c.dueDate!==due||
                  c.cadence!==spec.cadence||c.recurring!==(spec.cadence!=='Una tantum');
                if(shouldUpdate)put({...c,amount,dueDate:due,cadence:spec.cadence,
                  recurring:spec.cadence!=='Una tantum',
                  estimated:!!spec.estimated,
                  variableAmount:!!spec.variableAmount,
                  note:[c.note,spec.note].filter(Boolean).join(' · ')});
              }else{
                const prior=historical(names);
                const due=spec.dueDate;
                // The last paid historical row remains untouched.
                const accountId=prior[0]?.accountId||null;
                insert({name:spec.name,amount:Number(spec.amount),dueDate:due,
                  cadence:spec.cadence,active:true,recurring:spec.cadence!=='Una tantum',
                  estimated:!!spec.estimated,variableAmount:!!spec.variableAmount,
                  accountId,note:spec.note||'Data indicativa'});
              }
            }
            // The old provider's recurring charges are closed, but paid
            // installments and their underlying expense movements remain.
            for(const spec of patch.archiveRecurring){
              for(const c of records.filter(x=>matches(x,[spec.name,...(spec.aliases||[])])&&
                !x.archived&&x.cadence==='Mensile'&&!x.liabilityId&&!x.liabilityKey)){
                put({...c,archived:true,active:false,
                  note:[c.note,spec.note].filter(Boolean).join(' · ')});
                archived++;
              }
            }
            for(const spec of patch.oneOffCommitments){
              const names=[spec.name,...(spec.aliases||[])];
              if(records.some(x=>matches(x,names)&&x.dueDate===spec.dueDate)|| 
                existingMovements.some(x=>x.type==='expense'&&matches({name:x.title},names)&&
                  Number(x.amount||0)===Number(spec.amount)&&
                  String(x.date||'').slice(0,7)===spec.dueDate.slice(0,7)))
                continue;
              insert({name:spec.name,amount:Number(spec.amount),dueDate:spec.dueDate,
                cadence:'Una tantum',recurring:false,active:true,estimated:true,
                note:spec.note||'Importo da calendario; verificare se già pagato'});
            }
            project.forecast=project.forecast||{};
            const recs=project.forecast.extraRecurrences||[];
            project.forecast.extraRecurrences=[
              ...recs.filter(x=>x.id!==recur.id),recur
            ];
            // Never overwrite a personal XME allocation already configured.
            if(!project.automatedSavings)project.automatedSavings=patch.automatedSavings;
            const f=project.forecast;
            const baseline=Number(f.monthlyBase||0);
            if(patch.forecastCorrection){
              const spec=patch.forecastCorrection;
              if((spec.baselineCandidates||[]).some(n=>Math.abs(baseline-Number(n))<.011))
                f.monthlyBase=Number(spec.targetMonthlyBase);
              else warnings.push('Budget mensile personalizzato non alterato ('+baseline+')');
              const oldExtra=Number(f.extraExpenses?.[spec.oneOffMonth]||0);
              if((spec.oneOffCandidates||[]).some(n=>Math.abs(oldExtra-Number(n))<.011)){
                f.extraExpenses=f.extraExpenses||{};
                f.extraExpenses[spec.oneOffMonth]=Number(spec.targetOneOffExpense);
              }else warnings.push('Extra del mese personalizzati non alterati ('+oldExtra+')');
            }
            project.reconciliation={
              date:patch.asOf||'',source:'Confronto backup locale e Google Calendar',
              checks:patch.verifiedExisting||[],notes:patch.requiresReview||[],
              warnings
            };
            project.appliedAdjustmentIds=[
              ...(project.appliedAdjustmentIds||[]),patch.patchId
            ];
            projects.put(project);
          };
        };
      };
    });
  }

  return{S,open,getAll,get,put,add,remove,clear,clearAll,exportAll,importAll,replacePlanningStores,receiveExpectedIncome,recordSalary,payScheduledCommitment,recordWeddingPayment,applyWeddingAdjustment,applyUnifiedReconciliation};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinanceDB;
