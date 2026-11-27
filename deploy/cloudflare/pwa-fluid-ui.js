// Device-local presentation and installation. Never alters records or save queues.
(function installLotigestFluidMode(){
 const key='lotigest-fluid-mode-v1';let enabled=true,installPrompt=null,installed=false;
 const standalone=window.matchMedia?.('(display-mode: standalone)');
 try{enabled=localStorage.getItem(key)!=='off';}catch{}
 function isInstalled(){return installed||Boolean(standalone?.matches)||navigator.standalone===true;}
 function paint(){
  document.documentElement.classList.toggle('lg-fluid-mode',enabled);
  for(const button of document.querySelectorAll('[data-lg-fluid-toggle]')){button.setAttribute('aria-pressed',String(enabled));button.textContent='Modo fluido: '+(enabled?'activo':'desactivado');}
  for(const button of document.querySelectorAll('[data-lg-install-app]')){button.disabled=isInstalled();button.textContent=isInstalled()?'Aplicación instalada':'Instalar aplicación';}
 }
 const originalSettings=settingsPage;
 settingsPage=function(...args){return originalSettings(...args)+'<section class="card card-padding lg-app-settings"><h3>Aplicación de LOTIGEST</h3><p>Instala el acceso en tu equipo y usa el modo fluido para reducir efectos visuales.</p><div class="lg-app-actions"><button type="button" class="btn btn-primary" data-lg-install-app '+(isInstalled()?'disabled':'')+'>'+(isInstalled()?'Aplicación instalada':'Instalar aplicación')+'</button><button type="button" class="btn btn-outline" data-lg-fluid-toggle aria-pressed="'+enabled+'">Modo fluido: '+(enabled?'activo':'desactivado')+'</button></div></section>';};
 window.addEventListener('beforeinstallprompt',event=>{if(typeof event.prompt!=='function')return;event.preventDefault();installPrompt=event;paint();});
 window.addEventListener('appinstalled',()=>{installed=true;installPrompt=null;paint();});
 standalone?.addEventListener?.('change',paint);
 document.addEventListener('click',async event=>{
  const toggle=event.target.closest?.('[data-lg-fluid-toggle]');
  if(toggle){enabled=!enabled;try{localStorage.setItem(key,enabled?'on':'off');}catch{}paint();return;}
  const button=event.target.closest?.('[data-lg-install-app]');if(!button||button.disabled)return;
  if(!installPrompt){toast('En el menú de Chrome elige «Instalar aplicación» o «Añadir a pantalla de inicio».');return;}
  const prompt=installPrompt;installPrompt=null;button.disabled=true;
  try{await prompt.prompt();await prompt.userChoice;}catch{toast('No se pudo abrir la instalación. Usa el menú del navegador.','error');}finally{paint();}
 });
 paint();
})();
