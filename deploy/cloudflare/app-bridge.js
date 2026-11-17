// Runs inside the original application closure. All writes to STORAGE use this bridge.
const CLOUD_CACHE='lotigest_d1_pending_v1';
let cloudReady=false,cloudBusy=false,cloudBlocked=false,cloudUser=null,cloudQueue=null,cloudTimer;
sessionStorage.removeItem(SESSION);
function cloudStatus(message,error=false){
 let el=document.getElementById('lotigest-cloud-status');
 if(!el){el=document.createElement('aside');el.id='lotigest-cloud-status';el.setAttribute('role','status');document.body.append(el);}
 el.replaceChildren(document.createTextNode(message+' '));el.dataset.error=String(error);
 if(cloudReady){for(const [label,run] of [['Reintentar',()=>cloudFlush()],['Respaldo pendiente',cloudDownload],['Cargar servidor',cloudReload]]){const b=document.createElement('button');b.textContent=label;b.onclick=run;el.append(b);}}
}
async function cloudApi(path,options={}){
 const r=await fetch('/api/app/'+path,{cache:'no-store',credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
 let result;try{result=await r.json();}catch{throw Error('Respuesta del servidor no válida. Tus datos pendientes se conservan.');}
 if(!r.ok)throw Object.assign(Error(result.error||'No se pudo conectar.'),{status:r.status});return result;
}
function cloudPersist(){localStorage.setItem(CLOUD_CACHE,JSON.stringify(cloudQueue));}
function cloudWrite(raw){
 if(!cloudReady)return;
 if(cloudBlocked)throw Error('Guardado pausado. Descarga el respaldo pendiente y carga los datos del servidor.');
 const old=cloudQueue.latest;cloudQueue.latest=raw;
 try{cloudPersist();}catch(e){cloudQueue.latest=old;cloudStatus('No hay espacio para conservar cambios. Descarga un respaldo.',true);throw e;}
 cloudStatus('Pendiente de guardar en D1…');clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudFlush,350);
}
async function cloudFlush(){
 if(!cloudReady||cloudBusy||cloudBlocked)return;cloudBusy=true;
 try{
  while(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed){
   if(!cloudQueue.pending){cloudQueue.pending={raw:cloudQueue.latest,mutation:crypto.randomUUID(),revision:cloudQueue.revision};cloudPersist();}
   const p=cloudQueue.pending;cloudStatus('Guardando en Cloudflare D1…');
   const result=await cloudApi('state',{method:'PUT',body:JSON.stringify({state:JSON.parse(p.raw),revision:p.revision,mutation:p.mutation})});
   cloudQueue.revision=result.revision;cloudQueue.confirmed=p.raw;cloudQueue.pending=null;cloudPersist();
  }
  cloudStatus('Guardado en Cloudflare D1 · revisión '+cloudQueue.revision);
 }catch(e){if(e.status===401){cloudReady=false;sessionStorage.removeItem(SESSION);render();}if([409,413,400,403].includes(e.status))cloudBlocked=true;cloudStatus(e.message||'Sin conexión. Cambios pendientes conservados en este equipo.',true);}
 finally{cloudBusy=false;}
}
function cloudDownload(){const raw=cloudQueue?.latest||JSON.stringify(db);download('LOTIGEST_respaldo_pendiente_'+dateKey(new Date())+'.json',raw,'application/json');}
async function cloudReload(){
 if(cloudBusy){toast('Espera a que termine el guardado actual.','error');return;}
 if(cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)){
  cloudDownload();if(!confirm('Se descargó tu respaldo pendiente. ¿Cargar los datos del servidor y descartar los cambios pendientes de este equipo?'))return;
 }
 cloudReady=false;cloudBlocked=false;
 try{await cloudLoad();}catch(e){cloudStatus(e.message,true);}
}
function cloudEmpty(){return {version:3,created:dateKey(new Date()),company:{name:'GRUPO H',location:'Honduras',phone:'',email:'',documentBrandVersion:1},lots:[],clients:[],sales:[],payments:[]};}
async function cloudLoad(){
 const remote=await cloudApi('state');cloudUser=remote.user;
 let saved=null;try{saved=JSON.parse(localStorage.getItem(CLOUD_CACHE)||'null');}catch{}
 if(saved&&saved.owner===cloudUser.name&&(saved.pending||saved.latest!==saved.confirmed)){
  cloudQueue=saved;db=readStoredLotigest(saved.latest);cloudReady=true;sessionStorage.setItem(SESSION,'yes');render();await cloudFlush();if(!cloudBlocked&&cloudReady&&!cloudQueue.pending&&cloudQueue.latest===cloudQueue.confirmed)await cloudLoad();return;
 }
 db=remote.state?readStoredLotigest(JSON.stringify(remote.state)):cloudEmpty();
 cloudQueue={owner:cloudUser.name,revision:remote.revision,confirmed:remote.state?JSON.stringify(db):null,latest:JSON.stringify(db),pending:null};
 cloudPersist();cloudReady=true;sessionStorage.setItem(SESSION,'yes');page='dashboard';render();
 // render may initialize the built-in inventory; persist the resulting state.
 cloudWrite(JSON.stringify(db));await cloudFlush();
 if(!remote.state&&localStorage.getItem(STORAGE))setTimeout(cloudImportOffer,50);
}
function cloudImportOffer(){
 showModal('Conservar tus datos anteriores',`<p>El servidor inició sin datos de ejemplo. Tu copia anterior de este navegador sigue intacta.</p><p>Puedes descargarla y revisarla antes de importarla desde Respaldo. No se importará ni reemplazará información automáticamente.</p><button class="btn btn-primary" id="cloud-old-backup">Descargar copia anterior</button>`);
 document.getElementById('cloud-old-backup').onclick=()=>download('LOTIGEST_copia_anterior.json',localStorage.getItem(STORAGE),'application/json');
}
async function cloudLogin(form){
 const button=form.querySelector('button[type="submit"],.login-submit');if(button)button.disabled=true;
 try{const d=new FormData(form);const credential=await lotigestAccess.credential(d.get('user'),d.get('password'));await cloudApi('session',{method:'POST',body:JSON.stringify({credential})});form.reset();await cloudLoad();toast('Sesión conectada a Cloudflare D1');}
 catch(e){cloudStatus(e.message,true);toast(e.message,'error');}finally{if(button)button.disabled=false;}
}
async function cloudLogout(){
 await cloudFlush();if(cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)){toast('Hay cambios pendientes. Guarda o descarga el respaldo antes de salir.','error');return;}
 try{await cloudApi('session',{method:'DELETE'});cloudReady=false;cloudQueue=null;sessionStorage.removeItem(SESSION);db=cloudEmpty();page='dashboard';render();cloudStatus('Sesión cerrada. Los datos permanecen en D1.');}catch(e){toast(e.message,'error');}
}
async function cloudBoot(){
 cloudStatus('Comprobando conexión con Cloudflare…');
 try{await cloudApi('session');await cloudLoad();}catch(e){cloudStatus(e.status===401?'Inicia sesión para consultar y guardar en Cloudflare D1.':e.message,Boolean(e.status!==401));}
}
window.addEventListener('online',()=>{cloudFlush();});
window.addEventListener('beforeunload',e=>{if(cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)){e.preventDefault();e.returnValue='Hay cambios pendientes de guardar.';}});
setInterval(()=>{if(cloudReady&&!cloudBlocked)cloudFlush();},15000);
function cloudUsersPage(){return `${header('Cuenta del servidor','Acceso privado de administración conectado a D1.')}<div class="card card-padding"><p>Sesión: <strong>${esc(cloudUser?.name||'')}</strong> · Administrador</p><form id="cloud-password-form"><label>Contraseña actual<input name="current" type="password" autocomplete="current-password" required></label><label>Nueva contraseña (mínimo 14 caracteres)<input name="password" type="password" minlength="14" maxlength="128" autocomplete="new-password" required></label><label>Confirmar nueva contraseña<input name="confirm" type="password" minlength="14" maxlength="128" autocomplete="new-password" required></label><button class="btn btn-primary">Cambiar contraseña</button><p id="cloud-password-result" role="status"></p></form></div>`;}
document.addEventListener('submit',async e=>{
 if(e.target.id!=='cloud-password-form')return;e.preventDefault();const form=e.target,button=form.querySelector('button'),output=form.querySelector('#cloud-password-result');button.disabled=true;
 try{
  const d=new FormData(form);if(d.get('password')!==d.get('confirm'))throw Error('Las contraseñas no coinciden.');
  const current=await lotigestAccess.credential(cloudUser.name,d.get('current'));
  const salt=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const token=await derive(d.get('password'),salt),token_hash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  await cloudApi('password',{method:'PUT',body:JSON.stringify({current,salt,token_hash})});form.reset();output.textContent='Contraseña actualizada. Las demás sesiones se cerraron.';
 }catch(error){output.textContent=error.message;}finally{button.disabled=false;}
});

