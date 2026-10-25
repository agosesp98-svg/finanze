(()=>{
  let pruning=false,reloadQueued=false,timer=null;
  const reached=g=>Number(g?.target||0)>0&&Number(g?.current||0)>=Number(g?.target||0);

  async function deleteGoal(id){
    const db=await FinanceDB.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('goals','readwrite');
      const req=tx.objectStore('goals').delete(id);
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }

  function queueReload(){
    if(reloadQueued)return;
    reloadQueued=true;
    setTimeout(()=>location.reload(),140);
  }

  async function prune(){
    if(pruning||typeof FinanceDB==='undefined')return;
    pruning=true;
    try{
      const goals=await FinanceDB.getAll('goals');
      const completed=goals.filter(reached);
      if(!completed.length)return;
      await Promise.all(completed.map(g=>deleteGoal(g.id)));
      sessionStorage.setItem('finanzeGoalRemoved',String(completed.length));
      queueReload();
    }catch(e){
      console.warn('Goal auto cleanup',e);
    }finally{
      pruning=false;
    }
  }

  function schedule(delay=220){
    clearTimeout(timer);
    timer=setTimeout(prune,delay);
  }

  document.addEventListener('submit',e=>{
    if(e.target?.id==='goalEdit'||e.target?.id==='marriageAddForm'||e.target?.id==='marriageEditForm'){
      schedule(260);
      setTimeout(prune,700);
    }
  });

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(prune,450);
    setTimeout(prune,1300);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(80)});
    window.addEventListener('pageshow',()=>schedule(80),{passive:true});
  });
})();
