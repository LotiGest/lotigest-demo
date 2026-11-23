// LOTIGEST · Contratos: pantalla reorganizada, sin modificar datos.
(function contractDashboardInstall(){
 const state={residence:null,query:'',stage:'all',block:'all',solar:'all',status:'all',page:1};
 const perPage=10;
 const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-HN').trim();
 const val=x=>String(x??'').trim();
 const num=l=>val(l?.sourceNumber??l?.number??l?.id);
 const distinct=arr=>[...new Set(arr.filter(Boolean))].sort(new Intl.Collator('es-HN',{numeric:true,sensitivity:'base'}).compare);
 const opt=(value,label,selected)=>'<option value="'+esc(value)+'"'+(selected===value?' selected':'')+'>'+esc(label)+'</option>';
 const statuses={all:'Todos los estados',active:'Activo',pending:'Pendiente de activar',registered:'Ficha registrada',voided:'Anulado',missing:'Sin ficha contractual'};
 // contractLotIds representa un GRUPO de solares, no la propiedad del documento.
 // Cada ficha tiene un solar principal d.lotId; nunca mostrar un solar ajeno primero.
 function relatedIds(d){const s=d.saleId?getSale(d.saleId):null;return [d.lotId||s?.lotId].filter(Boolean);}
 function otherGroupLots(d){
  const primary=new Set(relatedIds(d));
  return [...new Set(Array.isArray(d.contractLotIds)?d.contractLotIds:[])]
   .filter(id=>!primary.has(id)).map(getLot).filter(l=>l?.residenceId===d.residenceId);
 }
 function makeRows(){
  const rid=residence().id;
  const docs=(db.contractTexts||[]).filter(d=>d.residenceId===rid);
  const records=docs.map(d=>{
   const sale=d.saleId?getSale(d.saleId):null;
   return {type:'doc',id:d.id,doc:d,sale,client:getClient(d.clientId),clientId:d.clientId||'',
    lots:relatedIds(d).map(getLot).filter(l=>l?.residenceId===rid),groupLots:otherGroupLots(d),
    status:d.status==='voided'?'voided':d.status==='active'?'active':d.status==='pending-sale'?'pending':'registered',
    date:sale?.date||d.structured?.date||d.createdAt||d.updatedAt||'',
    amount:d.structured?.price??sale?.price??null};
  });
  const sales=(db.sales||[]).filter(s=>getLot(s.lotId)?.residenceId===rid&&!docs.some(d=>d.saleId===s.id||(d.clientId===s.clientId&&relatedIds(d).includes(s.lotId))));
  records.push(...sales.map(s=>({type:'sale',id:s.id,sale:s,client:getClient(s.clientId),clientId:s.clientId||'',lots:[getLot(s.lotId)].filter(Boolean),status:'missing',date:s.date||'',amount:s.price??null})));
  return records.sort((a,b)=>val(b.date).localeCompare(val(a.date))||val(a.id).localeCompare(val(b.id)));
 }
 function locationMatch(r,key,selected){
  if(selected==='all')return true;
  const linked=r.lots.some(l=>key==='stage'?val(l.stage)===selected:key==='block'?val(l.block)===selected:norm(num(l))===norm(selected));
  if(linked)return true;
  if(r.status!=='voided')return false;
  const saved=contractRecordedLocation(r.doc);
  return key==='stage'?saved.stage===selected:key==='block'?saved.block===selected:norm(saved.number)===norm(selected);
 }
 function filtered(all){return all.filter(r=>locationMatch(r,'stage',state.stage)&&locationMatch(r,'block',state.block)&&locationMatch(r,'solar',state.solar)&&
  (state.status==='all'||state.status===r.status)&&
  (!state.query||norm([r.id,r.client?.name,r.client?.identity,r.doc?.title,r.doc?.voidReason,
   r.status==='voided'?'etapa '+contractRecordedLocation(r.doc).stage+' bloque '+contractRecordedLocation(r.doc).block+' solar '+contractRecordedLocation(r.doc).number:'',
   ...r.lots.flatMap(l=>['etapa '+l.stage,'bloque '+l.block,'solar '+num(l),l.id])].join(' ')).includes(norm(state.query))));}
 function contractRecordedLocation(doc){
  const s=doc?.structured||{};
  return {stage:val(s.stage),block:val(s.block),number:val(s.number)};
 }
 function contractVoidMismatch(r){
  const saved=contractRecordedLocation(r.doc),lot=r.lots[0];
  return Boolean(lot&&(
   (saved.stage&&norm(saved.stage)!==norm(lot.stage))||
   (saved.block&&norm(saved.block)!==norm(lot.block))||
   (saved.number&&norm(saved.number)!==norm(num(lot)))));
 }
 function where(r){
  const l=r.lots[0],saved=contractRecordedLocation(r.doc);
  const linked=l?'Etapa '+esc(l.stage||'—')+' / Bloque '+esc(l.block||'—')+' / Solar '+esc(num(l)):'Sin solar vinculado';
  const extras=r.groupLots?.length?
   '<small class="ct-more">Otros del mismo grupo (no de esta ficha): '+
    r.groupLots.map(x=>'Etapa '+esc(x.stage||'—')+' / Bloque '+esc(x.block||'—')+' / Solar '+esc(num(x))).join('; ')+'</small>':'';
  const mismatch=contractVoidMismatch(r);
  if(r.status!=='voided'){
   const written=saved.stage||saved.block||saved.number?
    'Etapa '+esc(saved.stage||'—')+' / Bloque '+esc(saved.block||'—')+' / Solar '+esc(saved.number||'—'):'';
   return linked+extras+(mismatch?'<small class="ct-more ct-void-mismatch">Según ficha: '+written+
    ' · Revisar diferencia con el solar vinculado</small>':'');
  }
  const recorded=saved.stage||saved.block||saved.number?
   'Etapa '+esc(saved.stage||'—')+' / Bloque '+esc(saved.block||'—')+' / Solar '+esc(saved.number||'—'):
   'Sin ubicación escrita en la ficha';
  return '<span class="ct-void-location">Vinculado: '+linked+'</span>'+extras+
   '<small class="ct-more'+(contractVoidMismatch(r)?' ct-void-mismatch':'')+'">Según ficha: '+recorded+
   (contractVoidMismatch(r)?' · Revisar diferencia':'')+'</small>';
 }
 function contractVoidedView(id){
  const d=(db.contractTexts||[]).find(x=>x.id===id&&x.status==='voided'&&x.residenceId===residence().id);
  if(!d)return;
  const client=getClient(d.clientId),saved=contractRecordedLocation(d);
  const linked=relatedIds(d).map(getLot).filter(l=>l?.residenceId===d.residenceId);
  const linkedLabel=linked.length?linked.map(l=>'Etapa '+esc(l.stage||'—')+' · Bloque '+esc(l.block||'—')+' · Solar '+esc(num(l))).join('; '):'No se encontró el solar vinculado';
  const savedLabel=saved.stage||saved.block||saved.number?
   'Etapa '+esc(saved.stage||'—')+' · Bloque '+esc(saved.block||'—')+' · Solar '+esc(saved.number||'—'):
   'No registrado en la ficha';
  const mismatch=contractVoidMismatch({doc:d,lots:linked});
  const date=value=>/^\d{4}-\d{2}-\d{2}/.test(val(value))?fmtDate(val(value).slice(0,10)):'No registrada';
  const cash=value=>value==null||value===''||!Number.isFinite(Number(value))?'—':money(Number(value));
  const moneyLine=(label,value)=>'<div class="detail-line"><span>'+label+'</span><strong>'+esc(cash(value))+'</strong></div>';
  const info=d.structured||{},sale=d.saleId?getSale(d.saleId):null;
  const body='<div class="ct-void-detail" role="region" aria-label="Detalle de contrato anulado">'+
   '<p class="ct-void-alert"><strong>Contrato anulado · Solo lectura.</strong> Consultar esta ficha no vuelve a activar el contrato ni modifica el solar o los pagos.</p>'+
   '<div class="detail-line"><span>Número de ficha</span><strong>'+esc(d.id)+'</strong></div>'+
   '<div class="detail-line"><span>Cliente</span><strong>'+esc(client?.name||info.name||'Sin nombre')+'</strong></div>'+
   '<div class="detail-line"><span>Identidad</span><strong>'+esc(client?.identity||info.identity||'—')+'</strong></div>'+
   '<div class="detail-line"><span>Fecha del contrato</span><strong>'+esc(date(info.date||d.createdAt))+'</strong></div>'+
   '<div class="detail-line"><span>Fecha de anulación</span><strong>'+esc(date(d.voidedAt||d.updatedAt))+'</strong></div>'+
   '<div class="detail-line"><span>Anulado por</span><strong>'+esc(d.voidedBy||'Sin registro')+'</strong></div>'+
   '<div class="ct-void-section"><strong>Motivo de anulación</strong><p>'+esc(d.voidReason||'No se especificó motivo')+'</p></div>'+
   '<div class="ct-void-section"><strong>Terreno vinculado en el inventario</strong><p>'+linkedLabel+'</p></div>'+
   '<div class="ct-void-section"><strong>Terreno escrito en la ficha</strong><p>'+savedLabel+'</p></div>'+
   (otherGroupLots(d).length?'<div class="ct-void-section"><strong>Otros solares del mismo grupo (no de esta ficha)</strong><p>'+
    otherGroupLots(d).map(l=>'Etapa '+esc(l.stage||'—')+' · Bloque '+esc(l.block||'—')+' · Solar '+esc(num(l))).join('; ')+'</p></div>':'')+
   (mismatch?'<p class="ct-void-warning"><strong>Atención:</strong> la ubicación guardada en la ficha no coincide con el terreno vinculado. Revisa etapa, bloque y solar antes de registrar una ficha nueva.</p>':'')+
   moneyLine('Precio pactado',info.price??sale?.price)+moneyLine('Prima pactada',info.down??sale?.downPayment)+
   moneyLine('Saldo financiado',info.financed)+
   (d.documentKey?'<p><a class="btn btn-outline btn-sm" target="_blank" rel="noopener noreferrer" href="/api/app/file?key='+encodeURIComponent(d.documentKey)+'">Ver imagen original</a></p>':'')+
   '<section class="ct-void-release"><h4>Desbloquear solares del contrato anulado</h4>'+
   '<p class="sm muted">La liberación es por solar. El cliente y la ficha histórica se conservan. Las ventas, primas, abonos, reservas y otros contratos están protegidos.</p>'+
   linked.map(l=>{
    const audit=auditVoidedContractSolarRelease(db,d.id,l.id,d.residenceId);
    const name='Etapa '+esc(l.stage||'—')+' · Bloque '+esc(l.block||'—')+' · Solar '+esc(num(l));
    const released=(d.lotReleaseHistory||[]).some(h=>h.lotId===l.id);
    return '<div class="ct-void-release-row"><strong>'+name+'</strong>'+
     (released?'<span class="ct-void-released">Solar ya liberado</span>':
     audit.allowed&&typeof contractIntakeAdmin==='function'&&contractIntakeAdmin()?
      '<button type="button" class="btn btn-outline btn-sm" data-ct-voided-release="'+esc(d.id)+'" data-ct-voided-lot="'+esc(l.id)+'">Desbloquear y quitar del cliente</button>':
      '<small class="ct-void-protected">'+esc(audit.reasons.join(' ')||'Se requiere administrador con la nube sincronizada.')+'</small>')+
     '</div>';
   }).join('')+'</section>'+
   (sale?'<p class="sm muted">Esta ficha tiene una venta vinculada. Verifica sus pagos antes de generar otro contrato para no duplicar cobros.</p>':
   '<p class="sm muted">Si el solar correcto era otro, registra una ficha nueva desde Nuevo contrato y selecciona etapa, bloque y número correctos. Esta anulación queda en el historial.</p>')+
   '</div>';
  showModal('Consultar contrato anulado',body,
   '<button type="button" class="btn btn-outline" data-action="close-modal">Cerrar</button>',true);
 }
 // PIN de confirmación efímero: nunca se persiste ni se incluye en exportaciones.
 let activationPin='',activationPinUntil=0,activationBusy=false;
 const activationAdmin=()=>typeof cloudUser!=='undefined'&&cloudUser?.role==='admin';
 function refreshActivationPin(force=false){
  if(!activationAdmin()){activationPin='';activationPinUntil=0;return '';}
  if(force||Date.now()>=activationPinUntil){
   const previous=activationPin,bytes=new Uint32Array(1);
   do{crypto.getRandomValues(bytes);activationPin=String(bytes[0]%10000).padStart(4,'0');}while(activationPin===previous);
   activationPinUntil=Date.now()+60000;
  }
  return activationPin;
 }
 function activationPinMarkup(){
  if(!activationAdmin())return '';
  return '<div class="card ct-activation-pin" role="region" aria-label="PIN del administrador"><span>PIN para activar contratos</span> <strong data-ct-pin-value>'+refreshActivationPin()+'</strong><small> Solo administrador · cambia cada minuto y después de utilizarlo</small></div>';
 }
 setInterval(()=>{
  const el=document.querySelector('.ct-activation-pin');
  if(!el){if(!activationAdmin())refreshActivationPin();return;}
  if(!activationAdmin()){el.remove();refreshActivationPin();return;}
  el.querySelector('[data-ct-pin-value]').textContent=refreshActivationPin();
 },1000);
 function activationRecord(id){
  if(!activationAdmin()||!contractIntakeAdmin())throw Error('Se requiere administrador con la nube sincronizada.');
  const d=(db.contractTexts||[]).find(x=>x.id===id&&x.status==='voided'&&x.residenceId===residence().id);
  if(!d)throw Error('El contrato ya no está anulado o pertenece a otra residencial.');
  const lot=getLot(d.lotId);
  if(!lot||lot.residenceId!==d.residenceId||!getClient(d.clientId))throw Error('Revisa el cliente y el solar del contrato.');
  if(contractVoidMismatch({doc:d,lots:[lot]}))throw Error('La etapa, bloque o solar no coincide con la ficha. Corrige la ubicación antes de activar.');
  if((lot.ownerClientId&&lot.ownerClientId!==d.clientId)||(lot.clientId&&lot.clientId!==d.clientId)||
   (lot.pendingContractId&&lot.pendingContractId!==d.id)||(lot.contractId&&lot.contractId!==d.id)||
   (db.contractTexts||[]).some(x=>x.id!==d.id&&x.status!=='voided'&&x.lotId===lot.id)||
   (db.sales||[]).some(x=>x.lotId===lot.id&&x.id!==d.saleId)||
   (db.reservations||[]).some(x=>x.lotId===lot.id&&!['expired','cancelled','voided'].includes(x.status)))
   throw Error('El solar tiene otra asignación, venta, contrato o apartado.');
  if(d.saleId&&!getSale(d.saleId))throw Error('No se encontró la venta original. Revisa el contrato.');
  if(lot.type==='private'||lot.status==='private')throw Error('El solar es una propiedad privada; no se puede activar desde contratos.');
  return d;
 }
 function activationOpen(id){
  try{
   const d=activationRecord(id);refreshActivationPin();
   showModal('Activar contrato',
    '<p>Reactivar contrato <strong>'+esc(d.id)+'</strong> de '+esc(getClient(d.clientId)?.name)+'.</p><p>Introduce el PIN que aparece arriba del panel del administrador.</p>'+
    '<form id="ct-activation-form"><input type="hidden" name="documentId" value="'+esc(id)+'"><label>PIN de 4 dígitos<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" required></label><p id="ct-activation-error" role="alert"></p></form>',
    '<button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button><button type="submit" form="ct-activation-form" class="btn btn-primary">Activar contrato</button>',true);
  }catch(e){toast(e.message,'error');}
 }
 document.addEventListener('submit',async e=>{
  if(e.target.id!=='ct-activation-form')return;
  e.preventDefault();e.stopImmediatePropagation();if(activationBusy)return;
  try{
   const data=Object.fromEntries(new FormData(e.target)),d=activationRecord(data.documentId);
   if(Date.now()>=activationPinUntil||!/^\d{4}$/.test(data.pin)||data.pin!==activationPin){
    refreshActivationPin();throw Error('PIN incorrecto o vencido. Consulta el PIN actual del administrador.');
   }
   const next=JSON.parse(JSON.stringify(db)),record=next.contractTexts.find(x=>x.id===d.id),lot=next.lots.find(x=>x.id===d.lotId);
   const at=new Date().toISOString();
   record.status=record.saleId?'active':(record.statusBeforeVoid==='registered'?'registered':'pending-sale');
   record.reactivationHistory=[...(record.reactivationHistory||[]),{at,by:cloudUser.name||'Administrador',voidedAt:record.voidedAt,voidReason:record.voidReason}];
   record.updatedAt=at;lot.ownerClientId=record.clientId;
   if(record.saleId){lot.status='sold';delete lot.pendingContractId;}else lot.pendingContractId=record.id;
   activationBusy=true;refreshActivationPin(true);
   cloudWrite(JSON.stringify(next));db=next;await cloudFlush();closeModal();render();
   toast(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed?'Reactivación pendiente de sincronización.':'Contrato reactivado.');
  }catch(err){const el=document.getElementById('ct-activation-error');if(el)el.textContent=err.message;toast(err.message,'error');}
  finally{activationBusy=false;}
 },true);
 let voidedReleaseDraft=null;
 function contractVoidedReleaseOpen(documentId,lotId){
  if(typeof contractIntakeAdmin!=='function'||!contractIntakeAdmin()){
   toast('Para liberar un solar necesitas administrador y nube sincronizada.','error');return;
  }
  const audit=auditVoidedContractSolarRelease(db,documentId,lotId,residence().id);
  if(!audit.allowed){toast('Solar protegido: '+audit.reasons.join(' '),'error');return;}
  const d=(db.contractTexts||[]).find(x=>x.id===documentId),lot=getLot(lotId),client=getClient(d.clientId);
  voidedReleaseDraft={documentId,lotId,residenceId:residence().id,snapshot:JSON.stringify(db),
   downloaded:false,checked:false,reason:'',code:'',busy:false};
  showModal('Desbloquear solar de contrato anulado',
   '<p class="ct-void-alert"><strong>Acción administrativa:</strong> el solar quedará disponible y se retirará su vínculo con este cliente, solo si no tiene operaciones válidas.</p>'+
   '<p><strong>'+esc(client?.name||'Cliente')+'</strong> · Etapa '+esc(lot.stage)+' · Bloque '+esc(lot.block)+' · Solar '+esc(num(lot))+'</p>'+
   (audit.planMarkedSold?'<p class="ct-void-warning"><strong>Vendido en el plano:</strong> al confirmar, también se corregirá esa marca para dejar este solar disponible. La corrección quedará en el historial.</p>':'')+
   '<p class="sm muted">No se eliminan clientes, contratos históricos, ventas ni recibos. No se modifican otros solares.</p>'+
   '<button type="button" class="btn btn-outline" data-ct-release-backup>1. Descargar respaldo completo JSON</button>'+
   '<label class="ct-void-check"><input type="checkbox" id="ct-release-confirm-backup"> Confirmo que descargué y guardé el respaldo</label>'+
   '<label class="field-group">Motivo de liberación<input id="ct-release-reason" maxlength="300" placeholder="Ej.: Se vinculó el solar 1 y correspondía el 2"></label>'+
   '<label class="field-group">Escribe LIBERAR para confirmar<input id="ct-release-code" autocomplete="off" placeholder="LIBERAR"></label>'+
   '<p id="ct-release-error" role="alert"></p>',
   '<button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>'+
   '<button type="button" class="btn btn-primary" data-ct-release-confirm disabled>Confirmar liberación</button>',true);
 }
 function contractVoidedReleaseToggle(){
  const d=voidedReleaseDraft,button=document.querySelector('[data-ct-release-confirm]');
  if(button)button.disabled=!d||d.busy||!d.downloaded||!d.checked||d.code!=='LIBERAR'||d.reason.trim().length<5;
 }
 async function contractVoidedReleaseSave(){
  const d=voidedReleaseDraft;if(!d||d.busy)return;
  const error=document.getElementById('ct-release-error');
  try{
   if(!contractIntakeAdmin())throw Error('Se requiere administrador y sincronización confirmada.');
   if(!d.downloaded||!d.checked||d.code!=='LIBERAR')throw Error('Primero descarga el respaldo y confirma LIBERAR.');
   if(d.reason.trim().length<5)throw Error('Indica el motivo de liberación.');
   if(residence().id!==d.residenceId||JSON.stringify(db)!==d.snapshot)
    throw Error('Los registros cambiaron. Vuelve a revisar y descargar el respaldo.');
   const result=releaseVoidedContractSolar(db,d.documentId,d.lotId,d.residenceId,
    cloudUser?.name||'Administrador',d.reason);
   if(!confirm('¿Liberar este solar y desvincularlo del cliente? El contrato anulado permanecerá en el historial.'))return;
   d.busy=true;contractVoidedReleaseToggle();
   cloudWrite(JSON.stringify(result.state));db=result.state;
   await cloudFlush();
   closeModal();voidedReleaseDraft=null;render();
   if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
    toast('Solar liberado localmente; falta confirmar la nube. No lo reasignes hasta sincronizar.','error');
   else toast('Solar desbloqueado y retirado del cliente. Contrato anulado conservado.');
  }catch(e){if(error)error.textContent=e.message;toast(e.message,'error');}
  finally{if(d){d.busy=false;contractVoidedReleaseToggle();}}
 }
 function actions(r){
  if(r.type==='sale')return '<button class="btn btn-outline btn-sm" data-ct-manual="'+esc(r.clientId)+'">Ficha manual</button> '+
    '<button class="btn btn-outline btn-sm" data-action="contract-scan" data-client="'+esc(r.clientId)+'" data-id="'+esc(r.id)+'">Escanear texto</button> '+
    '<button class="btn btn-outline btn-sm" data-action="contract-preview" data-id="'+esc(r.id)+'">Plantilla</button>';
  const d=r.doc;
  if(d.status==='voided')return '<button type="button" class="btn btn-outline btn-sm" data-ct-voided-view="'+esc(d.id)+'">Ver anulación</button>'+ (activationAdmin()?' <button type="button" class="btn btn-primary btn-sm" data-ct-activate="'+esc(d.id)+'">Activar contrato</button>':'');
  return '<button class="btn btn-outline btn-sm" data-contract-ficha-view="'+esc(d.id)+'">Ver</button> '+
   (d.status!=='voided'?'<button class="btn btn-outline btn-sm" data-contract-edit="'+esc(d.id)+'">Editar</button> '+
    '<button class="btn btn-outline btn-sm" data-contract-delete="'+esc(d.id)+'">Eliminar</button> ':'')+
   (d.structured&&d.clientId?'<button class="btn btn-outline btn-sm" data-contract-sheet="'+esc(d.id)+'">PDF</button> ':'')+
   (r.sale?'<button class="btn btn-outline btn-sm" data-action="contract-preview" data-id="'+esc(r.sale.id)+'">Plantilla</button> ':'')+
   (d.format==='text-only'?'<button class="btn btn-outline btn-sm" data-action="contract-text-edit" data-id="'+esc(d.id)+'">Editar texto</button> ':'')+
   (d.status==='pending-sale'?'<button class="btn btn-primary btn-sm" data-contract-intake-activate="'+esc(d.id)+'">Activar crédito</button> ':'')+
   (d.documentKey?'<a class="btn btn-outline btn-sm" href="/api/app/file?key='+encodeURIComponent(d.documentKey)+'" target="_blank" rel="noopener noreferrer">Original</a>':'');
 }
 contractsPage=function(){
  const rid=residence().id;
  if(state.residence!==rid)Object.assign(state,{residence:rid,query:'',stage:'all',block:'all',solar:'all',status:'all',page:1});
  const all=makeRows(),stages=distinct(all.flatMap(r=>r.lots.map(l=>val(l.stage))));
  const stageRows=all.filter(r=>locationMatch(r,'stage',state.stage));
  const blocks=distinct(stageRows.flatMap(r=>r.lots.map(l=>val(l.block))));
  if(state.block!=='all'&&!blocks.includes(state.block))state.block='all';
  const blockRows=stageRows.filter(r=>locationMatch(r,'block',state.block));
  const solars=distinct(blockRows.flatMap(r=>r.lots.map(num)));
  if(state.solar!=='all'&&!solars.includes(state.solar))state.solar='all';
  const list=filtered(all),pages=Math.max(1,Math.ceil(list.length/perPage));
  state.page=Math.min(Math.max(state.page,1),pages);
  const start=(state.page-1)*perPage,subset=list.slice(start,start+perPage);
  const count=s=>all.filter(r=>r.status===s).length;
  const toolbar='<button type="button" class="btn btn-primary" data-contract-intake-open>'+ic('plus')+' Nuevo contrato</button>'+
    '<button type="button" class="btn btn-outline" data-ct-print>'+ic('printer')+' Imprimir</button>'+
    '<button type="button" class="btn btn-outline" data-ct-export>'+ic('download')+' Exportar Excel</button>';
  const cards='<div class="ct-stats">'+[['all','▤','Fichas registradas',all.filter(r=>r.type==='doc').length],['active','✓','Activos',count('active')],['pending','◷','Por completar',count('pending')+count('missing')],['voided','×','Anulados',count('voided')]]
    .map(([style,icon,label,n])=>style==='voided'?
     '<button type="button" class="ct-stat ct-voided ct-stat-link" data-ct-show-voided aria-pressed="'+(state.status==='voided')+'" title="Mostrar contratos anulados"><span class="ct-symbol" aria-hidden="true">'+icon+'</span><span><small>'+label+'</small><strong>'+n+'</strong><small>Ver lista</small></span></button>':
     '<div class="ct-stat ct-'+style+'"><span class="ct-symbol" aria-hidden="true">'+icon+'</span><div><small>'+label+'</small><strong>'+n+'</strong></div></div>').join('')+'</div>';
  const filters='<section class="card ct-filters"><div class="ct-fields">'+
    '<label>Buscar contrato<input type="search" id="ct-query" value="'+esc(state.query)+'" placeholder="Contrato, cliente, identidad o solar"></label>'+
    '<label>Etapa<select id="ct-stage">'+opt('all','Todas',state.stage)+stages.map(s=>opt(s,'Etapa '+s,state.stage)).join('')+'</select></label>'+
    '<label>Bloque<select id="ct-block">'+opt('all','Todos',state.block)+blocks.map(b=>opt(b,'Bloque '+b,state.block)).join('')+'</select></label>'+
    '<label>Solar<select id="ct-solar">'+opt('all','Todos',state.solar)+solars.map(n=>opt(n,'Solar '+n,state.solar)).join('')+'</select></label>'+
    '<label>Estado<select id="ct-status">'+Object.entries(statuses).map(([s,t])=>opt(s,t,state.status)).join('')+'</select></label>'+
    '<button class="btn btn-outline" type="button" data-ct-clear>Limpiar</button></div></section>';
  const table='<section class="card"><div class="panel-table-head"><h2>'+(state.status==='voided'?'Contratos anulados':'Registro de contratos')+'</h2><span class="sm muted">'+list.length+' resultado(s)</span></div>'+
    '<div class="table-scroll ct-scroll" role="region" aria-label="Tabla de contratos" tabindex="0"><table class="ct-table"><thead><tr>'+
    '<th>N.º contrato / ficha</th><th>Cliente</th><th>Terreno (etapa / bloque / solar)</th><th>Fecha / registro</th><th>Monto (L)</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+
    subset.map(r=>'<tr><td class="strong">'+(r.type==='doc'?esc(r.id):'—'+ '<small class="ct-more">Venta '+esc(r.id)+'</small>')+'</td>'+
      '<td>'+esc(r.client?.name||r.doc?.structured?.name||'Cliente por completar')+'</td>'+
      '<td>'+where(r)+'</td><td>'+(r.date&&/^\d{4}-\d{2}-\d{2}/.test(String(r.date))?fmtDate(String(r.date).slice(0,10)):'—')+'</td>'+
      '<td class="tabular">'+(r.amount==null||r.amount===''||!Number.isFinite(Number(r.amount))?'—':money(Number(r.amount)))+'</td>'+
      '<td><span class="ct-state ct-'+r.status+'">'+esc(statuses[r.status])+'</span></td><td class="ct-actions">'+actions(r)+'</td></tr>').join('')+
    '</tbody></table>'+(subset.length?'':'<p class="empty">No hay contratos con los filtros seleccionados.</p>')+'</div>'+
    '<footer class="ct-pagination"><span>Mostrando '+(list.length?start+1:0)+' a '+(start+subset.length)+' de '+list.length+'</span>'+
    '<div><button class="btn btn-outline btn-sm" data-ct-page="'+(state.page-1)+'" '+(state.page<=1?'disabled':'')+'>Anterior</button>'+
    '<span>Página '+state.page+' de '+pages+'</span>'+
    '<button class="btn btn-outline btn-sm" data-ct-page="'+(state.page+1)+'" '+(state.page>=pages?'disabled':'')+'>Siguiente</button></div></footer></section>';
  const assignments=(db.lots||[]).filter(l=>l.residenceId===rid&&l.ownerClientId&&getClient(l.ownerClientId)).sort((a,b)=>val(getClient(a.ownerClientId).name).localeCompare(val(getClient(b.ownerClientId).name),'es-HN')||val(a.stage).localeCompare(val(b.stage),'es-HN',{numeric:true}));
  const tools='<details class="card ct-tools"><summary>Más herramientas de contratos</summary><p class="sm muted">Estas operaciones conservan las fichas, los pagos y las medidas actuales.</p>'+
    '<div class="ct-tool-actions"><button class="btn btn-outline" data-contract-owner-manual>Ficha de contrato manual</button>'+
    '<button class="btn btn-outline" data-contract-owner-open>Asignar solares a un cliente</button>'+
    '<button class="btn btn-outline" data-action="contract-scan-choose">Escanear contrato (solo texto)</button>'+
    '<button class="btn btn-outline" data-contract-rebuild-open>Preparar limpieza de clientes</button>'+
    '<button class="btn btn-outline" data-page="residences">Administrar residenciales</button></div>'+
    (typeof annexPlansMarkup==='function'?annexPlansMarkup(residence()):'')+    '<details style="margin:12px 0"><summary>Solares asignados a clientes ('+assignments.length+')</summary>'+    '<div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Etapa</th><th>Bloque</th><th>Solar</th></tr></thead><tbody>'+    assignments.slice(0,70).map(l=>'<tr><td>'+esc(getClient(l.ownerClientId).name)+'</td><td>'+esc(l.stage||'—')+'</td><td>'+esc(l.block||'—')+'</td><td>'+esc(num(l))+'</td></tr>').join('')+'</tbody></table></div>'+    (assignments.length>70?'<p class="sm muted">Se muestran 70 registros; el resto continúa disponible en Clientes.</p>':'')+'</details>'+
    '<p class="sm muted">Registrar una ficha no significa cobrar la prima. El crédito y los abonos se activan por separado.</p></details>';
  return '<div class="ct-module">'+
    header('Contratos','Gestión de fichas, documentos y terrenos vinculados.',toolbar)+
    activationPinMarkup()+cards+filters+table+tools+'</div>';
 };
 // En Contratos, aprovechar la barra superior del sistema en lugar de repetir
 // cabecera, selector de residencial y botones dentro del área de trabajo.
 function contractToolbarInTopbar(){
  const root=document.getElementById('app');
  const bar=root?.querySelector('.lg-topbar');
  const content=root?.querySelector('.ct-module');
  const head=content?.querySelector('.page-head');
  const buttons=head?.querySelector('.head-actions');
  if(!bar||!content||!head||!buttons||bar.querySelector('.ct-top-actions'))return;
  const toolbar=document.createElement('div');
  toolbar.className='ct-top-actions';
  toolbar.setAttribute('aria-label','Residencial y acciones de contratos');
  const label=document.createElement('label');
  label.className='ct-top-residence';
  label.htmlFor='ct-top-residence-select';
  const name=document.createElement('span');
  name.textContent='Residencial';
  const select=document.createElement('select');
  select.id='ct-top-residence-select';
  select.setAttribute('data-residence-picker','');
  select.setAttribute('aria-label','Seleccionar residencial para contratos');
  const current=residence().id;
  for(const r of db.residences.filter(r=>!r.hidden||r.id===current)){
   const opt=document.createElement('option');
   opt.value=r.id;opt.textContent=r.name;
   opt.selected=r.id===current;
   select.appendChild(opt);
  }
  label.append(name,select);
  toolbar.appendChild(label);
  // Mover los botones reales: se conservan sus data-action y permisos existentes.
  while(buttons.firstChild)toolbar.appendChild(buttons.firstChild);
  bar.insertBefore(toolbar,bar.querySelector('.lg-top-tools'));
  bar.classList.add('ct-topbar');
  head.remove();
  // Proteger esta vista frente a otros adaptadores que añadieran otro selector.
  content.querySelectorAll('[data-residence-picker]').forEach(el=>{
   const wrapper=el.closest('.card');
   if(wrapper&&wrapper.querySelectorAll('[data-residence-picker]').length===1){
    wrapper.remove();
   }else{
    el.closest('label')?.remove();
   }
  });
 }
 const contractDashboardPreviousRender=render;
 render=function(){
  const result=contractDashboardPreviousRender.apply(this,arguments);
  if(page==='contracts')contractToolbarInTopbar();
  return result;
 };
 function update(key,val){state[key]=val;state.page=1;if(key==='stage'){state.block='all';state.solar='all';}else if(key==='block')state.solar='all';render();}
 document.addEventListener('input',e=>{
  if(voidedReleaseDraft&&e.target.id==='ct-release-reason'){
   voidedReleaseDraft.reason=e.target.value;contractVoidedReleaseToggle();return;
  }
  if(voidedReleaseDraft&&e.target.id==='ct-release-code'){
   voidedReleaseDraft.code=e.target.value.trim().toUpperCase();contractVoidedReleaseToggle();return;
  }
  if(e.target.id!=='ct-query')return;
  const index=typeof e.target.selectionStart==='number'?e.target.selectionStart:null;
  update('query',e.target.value);
  const input=document.getElementById('ct-query');
  if(input){input.focus({preventScroll:true});if(index!==null)input.setSelectionRange(index,index);}
 });
 document.addEventListener('change',e=>{
  if(e.target.id==='ct-release-confirm-backup'&&voidedReleaseDraft){
   voidedReleaseDraft.checked=Boolean(e.target.checked);contractVoidedReleaseToggle();return;
  }
  const keys={'ct-stage':'stage','ct-block':'block','ct-solar':'solar','ct-status':'status'};
  if(keys[e.target.id])update(keys[e.target.id],e.target.value);
 });
 document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-ct-activate],[data-ct-manual],[data-ct-print],[data-ct-export],[data-ct-clear],[data-ct-page],[data-ct-show-voided],[data-ct-voided-view],[data-ct-voided-release],[data-ct-release-backup],[data-ct-release-confirm]');
  if(!btn)return;
  e.preventDefault();
  if(btn.hasAttribute('data-ct-activate'))return activationOpen(btn.dataset.ctActivate);
  if(btn.hasAttribute('data-ct-voided-release'))
   return contractVoidedReleaseOpen(btn.dataset.ctVoidedRelease,btn.dataset.ctVoidedLot);
  if(btn.hasAttribute('data-ct-release-backup')){
   const d=voidedReleaseDraft;if(!d||d.busy)return;
   const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
   download('LOTIGEST_RESPALDO_LIBERACION_SOLAR_'+stamp+'.json',JSON.stringify(db,null,2),'application/json');
   d.downloaded=true;contractVoidedReleaseToggle();return;
  }
  if(btn.hasAttribute('data-ct-release-confirm')){contractVoidedReleaseSave();return;}
  if(btn.hasAttribute('data-ct-voided-view'))return contractVoidedView(btn.dataset.ctVoidedView);
  if(btn.hasAttribute('data-ct-show-voided')){
   const next=state.status==='voided'?'all':'voided';
   Object.assign(state,{query:'',stage:'all',block:'all',solar:'all',status:next,page:1});
   render();return;
  }
  if(btn.hasAttribute('data-ct-manual'))return contractIntakeOpen(btn.dataset.ctManual,'manual');
  if(btn.hasAttribute('data-ct-clear')){Object.assign(state,{query:'',stage:'all',block:'all',solar:'all',status:'all',page:1});render();return;}
  if(btn.hasAttribute('data-ct-page')){const n=Number(btn.dataset.ctPage);if(Number.isSafeInteger(n)&&n>=1){state.page=n;render();}return;}
  if(btn.hasAttribute('data-ct-print')){window.print();return;}
  if(btn.hasAttribute('data-ct-export')){
   const headers=['Ficha / contrato','Venta','Cliente','Identidad','Etapa','Bloque','Solar(es)','Fecha / registro','Monto (L)','Estado'];
   const lines=filtered(makeRows()).map(r=>[r.type==='doc'?r.id:'',r.sale?.id||'',r.client?.name||r.doc?.structured?.name||'',r.client?.identity||'',
    distinct(r.lots.map(l=>l.stage)).join(', '),distinct(r.lots.map(l=>l.block)).join(', '),r.lots.map(num).join(', '),
    String(r.date||'').slice(0,10),r.amount??'',statuses[r.status]]);
   downloadExcel('LOTIGEST_Contratos_'+new Date().toISOString().slice(0,10)+'.xlsx',headers,lines);
  }
 });
})();