// LOTIGEST · Terrenos / Predios consulta el titular SOLO cuando existe ficha de Contratos.
// No se eliminan datos automáticamente; la limpieza requiere revisión y respaldo.
(function lotContractFirstInstall(){
 let auditDraft=null;
 function contractForLot(lot){
  if(!lot)return null;
  const sale=(db.sales||[]).find(s=>s.lotId===lot.id);
  const docs=(db.contractTexts||[]).filter(d=>
   d.status!=='voided'&&(d.lotId===lot.id||
    (d.contractLotIds||[]).includes(lot.id)||(sale&&d.saleId===sale.id)));
  return docs.find(d=>d.clientId&&(sale?d.clientId===sale.clientId:true))||null;
 }
 const previousBuyerSummary=buyerInventorySummary;
 buyerInventorySummary=function(lot){
  const doc=contractForLot(lot);
  if(!doc){
   const exists=(db.sales||[]).some(s=>s.lotId===lot.id);
   return '<span class="muted">Sin contrato</span>'+
    (exists?'<br><small class="muted">Compra anterior por revisar; no se ha eliminado</small>':'');
  }
  const client=getClient(doc.clientId);
  return '<strong>'+esc(client?.name||'Titular por verificar')+'</strong><br><small>'+
   esc(doc.status==='active'?'Contrato activo':doc.status==='pending-sale'?'Contrato pendiente':'Contrato registrado')+'</small>';
 };
 const prevLotsPage=lotsPage;
 lotsPage=function(){
  let html=prevLotsPage();
  html=html.replace('<th>Comprador / compra</th>','<th>Contrato / titular</th>');
  html=html.replace('<button class="btn btn-outline" data-action="buyer-import">Importar Excel de compradores</button>',
   '<button class="btn btn-outline" data-lot-go-contracts>Ir a Contratos</button>');
  const rid=residence().id,audit=auditUncontractedSales(db,rid);
  const links=auditOrphanOwnerLinks(db,rid,true);
  const admin=cloudUser?.role==='admin';
  const info='<section class="card card-padding lot-contract-first-note">'+
   '<h3>Compradores desde Contratos</h3><p class="sm">Aquí administras medidas, precios, etapas, bloques y solares. Para crear o vincular el comprador y registrar la compra, utiliza <strong>Contratos → Nuevo contrato</strong>. Un comprador sin contrato no se mostrará como titular confirmado.</p>'+
   (admin?'<p class="sm"><strong>'+audit.candidates.length+'</strong> compras sin contrato y sin movimientos encontradas para revisión; <strong>'+
    audit.protectedSales.length+'</strong> compras con vínculos protegidos. Además hay <strong>'+
    links.candidates.length+'</strong> asociaciones provisionales que puedes liberar en la misma operación.</p>'+
    '<div class="lot-contract-first-actions"><button type="button" class="btn btn-outline" data-lot-uncontracted-open>Revisar compras sin contrato</button>'+
    '<button type="button" class="btn btn-outline" data-owner-cleanup-bulk>Liberar todos los solares sin contrato</button></div>':'')+
   '</section>';
  return html.replace('<div class="page-cols">',info+'<div class="page-cols">');
 };
 const prevEditLot=editLot;
 editLot=function(id){
  const result=prevEditLot(id);
  const modal=document.querySelector('#modal-root .modal');
  const section=modal?.querySelector('[data-action="buyer-history"]')?.closest('section');
  if(section){
   section.innerHTML='<h3>Compradores y contratos</h3><p>Los compradores y la compra se registran desde <strong>Contratos → Nuevo contrato</strong>. Los precios y medidas se mantienen aquí.</p>'+
    '<button type="button" class="btn btn-outline" data-lot-go-contracts>Ir a Contratos</button>';
  }
  return result;
 };
 const prevSolarWindow=openSolarWindow;
 openSolarWindow=function(lotId){
  const result=prevSolarWindow(lotId);
  const modal=document.querySelector('#modal-root .modal'),form=modal?.querySelector('#solar-form');
  if(!form)return result;
  const operation=form.querySelector('#solar-operation');
  if(operation){
   for(const option of [...operation.options])if(['credit','cash'].includes(option.value))option.remove();
   if(['credit','cash'].includes(operation.value))operation.value='';
  }
  // El bloque de venta permanece oculto para que el manejador legado de apartados
  // conserve sus referencias DOM; no se ofrecen ni ejecutan compras directas.
  const saleSection=form.querySelector('#solar-sale-section');
  if(saleSection)saleSection.classList.add('hidden');
  const note=document.createElement('div');note.className='notice-card lot-contract-first-tip';
  note.innerHTML='<strong>Compra exclusivamente desde Contratos</strong><p class="sm">Aquí puedes consultar el solar y realizar apartados. Para asignar comprador, prima, fecha y mensualidades, abre Nuevo contrato.</p>'+
   '<button type="button" class="btn btn-outline btn-sm" data-lot-go-contracts>Nuevo contrato</button>';
  form.before(note);
  const lot=getLot(lotId);
  if(lot&&!contractForLot(lot)){
   for(const box of modal.querySelectorAll('.notice-card')){
    if(box!==note&&box.textContent.trim().startsWith('Comprador:'))
     box.textContent='Compra anterior sin contrato; revisar en Contratos. No se han eliminado saldos ni recibos.';
   }
  }
  updateSolarWindow();
  return result;
 };
 function filterText(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 }

 function auditCombinedSolarCleanup(state,rid){
  const sales=auditUncontractedSales(state,rid),owners=auditOrphanOwnerLinks(state,rid,true);
  const candidates=[...sales.candidates.map(x=>({...x,key:'sale:'+x.saleId,kind:'Compra sin contrato'})),...owners.candidates.map(x=>({...x,key:'owner:'+x.lotId,kind:'Asignación provisional'}))];
  const eligible=new Set(candidates.map(x=>x.lotId)),protectedByLot=new Map();
  for(const x of [...sales.protectedSales,...owners.protectedLinks])if(!eligible.has(x.lotId)){
   const previous=protectedByLot.get(x.lotId);
   protectedByLot.set(x.lotId,previous?{...previous,reason:[...new Set([previous.reason,x.reason])].join(' · ')}:x);
  }
  return {candidates,protectedSales:[...protectedByLot.values()]};
 }
 function removeCombinedSolarCleanup(state,keys,rid,actor){
  if(!Array.isArray(keys)||!keys.length||new Set(keys).size!==keys.length)throw Error('Selección inválida.');
  const audit=auditCombinedSolarCleanup(state,rid),allowed=new Map(audit.candidates.map(x=>[x.key,x]));
  for(const key of keys)if(!allowed.has(key))throw Error('La selección cambió o contiene un solar protegido.');
  const rows=keys.map(key=>allowed.get(key)),owners=rows.filter(x=>x.kind==='Asignación provisional').map(x=>x.lotId),sales=rows.filter(x=>x.kind==='Compra sin contrato').map(x=>x.saleId);
  let next=state;
  if(owners.length)next=removeOrphanOwnerLinks(next,owners,rid,actor,'Liberar asignaciones provisionales para registrar contratos manualmente',undefined,true,true).state;
  if(sales.length)next=removeUncontractedSales(next,sales,rid,true).state;
  return {state:next,changed:rows.length};
 }
 function renderAudit(){
  const d=auditDraft,host=document.getElementById('lot-uncontracted-content');
  if(!d||!host)return;
  const q=filterText(d.search);
  const shown=d.audit.candidates.filter(row=>filterText([row.clientName,row.stage,row.block,row.number,row.lotId,row.kind,row.saleId].join(' ')).includes(q));
  host.innerHTML='<p class="sm"><strong>'+d.audit.candidates.length+
   ' solares elegibles</strong> (compras sin respaldo y asignaciones provisionales). <strong>'+
   d.audit.protectedSales.length+' protegidas</strong>: no se eliminarán, incluso aunque falte su contrato.</p>'+
   '<label class="field-group">Buscar cliente, etapa, bloque o solar<input id="lot-uncontracted-search" value="'+esc(d.search)+'" autocomplete="off" placeholder="Buscar comprador o solar"></label>'+
   '<div class="owner-cleanup-list">'+
   (shown.length?shown.slice(0,250).map(row=>'<label class="owner-cleanup-item">'+
    '<input type="checkbox" data-lot-uncontracted-id="'+esc(row.key)+'" '+(d.selected.has(row.key)?'checked':'')+'>'+
    '<span><strong>'+esc(row.clientName)+'</strong><small>Etapa '+esc(row.stage||'—')+' · Bloque '+
    esc(row.block||'—')+' · Solar '+esc(row.number)+'</small><small>'+esc(row.kind)+
    ' · '+esc(row.reason)+'</small></span></label>').join(''):
    '<p class="sm muted">No se encontraron solares elegibles con este filtro.</p>')+'</div>'+
   '<p class="sm"><strong>'+d.selected.size+' solares seleccionados.</strong> Se liberarán en una sola operación. Se conservan clientes, medidas, precios, contratos, pagos e historial importado.</p>'+
   '<div class="owner-cleanup-actions"><button class="btn btn-outline btn-sm" type="button" data-lot-uncontracted-select>Seleccionar visibles</button><button class="btn btn-primary btn-sm" type="button" data-lot-uncontracted-all>Seleccionar todos ('+d.audit.candidates.length+')</button>'+
   '<button class="btn btn-outline btn-sm" type="button" data-lot-uncontracted-clear>Quitar selección</button>'+
   '<button class="btn btn-outline btn-sm" type="button" data-lot-uncontracted-protected>Ver protegidas ('+d.audit.protectedSales.length+')</button></div>'+
   '<div class="owner-cleanup-confirm"><button class="btn btn-outline" type="button" data-lot-uncontracted-backup>1. Descargar respaldo JSON</button>'+
   '<label><input type="checkbox" id="lot-uncontracted-confirm-backup" '+(d.confirmed?'checked':'')+'> Confirmo que descargué y guardé el respaldo</label>'+
   '<label>Escribe <strong>RETIRAR</strong> para confirmar<input id="lot-uncontracted-code" value="'+esc(d.code)+'" autocomplete="off"></label>'+
   '<p role="alert" id="lot-uncontracted-error"></p></div>';
  const button=document.querySelector('[data-lot-uncontracted-save]');
  if(button)button.disabled=d.busy||!d.selected.size||
   !d.backupDownloaded||!d.confirmed||d.code!=='RETIRAR';
 }
 function openAudit(){
  if(!contractIntakeAdmin()){toast('Esta revisión requiere administrador y Cloudflare sincronizado.','error');return;}
  auditDraft={residenceId:residence().id,snapshot:JSON.stringify(db),
   audit:auditCombinedSolarCleanup(db,residence().id),search:'',
   selected:new Set(),backupDownloaded:false,confirmed:false,code:'',busy:false};
  showModal('Revisar compras sin contrato · Terrenos / Predios',
   '<p>Esta limpieza no es automática. Selecciona todos los solares elegibles de esta residencial, descarga el respaldo y confirma. No se borrarán clientes, contratos, pagos, reservas ni el historial importado.</p><div id="lot-uncontracted-content"></div>',
   '<button class="btn btn-soft" type="button" data-action="close-modal">Cancelar</button>'+
   '<button class="btn btn-primary" type="button" data-lot-uncontracted-save disabled>Liberar solares seleccionados</button>',true);
  renderAudit();
 }
 async function saveAudit(){
  const d=auditDraft;if(!d||d.busy)return;
  try{
   if(!contractIntakeAdmin())throw Error('Necesitas una sesión de administrador con datos sincronizados.');
   if(!d.backupDownloaded||!d.confirmed||d.code!=='RETIRAR'||!d.selected.size)
    throw Error('Descarga el respaldo, confírmalo y selecciona las compras.');
   if(residence().id!==d.residenceId||JSON.stringify(db)!==d.snapshot)
    throw Error('El estado cambió. Revisa nuevamente antes de borrar.');
   const result=removeCombinedSolarCleanup(db,[...d.selected],d.residenceId,cloudUser?.name||'Administrador');
   if(!confirm('¿Retirar '+result.changed+' asignaciones y compras elegibles SIN contrato ni pagos reales? Se conservarán todos los clientes y solares.'))return;
   d.busy=true;
   cloudWrite(JSON.stringify(result.state));db=result.state;
   await cloudFlush();
   closeModal();auditDraft=null;render();
   if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
    toast('Cambio pendiente en Cloudflare. Verifica el estado de sincronización antes de continuar.','error');
   else toast(result.changed+' solares liberados. Puedes registrarlos desde Contratos.');
  }catch(e){
   const el=document.getElementById('lot-uncontracted-error');if(el)el.textContent=e.message;
   toast(e.message,'error');
  }finally{if(d){d.busy=false;renderAudit();}}
 }
 document.addEventListener('click',event=>{
  const anchor=event.target.closest?.('[data-lot-go-contracts],[data-lot-uncontracted-open],[data-lot-uncontracted-save],[data-lot-uncontracted-select],[data-lot-uncontracted-all],[data-lot-uncontracted-clear],[data-lot-uncontracted-protected],[data-lot-uncontracted-backup],[data-action="buyer-history"],[data-action="buyer-import"],[data-action="buyer-import-confirm"]');
  if(!anchor)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(anchor.hasAttribute('data-lot-go-contracts')){
   closeModal();page='contracts';render();return;
  }
  if(anchor.matches('[data-action="buyer-history"],[data-action="buyer-import"],[data-action="buyer-import-confirm"]')){
   toast('Para asociar un comprador y su solar utiliza Contratos → Nuevo contrato.','error');return;
  }
  if(anchor.hasAttribute('data-lot-uncontracted-open')){openAudit();return;}
  const d=auditDraft;if(!d||d.busy)return;
  if(anchor.hasAttribute('data-lot-uncontracted-all')){d.selected=new Set(d.audit.candidates.map(row=>row.key));d.search='';}
  else if(anchor.hasAttribute('data-lot-uncontracted-select')){
   d.audit.candidates.filter(row=>filterText([row.clientName,row.stage,row.block,row.number,row.lotId,row.kind,row.saleId].join(' ')).includes(filterText(d.search))).slice(0,250).forEach(row=>d.selected.add(row.key));
  }else if(anchor.hasAttribute('data-lot-uncontracted-clear'))d.selected.clear();
  else if(anchor.hasAttribute('data-lot-uncontracted-protected')){
   const lines=d.audit.protectedSales.slice(0,35).map(r=>r.clientName+' · Etapa '+r.stage+' / Bloque '+r.block+' / Solar '+r.number+' · '+r.reason);
   alert('Compras protegidas ('+d.audit.protectedSales.length+'):\n'+(lines.join('\n')||'Ninguna')+
    (d.audit.protectedSales.length>35?'\n… y más protegidas':''));
  }else if(anchor.hasAttribute('data-lot-uncontracted-backup')){
   try{
    download('LOTIGEST_antes_retirar_compras_sin_contrato_'+businessToday()+'.json',
     JSON.stringify(db,null,2),'application/json');
    d.backupDownloaded=true;
    toast('Respaldo descargado. Confirma que el archivo se guardó.');
   }catch(e){toast('No se pudo descargar: '+e.message,'error');}
  }else if(anchor.hasAttribute('data-lot-uncontracted-save')){saveAudit();return;}
  renderAudit();
 },true);
 document.addEventListener('submit',event=>{
  if(event.target.id==='buyer-history-form'||event.target.id==='solar-form'&&
    ['cash','credit'].includes(event.target.elements.operation?.value)){
   event.preventDefault();event.stopImmediatePropagation();
   toast('Registra la compra y el comprador desde Contratos → Nuevo contrato.','error');
  }
 },true);
 document.addEventListener('change',event=>{
  const d=auditDraft;if(!d)return;
  if(event.target.dataset?.lotUncontractedId){
   if(event.target.checked)d.selected.add(event.target.dataset.lotUncontractedId);
   else d.selected.delete(event.target.dataset.lotUncontractedId);
   renderAudit();
  }else if(event.target.id==='lot-uncontracted-confirm-backup'){
   d.confirmed=Boolean(event.target.checked);renderAudit();
  }
 },true);
 document.addEventListener('input',event=>{
  const d=auditDraft;if(!d)return;
  if(event.target.id==='lot-uncontracted-search'){
   const index=event.target.selectionStart;
   d.search=event.target.value;renderAudit();
   const input=document.getElementById('lot-uncontracted-search');
   if(input){input.focus();if(index!=null)input.setSelectionRange(index,index);}
  }else if(event.target.id==='lot-uncontracted-code'){
   d.code=event.target.value;
   const button=document.querySelector('[data-lot-uncontracted-save]');
   if(button)button.disabled=d.busy||!d.selected.size||
    !d.backupDownloaded||!d.confirmed||d.code!=='RETIRAR';
  }
 },true);
})();
