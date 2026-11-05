/* Finanze AI — a local-first, consent-based conversation. */
const FinanzeAIChat=(()=>{
  const $=id=>document.getElementById(id);
  const HISTORY_KEY='aiChatHistory',URL_KEY='aiWorkerUrl',SHARE_KEY='aiShareSummary';
  const TOKEN_KEY='finanze.ai.accessToken',DRAFT_KEY='finanze.ai.draft';
  const MAX_MESSAGES=50,MAX_INPUT=1200;
  let endpoint='',token='',share=false,history=[],busy=false,connected=false,setupOpen=false;
  let activeController=null,manualStop=false;
  const settingsValue=async(key,fallback)=>((await FinanceDB.get('settings',key))?.value??fallback);
  const setValue=(key,value)=>FinanceDB.put('settings',{key,value});

  function normalizeWorkerUrl(raw){
    const url=new URL(String(raw||'').trim());
    if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev')||url.username||url.password||url.port||url.search||url.hash)
      throw new Error('Inserisci un indirizzo HTTPS valido del Worker (workers.dev).');
    if(url.pathname!=='/'&&url.pathname!=='/chat')throw new Error('Usa solo l’indirizzo base del Worker.');
    return url.origin+'/chat';
  }

  function normalizeHistory(raw){
    if(!Array.isArray(raw))return [];
    return raw.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.trim())
      .slice(-MAX_MESSAGES).map(m=>({
        role:m.role,content:m.content.slice(0,6500),
        ...(typeof m.createdAt==='string'&&Number.isFinite(Date.parse(m.createdAt))?{createdAt:m.createdAt}:{}),
        ...(m.status==='failed'||m.status==='skipped'||m.status==='sending'?{status:m.status==='sending'?'failed':m.status}:{})
      }));
  }
  function requestMessages(items,max=10){
    if(!Array.isArray(items))return [];
    return items.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.trim()
      &&m.status!=='failed'&&m.status!=='skipped')
      .slice(-max).map(m=>({role:m.role,content:m.content.slice(0,1500)}));
  }

  function showError(message,{retry=false,setup=false}={}){
    const box=$(setup?'aiSetupError':'aiError');
    const label=$(setup?'aiSetupErrorText':'aiErrorText');
    box.hidden=!message;
    label.textContent=message||'';
    if(!setup)$('aiRetryButton').hidden=!retry;
  }
  function isConfigured(){return Boolean(endpoint&&token)}
  function renderStatus(){
    let status='Da configurare',kind='';
    if(busy){status='Sto analizzando…';kind='busy'}
    else if(isConfigured()&&navigator.onLine===false){status='Connessione assente';kind='offline'}
    else if(isConfigured()){status=connected?'Assistente attivo':'Pronta a rispondere';kind='online'}
    $('aiStatus').textContent=status;
    $('aiStatusDot').className='ai-status-dot'+(kind?' '+kind:'');
  }
  function updateContext(){
    $('aiShare').checked=share;
    $('aiContextStatus').textContent=share?'Dati abilitati · sola lettura':'Nessun dato condiviso';
    $('aiPrivacyText').textContent=share
      ?'Con ogni richiesta inviamo a Cloudflare gli ultimi messaggi e un riepilogo di saldi, budget, rate, obiettivi, scadenze e totali di spesa per categoria. Non inviamo descrizioni dei singoli movimenti, IBAN o documenti.'
      :'Vengono inviati a Cloudflare solo la domanda e gli ultimi messaggi della conversazione. Saldi e riepiloghi finanziari non sono inclusi.';
  }
  function showSetup(open){
    setupOpen=!isConfigured()||!!open;
    $('aiSetup').hidden=!setupOpen;
    $('aiChatArea').hidden=setupOpen;
    $('aiConfigButton').setAttribute('aria-expanded',String(setupOpen));
    $('aiConfigButton').setAttribute('aria-label',setupOpen&&isConfigured()?'Chiudi impostazioni AI':'Impostazioni AI');
    $('aiConfigButton').title=setupOpen&&isConfigured()?'Torna alla chat':'Impostazioni AI';
    $('aiNewChatButton').hidden=setupOpen||!history.length;
    $('aiNewChatButton').disabled=busy;
    if(setupOpen){
      $('aiWorkerInput').value=endpoint?endpoint.replace(/\/chat$/,''):'';
      $('aiTokenInput').value='';
      $('aiTokenInput').placeholder=token?'Chiave salvata · inserisci solo per sostituirla':'Inserisci la chiave privata Cloudflare';
      $('aiTokenInput').required=!token;
      showError('',{setup:true});
    }else requestAnimationFrame(()=>scrollBottom(false));
    renderStatus();
  }

  function appendInline(target,text){
    const re=/(\*\*[^*\n]+\*\*|__[^_\n]+__|\x60[^\x60\n]+\x60|\*[^*\n]+\*)/g;
    let last=0,m;
    while((m=re.exec(text))){
      if(m.index>last)target.appendChild(document.createTextNode(text.slice(last,m.index)));
      const raw=m[0],bold=raw.startsWith('**')||raw.startsWith('__'),code=raw.startsWith('\x60');
      const el=document.createElement(code?'code':bold?'strong':'em');
      el.textContent=raw.slice(code?1:bold?2:1,code?-1:bold?-2:-1);
      target.appendChild(el);last=m.index+raw.length;
    }
    if(last<text.length)target.appendChild(document.createTextNode(text.slice(last)));
  }

  function formatRichText(value){
    const host=document.createElement('div');host.className='ai-richtext';
    const lines=String(value||'').replace(/\r\n?/g,'\n').split('\n');
    const heading=l=>/^#{1,3}\s+/.test(l);
    const bullet=l=>/^\s*(?:[-*•]|\d+[.)])\s+/.test(l);
    const fence=l=>/^\s*\x60\x60\x60/.test(l);
    const tableDivider=l=>/^\s*\|?[\s:|\-]+\|?\s*$/.test(l)&&l.includes('-')&&l.includes('|');
    const tableCells=l=>l.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
    let i=0;
    while(i<lines.length){
      const line=lines[i];
      if(!line.trim()){i++;continue}
      if(fence(line)){
        const parts=[];i++;
        while(i<lines.length&&!fence(lines[i]))parts.push(lines[i++]);
        if(i<lines.length)i++;
        const pre=document.createElement('pre'),code=document.createElement('code');
        code.textContent=parts.join('\n');pre.appendChild(code);host.appendChild(pre);continue;
      }
      if(heading(line)){
        const level=Math.min(4,1+(line.match(/^#+/)||['#'])[0].length);
        const h=document.createElement('h'+level);appendInline(h,line.replace(/^#{1,3}\s+/,''));host.appendChild(h);i++;continue;
      }
      if(i+1<lines.length&&line.includes('|')&&tableDivider(lines[i+1])&&tableCells(line).length>1){
        const holder=document.createElement('div');holder.className='ai-table-scroll';
        const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');
        const columns=tableCells(line);
        columns.forEach(cell=>{const th=document.createElement('th');appendInline(th,cell);tr.appendChild(th)});
        thead.appendChild(tr);table.appendChild(thead);i+=2;
        const tbody=document.createElement('tbody');let rows=0;
        while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()&&rows<30){
          const row=document.createElement('tr');
          tableCells(lines[i]).slice(0,columns.length).forEach(cell=>{const td=document.createElement('td');appendInline(td,cell);row.appendChild(td)});
          tbody.appendChild(row);i++;rows++;
        }
        table.appendChild(tbody);holder.appendChild(table);continue;
      }
      if(bullet(line)){
        const numbered=/^\s*\d+[.)]\s+/.test(line);
        const list=document.createElement(numbered?'ol':'ul');
        while(i<lines.length&&bullet(lines[i])&&/^\s*\d+[.)]\s+/.test(lines[i])===numbered){
          const li=document.createElement('li');appendInline(li,lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/,''));
          list.appendChild(li);i++;
        }
        host.appendChild(list);continue;
      }
      if(/^\s*>\s?/.test(line)){
        const block=document.createElement('blockquote'),parts=[];
        while(i<lines.length&&/^\s*>\s?/.test(lines[i]))parts.push(lines[i++].replace(/^\s*>\s?/,''));
        appendInline(block,parts.join(' '));host.appendChild(block);continue;
      }
      if(/^\s*(?:---|\*\*\*)\s*$/.test(line)){host.appendChild(document.createElement('hr'));i++;continue}
      const parts=[];
      while(i<lines.length&&lines[i].trim()&&!heading(lines[i])&&!bullet(lines[i])&&!fence(lines[i])
        &&!(i+1<lines.length&&lines[i].includes('|')&&tableDivider(lines[i+1]))
        &&!/^\s*>\s?/.test(lines[i]))parts.push(lines[i++].trim());
      if(!parts.length){i++;continue}
      const p=document.createElement('p');appendInline(p,parts.join(' '));host.appendChild(p);
    }
    return host;
  }

  function iconMarkup(name){
    if(name==='spark')return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3L12 2Z"/></svg>';
    if(name==='copy')return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></svg>';
    return '';
  }
  function formatTime(value){
    if(!value)return '';
    const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
    return new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(d);
  }
  function nearBottom(){
    const host=$('aiMessages');
    return host.scrollHeight-host.scrollTop-host.clientHeight<95;
  }
  function updateScrollButton(){$('aiScrollBottomButton').hidden=!history.length||nearBottom()}
  function scrollBottom(smooth=true){
    const host=$('aiMessages');if(!host||host.clientHeight===0)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.scrollTo({top:host.scrollHeight,behavior:smooth&&!reduced?'smooth':'auto'});
    updateScrollButton();
  }
  function renderMessages(forceBottom=false){
    const host=$('aiMessages'),keepBottom=forceBottom||nearBottom(),lastScroll=host.scrollTop;
    const fragment=document.createDocumentFragment();
    if(!history.length){
      const welcome=document.createElement('div');welcome.className='ai-welcome';
      welcome.innerHTML='<div class="ai-welcome-mark" aria-hidden="true">'+iconMarkup('spark')+'</div><h2>Facciamo chiarezza sui tuoi soldi.</h2><p>Bilancio, scadenze, risparmi o nuovi obiettivi. Chiedi quello che ti serve, in modo naturale.</p>';
      fragment.appendChild(welcome);
    }
    history.forEach((item,index)=>{
      const turn=document.createElement('div'),isUser=item.role==='user';
      turn.className='ai-message '+(isUser?'ai-message-user':'ai-message-assistant')+(item.status==='failed'?' failed':'');
      if(isUser){
        const body=document.createElement('div');body.className='ai-user-body';body.textContent=item.content;turn.appendChild(body);
        const meta=document.createElement('div');meta.className='ai-turn-meta';
        meta.textContent=(item.status==='failed'?'Non inviata':item.status==='skipped'?'Non inviata · saltata':'')+
          (formatTime(item.createdAt)?((item.status==='failed'||item.status==='skipped')?' · ':'')+formatTime(item.createdAt):'');
        if(meta.textContent)turn.appendChild(meta);
      }else{
        const avatar=document.createElement('span');avatar.className='ai-message-avatar';avatar.innerHTML=iconMarkup('spark');
        const content=document.createElement('div');content.className='ai-message-content';
        const heading=document.createElement('div');heading.className='ai-message-heading';heading.textContent='Finanze AI';
        content.appendChild(heading);content.appendChild(formatRichText(item.content));
        const meta=document.createElement('div');meta.className='ai-turn-meta';
        const copy=document.createElement('button');copy.type='button';copy.className='ai-copy-button';copy.dataset.copyAi=String(index);
        copy.innerHTML=iconMarkup('copy')+'<span>Copia</span>';copy.setAttribute('aria-label','Copia la risposta');
        meta.appendChild(copy);
        const time=formatTime(item.createdAt);
        if(time){const itemTime=document.createElement('span');itemTime.textContent=time;meta.appendChild(itemTime)}
        content.appendChild(meta);turn.append(avatar,content);
      }
      fragment.appendChild(turn);
    });
    if(busy){
      const turn=document.createElement('div');turn.className='ai-message ai-message-assistant';
      const avatar=document.createElement('span');avatar.className='ai-message-avatar';avatar.innerHTML=iconMarkup('spark');
      const content=document.createElement('div');content.className='ai-message-content';
      const heading=document.createElement('div');heading.className='ai-message-heading';heading.textContent='Finanze AI';
      const typing=document.createElement('div');typing.className='ai-typing';
      const dots=document.createElement('span');dots.className='ai-typing-dots';dots.setAttribute('aria-hidden','true');
      for(let j=0;j<3;j++)dots.appendChild(document.createElement('i'));
      const msg=document.createElement('span');msg.textContent=share?'Sto analizzando i dati…':'Sto preparando la risposta…';
      typing.append(dots,msg);content.append(heading,typing);turn.append(avatar,content);fragment.appendChild(turn);
    }
    host.replaceChildren(fragment);
    $('aiSuggestions').hidden=Boolean(history.length)||busy;
    $('aiNewChatButton').hidden=setupOpen||!history.length;
    requestAnimationFrame(()=>{
      if(keepBottom)host.scrollTop=host.scrollHeight;
      else host.scrollTop=lastScroll;
      updateScrollButton();
    });
  }

  function updateComposer(){
    const field=$('aiPrompt');field.style.height='auto';
    field.style.height=Math.min(130,Math.max(37,field.scrollHeight))+'px';
    $('aiSendButton').disabled=busy||!field.value.trim();
    $('aiSendButton').hidden=busy;
    $('aiStopButton').hidden=!busy;
    const count=field.value.length;
    $('aiCharCount').hidden=count<950;
    $('aiCharCount').textContent=count+'/'+MAX_INPUT;
    $('aiCharCount').classList.toggle('warning',count>1100);
    $('aiComposerHint').textContent=busy?'Puoi interrompere la risposta in qualsiasi momento':'Invio con ↵ · A capo con Maiusc + ↵';
  }
  function setBusy(next){
    busy=next;renderStatus();updateComposer();
    $('aiNewChatButton').disabled=busy;
    document.querySelectorAll('[data-ai-question]').forEach(x=>x.disabled=busy);
  }
  async function financialContext(){
    const names=['accounts','budgets','commitments','liabilities','goals','settings','movements','expectedIncomes'];
    const values=await Promise.all(names.map(n=>FinanceDB.getAll(n)));
    return FinanzeAIContext.build(Object.fromEntries(names.map((n,i)=>[n,values[i]])),new Date());
  }
  async function saveHistory(){
    try{await setValue(HISTORY_KEY,history.slice(-MAX_MESSAGES))}
    catch(e){console.warn('Impossibile salvare la cronologia locale',e)}
  }
  async function send(question,{retry=false,fromComposer=false}={}){
    if(busy)return;
    if(!isConfigured()){showSetup(true);showError('Completa prima la configurazione Cloudflare.',{setup:true});return}
    if(!retry&&!String(question||'').trim())return;
    let current;
    if(retry){
      current=[...history].reverse().find(m=>m.role==='user'&&m.status==='failed');
      if(!current){showError('Non ci sono messaggi da riprovare.');return}
      current.status='sending';
    }else{
      history.forEach(m=>{if(m.status==='failed')m.status='skipped'});
      current={role:'user',content:String(question).trim().slice(0,MAX_INPUT),createdAt:new Date().toISOString(),status:'sending'};
      history.push(current);history=history.slice(-MAX_MESSAGES);
      if(fromComposer){$('aiPrompt').value='';localStorage.removeItem(DRAFT_KEY)}
    }
    showError('');manualStop=false;setBusy(true);renderMessages(true);
    try{
      if(navigator.onLine===false)throw new Error('Sei offline. Controlla la connessione e riprova.');
      const context=share?await financialContext():null;
      if(manualStop)throw Object.assign(new Error('Interrotta'),{name:'AbortError'});
      const messages=requestMessages(history,10);
      if(!messages.length||messages.at(-1).role!=='user')throw new Error('Non riesco a preparare il messaggio.');
      const controller=new AbortController();activeController=controller;
      const timeout=setTimeout(()=>controller.abort(),60000);
      let response;
      try{
        response=await fetch(endpoint,{
          method:'POST',mode:'cors',cache:'no-store',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
          body:JSON.stringify({messages,context}),signal:controller.signal
        });
      }finally{clearTimeout(timeout)}
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||('Errore HTTP '+response.status));
      if(typeof data.reply!=='string'||!data.reply.trim())throw new Error('Il modello non ha restituito una risposta.');
      delete current.status;
      history.push({role:'assistant',content:data.reply.slice(0,6500),createdAt:new Date().toISOString()});
      history=history.slice(-MAX_MESSAGES);connected=true;showError('');
    }catch(error){
      current.status='failed';
      const msg=error.name==='AbortError'?(manualStop?'Risposta interrotta. Puoi riprovare quando vuoi.':'La risposta sta impiegando troppo tempo. Riprova.'):
        (error.message==='Failed to fetch'?'Cloudflare non è raggiungibile. Verifica la connessione o l’URL del Worker.':(error.message||'Impossibile ottenere una risposta.'));
      showError(msg,{retry:true});
    }finally{
      activeController=null;manualStop=false;setBusy(false);
      renderMessages(true);await saveHistory();
    }
  }
  function stop(){if(!busy)return;manualStop=true;if(activeController)activeController.abort()}
  async function configure(event){
    event.preventDefault();
    let url,secret;
    try{url=normalizeWorkerUrl($('aiWorkerInput').value);secret=$('aiTokenInput').value.trim()||token}
    catch(e){showError(e.message,{setup:true});return}
    if(secret.length<24){showError('La chiave privata deve contenere almeno 24 caratteri.',{setup:true});return}
    try{
      endpoint=url;token=secret;connected=false;
      localStorage.setItem(TOKEN_KEY,token);
      await setValue(URL_KEY,endpoint);
      showError('',{setup:true});showSetup(false);
    }catch(error){showError('Impossibile salvare il collegamento sul dispositivo.',{setup:true})}
  }
  async function newChat(){
    if(busy||!history.length)return;
    if(!confirm('Iniziare una nuova chat? La conversazione attuale verrà eliminata dal dispositivo.'))return;
    history=[];await saveHistory();showError('');
    renderMessages(true);updateComposer();$('aiPrompt').focus();
  }
  async function copyReply(index,button){
    const m=history[index];if(!m||m.role!=='assistant')return;
    try{
      await navigator.clipboard.writeText(m.content);
      const span=button.querySelector('span');if(!span)return;
      span.textContent='Copiato';
      setTimeout(()=>{if(span.isConnected)span.textContent='Copia'},1500);
    }catch{showError('Copia non riuscita. Verifica i permessi degli appunti.')}
  }
  function resizeViewport(){
    const height=window.visualViewport?.height||window.innerHeight;
    if(Number.isFinite(height)&&height>250)document.documentElement.style.setProperty('--ai-visible-height',height+'px');
  }

  async function init(){
    if(!$('view-ai'))return;
    endpoint=String(await settingsValue(URL_KEY,'')||'');
    token=localStorage.getItem(TOKEN_KEY)||'';
    share=Boolean(await settingsValue(SHARE_KEY,false));
    history=normalizeHistory(await settingsValue(HISTORY_KEY,[]));
    $('aiPrompt').value=localStorage.getItem(DRAFT_KEY)||'';
    resizeViewport();updateContext();updateComposer();renderMessages(true);showSetup(false);
    if(history.at(-1)?.status==='failed')showError('L’ultima domanda non ha ricevuto risposta. Puoi riprovare.',{retry:true});
    $('aiConfigButton').addEventListener('click',()=>{if(!isConfigured())return;showSetup(!setupOpen)});
    $('aiSetupForm').addEventListener('submit',configure);
    $('aiNewChatButton').addEventListener('click',newChat);
    $('aiShare').addEventListener('change',async event=>{
      share=!!event.target.checked;
      await setValue(SHARE_KEY,share);updateContext();
    });
    $('aiChatForm').addEventListener('submit',event=>{event.preventDefault();send($('aiPrompt').value,{fromComposer:true})});
    $('aiPrompt').addEventListener('input',()=>{
      const v=$('aiPrompt').value;
      if(v)localStorage.setItem(DRAFT_KEY,v);else localStorage.removeItem(DRAFT_KEY);
      updateComposer();
    });
    $('aiPrompt').addEventListener('keydown',event=>{
      if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){
        event.preventDefault();send($('aiPrompt').value,{fromComposer:true});
      }
    });
    $('aiPrompt').addEventListener('focus',()=>{document.body.classList.add('ai-chat-focused');requestAnimationFrame(resizeViewport)});
    $('aiPrompt').addEventListener('blur',()=>{
      setTimeout(()=>{if(document.activeElement!==$('aiPrompt'))document.body.classList.remove('ai-chat-focused');resizeViewport()},180);
    });
    $('aiStopButton').addEventListener('click',stop);
    $('aiRetryButton').addEventListener('click',()=>send(null,{retry:true}));
    $('aiScrollBottomButton').addEventListener('click',()=>scrollBottom());
    $('aiMessages').addEventListener('scroll',updateScrollButton,{passive:true});
    $('aiMessages').addEventListener('click',event=>{
      const button=event.target.closest('[data-copy-ai]');
      if(button)copyReply(Number(button.dataset.copyAi),button);
    });
    document.querySelectorAll('[data-ai-question]').forEach(button=>button.addEventListener('click',()=>{
      if(button.dataset.aiRequiresContext==='true'&&!share){
        showError('Per rispondere con i tuoi dati, attiva prima “Contesto finanziario”.');
        $('aiShare').focus();return;
      }
      send(button.dataset.aiQuestion);
    }));
    window.addEventListener('online',renderStatus);
    window.addEventListener('offline',renderStatus);
    window.addEventListener('resize',resizeViewport,{passive:true});
    window.visualViewport?.addEventListener('resize',resizeViewport,{passive:true});
    document.addEventListener('click',event=>{
      if(event.target.closest('[data-view="ai"]'))requestAnimationFrame(()=>{resizeViewport();scrollBottom(false)});
    });
    document.addEventListener('finanze:data-reset',()=>{
      history=[];endpoint='';token='';share=false;
      localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(DRAFT_KEY);
    });
  }
  return{init,normalizeWorkerUrl,normalizeHistory,requestMessages};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FinanzeAIChat;
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>FinanzeAIChat.init().catch(error=>console.error('Finanze AI init:',error)));
