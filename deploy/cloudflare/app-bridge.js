// Runs inside the original application closure. All writes to STORAGE use this bridge.
const CLOUD_CACHE='lotigest_d1_pending_v1';
let cloudReady=false,cloudBusy=false,cloudBlocked=false,cloudUser=null,cloudQueue=null,cloudTimer,cloudNoticeTimer,cloudNoticeKind,cloudCredential=null,cloudOffline=false,cloudRegistration=null,cloudRefreshBusy=false,cloudAuthBusy=false,cloudUserRequestedUpdate=false;
const CLOUD_PAGE_KEY='lotigest_last_page_v1';
function cloudSavedPage(owner){try{const name=String(owner||'').trim().toLowerCase(),value=localStorage.getItem(CLOUD_PAGE_KEY+':'+name);return name&&Object.prototype.hasOwnProperty.call(pages,value)?value:null;}catch{return null;}}
function cloudRestorePage(owner){const restored=cloudSavedPage(owner);if(restored)page=restored;}
document.addEventListener('click',event=>{
 const nav=event.target.closest?.('[data-page]');if(!nav||!cloudUser?.name)return;
 const target=nav.dataset.page;if(Object.prototype.hasOwnProperty.call(pages,target)){
  try{localStorage.setItem(CLOUD_PAGE_KEY+':'+cloudUser.name.toLowerCase(),target);}catch{}
 }
},true);
sessionStorage.removeItem(SESSION);
function cloudStatus(message,error=false){
 let el=document.getElementById('lotigest-cloud-status'),indicator=document.getElementById('lotigest-sync-indicator');
 if(!el){el=document.createElement('aside');el.id='lotigest-cloud-status';el.setAttribute('role','status');document.body.append(el);}
 if(!indicator){indicator=document.createElement('button');indicator.id='lotigest-sync-indicator';indicator.type='button';indicator.setAttribute('aria-live','polite');indicator.onclick=()=>{el.hidden=!el.hidden;};document.body.append(indicator);}
 const dirty=cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed);
 const kind=cloudBlocked?'conflict':error?'error':message.includes('Guardando')?'saving':dirty?'pending':message.includes('Guardado')?'saved':'info';
 indicator.textContent=cloudBlocked?'! Revisar cambios':kind==='saved'?'✓ Guardado':kind==='saving'?'↻ Guardando':dirty?'● Pendiente':cloudOffline?'● Sin conexión':'☁ Conexión';indicator.title=message;indicator.setAttribute('aria-label','Estado de sincronización: '+indicator.textContent+'. Mostrar u ocultar detalle');
 const open=kind!==cloudNoticeKind;cloudNoticeKind=kind;
 el.replaceChildren(document.createTextNode(message+' '));el.dataset.error=String(error);
 const close=document.createElement('button');close.textContent='×';close.className='cloud-notice-close';close.setAttribute('aria-label','Cerrar notificación');close.onclick=()=>{el.hidden=true;};el.append(close);
 if(cloudReady){
  const actions=dirty?[...(!cloudBlocked?[['Reintentar',()=>cloudFlush()]]:[]),['Descargar mi copia',cloudDownload],['Usar datos del servidor',cloudReload]]:[['Actualizar datos',cloudRefresh],['Guía de uso',()=>{page='help';render();}]];
  for(const [label,run] of actions){const b=document.createElement('button');b.textContent=label;b.onclick=run;el.append(b);}
 }
 if(error&&!cloudReady&&localStorage.getItem(CLOUD_CACHE)){const b=document.createElement('button');b.textContent='Descargar copia local';b.onclick=()=>download('LOTIGEST_copia_local_original.json',localStorage.getItem(CLOUD_CACHE),'application/json');el.append(b);const restore=document.createElement('button');restore.textContent='Recuperar del servidor';restore.onclick=async()=>{if(!confirm('¿Recuperar los datos del servidor? Se descargará primero la copia local original para conservarla.'))return;b.click();try{await cloudLoad({discardPending:true});}catch(e){cloudStatus(e.message,true);}};el.append(restore);}
 // Guardado y sincronización correctos son silenciosos. Los fallos graves se informan.
 const routine=!cloudBlocked&&(!error||/^(Sin conexión|No se pudo actualizar)/i.test(message));
 indicator.hidden=!cloudOffline&&!cloudBlocked&&!error;
 if(routine){el.hidden=true;clearTimeout(cloudNoticeTimer);return;}
 if(open)el.hidden=false;clearTimeout(cloudNoticeTimer);
}
async function cloudApi(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const r=await fetch('/api/app/'+path,{cache:'no-store',credentials:'same-origin',...options,signal:controller.signal,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  let result;try{result=await r.json();}catch{throw Error('Respuesta del servidor no válida. Tus cambios pendientes se conservan.');}
  if(!r.ok)throw Object.assign(Error(result.error||'No se pudo conectar.'),{status:r.status});return result;
 }catch(e){if(e.name==='AbortError')throw Error('La conexión tardó demasiado. Tus cambios siguen pendientes; puedes reintentar.');throw e;}
 finally{clearTimeout(timer);}
}
function cloudPersist(){
 const packed={...cloudQueue,cacheVersion:2,confirmed:cloudQueue.latest===cloudQueue.confirmed,
  pending:cloudQueue.pending?{...cloudQueue.pending,raw:cloudQueue.pending.raw===cloudQueue.latest?null:cloudQueue.pending.raw}:null};
 localStorage.setItem(CLOUD_CACHE,JSON.stringify(packed));
}
function cloudUnpack(raw){
 const saved=JSON.parse(raw||'null');if(saved?.cacheVersion===2){saved.confirmed=saved.confirmed?saved.latest:null;if(saved.pending?.raw===null)saved.pending.raw=saved.latest;}return saved;
}
function cloudWrite(raw){
 if(!cloudReady||cloudUser?.role==='sales')return;
 if(cloudBlocked)throw Error('Guardado pausado. Descarga el respaldo pendiente y carga los datos del servidor.');
 const old=cloudQueue.latest;cloudQueue.latest=raw;
 try{cloudPersist();}catch(e){cloudQueue.latest=old;cloudStatus('No hay espacio para conservar cambios. Descarga un respaldo.',true);throw e;}
 cloudStatus('Pendiente de guardar en D1…');clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudFlush,350);
}
async function cloudFlush(){
 if(!cloudReady||cloudBusy||cloudBlocked)return;if(cloudUser?.role==='sales')return;if(navigator.onLine===false){cloudOffline=true;cloudStatus('Sin conexión. Los cambios se conservan en este equipo y se enviarán automáticamente.');return;}cloudBusy=true;
 try{
  await cloudFlushFiles();
  while(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed){
   if(!cloudQueue.pending){cloudQueue.pending={raw:cloudQueue.latest,mutation:crypto.randomUUID(),revision:cloudQueue.revision};cloudPersist();}
   const p=cloudQueue.pending;cloudStatus('Guardando en Cloudflare D1…');
   const payload={method:'PUT',body:JSON.stringify({state:JSON.parse(p.raw),revision:p.revision,mutation:p.mutation})};
   let result;try{result=await cloudApi('state',payload);}catch(e){if(e.status!==401||!cloudCredential)throw e;await cloudApi('session',{method:'POST',body:JSON.stringify({credential:cloudCredential})});result=await cloudApi('state',payload);}
   cloudQueue.revision=result.revision;cloudQueue.confirmed=p.raw;cloudQueue.pending=null;cloudPersist();
  }
  cloudOffline=false;cloudStatus('Guardado en Cloudflare D1 · revisión '+cloudQueue.revision);
 }catch(e){if(!e.status||e.status>=500)cloudOffline=true;if(e.status===401){cloudReady=false;sessionStorage.removeItem(SESSION);render();}if([409,413,400,403].includes(e.status))cloudBlocked=true;cloudStatus(e.message||'Sin conexión. Cambios pendientes conservados en este equipo.',cloudBlocked||e.status===401);}
 finally{cloudBusy=false;}
}
function cloudDownload(){const raw=cloudQueue?.latest||JSON.stringify(db);download('LOTIGEST_respaldo_pendiente_'+dateKey(new Date())+'.json',raw,'application/json');}
async function cloudReload(){
 if(cloudBusy){toast('Espera a que termine el guardado actual.','error');return;}
 if(cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)){
  cloudDownload();if(!confirm('Se descargó tu respaldo pendiente. ¿Cargar los datos del servidor y descartar los cambios pendientes de este equipo?'))return;
 }
 cloudReady=false;cloudBlocked=false;
 try{await cloudLoad({discardPending:true});}catch(e){cloudReady=Boolean(cloudQueue);cloudBlocked=true;cloudStatus(e.message,true);}
}
function cloudEmpty(){return {version:3,created:dateKey(new Date()),company:{name:'GRUPO H',location:'Honduras',phone:'',email:'',documentBrandVersion:1},lots:[],clients:[],sales:[],payments:[]};}
async function cloudLoad({discardPending=false,preservePage=true}={}){
 const previousPage=page;
 const remote=await cloudApi('state');cloudUser=remote.user;
 let saved=null;if(!discardPending){try{saved=cloudUnpack(localStorage.getItem(CLOUD_CACHE));}catch{throw Object.assign(Error('La copia local pendiente no pudo leerse y se conservó intacta. Descárgala antes de recuperar los datos del servidor.'),{status:422});}}
 if(!discardPending&&saved&&saved.owner===cloudUser.name&&(saved.pending||saved.latest!==saved.confirmed)){
  cloudQueue=saved;db=readStoredLotigest(saved.latest);await prepareOfficialBackgrounds();cloudReady=true;sessionStorage.setItem(SESSION,'yes');if(page==='dashboard')cloudRestorePage(cloudUser.name);render();await cloudFlush();if(!cloudBlocked&&cloudReady&&!cloudQueue.pending&&cloudQueue.latest===cloudQueue.confirmed)await cloudLoad();return;
 }
 if(saved&&saved.owner!==cloudUser.name&&(saved.pending||saved.latest!==saved.confirmed))localStorage.setItem(CLOUD_CACHE+'_recovery_'+crypto.randomUUID(),JSON.stringify(saved));
 db=remote.state?readStoredLotigest(JSON.stringify(remote.state)):cloudEmpty();
 cloudQueue={owner:cloudUser.name,revision:remote.revision,confirmed:remote.state?JSON.stringify(db):null,latest:JSON.stringify(db),pending:null};
 cloudPersist();await prepareOfficialBackgrounds();cloudReady=true;sessionStorage.setItem(SESSION,'yes');page=preservePage?previousPage:'dashboard';if(page==='dashboard')cloudRestorePage(cloudUser.name);cloudOffline=false;render();
 // render may initialize the built-in inventory; persist the resulting state.
 cloudWrite(JSON.stringify(db));await cloudFlush();
 if(cloudUser?.role==='admin')setTimeout(refreshClientRequests,250);
 /* Las copias antiguas se revisan solo desde Respaldo. */
}
function cloudImportOffer(){
 sessionStorage.setItem('lotigest_migration_offer_seen','yes');
 const raw=localStorage.getItem(STORAGE);if(!raw){toast('No hay una copia anterior en este navegador.','error');return;}
 let info;try{info=validateLotigestBackup(JSON.parse(raw));}catch(e){toast('La copia anterior requiere revisión. Descárgala antes de importar.','error');download('LOTIGEST_copia_anterior.json',raw,'application/json');return;}
 showModal('Revisar tu copia anterior',`<p>Se conservó la información anterior de este navegador. Puede incluir datos de demostración: revísala antes de importarla.</p><p><strong>${info.clients} clientes · ${info.lots} terrenos · ${info.sales} ventas · ${info.payments} abonos.</strong></p><p>Importar reemplaza los registros actuales de D1 por esta copia completa. Los PDF antiguos deben adjuntarse de nuevo desde sus archivos originales.</p><button class="btn btn-outline" id="cloud-old-backup">Descargar copia para revisar</button> <button class="btn btn-primary" id="cloud-old-import">Importar esta copia a D1</button>`);
 document.getElementById('cloud-old-backup').onclick=()=>download('LOTIGEST_copia_anterior.json',raw,'application/json');
 document.getElementById('cloud-old-import').onclick=async()=>{
  if(cloudBusy||cloudBlocked){toast('Resuelve primero el guardado pendiente.','error');return;}
  if(!confirm('¿Importar esta copia completa al servidor? Se descargará antes un respaldo del estado actual.'))return;
  download('LOTIGEST_antes_de_importar.json',JSON.stringify(db),'application/json');
  try{const next=readStoredLotigest(raw);cloudWrite(JSON.stringify(next));db=next;closeModal();render();await cloudFlush();}catch(e){toast(e.message,'error');}
 };
}
document.addEventListener('click',e=>{if(e.target.closest('#cloud-local-review'))cloudImportOffer();});
async function cloudLogin(form){
 cloudAuthBusy=true;const button=form.querySelector('button[type="submit"],.login-submit');if(button)button.disabled=true;
 const d=new FormData(form),username=String(d.get('user')||'').trim().toLowerCase(),password=String(d.get('password')||'');
 try{
  const credential=await lotigestAccess.credential(username,password);const login=await cloudApi('session',{method:'POST',body:JSON.stringify({credential})});cloudUser=login.user;cloudCredential=credential;cloudBlocked=false;sessionStorage.removeItem('lotigest_signed_out');
  try{const r=await fetch('/api/d1/users?'+new URLSearchParams({username}),{cache:'no-store'});if(r.ok){const {salt}=await r.json();await cloudRememberLogin(username,salt,credential);}}catch{}
  form.reset();await cloudLoad();
 }catch(e){
  if(!e.status||e.status>=500){try{await cloudOfflineUnlock(username,password);return;}catch(offline){e=offline;}}
  cloudStatus(e.message,true);toast(e.message,'error');
 }finally{cloudAuthBusy=false;if(button)button.disabled=false;}
}
async function cloudLogout(){
 await cloudFlush();if(cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)){if(!confirm('Hay cambios pendientes. Se conservarán en este equipo para enviarlos cuando vuelvas a entrar. ¿Cerrar sesión?'))return;}
 sessionStorage.setItem('lotigest_signed_out','yes');
 try{await cloudApi('session',{method:'DELETE'});sessionStorage.removeItem('lotigest_signed_out');}catch{}
 cloudReady=false;cloudQueue=null;cloudCredential=null;cloudOffline=false;sessionStorage.removeItem(SESSION);db=cloudEmpty();page='dashboard';render();cloudStatus('Sesión cerrada. Los datos del servidor y la copia pendiente se conservaron.');
}
async function cloudBoot(){
 if(cloudAuthBusy)return;
 if(sessionStorage.getItem('lotigest_signed_out')==='yes'){try{await cloudApi('session',{method:'DELETE'});sessionStorage.removeItem('lotigest_signed_out');}catch{}return;}
 cloudStatus('Comprobando conexión con Cloudflare…');
 try{if(navigator.onLine===false)throw Error('Sin conexión');await cloudApi('session');if(!cloudAuthBusy)await cloudLoad();}catch(e){cloudStatus(e.status===401?'Inicia sesión.':e.status&&e.status<500?e.message:'Sin conexión. Puedes entrar con tu contraseña si preparaste una copia local.',Boolean(e.status!==401&&navigator.onLine!==false));}
}
window.addEventListener('online',()=>{cloudRefresh();cloudFlush();});
window.addEventListener('focus',()=>{cloudRefresh();});
window.addEventListener('beforeunload',e=>{if(cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)){e.preventDefault();e.returnValue='Hay cambios pendientes de guardar.';}});
setInterval(()=>{if(cloudReady&&!cloudBlocked)cloudFlush();},15000);
setInterval(()=>{cloudRefresh();},60000);
function cloudUsersPage(){return `${header('Cuenta del servidor','Acceso privado conectado a D1.')}<div class="card card-padding"><p>Sesión: <strong>${esc(cloudUser?.name||'')}</strong> · ${cloudUser?.role==='sales'?'Vendedor · catálogo de consulta':'Administrador'}</p>${cloudUser?.role==='admin'?accountCreationForm():''}<form id="cloud-password-form"><label>Contraseña actual<input name="current" type="password" autocomplete="current-password" required></label><label>Nueva contraseña (mínimo 14 caracteres)<input name="password" type="password" minlength="14" maxlength="128" autocomplete="new-password" required></label><label>Confirmar nueva contraseña<input name="confirm" type="password" minlength="14" maxlength="128" autocomplete="new-password" required></label><button class="btn btn-primary">Cambiar contraseña</button><p id="cloud-password-result" role="status"></p></form></div>`;}
document.addEventListener('submit',async e=>{
 if(e.target.id!=='cloud-password-form')return;e.preventDefault();const form=e.target,button=form.querySelector('button'),output=form.querySelector('#cloud-password-result');button.disabled=true;
 try{
  const d=new FormData(form);if(d.get('password')!==d.get('confirm'))throw Error('Las contraseñas no coinciden.');
  const current=await lotigestAccess.credential(cloudUser.name,d.get('current'));
  const salt=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const token=await derive(d.get('password'),salt),token_hash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  await cloudApi('password',{method:'PUT',body:JSON.stringify({current,salt,token_hash})});cloudCredential=token;await cloudRememberLogin(cloudUser.name,salt,token);form.reset();output.textContent='Contraseña actualizada. Las demás sesiones se cerraron.';
 }catch(error){output.textContent=error.message;}finally{button.disabled=false;}
});

