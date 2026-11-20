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
   protectedLinks.length+' vínculos protegidos (no se borrarán). Las ventas, apartados, recibos y fichas históricas están excluidos.</p>'+
   '<label class="field-group">Buscar cliente, bloque o solar<input id="owner-cleanup-search" type="search" autocomplete="off" placeholder="Nombre, bloque o número de solar" value="'+esc(draft.search||'')+'"></label>'+
   '<div class="owner-cleanup-list">'+(visible.length?visible.slice(0,300).map(x=>
    '<label class="owner-cleanup-item"><input type="checkbox" data-owner-cleanup-id="'+esc(x.lotId)+'" '+(draft.selected.has(x.lotId)?'checked':'')+'>'+
    '<span><strong>'+esc(x.clientName)+'</strong><small>Etapa '+esc(x.stage||'—')+
    ' · Bloque '+esc(x.block||'—')+' · Solar '+esc(x.number)+'</small><small>'+esc(x.reason)+'</small></span></label>').join(''):
    '<p class="sm muted">No hay solares sin contrato elegibles para desvincular con este filtro.</p>')+'</div>'+
   (visible.length>300?'<p class="sm muted">Mostrando 300 resultados; busca el cliente para encontrar sus solares.</p>':'')+
   '<p class="sm"><strong>'+draft.selected.size+' solares seleccionados</strong> (máximo 20 por operación). Solo desaparecerá la asociación provisional con el cliente. La medida, precio, etapa y geometría permanecerán.</p>'+
   '<div class="owner-cleanup-actions"><button type="button" class="btn btn-outline btn-sm" data-owner-cleanup-select-all>Seleccionar los visibles</button>'+
   '<button type="button" class="btn btn-outline btn-sm" data-owner-cleanup-clear>Quitar selección</button>'+
   '<button type="button" class="btn btn-outline btn-sm" data-owner-cleanup-protected>Ver vínculos protegidos ('+protectedLinks.length+')</button></div>'+
   '<div class="owner-cleanup-confirm"><button type="button" class="btn btn-outline" data-owner-cleanup-backup>1. Descargar respaldo JSON</button>'+
   '<label><input type="checkbox" id="owner-cleanup-backup-ok" '+(draft.confirmedBackup?'checked':'')+
   '> Confirmo que descargué y guardé el respaldo</label>'+
   '<label>Escribe <strong>DESVINCULAR</strong> para confirmar<input id="owner-cleanup-code" autocomplete="off" value="'+esc(draft.code||'')+'"></label>'+
   '<p id="owner-cleanup-error" role="alert"></p></div>';
  const btn=document.querySelector('[data-owner-cleanup-save]');if(btn)
   btn.disabled=draft.busy||!draft.selected.size||draft.selected.size>20||!draft.backupDownloaded||!draft.confirmedBackup||draft.code!=='DESVINCULAR';
 }
 function open(){
  if(!contractIntakeAdmin()){toast('Para limpiar asociaciones necesitas sesión de administrador y nube sincronizada.','error');return;}
  draft={residenceId:residence().id,audit:auditOrphanOwnerLinks(db,residence().id),snapshot:JSON.stringify(db),
   selected:new Set(),search:'',backupDownloaded:false,confirmedBackup:false,code:'',busy:false};
  showModal('Revisar solares vinculados sin contrato',
   '<p>Esta herramienta permite retirar solares asignados a clientes por registros provisionales. No borra clientes, contratos, pagos ni solares. Primero revisa la lista.</p><div id="owner-cleanup-content"></div>',
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
   if(!d.backupDownloaded||!d.confirmedBackup||d.code!=='DESVINCULAR'||!d.selected.size)
    throw Error('Descarga el respaldo, confirma y selecciona los solares antes de continuar.');
   if(residence().id!==d.residenceId||JSON.stringify(db)!==d.snapshot)
    throw Error('Los datos cambiaron. Vuelve a revisar y descargar el respaldo.');
   const result=removeOrphanOwnerLinks(db,[...d.selected],d.residenceId);
   if(!confirm('¿Quitar solo las '+result.changed+' asociaciones provisionales elegidas? No se eliminarán clientes ni solares.'))return;
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
 const original=contractsPage;
 contractsPage=function(){
  const result=original();
  if(cloudUser?.role!=='admin')return result;
  const audit=auditOrphanOwnerLinks(db,residence().id);
  const section='<section class="card owner-cleanup-card">'+
   '<h3>Revisar solares sin contrato</h3>'+
   '<p class="sm">Contratos es la referencia para identificar los solares correctos. Hay <b>'+audit.candidates.length+
   '</b> asociaciones provisionales sin contrato que pueden revisarse, y <b>'+audit.protectedLinks.length+
   '</b> protegidas por documentos o movimientos. No afecta el inventario ni los recibos.</p>'+
   '<button type="button" class="btn btn-outline" data-owner-cleanup-open>Revisar y desvincular</button></section>';
  return section+result;
 };
 document.addEventListener('click',event=>{
  const el=event.target.closest?.('[data-owner-cleanup-open],[data-owner-cleanup-save],[data-owner-cleanup-select-all],[data-owner-cleanup-clear],[data-owner-cleanup-backup],[data-owner-cleanup-protected]');
  if(!el)return;
  event.preventDefault();event.stopImmediatePropagation();
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
  if(event.target.id==='owner-cleanup-code'){
   draft.code=event.target.value;
   const button=document.querySelector('[data-owner-cleanup-save]');
   if(button)button.disabled=draft.busy||!draft.selected.size||draft.selected.size>20||!draft.backupDownloaded||!draft.confirmedBackup||draft.code!=='DESVINCULAR';
  }
 },true);
})();
