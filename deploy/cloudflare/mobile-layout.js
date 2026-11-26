// Presentation only; desktop layout and all saved business data stay untouched.
(()=>{
 const mobile=matchMedia('(max-width:900px)');
 let queued=false;
 function setAttr(el,key,value){if(el.getAttribute(key)!==value)el.setAttribute(key,value);}
 function update(){
  const menu=document.querySelector('.lg-mobile-menu'),sidebar=document.getElementById('lgSidebar');
  if(sidebar){
   const opened=mobile.matches && sidebar.classList.contains('open');
   // En PC el estado se controla por navegación, sin restaurar una barra abierta antigua.
   if(mobile.matches)sidebar.classList.remove('pinned');
   const inert=mobile.matches&&!opened;if(sidebar.inert!==inert)sidebar.inert=inert;
   setAttr(sidebar,'aria-hidden',String(inert));
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
  if(menu&&sidebar){setAttr(menu,'aria-controls','lgSidebar');setAttr(menu,'aria-expanded',String(mobile.matches&&sidebar.classList.contains('open')));setAttr(menu,'aria-label',sidebar.classList.contains('open')?'Cerrar menú':'Abrir menú');}
  const style=document.documentElement.style,height=(window.visualViewport?.height||window.innerHeight)+'px';
  if(mobile.matches){if(style.getPropertyValue('--lg-visible-height')!==height)style.setProperty('--lg-visible-height',height);}
  else if(style.getPropertyValue('--lg-visible-height'))style.removeProperty('--lg-visible-height');
 }
 function schedule(){if(queued)return;queued=true;const run=()=>{queued=false;update();};if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(run);else queueMicrotask(run);}
 function relevant(records){return records.some(r=>r.type==='attributes'?r.target.id==='lgSidebar':[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.('#lgSidebar,.lg-mobile-menu,.lg-side-head')||n.querySelector?.('#lgSidebar,.lg-mobile-menu,.lg-side-head'))));}
 function init(){update();new MutationObserver(records=>{if(relevant(records))schedule();}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 window.visualViewport?.addEventListener('resize',schedule);window.addEventListener('resize',schedule);mobile.addEventListener('change',schedule);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobile.matches&&!document.querySelector('.modal-cover'))document.querySelector('.lotigest-shell .mobile-backdrop')?.click();});
})();