for(const event of ['submit','change'])document.addEventListener(event,e=>{if(!cloudBlocked||e.target.closest?.('#login-form,#cloud-password-form'))return;e.preventDefault();e.stopImmediatePropagation();toast('Guardado pausado: descarga el respaldo pendiente y carga los datos del servidor.','error');},true);
document.addEventListener('click',e=>{if(!cloudBlocked)return;const action=e.target.closest('[data-action]');if(!action||['close-modal','print-doc','backup-export','menu','close-menu'].includes(action.dataset.action))return;e.preventDefault();e.stopImmediatePropagation();toast('Resuelve el guardado pendiente antes de modificar datos.','error');},true);
async function cloudPdfStore(mode,operation){
 let result;
 const store={put(file,key){result=(async()=>{if(file.size>8*1024*1024)throw Error('El PDF supera 8 MB. Reduce su tamaño antes de adjuntarlo.');await cloudApi('file?'+new URLSearchParams({key}),{method:'PUT',headers:{'Content-Type':'application/pdf'},body:file});return key;})();return {};},get(key){result=(async()=>{const r=await fetch('/api/app/file?'+new URLSearchParams({key}),{cache:'no-store'});if(!r.ok){const msg=await r.json();throw Error(msg.error);}return r.blob();})();return {};},delete(key){result=cloudApi('file?'+new URLSearchParams({key}),{method:'DELETE'});return {};}};
 operation(store);return result;
}