for(const event of ['submit','change'])document.addEventListener(event,e=>{if(!cloudBlocked||e.target.closest?.('#login-form,#cloud-password-form'))return;e.preventDefault();e.stopImmediatePropagation();toast('Guardado pausado: descarga el respaldo pendiente y carga los datos del servidor.','error');},true);
document.addEventListener('click',e=>{if(!cloudBlocked)return;const action=e.target.closest('[data-action]');if(!action||['close-modal','print-doc','backup-export','menu','close-menu'].includes(action.dataset.action))return;e.preventDefault();e.stopImmediatePropagation();toast('Resuelve el guardado pendiente antes de modificar datos.','error');},true);
async function cloudPdfStore(mode,operation){
 let result;
 const store={put(file,key){result=(async()=>{if(file.size>12*1024*1024)throw Error('El PDF supera 12 MB. Reduce su tamaño antes de adjuntarlo.');if(!window.lotigestFiles)throw Error('El almacenamiento de documentos no está disponible.');await lotigestFiles.queue(key,file);cloudStatus('Documento conservado en este equipo; pendiente de sincronizar.');return key;})();return {};},get(key){result=(async()=>{const local=await window.lotigestFiles?.get(key);if(local)return local;const r=await fetch('/api/app/file?'+new URLSearchParams({key}),{cache:'no-store'});if(!r.ok){const msg=await r.json();throw Error(msg.error);}const file=await r.blob();await window.lotigestFiles?.cache(key,file);return file;})();return {};},delete(){result=Promise.resolve();return {};}};
 operation(store);return result;
}
async function cloudFlushFiles(){
 if(!window.lotigestFiles||cloudUser?.role==='sales')return;
 for(const row of await lotigestFiles.pending()){
  cloudStatus('Subiendo documento pendiente…');
  try{await cloudApi('file?'+new URLSearchParams({key:row.key}),{method:'PUT',headers:{'Content-Type':['application/pdf','image/png','image/jpeg','image/webp'].includes(row.file.type)?row.file.type:'application/pdf'},body:row.file});}
  catch(e){if(e.status!==401||!cloudCredential)throw e;await cloudApi('session',{method:'POST',body:JSON.stringify({credential:cloudCredential})});await cloudApi('file?'+new URLSearchParams({key:row.key}),{method:'PUT',headers:{'Content-Type':['application/pdf','image/png','image/jpeg','image/webp'].includes(row.file.type)?row.file.type:'application/pdf'},body:row.file});}
  await lotigestFiles.complete(row.key);
 }
}
window.addEventListener('storage',e=>{
 if(e.key!==CLOUD_CACHE||!cloudReady||!cloudQueue||!e.newValue)return;
 let other;try{other=cloudUnpack(e.newValue);}catch{return;}
 if(other.owner===cloudQueue.owner&&other.latest===cloudQueue.latest)return;
 if(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed){
  const rescue=CLOUD_CACHE+'_recovery_'+crypto.randomUUID();
  try{localStorage.setItem(rescue,JSON.stringify(cloudQueue));}catch{cloudDownload();}
  cloudBlocked=true;cloudStatus('Otra pestaña cambió la copia local. Se conservó una copia de recuperación. Descarga tus cambios antes de cargar el servidor.',true);
 }
});
function cloudHelpPage(){if(cloudUser?.role==='sales')return sellerHelpPage();return `${header('Guía de uso','Empieza aquí y sigue este recorrido para registrar una operación.')}<p id="cloud-offline-readiness">${'serviceWorker' in navigator?(navigator.serviceWorker.controller?'Inicio sin conexión preparado en este equipo.':'Preparando el inicio sin conexión; mantén esta pestaña conectada hasta que termine.'):'Este navegador no permite preparar el arranque sin conexión.'}</p><div class="card card-padding"><ol class="cloud-guide"><li><strong>Selecciona la residencial.</strong> Usa Residenciales para agregarla y el selector superior para trabajar en la correcta.</li><li><strong>Prepara el terreno.</strong> En Terrenos / Predios revisa bloque, número, medidas, área y precio. Los solares sin precio o área no pueden venderse.</li><li><strong>Registra al cliente.</strong> En Clientes agrega nombre, identidad y contacto. Busca primero para evitar duplicados.</li><li><strong>Aparta o vende.</strong> Abre el solar en el mapa, selecciona al cliente y elige Apartado, Contado o Crédito. Revisa prima, fecha y plazo antes de confirmar.</li><li><strong>Registra el abono.</strong> En Cuotas y pagos elige registro normal o OCR. Con OCR revisa el monto y el cliente detectados antes de confirmar; la foto no se archiva.</li><li><strong>Comprueba el recibo y el guardado.</strong> Abre Recibos para descargar o compartir. El guardado se hace automáticamente. Si estás sin conexión, los movimientos quedan pendientes y se envían cuando regrese internet; si hay un conflicto, revisa la advertencia antes de continuar.</li></ol><p>Si el servidor detecta cambios de otra sesión, descarga tu copia y usa «Usar datos del servidor». Nunca se sobrescriben esos cambios automáticamente.</p><p>Sin internet, tus cambios quedan pendientes en este equipo y se envían automáticamente cuando vuelve la conexión. Después de abrirlo una vez con internet y preparar la copia de este equipo, puedes volver a abrirlo sin red e iniciar sesión con tu contraseña. El acceso sin conexión debe renovarse con internet cada siete días.</p><p>En Respaldo puedes exportar tus datos o revisar la copia anterior del navegador. Los PDF se adjuntan aparte y admiten hasta 12 MB por archivo. El OCR y los mapas de fondo necesitan haberse descargado previamente; WhatsApp y las funciones externas requieren internet.</p><p>Los administradores gestionan registros y las cuentas de vendedor consultan el catálogo sin datos personales ni cobros. Los recordatorios automáticos de WhatsApp y el mapa público requieren terminar su integración; compartir un recibo es una acción manual.</p><button class="btn btn-primary" data-page="clients">Ir a Clientes</button> <button class="btn btn-outline" data-page="lots">Ir a Terrenos</button> <button class="btn btn-outline" data-page="payments">Ir a Cuotas y pagos</button></div>`;}

