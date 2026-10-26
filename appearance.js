(()=>{
  const KEY='finanze-ui-preferences-v1';
  const defaults={theme:'auto',glass:true,motion:true,adaptiveTab:true};
  const $=(s,r=document)=>r.querySelector(s);
  let prefs={...defaults};
  let lastY=window.scrollY;
  let scrollTick=false;

  function read(){
    try{prefs={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{prefs={...defaults}}
    return prefs;
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs))}catch{}}
  function effectiveTheme(){return prefs.theme==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):prefs.theme}
  function apply(){
    const root=document.documentElement,theme=effectiveTheme();
    root.dataset.theme=theme;
    root.dataset.glass=prefs.glass?'on':'off';
    root.dataset.motion=prefs.motion?'on':'off';
    root.dataset.adaptiveTab=prefs.adaptiveTab?'on':'off';
    root.style.colorScheme=theme;
    const metas=[...document.querySelectorAll('meta[name="theme-color"]')];
    metas.forEach(m=>m.content=theme==='dark'?'#050507':'#f2f4f8');
    syncControls();
  }
  function setPref(key,value){prefs[key]=value;save();apply()}

  function appearanceSection(){
    const current=prefs.theme;
    return `<div id="appearanceSettings" class="sheet-section appearance-settings">
      <h3>Aspetto</h3>
      <div class="appearance-picker segmented" role="group" aria-label="Aspetto">
        <button type="button" data-theme-choice="auto" class="${current==='auto'?'active':''}">Automatico</button>
        <button type="button" data-theme-choice="light" class="${current==='light'?'active':''}">Chiaro</button>
        <button type="button" data-theme-choice="dark" class="${current==='dark'?'active':''}">Scuro</button>
      </div>
      <div class="settings-group">
        <label class="switch-row"><span><b>Liquid Glass</b><small>Trasparenze, profondità e riflessi dinamici</small></span><input id="prefGlass" class="ios-switch" type="checkbox" ${prefs.glass?'checked':''}></label>
        <label class="switch-row"><span><b>Animazioni fluide</b><small>Transizioni spring e feedback al tocco</small></span><input id="prefMotion" class="ios-switch" type="checkbox" ${prefs.motion?'checked':''}></label>
        <label class="switch-row"><span><b>Tab bar dinamica</b><small>Si compatta mentre scorri, come su iOS</small></span><input id="prefAdaptiveTab" class="ios-switch" type="checkbox" ${prefs.adaptiveTab?'checked':''}></label>
      </div>
      <p class="helper appearance-helper">Le preferenze grafiche restano su questo dispositivo e non modificano i tuoi dati finanziari.</p>
    </div>`;
  }

  function injectSettings(){
    const body=$('#sheetBody');
    if(!body||!$('#salarySettings',body)||$('#appearanceSettings',body))return;
    const salarySection=$('#salarySettings',body).closest('.sheet-section');
    if(salarySection)salarySection.insertAdjacentHTML('afterend',appearanceSection());
    syncControls();
  }

  function syncControls(){
    document.querySelectorAll('[data-theme-choice]').forEach(b=>{
      const active=b.dataset.themeChoice===prefs.theme;
      b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');
    });
    const g=$('#prefGlass'),m=$('#prefMotion'),a=$('#prefAdaptiveTab');
    if(g)g.checked=!!prefs.glass;if(m)m.checked=!!prefs.motion;if(a)a.checked=!!prefs.adaptiveTab;
    if(!prefs.adaptiveTab)document.querySelector('.tabbar')?.classList.remove('compact');
  }

  function bindPreferences(){
    document.addEventListener('click',e=>{
      const choice=e.target.closest('[data-theme-choice]');
      if(choice){setPref('theme',choice.dataset.themeChoice);return}
    });
    document.addEventListener('change',e=>{
      if(e.target.id==='prefGlass')setPref('glass',e.target.checked);
      if(e.target.id==='prefMotion')setPref('motion',e.target.checked);
      if(e.target.id==='prefAdaptiveTab')setPref('adaptiveTab',e.target.checked);
    });
  }

  function bindGlassPointer(){
    const selector='.icon-button,.spend-card,.month-card,.account-card,.goal-hero,.goal-card,.plan-summary,.sheet,.tabbar,.primary-button,.secondary-button,.danger-button';
    document.addEventListener('pointermove',e=>{
      if(!prefs.glass)return;
      const el=e.target.closest(selector);if(!el)return;
      const r=el.getBoundingClientRect();
      el.style.setProperty('--glass-x',`${((e.clientX-r.left)/Math.max(1,r.width))*100}%`);
      el.style.setProperty('--glass-y',`${((e.clientY-r.top)/Math.max(1,r.height))*100}%`);
    },{passive:true});
  }

  function bindScroll(){
    addEventListener('scroll',()=>{
      if(scrollTick)return;scrollTick=true;
      requestAnimationFrame(()=>{
        const y=window.scrollY,down=y>lastY+4,up=y<lastY-4,tab=$('.tabbar'),top=$('.topbar');
        top?.classList.toggle('scrolled',y>8);
        if(tab&&prefs.adaptiveTab&&y>90){if(down)tab.classList.add('compact');if(up)tab.classList.remove('compact')}
        else tab?.classList.remove('compact');
        lastY=y;scrollTick=false;
      });
    },{passive:true});
  }

  function bindViewMotion(){
    document.addEventListener('click',e=>{
      const nav=e.target.closest('[data-view]');if(!nav||!prefs.motion)return;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const active=document.querySelector('.view.active');
        if(!active)return;active.classList.remove('liquid-enter');void active.offsetWidth;active.classList.add('liquid-enter');
      }));
    },true);
  }

  function observeSheets(){
    const body=$('#sheetBody');if(!body)return;
    new MutationObserver(()=>injectSettings()).observe(body,{childList:true,subtree:true});
  }

  read();apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(prefs.theme==='auto')apply()});
  document.addEventListener('DOMContentLoaded',()=>{
    apply();bindPreferences();bindGlassPointer();bindScroll();bindViewMotion();observeSheets();
    setTimeout(injectSettings,0);
  });
})();
