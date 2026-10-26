(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const norm=FinanceEngine.norm;
  let busy=false;

  function isRecurring(item){
    const cadence=norm(item?.cadence);
    return item?.recurring===true||cadence.includes('mensil')||cadence.includes('14 giorni')||cadence.includes('settiman');
  }

  async function currentItem(){
    const form=$('#commitmentForm');if(!form)return null;
    const pay=$('[data-pay-commitment]',form);if(!pay)return null;
    const id=Number(pay.dataset.payCommitment||0);if(!id)return null;
    return FinanceDB.get('commitments',id);
  }

  async function inject(){
    if(busy||$('#endRecurringBtn'))return;busy=true;
    try{
      const form=$('#commitmentForm');if(!form)return;
      const item=await currentItem();
      if(!item||item.liabilityId||item.liabilityKey||!isRecurring(item))return;
      const button=document.createElement('button');
      button.id='endRecurringBtn';button.type='button';button.className='danger-button';
      button.textContent='Termina ricorrenza';
      button.style.marginTop='4px';
      button.addEventListener('click',()=>endRecurring(item));
      form.appendChild(button);
    }finally{busy=false}
  }

  async function endRecurring(item){
    if(!confirm('Terminare questa ricorrenza? Le spese già registrate resteranno nello storico.'))return;
    const commitments=await FinanceDB.getAll('commitments'),key=norm(item.name);
    const matches=commitments.filter(c=>!c.liabilityId&&!c.liabilityKey&&norm(c.name)===key&&isRecurring(c));
    for(const c of matches)await FinanceDB.remove('commitments',c.id);
    const close=$('[data-close-sheet]');if(close)close.click();
    setTimeout(()=>location.reload(),80);
  }

  const body=$('#sheetBody');
  if(body)new MutationObserver(()=>setTimeout(inject,20)).observe(body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,20));
  setTimeout(inject,20);
})();