function cloudRecoveryCopies(){
 const copies=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key.startsWith(CLOUD_CACHE+'_recovery_'))continue;try{const q=cloudUnpack(localStorage.getItem(key));if(q?.owner===cloudUser?.name&&q.latest)copies.push({key,raw:q.latest});}catch{}}
 showModal('Copias locales de recuperación',copies.length?'<p>Descarga y revisa estas copias antes de importarlas desde Respaldo. No se fusionan automáticamente.</p>'+copies.map((c,i)=>'<button class="btn btn-outline" data-recovery-index="'+i+'">Descargar copia '+(i+1)+'</button>').join(' '):'<p>No hay copias adicionales pendientes en este navegador.</p>');
 document.querySelectorAll('[data-recovery-index]').forEach(b=>b.onclick=()=>download('LOTIGEST_recuperacion_'+(Number(b.dataset.recoveryIndex)+1)+'.json',copies[Number(b.dataset.recoveryIndex)].raw,'application/json'));
}
document.addEventListener('click',e=>{if(e.target.closest('#cloud-recovery-copies'))cloudRecoveryCopies();});

const CLOUD_PROFILE='lotigest_offline_profile_v1';
async function cloudVerifier(credential,nonce){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(credential+':'+nonce));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
async function cloudRememberLogin(username,salt,credential){const nonce=crypto.randomUUID();localStorage.setItem(CLOUD_PROFILE,JSON.stringify({username,salt,nonce,verifier:await cloudVerifier(credential,nonce),verifiedAt:Date.now(),role:cloudUser?.role||'admin'}));}
async function cloudOfflineUnlock(username,password){
 let profile;try{profile=JSON.parse(localStorage.getItem(CLOUD_PROFILE)||'null');}catch{}
 if(!profile||profile.username!==username||!['admin','sales'].includes(profile.role)||!Number.isFinite(profile.verifiedAt)||!/^[a-f0-9]{64}$/.test(profile.salt||'')||!/^[a-f0-9]{64}$/.test(profile.verifier||'')||Date.now()-profile.verifiedAt>7*86400000)throw Error('Este equipo no tiene acceso sin conexión vigente. Conéctate e inicia sesión una vez para prepararlo.');
 const credential=await derive(password,profile.salt),actual=await cloudVerifier(credential,profile.nonce);let difference=actual.length^profile.verifier.length;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^profile.verifier.charCodeAt(i);
 if(difference)throw Error('Usuario o contraseña incorrectos para la copia sin conexión.');
 const saved=cloudUnpack(localStorage.getItem(CLOUD_CACHE));if(!saved||saved.owner!==username)throw Error('No hay datos guardados de esta cuenta en el equipo.');
 cloudQueue=saved;cloudUser={name:username,role:profile.role};cloudCredential=credential;cloudOffline=true;cloudReady=true;cloudBlocked=false;db=readStoredLotigest(saved.latest);await prepareOfficialBackgrounds();sessionStorage.setItem(SESSION,'yes');cloudRestorePage(username);render();cloudStatus('Sin conexión. Puedes trabajar; los cambios se enviarán automáticamente al volver internet.');
}
async function cloudRefresh(){
 if(cloudAuthBusy||cloudRefreshBusy||cloudBusy||cloudBlocked||navigator.onLine===false)return;
 if(!cloudReady){if(cloudCredential)await cloudBoot();return;}
 cloudRefreshBusy=true;
 try{
  await cloudFlush();
  if(cloudBlocked||!cloudReady||cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)return;
  let check;try{check=await cloudApi('state?revision=1');}catch(e){if(e.status!==401||!cloudCredential)throw e;await cloudApi('session',{method:'POST',body:JSON.stringify({credential:cloudCredential})});check=await cloudApi('state?revision=1');}
  if(check.revision!==cloudQueue.revision&&!activeModal)await cloudLoad({preservePage:true});
  cloudOffline=false;cloudStatus('Datos sincronizados automáticamente.');
 }catch(e){cloudOffline=true;cloudStatus('No se pudo actualizar. Se conservaron los datos de este equipo; se reintentará automáticamente.');}
 finally{cloudRefreshBusy=false;}
}
function cloudActivateUpdate(){if(!cloudUserRequestedUpdate||cloudAuthBusy||document.querySelector('#login-form [name=password]')?.value)return;const dirty=cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed);if(cloudRegistration?.waiting&&!dirty&&!activeModal)cloudRegistration.waiting.postMessage({type:'ACTIVATE_UPDATE'});}
async function cloudPrepareOffline(){
 if(!('serviceWorker' in navigator))return;
 try{
  const hadController=Boolean(navigator.serviceWorker.controller);let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(cloudUserRequestedUpdate&&hadController&&!reloaded&&!(cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed))&&!activeModal){reloaded=true;location.reload();}});
  cloudRegistration=await navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'});navigator.serviceWorker.ready.then(()=>{const label=document.getElementById('cloud-offline-readiness');if(label)label.textContent='Inicio sin conexión preparado en este equipo.';});
 }catch{cloudStatus('No se pudo preparar el arranque sin conexión. El guardado sigue disponible; vuelve a intentar con internet.',true);}
}

