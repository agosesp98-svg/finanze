const FinanzeAIChat=(()=>{
  const $=id=>document.getElementById(id);
  const HISTORY_KEY='aiChatHistory',URL_KEY='aiWorkerUrl',SHARE_KEY='aiShareSummary';
  const TOKEN_KEY='finanze.ai.accessToken';
  let endpoint='',token='',share=false,history=[],busy=false,connected=false;
  const messageLimit=40;
  const settingsValue=async (key,fallback)=>((await FinanceDB.get('settings',key))?.value??fallback);
  const setValue=(key,value)=>FinanceDB.put('settings',{key,value});

  function normalizeWorkerUrl(raw){
    const url=new URL(String(raw||'').trim());
    if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev')||url.username||url.password||url.port||url.search||url.hash)throw new Error('Inserisci un indirizzo HTTPS del tuo Worker Cloudflare (workers.dev).');
    if(url.pathname!=='/'&&url.pathname!=='/chat')throw new Error('Usa l’indirizzo base del Worker, senza percorsi aggiuntivi.');
    return url.origin+'/chat';
  }
  function showError(message){
    const box=$('aiError');
    box.hidden=!message;box.textContent=message||'';
  }
  function isConfigured(){return Boolean(endpoint&&token)}
  function showSetup(force){
    const setup=$('aiSetup'),chat=$('aiChatArea');
    const configured=isConfigured();
    setup.hidden=configured&&!force;
    chat.hidden=!configured;
    $('aiConfigButton').textContent=configured?(setup.hidden?'Impostazioni':'Chiudi'):'Configura';
    $('aiStatus').textContent=configured?(connected?'Connessione verificata':'Configurato · da verificare'):'Attivazione necessaria';
  }
  function renderMessages(){
    const host=$('aiMessages');host.replaceChildren();
    if(!history.length){
      const welcome=document.createElement('div');
      welcome.className='ai-welcome';
      welcome.innerHTML='<h2>Un assistente per le tue finanze</h2><p>Fai una domanda sul tuo bilancio, le scadenze o gli obiettivi. Per utilizzare i valori registrati, attiva la condivisione del riepilogo.</p>';
      host.appendChild(welcome);
    }
    for(const item of history){
      const bubble=document.createElement('div');
      bubble.className='ai-bubble '+(item.role==='user'?'from-user':'from-ai');
      const label=document.createElement('small');
      label.textContent=item.role==='user'?'Tu':'Finanze AI';
      const body=document.createElement('div');body.textContent=item.content;
      bubble.append(label,body);host.appendChild(bubble);
    }
    host.scrollTop=host.scrollHeight;
  }
  function render(){
    $('aiWorkerInput').value=endpoint?endpoint.replace(/\/chat$/,''):'';
    $('aiTokenInput').value=token;
    $('aiShare').checked=share;
    $('aiSendButton').disabled=busy;
    $('aiPrompt').disabled=busy;
    $('aiSendButton').textContent=busy?'Elaborazione…':'Invia';
    $('aiPrivacyText').textContent=share?'Il riepilogo dei conti, budget e scadenze sarà inviato a Cloudflare con ogni domanda.':'Nessun riepilogo finanziario viene aggiunto. La domanda e gli ultimi messaggi vengono comunque inviati a Cloudflare.';
    showSetup(false);
    renderMessages();
  }
  async function financialContext(){
    const names=['accounts','budgets','commitments','liabilities','goals','settings'];
    const values=await Promise.all(names.map(n=>FinanceDB.getAll(n)));
    const data=Object.fromEntries(names.map((n,i)=>[n,values[i]]));
    return FinanzeAIContext.build(data,new Date());
  }
  function setBusy(next){
    busy=next;
    $('aiPrompt').disabled=next;
    $('aiSendButton').disabled=next;
    $('aiSendButton').textContent=next?'Elaborazione…':'Invia';
  }
  async function saveHistory(){await setValue(HISTORY_KEY,history.slice(-messageLimit))}
  async function send(question){
    if(busy)return;
    const content=String(question||'').trim().slice(0,1200);
    if(!content)return;
    if(!isConfigured()){showSetup(true);showError('Configura prima il collegamento Cloudflare.');return}
    showError('');$('aiPrompt').value='';
    history.push({role:'user',content});history=history.slice(-messageLimit);
    renderMessages();setBusy(true);
    try{
      const context=share?await financialContext():null;
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),35000);
      let response;
      try{
        response=await fetch(endpoint,{
          method:'POST',mode:'cors',cache:'no-store',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
          body:JSON.stringify({messages:history.slice(-9).map(m=>({role:m.role,content:m.content.slice(0,1500)})),context}),
          signal:controller.signal
        });
      }finally{clearTimeout(timeout)}
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||('Errore HTTP '+response.status));
      if(typeof data.reply!=='string'||!data.reply.trim())throw new Error('Risposta AI vuota.');
      history.push({role:'assistant',content:data.reply.slice(0,3500)});
      history=history.slice(-messageLimit);connected=true;
      renderMessages();showSetup(false);
    }catch(error){
      showError(error.name==='AbortError'?'La richiesta è scaduta. Riprova.':(error.message==='Failed to fetch'?'Impossibile raggiungere Cloudflare. Verifica URL, connessione e configurazione CORS.':error.message||'Errore di connessione.'));
    }finally{await saveHistory();setBusy(false)}
  }
  async function configure(event){
    event.preventDefault();
    const raw=$('aiWorkerInput').value,secret=$('aiTokenInput').value.trim();
    let url;
    try{url=normalizeWorkerUrl(raw)}catch(e){showError(e.message);return}
    if(secret.length<24){showError('La chiave privata deve contenere almeno 24 caratteri.');return}
    endpoint=url;token=secret;connected=false;
    localStorage.setItem(TOKEN_KEY,token);
    await setValue(URL_KEY,endpoint);
    showError('');render();
  }
  async function clearHistory(){
    if(!history.length||!confirm('Eliminare la cronologia locale della chat AI?'))return;
    history=[];await saveHistory();showError('');renderMessages();
  }
  async function init(){
    if(!$('view-ai'))return;
    endpoint=String(await settingsValue(URL_KEY,'')||'');
    token=localStorage.getItem(TOKEN_KEY)||'';
    share=Boolean(await settingsValue(SHARE_KEY,false));
    const saved=await settingsValue(HISTORY_KEY,[]);
    history=Array.isArray(saved)?saved.filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string').slice(-messageLimit):[];
    render();
    $('aiConfigButton').addEventListener('click',()=>{
      const setup=$('aiSetup');
      showSetup(setup.hidden);
    });
    $('aiSetupForm').addEventListener('submit',configure);
    $('aiShare').addEventListener('change',async e=>{
      share=Boolean(e.target.checked);
      await setValue(SHARE_KEY,share);render();
    });
    $('aiChatForm').addEventListener('submit',event=>{event.preventDefault();send($('aiPrompt').value)});
    $('aiPrompt').addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){
        e.preventDefault();send($('aiPrompt').value);
      }
    });
    document.querySelectorAll('[data-ai-question]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.aiQuestion)));
    $('aiClearButton').addEventListener('click',clearHistory);
    document.addEventListener('finanze:data-reset',()=>{history=[];endpoint='';token='';share=false;localStorage.removeItem(TOKEN_KEY)});
  }
  return {init,normalizeWorkerUrl};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinanzeAIChat;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>FinanzeAIChat.init().catch(error=>console.error('Finanze AI init:',error)));
