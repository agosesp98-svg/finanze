(()=>{
  const NS='http://www.w3.org/2000/svg';
  const TARGETS='.tabbar,.icon-button,.sheet,.segmented,.spend-card,.month-card,.account-card,.list-card,.plan-summary,.projection-row,.goal-card,.goal-hero,.sheet-section,.kpi';
  const registry=new WeakMap();
  let seq=0;

  const isSafari=()=>/Safari/i.test(navigator.userAgent)&&!/Chrome|CriOS|Chromium|Edg/i.test(navigator.userAgent);
  const isFirefox=()=>/Firefox|FxiOS/i.test(navigator.userAgent);

  function svgBackdropSupported(id){
    if(isSafari()||isFirefox())return false;
    try{
      const div=document.createElement('div');
      div.style.backdropFilter=`url(#${id})`;
      return !!div.style.backdropFilter;
    }catch{return false}
  }

  function radiusOf(el){
    const r=parseFloat(getComputedStyle(el).borderTopLeftRadius||'0');
    return Number.isFinite(r)?r:24;
  }

  function dataMap(el,ids){
    const rect=el.getBoundingClientRect();
    const width=Math.max(1,Math.round(rect.width||400));
    const height=Math.max(1,Math.round(rect.height||200));
    const radius=Math.max(0,Math.min(radiusOf(el),Math.min(width,height)/2));
    const edge=Math.max(1,Math.min(width,height)*.035);
    const innerW=Math.max(1,width-edge*2),innerH=Math.max(1,height-edge*2);
    const content=`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${ids.red}" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient><linearGradient id="${ids.blue}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient></defs><rect width="${width}" height="${height}" fill="black"/><rect width="${width}" height="${height}" rx="${radius}" fill="url(#${ids.red})"/><rect width="${width}" height="${height}" rx="${radius}" fill="url(#${ids.blue})" style="mix-blend-mode:difference"/><rect x="${edge}" y="${edge}" width="${innerW}" height="${innerH}" rx="${radius}" fill="hsl(0 0% 50% / .93)" style="filter:blur(11px)"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(content)}`;
  }

  function makeSvg(id,ids){
    const svg=document.createElementNS(NS,'svg');
    svg.classList.add('rb-glass-filter');
    svg.setAttribute('aria-hidden','true');
    const defs=document.createElementNS(NS,'defs');
    const filter=document.createElementNS(NS,'filter');
    filter.id=id;filter.setAttribute('color-interpolation-filters','sRGB');filter.setAttribute('x','0%');filter.setAttribute('y','0%');filter.setAttribute('width','100%');filter.setAttribute('height','100%');
    const image=document.createElementNS(NS,'feImage');image.setAttribute('x','0');image.setAttribute('y','0');image.setAttribute('width','100%');image.setAttribute('height','100%');image.setAttribute('preserveAspectRatio','none');image.setAttribute('result','map');
    filter.appendChild(image);
    const channels=[['red',-180,'1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'],['green',-170,'0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0'],['blue',-160,'0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 0 1 0']];
    channels.forEach(([name,scale,matrix])=>{
      const d=document.createElementNS(NS,'feDisplacementMap');d.setAttribute('in','SourceGraphic');d.setAttribute('in2','map');d.setAttribute('scale',String(scale));d.setAttribute('xChannelSelector','R');d.setAttribute('yChannelSelector','G');d.setAttribute('result',`disp-${name}`);filter.appendChild(d);
      const c=document.createElementNS(NS,'feColorMatrix');c.setAttribute('in',`disp-${name}`);c.setAttribute('type','matrix');c.setAttribute('values',matrix);c.setAttribute('result',name);filter.appendChild(c);
    });
    const blend1=document.createElementNS(NS,'feBlend');blend1.setAttribute('in','red');blend1.setAttribute('in2','green');blend1.setAttribute('mode','screen');blend1.setAttribute('result','rg');filter.appendChild(blend1);
    const blend2=document.createElementNS(NS,'feBlend');blend2.setAttribute('in','rg');blend2.setAttribute('in2','blue');blend2.setAttribute('mode','screen');blend2.setAttribute('result','output');filter.appendChild(blend2);
    const blur=document.createElementNS(NS,'feGaussianBlur');blur.setAttribute('in','output');blur.setAttribute('stdDeviation','0');filter.appendChild(blur);
    defs.appendChild(filter);svg.appendChild(defs);
    return{svg,image};
  }

  function opticalLayer(cls){const x=document.createElement('span');x.className=cls;x.setAttribute('aria-hidden','true');return x}

  function update(el){
    const data=registry.get(el);if(!data||!el.isConnected)return;
    data.image?.setAttribute('href',dataMap(el,data.ids));
  }

  function enhance(el){
    if(!(el instanceof HTMLElement))return;
    const existing=registry.get(el);
    if(existing&&el.querySelector('.rb-glass-rim')){update(el);return}
    if(existing)existing.observer?.disconnect();
    el.querySelectorAll(':scope > .rb-glass-filter,:scope > .rb-glass-sheen,:scope > .rb-glass-rim,:scope > .rb-glass-line,:scope > .rb-glass-glow').forEach(x=>x.remove());

    const uid=`rb-glass-${++seq}`;
    const ids={red:`${uid}-red`,blue:`${uid}-blue`};
    const supported=svgBackdropSupported(uid);
    const {svg,image}=makeSvg(uid,ids);
    el.classList.add('rb-glass-surface',supported?'rb-glass-svg':'rb-glass-fallback');
    el.classList.remove(supported?'rb-glass-fallback':'rb-glass-svg');
    if(supported)el.style.setProperty('--rb-filter',`url(#${uid})`);else el.style.removeProperty('--rb-filter');
    el.append(svg,opticalLayer('rb-glass-sheen'),opticalLayer('rb-glass-rim'),opticalLayer('rb-glass-line'),opticalLayer('rb-glass-glow'));
    const observer=new ResizeObserver(()=>requestAnimationFrame(()=>update(el)));
    observer.observe(el);
    registry.set(el,{image,ids,observer});
    requestAnimationFrame(()=>update(el));
  }

  function scan(root=document){
    if(root instanceof HTMLElement&&root.matches(TARGETS))enhance(root);
    root.querySelectorAll?.(TARGETS).forEach(enhance);
  }

  function bindPointer(){
    document.addEventListener('pointermove',e=>{
      const el=e.target.closest?.('.rb-glass-surface');if(!el)return;
      const r=el.getBoundingClientRect();
      el.style.setProperty('--glass-x',`${((e.clientX-r.left)/Math.max(1,r.width))*100}%`);
      el.style.setProperty('--glass-y',`${((e.clientY-r.top)/Math.max(1,r.height))*100}%`);
    },{passive:true});
  }

  function observe(){
    new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='childList')record.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n)});
        if(record.target instanceof HTMLElement&&record.target.matches(TARGETS)&&!record.target.querySelector(':scope > .rb-glass-rim'))enhance(record.target);
      }
    }).observe(document.body,{childList:true,subtree:true});
  }

  function init(){scan();bindPointer();observe()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
