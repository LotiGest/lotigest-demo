// Limpieza asistida: nunca se ejecuta automáticamente ni afecta clientes o contratos.
(function installOwnerCleanupPanel(){
 let draft=null;
 function renderPreview(){
  if(!draft)return;
  const {candidates,protectedLinks}=draft.audit;
  const host=document.getElementById('owner-cleanup-content');
  if(!host)return;
  const q=String(draft.search||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const visible=candidates.filter(x=>[x.clientName,x.stage,x.block,x.number,x.lotId].join(' ')
   .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
  host.innerHTML='<p class="sm"><strong>'+candidates.length+' asociaciones provisionales sin contrato</strong> · '+
   protectedLinks.length+' vínculos protegidos (no se borrarán). Las ventas, contratos vigentes, apartados y cobros reales están protegidos. Las importaciones sin contabilizar podrán desvincularse sin borrar su historial.</p>'+
   '<label class="field-group">Buscar cliente, bloque o solar<input id="owner-cleanup-search" type="search" autocomplete="off" placeholder="Nombre, bloque o número de solar" value="'+esc(draft.search||'')+'"></label>'+
   '<div class="owner-cleanup-list">'+(visible.length?visible.slice(0,300).map(x=>
    '<label class="owner-cleanup-item"><input type="checkbox" data-owner-cleanup-id="'+esc(x.lotId)+'" '+(draft.selected.has(x.lotId)?'checked':'')+'>'+
    '<span><strong>'+esc(x.clientName)+'</strong><small>Etapa '+esc(x.stage||'—')+
    ' · Bloque '+esc(x.block||'—')+' · Solar '+esc(x.number)+'</small><small>'+esc(x.reason)+'</small></span></label>').join(''):
    '<p class="sm muted">No hay solares sin contrato elegibles para desvincular con este filtro.</p>')+'</div>'+
   (visible.length>300?'<p class="sm muted">Mostrando 300 resultados; busca el cliente para encontrar sus solares.</p>':'')+
   '<p class="sm"><strong>'+draft.selected.size+' solares seleccionados</strong> (máximo 20 por operación). Se quitará la asignación provisional y la marca importada de deuda, cuando corresponda. Los datos de PDF o Excel se conservarán como historial. La medida, precio, etapa y geometría permanecerán.</p>'+
   '<div class="owner-cleanup-actions"><button type="button" class="btn btn-outline btn-sm" data-owner-cleanup-select-all>Seleccionar los visibles</button>'+
   '<button type="button" class="btn btn-outline btn-sm" data-owner-cleanup-clear>Quitar selección</button>'+
   '<button type="button" class="btn btn-outline btn-sm" data-owner-cleanup-protected>Ver vínculos protegidos ('+protectedLinks.length+')</button></div>'+
   '<div class="owner-cleanup-confirm"><button type="button" class="btn btn-outline" data-owner-cleanup-backup>1. Descargar respaldo JSON</button>'+
   '<label><input type="checkbox" id="owner-cleanup-backup-ok" '+(draft.confirmedBackup?'checked':'')+
   '> Confirmo que descargué y guardé el respaldo</label>'+
   '<label>Motivo de la corrección<input id="owner-cleanup-reason" maxlength="300" placeholder="Ej.: El solar 1 se asignó por error; corresponde el solar 2" value="'+esc(draft.reason||'')+'"></label>'+
   '<label>Escribe <strong>DESVINCULAR</strong> para confirmar<input id="owner-cleanup-code" autocomplete="off" value="'+esc(draft.code||'')+'"></label>'+
   '<p id="owner-cleanup-error" role="alert"></p></div>';
  const btn=document.querySelector('[data-owner-cleanup-save]');if(btn)
   btn.disabled=draft.busy||!draft.selected.size||draft.selected.size>20||!draft.backupDownloaded||!draft.confirmedBackup||draft.code!=='DESVINCULAR'||draft.reason.trim().length<5;
 }
 function open(lotId=null){
  if(!contractIntakeAdmin()){toast('Para limpiar asociaciones necesitas sesión de administrador y nube sincronizada.','error');return;}
  const rid=residence().id,audit=auditOrphanOwnerLinks(db,rid,true),selected=new Set();
  if(lotId){
   const candidate=audit.candidates.find(x=>x.lotId===lotId);
   if(!candidate){
    const protectedLot=audit.protectedLinks.find(x=>x.lotId===lotId);
    toast(protectedLot?'Este solar no puede liberarse: '+protectedLot.reason:'El solar no tiene una asignación provisional elegible.','error');
    return;
   }
   selected.add(lotId);
  }
  draft={residenceId:rid,audit,snapshot:JSON.stringify(db),
   selected,search:lotId||'',backupDownloaded:false,confirmedBackup:false,code:'',reason:'',busy:false};
  showModal(lotId?'Quitar propietario de este solar':'Revisar solares vinculados sin contrato',
   '<p>Esta herramienta permite liberar solares asignados por registros provisionales o importaciones sin contabilizar. No borra clientes, contratos, pagos ni solares. Verifica el cliente correcto antes de reasignar.</p><div id="owner-cleanup-content"></div>',
   '<button type="button" class="btn btn-soft" data-action="close-modal">Cancelar</button>'+
   '<button type="button" class="btn btn-primary" data-owner-cleanup-save disabled>Desvincular solares seleccionados</button>',true);
  renderPreview();
 }
 async function save(){
  const d=draft;if(!d||d.busy)return;
  const error=document.getElementById('owner-cleanup-error');
  try{
   if(d.selected.size>20)throw Error('Solo se permiten 20 asociaciones por operación; reduce la selección.');
   if(!contractIntakeAdmin())throw Error('Debes estar conectado como administrador y sin sincronizaciones pendientes.');
   if(!d.backupDownloaded||!d.confirmedBackup||d.code!=='DESVINCULAR'||!d.selected.size||d.reason.trim().length<5)
    throw Error('Descarga el respaldo, confirma y selecciona los solares antes de continuar.');
   if(residence().id!==d.residenceId||JSON.stringify(db)!==d.snapshot)
    throw Error('Los datos cambiaron. Vuelve a revisar y descargar el respaldo.');
   const result=removeOrphanOwnerLinks(db,[...d.selected],d.residenceId,cloudUser?.name||'Administrador',d.reason,undefined,true);
   if(!confirm('¿Desvincular '+result.changed+' solar(es) sin contrato ni cobro real? Las asociaciones importadas quedarán en el historial; verifica el contrato físico antes de reasignar.'))return;
   d.busy=true;
   cloudWrite(JSON.stringify(result.state));db=result.state;
   await cloudFlush();
   closeModal();draft=null;render();
   if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
    toast('Los cambios están pendientes de sincronización. Comprueba el estado de Cloudflare antes de continuar.','error');
   else toast(result.changed+' asociaciones de solares sin contrato desvinculadas. Los contratos y pagos se conservaron.');
  }catch(e){if(error)error.textContent=e.message;toast(e.message,'error');}
  finally{if(d){d.busy=false;renderPreview();}}
 }
 function inlineSolarCleanup(lotId){
  const lot=getLot(lotId),root=document.querySelector('#modal-root .modal-content');
  if(!root||!lot?.ownerClientId||cloudUser?.role!=='admin'||root.querySelector('[data-owner-cleanup-single]'))return;
  const review=auditOrphanOwnerLinks(db,lot.residenceId,true);
  const eligible=review.candidates.find(x=>x.lotId===lotId);
  const blocked=review.protectedLinks.find(x=>x.lotId===lotId);
  const synced=contractIntakeAdmin();
  const message=eligible?
   (eligible.importedOnly?'Asignación importada sin contabilizar. Se conserva el historial y se libera la asociación actual.':lot.status==='sold'?'Este solar figura como Comprado, pero no tiene venta ni movimientos comprobados. Al desvincularlo quedará Disponible.':
    'Se quitará únicamente la asignación provisional de este solar. Los otros solares del cliente no cambiarán.'):
   'Solar protegido: '+(blocked?.reason||'la asignación requiere revisión antes de liberarla');
  root.insertAdjacentHTML('afterbegin',
   '<section class="notice-card" style="margin:10px 0 16px;border:1px solid rgba(120,150,136,.35)">'+
   '<strong>Corregir cliente asociado</strong><p class="sm">'+esc(message)+'</p>'+
   '<button type="button" class="btn btn-outline btn-sm" data-owner-cleanup-single="'+esc(lotId)+'" '+
   (!eligible||!synced?'disabled':'')+'>Quitar persona de este solar</button>'+
   (!synced?'<p class="sm muted">Se requiere sesión de administrador con nube sincronizada.</p>':'')+
   '</section>');
 }
 const cleanupViewLotBase=viewLot;
 viewLot=function(lotId){const result=cleanupViewLotBase(lotId);inlineSolarCleanup(lotId);return result;};
 const cleanupSolarWindowBase=openSolarWindow;
 openSolarWindow=function(lotId){const result=cleanupSolarWindowBase(lotId);inlineSolarCleanup(lotId);return result;};
 const original=contractsPage;
 contractsPage=function(){
  const result=original();
  if(cloudUser?.role!=='admin')return result;
  const audit=auditOrphanOwnerLinks(db,residence().id,true);
  const section='<section class="card owner-cleanup-card">'+
   '<h3>Revisar solares sin contrato</h3>'+
   '<p class="sm">Contratos es la referencia para identificar los solares correctos. Hay <b>'+audit.candidates.length+
   '</b> asociaciones provisionales sin contrato que pueden revisarse, y <b>'+audit.protectedLinks.length+
   '</b> protegidas por documentos o movimientos. No afecta el inventario ni los recibos.</p>'+
   '<button type="button" class="btn btn-outline" data-owner-cleanup-open>Revisar y desvincular</button></section>';
  return section+result;
 };
 document.addEventListener('click',event=>{
  const el=event.target.closest?.('[data-owner-cleanup-single],[data-owner-cleanup-open],[data-owner-cleanup-save],[data-owner-cleanup-select-all],[data-owner-cleanup-clear],[data-owner-cleanup-backup],[data-owner-cleanup-protected]');
  if(!el)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(el.hasAttribute('data-owner-cleanup-single'))return open(el.dataset.ownerCleanupSingle);
  if(el.hasAttribute('data-owner-cleanup-open'))return open();
  const d=draft;if(!d||d.busy)return;
  if(el.hasAttribute('data-owner-cleanup-select-all')){
   const q=String(d.search||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   d.audit.candidates.filter(x=>[x.clientName,x.stage,x.block,x.number,x.lotId].join(' ')
     .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)).slice(0,20).forEach(x=>d.selected.add(x.lotId));
  }else if(el.hasAttribute('data-owner-cleanup-clear'))d.selected.clear();
  else if(el.hasAttribute('data-owner-cleanup-backup')){
   try{download('LOTIGEST_respaldo_antes_desvincular_'+businessToday()+'.json',JSON.stringify(db,null,2),'application/json');d.backupDownloaded=true;toast('Respaldo descargado. Verifica que el archivo se guardó correctamente.');}
   catch(e){toast('No se pudo descargar el respaldo: '+e.message,'error');}
  }else if(el.hasAttribute('data-owner-cleanup-protected')){
   const items=d.audit.protectedLinks.slice(0,35);
   const reason=items.map(x=>x.clientName+' · Bloque '+x.block+' / Solar '+x.number+' · '+x.reason).join('\n');
   alert('Vínculos que NO se borrarán ('+d.audit.protectedLinks.length+'):\n'+(reason||'Ninguno')+
    (d.audit.protectedLinks.length>35?'\n… y más protegidos':''));
  }else if(el.hasAttribute('data-owner-cleanup-save'))return save();
  renderPreview();
 },true);
 document.addEventListener('change',event=>{
  if(!draft)return;
  const id=event.target.dataset?.ownerCleanupId;
  if(id){if(event.target.checked)draft.selected.add(id);else draft.selected.delete(id);renderPreview();}
  if(event.target.id==='owner-cleanup-backup-ok'){draft.confirmedBackup=Boolean(event.target.checked);renderPreview();}
 },true);
 document.addEventListener('input',event=>{
  if(!draft)return;
  if(event.target.id==='owner-cleanup-search'){
   const at=event.target.selectionStart;draft.search=event.target.value;renderPreview();
   const next=document.getElementById('owner-cleanup-search');if(next){next.focus();if(at!=null)next.setSelectionRange(at,at);}
  }
  if(event.target.id==='owner-cleanup-reason'){
   draft.reason=event.target.value;
   const button=document.querySelector('[data-owner-cleanup-save]');
   if(button)button.disabled=draft.busy||!draft.selected.size||draft.selected.size>20||!draft.backupDownloaded||!draft.confirmedBackup||draft.code!=='DESVINCULAR'||draft.reason.trim().length<5;
  }
  if(event.target.id==='owner-cleanup-code'){
   draft.code=event.target.value;
   const button=document.querySelector('[data-owner-cleanup-save]');
   if(button)button.disabled=draft.busy||!draft.selected.size||draft.selected.size>20||!draft.backupDownloaded||!draft.confirmedBackup||draft.code!=='DESVINCULAR'||draft.reason.trim().length<5;
  }
 },true);
})();
