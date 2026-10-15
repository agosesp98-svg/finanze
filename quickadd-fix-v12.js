(()=>{
  function openComposer(){
    const composer=document.getElementById('v11Composer');
    const backdrop=document.getElementById('v11ComposerBackdrop');
    if(!composer||!backdrop)return false;
    backdrop.hidden=false;
    requestAnimationFrame(()=>{
      backdrop.classList.add('open');
      composer.classList.add('open');
      composer.setAttribute('aria-hidden','false');
    });
    return true;
  }

  document.addEventListener('click',e=>{
    if(!e.target.closest('#quickAddBtn'))return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if(!openComposer())setTimeout(openComposer,0);
  },true);
})();