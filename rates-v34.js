(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const fmtMonth=s=>{
    if(!s)return '';
    const d=new Date(`${s}T12:00:00`);
    return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('it-IT',{month:'short',year:'numeric'}).format(d);
  };
  const PATCH_PARAM='ratePlanPatch';
  let busy=false;

  if(typeof FinanceDB==='undefined')return;

  const rawAdd=FinanceDB.add.bind(FinanceDB);
  const rawPut=FinanceDB.put.bind(FinanceDB);

  async function linkedLiability(value){
    if(!value||(!value.liabilityId&&!value.liabilityKey))return null;
    const liabilities=await FinanceDB.getAll('liabilities');
    return liabilities.find(l=>Number(l.id)===Number(value.liabilityId)||(value.liabilityKey&&l.scheduleKey===value.liabilityKey))||null;
  }

  async function ensureBalloon(liability){
    if(!liability?.finalPaymentDate||!Number(liability.finalPayment||0))return;
    const commitments=await FinanceDB.getAll('commitments');
    const exists=commitments.some(c=>c.active!==false&&String(c.dueDate)===String(liability.finalPaymentDate)&&(
      Number(c.liabilityId)===Number(liability.id)||(liability.scheduleKey&&c.liabilityKey===liability.scheduleKey)
    )&&Number(c.amount||0)===Number(liability.finalPayment||0));
    if(exists)return;
    await rawAdd('commitments',{
      name:`Pagamento finale`,
      amount:Number(liability.finalPayment||0),
      dueDate:liability.finalPaymentDate,
      cadence:'Una tantum',
      estimated:false,
      active:true,
      recurring:false,
      generated:true,
      liabilityId:liability.id,
      liabilityKey:liability.scheduleKey||'',
      note:'Pagamento finale collegato al finanziamento'
    });
  }

  FinanceDB.put=async(store,value)=>{
    if(store==='liabilities'&&value){
      const noFinalBalloon=!Number(value.finalPayment||0);
      const byInstallments=value.installmentsRemaining!=null&&Number(value.installmentsRemaining)<=0;
      const byResidual=value.remaining!=null&&Number(value.remaining)<=0;
      if(noFinalBalloon&&(byInstallments||byResidual))value.completed=true;

      if(value.recurrenceEnd&&value.nextDueDate&&String(value.nextDueDate)>String(value.recurrenceEnd)&&Number(value.finalPayment||0)>0){
        value.regularMonthly=value.regularMonthly??value.monthly;
        value.monthly=0;
        value.monthlyPhaseComplete=true;
        value.nextDueDate=value.finalPaymentDate||'';
        await ensureBalloon(value);
      }
      if(value.monthlyPhaseComplete&&value.finalPaymentDate&&value.nextDueDate&&String(value.nextDueDate)>String(value.finalPaymentDate)){
        value.completed=true;
        value.nextDueDate='';
      }
    }
    return rawPut(store,value);
  };

  FinanceDB.add=async(store,value)=>{
    if(store==='commitments'&&value&&(value.liabilityId||value.liabilityKey)){
      const liability=await linkedLiability(value);
      if(liability){
        if(liability.completed)return 0;
        if(liability.recurrenceEnd&&value.dueDate&&String(value.dueDate)>String(liability.recurrenceEnd)){
          const isBalloon=liability.finalPaymentDate&&String(value.dueDate)===String(liability.finalPaymentDate)&&Number(value.amount||0)===Number(liability.finalPayment||0);
          if(!isBalloon){
            await ensureBalloon(liability);
            return 0;
          }
        }
        if(liability.finalDueDate&&value.dueDate&&String(value.dueDate)>String(liability.finalDueDate))return 0;
      }
    }
    return rawAdd(store,value);
  };

  function decodeBase64Url(value){
    try{
      const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
      const padded=normalized+'='.repeat((4-normalized.length%4)%4);
      const bytes=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }catch{return ''}
  }

  async function consumePatch(){
    const url=new URL(location.href);
    const raw=url.searchParams.get(PATCH_PARAM);
    if(!raw)return false;
    let patch=[];
    try{patch=JSON.parse(decodeBase64Url(raw))}catch{patch=[]}
    if(!Array.isArray(patch)||!patch.length){
      url.searchParams.delete(PATCH_PARAM);
      history.replaceState(null,'',url.pathname+(url.search?url.search:'')+url.hash);
      return false;
    }

    const liabilities=await FinanceDB.getAll('liabilities');
    const commitments=await FinanceDB.getAll('commitments');
    let changed=false;

    for(const spec of patch){
      if(!spec||typeof spec!=='object'||!spec.match)continue;
      const liability=liabilities.find(l=>norm(l.name)===norm(spec.match));
      if(!liability)continue;
      const allowed=['finalDueDate','recurrenceEnd','finalPaymentDate','nextDueDate','installmentsRemaining','installmentsTotal','scheduleNote'];
      for(const key of allowed){
        if(spec[key]!==undefined&&spec[key]!==null&&liability[key]!==spec[key]){
          liability[key]=spec[key];changed=true;
        }
      }
      if(Number(liability.installmentsRemaining)<=0&&liability.installmentsRemaining!=null&&!Number(liability.finalPayment||0)){
        liability.completed=true;changed=true;
      }
      await FinanceDB.put('liabilities',liability);

      if(liability.finalDueDate){
        for(const c of commitments){
          const linked=Number(c.liabilityId)===Number(liability.id)||(liability.scheduleKey&&c.liabilityKey===liability.scheduleKey);
          if(linked&&c.active!==false&&c.dueDate&&String(c.dueDate)>String(liability.finalDueDate)){
            await FinanceDB.remove('commitments',c.id);changed=true;
          }
        }
      }
    }

    url.searchParams.delete(PATCH_PARAM);
    history.replaceState(null,'',url.pathname+(url.search?url.search:'')+url.hash);
    return changed;
  }

  async function enforceCompletion(){
    const liabilities=await FinanceDB.getAll('liabilities');
    let changed=false;
    for(const l of liabilities){
      if(l.completed)continue;
      const noFinalBalloon=!Number(l.finalPayment||0);
      const byInstallments=l.installmentsRemaining!=null&&Number(l.installmentsRemaining)<=0;
      const byResidual=l.remaining!=null&&Number(l.remaining)<=0;
      if(noFinalBalloon&&(byInstallments||byResidual)){
        l.completed=true;
        await FinanceDB.put('liabilities',l);
        changed=true;
      }
      if(l.recurrenceEnd&&l.nextDueDate&&String(l.nextDueDate)>String(l.recurrenceEnd)&&Number(l.finalPayment||0)>0){
        await FinanceDB.put('liabilities',l);
        changed=true;
      }
    }
    return changed;
  }

  async function decorate(){
    if(busy)return;busy=true;
    try{
      const host=$('#liabilityList');if(!host)return;
      const liabilities=await FinanceDB.getAll('liabilities');
      for(const row of host.querySelectorAll('[data-liability]')){
        const l=liabilities.find(x=>String(x.id)===String(row.dataset.liability));
        if(!l)continue;
        const copy=row.querySelector('.row-copy');if(!copy)continue;
        let meta=copy.querySelector('.v34-rate-meta');
        if(!meta){meta=document.createElement('span');meta.className='v34-rate-meta';copy.appendChild(meta)}
        const bits=[];
        if(l.installmentsRemaining!=null)bits.push(`${Number(l.installmentsRemaining)} ${Number(l.installmentsRemaining)===1?'rata rimasta':'rate rimaste'}`);
        if(l.finalDueDate)bits.push(`fine ${fmtMonth(l.finalDueDate)}`);
        else if(l.recurrenceEnd)bits.push(`rate fino a ${fmtMonth(l.recurrenceEnd)}`);
        if(l.finalPaymentDate)bits.push(`maxirata ${fmtMonth(l.finalPaymentDate)}`);
        meta.textContent=bits.join(' · ');
        meta.hidden=!bits.length;
      }
    }finally{busy=false}
  }

  function watch(){
    const host=$('#liabilityList');if(!host)return;
    new MutationObserver(()=>setTimeout(decorate,20)).observe(host,{childList:true,subtree:true});
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    try{
      const patched=await consumePatch();
      const completed=await enforceCompletion();
      watch();
      setTimeout(decorate,300);setTimeout(decorate,1000);
      if(patched||completed)setTimeout(()=>location.reload(),80);
    }catch(e){console.warn('Rates V34',e)}
  });
})();
