// Presentation only; desktop layout and all saved business data stay untouched.
(()=>{
 const mobile=matchMedia('(max-width:900px)');
 function update(){
  const menu=document.querySelector('.lg-mobile-menu'),sidebar=document.getElementById('lgSidebar');
  if(sidebar){
   const opened=mobile.matches && sidebar.classList.contains('open');
   // En PC el estado se controla por navegación, sin restaurar una barra abierta antigua.
   if(mobile.matches)sidebar.classList.remove('pinned');
   sidebar.inert=mobile.matches&&!opened;
   sidebar.setAttribute('aria-hidden',String(mobile.matches&&!opened));
   if(mobile.matches){
    const head=sidebar.querySelector('.lg-side-head');
    if(head&&!head.querySelector('.lg-phone-close')){
     const close=document.createElement('button');
     close.type='button';close.className='lg-phone-close';
     close.dataset.action='close-menu';close.textContent='×';
     close.setAttribute('aria-label','Cerrar menú lateral');
     head.append(close);
    }
   }else sidebar.querySelector('.lg-phone-close')?.remove();
  }
  if(menu&&sidebar){menu.setAttribute('aria-controls','lgSidebar');menu.setAttribute('aria-expanded',String(mobile.matches&&sidebar.classList.contains('open')));menu.setAttribute('aria-label',sidebar.classList.contains('open')?'Cerrar menú':'Abrir menú');}
  if(mobile.matches)document.documentElement.style.setProperty('--lg-visible-height',(window.visualViewport?.height||window.innerHeight)+'px');
  else document.documentElement.style.removeProperty('--lg-visible-height');
 }
 function init(){update();new MutationObserver(update).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 window.visualViewport?.addEventListener('resize',update);window.addEventListener('resize',update);mobile.addEventListener('change',update);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobile.matches&&!document.querySelector('.modal-cover'))document.querySelector('.lotigest-shell .mobile-backdrop')?.click();});
})();