async function cloudManualUpdate(){
 if(navigator.onLine===false){toast('Necesitas internet para actualizar LOTIGEST.','error');return;}
 if(cloudBlocked||cloudBusy||(cloudQueue&&(cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed))){
  cloudStatus('Hay cambios de pagos pendientes o un conflicto. Sincronízalos o descárgalos antes de instalar una versión.',true);
  return;
 }
 try{
  const response=await fetch('/version.json?manual='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('No se pudo comprobar la versión publicada.');
  const info=await response.json();
  if(typeof info.version!=='string'||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(info.version))throw Error('Versión del servidor inválida.');
  const current=CLOUD_BUILD_VERSION.split('.').map(Number),latest=info.version.split('.').map(Number);
  const newer=latest.some((v,i)=>v>current[i]&&latest.slice(0,i).every((n,j)=>n===current[j]));
  if(!confirm(newer?'¿Instalar LOTIGEST '+info.version+'? La pantalla se recargará sin eliminar pagos.':'Tienes la versión '+CLOUD_BUILD_VERSION+'. ¿Volver a cargarla desde internet para reparar la pantalla?'))return;
  cloudUserRequestedUpdate=true;
  const registration='serviceWorker' in navigator?(cloudRegistration||await navigator.serviceWorker.getRegistration()):null;
  if(registration){
   await registration.update();
   if(registration.installing){
    const installing=registration.installing;
    await Promise.race([
     new Promise(resolve=>{
      const check=()=>{
       if(['installed','redundant','activated'].includes(installing.state)){
        installing.removeEventListener('statechange',check);resolve();
       }
      };
      installing.addEventListener('statechange',check);check();
     }),
     new Promise(resolve=>setTimeout(resolve,4500))
    ]);
   }
   if(registration.waiting){
    const controllerChanged=new Promise(resolve=>{
     const done=()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);resolve();};
     navigator.serviceWorker.addEventListener('controllerchange',done);
     setTimeout(done,4500);
    });
    registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
    await controllerChanged;
   }
  }
  // La navegación lleva un parámetro nuevo; el Service Worker obtiene la página de la red.
  // Es una acción exclusivamente manual, nunca desde el guardado ni al entrar.
  location.replace('/?lotigestVersion='+encodeURIComponent(info.version)+'&manual='+Date.now());
 }catch(error){
  cloudUserRequestedUpdate=false;
  toast(error.message||'No se pudo completar la actualización.','error');
 }
}

document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-action="cloud-manual-update"]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(button.disabled)return;
 button.disabled=true;
 Promise.resolve(cloudManualUpdate()).finally(()=>{if(button.isConnected)button.disabled=false;});
},true);

setTimeout(cloudPrepareOffline,0);
