(function installLotigestKeyboardShortcuts(){
 'use strict';
 const defs=[
  ['contracts','Contratos','contracts','c'],
  ['single','Abono individual',null,'a'],
  ['multi','Abonos varios',null,'b'],
  ['collections','Residenciales y abonos','collections','r'],
  ['lots','Terrenos','lots','t'],
  ['dashboard','Panel principal','dashboard','p'],
  ['clients','Clientes','clients',''],
  ['payments','Cuotas y pagos','payments',''],
  ['receipts','Recibos','receipts',''],
  ['finance','Finanzas','finance',''],
  ['gps','Mapa GPS','gps',''],
  ['residences','Residenciales','residences',''],
  ['reports','Reportes','reports',''],
  ['pending','Pendientes','pending',''],
  ['settings','Configuración','settings','']
 ];
 const defaults=()=>({order:defs.map(d=>d[0]),keys:Object.fromEntries(defs.map(d=>[d[0],d[3]?'ctrl+'+d[3]:'']))});
 let draft=null,draftUser=null,captureId=null,dragId=null,moreOpen=false;
 const safe=value=>esc(String(value??''));
 const who=()=>String(cloudUser?.id||cloudUser?.username||cloudUser?.name||'local');
 const storageKey=()=> 'lotigest-pro-shortcuts-v1:'+who();
 function normalizeShortcut(value){
  const components=String(value||'').trim().toLowerCase().replace(/\s+/g,'').split('+').filter(Boolean);
  if(!components.length)return '';
  const letter=components.pop();
  if(!/^[a-z0-9]$/.test(letter)&&!/^(f[1-9]|f1[0-2])$/.test(letter))return '';
  const flags=[components.includes('ctrl'),components.includes('alt'),components.includes('shift'),components.includes('meta')];
  if(!flags.some(Boolean)||components.length!==new Set(components).size||components.some(c=>!['ctrl','alt','shift','meta'].includes(c)))return '';
  return ['ctrl','alt','shift','meta'].filter(x=>components.includes(x)).concat(letter).join('+');
 }
 function scLoad(){
  const base=defaults();let raw={};
  try{raw=JSON.parse(localStorage.getItem(storageKey())||'{}')||{};}catch{}
  if(raw&&typeof raw==='object'){
   const order=Array.isArray(raw.order)?raw.order.filter(id=>base.order.includes(id)):base.order;
   const unique=[...new Set(order)];
   base.order=[...unique,...base.order.filter(id=>!unique.includes(id))];
   for(const id of base.order){
    if(!Object.prototype.hasOwnProperty.call(raw.keys||{},id))continue;
    const val=raw.keys[id];
    base.keys[id]=val===''?'':normalizeShortcut(val)||base.keys[id];
   }
   const seen=new Set();
   for(const id of base.order){const k=base.keys[id];if(k&&seen.has(k))base.keys[id]='';else if(k)seen.add(k);}
  }
  return base;
 }
 function scDraft(){
  const user=who();
  if(!draft||draftUser!==user){draft=scLoad();draftUser=user;captureId=null;}
  return draft;
 }
 function shortcutLabel(code){
  if(!code)return 'Sin asignar';
  return code.split('+').map(part=>({ctrl:'Ctrl',alt:'Alt',shift:'Shift',meta:'⌘'}[part]||part.toUpperCase())).join(' + ');
 }
 function scRow(id,index){
  const def=defs.find(d=>d[0]===id),code=scDraft().keys[id]||'';
  const editing=captureId===id;
  return '<div class="lg-shortcut-row" data-shortcut-row="'+safe(id)+'" draggable="true">'+
   '<div class="lg-shortcut-move"><button type="button" data-shortcut-up="'+safe(id)+'" aria-label="Subir '+safe(def[1])+'">↑</button>'+
   '<button type="button" data-shortcut-down="'+safe(id)+'" aria-label="Bajar '+safe(def[1])+'">↓</button></div>'+
   '<span class="lg-shortcut-key">'+safe(shortcutLabel(code))+'</span>'+
   '<strong class="lg-shortcut-name">'+safe(def[1])+'</strong>'+
   '<button type="button" class="btn btn-outline btn-sm lg-shortcut-edit" data-shortcut-edit="'+safe(id)+'">'+(editing?'Cancelar':'✎ Cambiar')+'</button>'+
   (editing?'<div class="lg-shortcut-capture-wrap"><label>Presiona una combinación de teclas<input class="lg-shortcut-capture" data-shortcut-capture="'+safe(id)+'" type="text" readonly placeholder="Ej.: Ctrl + Shift + C" aria-label="Presiona nuevas teclas para '+safe(def[1])+'"></label><small>Usa Ctrl, Alt o Shift + letra. Supr elimina el atajo; Esc cancela.</small></div>':'')+
   '</div>';
 }
 function shortcutMarkup(){
  const state=scDraft(),main=state.order.slice(0,6),others=state.order.slice(6);
  // Usar la lista de módulos predeterminados para agrupar las acciones,
  // incluso cuando el usuario reordene los accesos.
  const primary=state.order.filter(id=>defs.slice(0,6).some(d=>d[0]===id));
  const extra=state.order.filter(id=>!primary.includes(id));
  const caution='Algunos atajos como Ctrl + C, Ctrl + R, Ctrl + T o Ctrl + P pueden ser utilizados por el navegador. En ese caso, cambia la combinación a Ctrl + Alt + letra.';
  return '<section class="card card-padding lg-shortcut-settings" id="lotigest-shortcut-settings" aria-labelledby="lg-shortcut-title">'+
   '<div class="lg-shortcut-header"><div><h2 id="lg-shortcut-title">⌨ Configuración de atajos</h2><p>Personaliza las combinaciones del teclado para abrir módulos y registrar abonos.</p></div></div>'+
   '<div class="lg-shortcut-note">✎ Pulsa <b>Cambiar</b> para asignar otras teclas. Puedes mover las filas con ↑ y ↓ o arrastrarlas en computadora.</div>'+
   '<div class="lg-shortcut-note">↵ <b>Enter:</b> avanza automáticamente a la siguiente casilla del formulario. <b>Shift + Enter:</b> agrega una nueva línea en observaciones. Enter no guarda abonos ni contratos por accidente; las búsquedas y formularios especiales conservan sus acciones.</div>'+
   '<h3>Atajos principales</h3><div class="lg-shortcut-rows">'+primary.map(scRow).join('')+'</div>'+
   '<details class="lg-shortcut-more" '+(moreOpen||extra.includes(captureId)?'open':'')+'><summary>Otros módulos del sistema ('+extra.length+')</summary><div class="lg-shortcut-rows">'+extra.map(scRow).join('')+'</div></details>'+
   '<p class="lg-shortcut-caution">'+safe(caution)+'</p>'+
   '<div class="lg-shortcut-actions"><button type="button" class="btn btn-outline" data-shortcut-reset>↺ Restablecer</button><button type="button" class="btn btn-primary" data-shortcut-save>✓ Guardar cambios</button></div>'+
   '<p class="sm muted">Los cambios se guardan para este usuario en este navegador. No modifican los datos de contratos ni abonos.</p></section>';
 }
 const originalSettingsPage=settingsPage;
 settingsPage=function(){
  const base=originalSettingsPage();
  const marker='<div class="page-cols">';
  return base.includes(marker)?base.replace(marker,shortcutMarkup()+marker):base+shortcutMarkup();
 };
 function refreshSettings(){
  const container=document.querySelector('#lotigest-shortcut-settings');
  if(container?.querySelector?.('.lg-shortcut-more')?.open)moreOpen=true;
  if(container)container.outerHTML=shortcutMarkup();
  if(captureId){
   const input=document.querySelector('[data-shortcut-capture="'+captureId+'"]');
   input?.focus();
  }
 }
 function shortcutValidation(key,ignoreId){
  if(!key)return '';
  const other=defs.find(d=>d[0]!==ignoreId&&scDraft().keys[d[0]]===key);
  if(other)return 'La combinación '+shortcutLabel(key)+' ya se utiliza para '+other[1]+'.';
  if(['ctrl+w','ctrl+n','ctrl+q','meta+w','meta+q','alt+f4'].includes(key))return 'Esta combinación está reservada para cerrar el navegador o ventana.';
  return '';
 }
 function fromEvent(e){
  const letter=String(e.key||'').toLowerCase();
  if(['control','shift','alt','meta','dead','unidentified'].includes(letter))return null;
  const mods=[e.ctrlKey?'ctrl':null,e.altKey?'alt':null,e.shiftKey?'shift':null,e.metaKey?'meta':null].filter(Boolean);
  if(!mods.length)return '';
  return normalizeShortcut(mods.concat(letter).join('+'));
 }
 function scNavigate(pageId){
  const nav=document.querySelector('.nav-btn[data-page="'+pageId+'"]');
  if(nav){nav.click();return;}
  toast('El módulo seleccionado no está disponible con tu usuario.','error');
 }
 function runShortcut(id){
  if(id==='single')return window.lotigestMultiDate?.openSingle?.();
  if(id==='multi')return window.lotigestMultiDate?.openMulti?.();
  const module=defs.find(d=>d[0]===id)?.[2];
  if(module)scNavigate(module);
 }
 document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.isComposing||e.repeat)return;
  const capture=e.target?.closest?.('[data-shortcut-capture]');
  if(capture){
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();captureId=null;refreshSettings();return;}
   if(['Backspace','Delete'].includes(e.key)){
    e.preventDefault();e.stopImmediatePropagation();scDraft().keys[capture.dataset.shortcutCapture]='';captureId=null;refreshSettings();return;
   }
   const key=fromEvent(e);
   if(key===null)return;
   e.preventDefault();e.stopImmediatePropagation();
   if(!key){capture.value='Usa Ctrl, Alt, Shift o ⌘ + una tecla';return;}
   const error=shortcutValidation(key,capture.dataset.shortcutCapture);
   if(error){toast(error,'error');capture.value=error;return;}
   scDraft().keys[capture.dataset.shortcutCapture]=key;captureId=null;refreshSettings();
   return;
  }
  if(!cloudReady||!cloudUser)return;
  const key=fromEvent(e);
  if(!key)return;
  const focus=e.target;
  if(focus?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"],.modal,[role="dialog"]'))return;
  if(key==='ctrl+c'&&window.getSelection?.()?.toString())return;
  const saved=scLoad();
  const item=saved.order.find(id=>saved.keys[id]===key);
  if(!item)return;
  e.preventDefault();e.stopImmediatePropagation();runShortcut(item);
 },true);
 document.addEventListener('click',e=>{
  const action=e.target?.closest?.('[data-shortcut-edit],[data-shortcut-up],[data-shortcut-down],[data-shortcut-save],[data-shortcut-reset]');
  if(!action)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(action.hasAttribute('data-shortcut-edit')){
   const id=action.dataset.shortcutEdit;
   captureId=captureId===id?null:id;
   refreshSettings();return;
  }
  if(action.hasAttribute('data-shortcut-up')||action.hasAttribute('data-shortcut-down')){
   const id=action.dataset.shortcutUp||action.dataset.shortcutDown;
   const state=scDraft(),i=state.order.indexOf(id),delta=action.hasAttribute('data-shortcut-up')?-1:1;
   const j=i+delta;
   if(i>=0&&j>=0&&j<state.order.length){
    const copy=state.order.slice();[copy[i],copy[j]]=[copy[j],copy[i]];state.order=copy;refreshSettings();
   }
   return;
  }
  if(action.hasAttribute('data-shortcut-reset')){
   draft=defaults();captureId=null;refreshSettings();toast('Atajos restablecidos. Pulsa Guardar cambios para conservarlos.');return;
  }
  const state=scDraft();
  const used=new Set();
  for(const id of state.order){
   const key=state.keys[id];
   if(!key)continue;
   if(used.has(key)){toast('No se pueden guardar atajos duplicados.','error');return;}
   used.add(key);
  }
  try{localStorage.setItem(storageKey(),JSON.stringify(state));captureId=null;refreshSettings();toast('Configuración de atajos guardada para este navegador.');}
  catch{toast('No fue posible guardar los atajos en este navegador.','error');}
 },true);
 document.addEventListener('toggle',e=>{
  if(e.target?.matches?.('#lotigest-shortcut-settings .lg-shortcut-more'))moreOpen=Boolean(e.target.open);
 },true);
 document.addEventListener('dragstart',e=>{
  const row=e.target?.closest?.('[data-shortcut-row]');
  if(row){dragId=row.dataset.shortcutRow;e.dataTransfer?.setData('text/plain',dragId);}
 },true);
 document.addEventListener('dragover',e=>{
  if(dragId&&e.target?.closest?.('[data-shortcut-row]'))e.preventDefault();
 },true);
 document.addEventListener('drop',e=>{
  const target=e.target?.closest?.('[data-shortcut-row]');
  if(!dragId||!target)return;
  e.preventDefault();const state=scDraft(),order=state.order.filter(id=>id!==dragId);
  const index=order.indexOf(target.dataset.shortcutRow);
  if(index>=0){order.splice(index,0,dragId);state.order=order;}
  dragId=null;refreshSettings();
 },true);
 document.addEventListener('dragend',()=>{dragId=null;},true);
 window.lotigestShortcuts={ready:true,defaults,load:scLoad,normalize:normalizeShortcut,run:runShortcut,format:shortcutLabel};
})();
