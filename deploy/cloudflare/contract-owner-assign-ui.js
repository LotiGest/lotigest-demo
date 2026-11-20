// Vinculación documental de propietarios: NO crea contratos, ventas, recibos ni cuotas.
function contractOwnerLotTitle(l){
 return 'Etapa '+String(l.stage??'sin confirmar')+' · Bloque '+String(l.block||'—')+' · Solar '+String(l.sourceNumber||l.number||l.id);
}
function planContractOwnerAssignment(state,residenceId,clientId,lotIds){
 if(!state?.residences?.some(r=>r.id===residenceId))throw Error('Selecciona una residencial válida.');
 if(!state.clients?.some(c=>c.id===clientId))throw Error('Selecciona un cliente registrado.');
 if(!Array.isArray(lotIds)||lotIds.length<1||lotIds.length>10||lotIds.some(id=>!id||typeof id!=='string'))
  throw Error('Selecciona entre uno y diez solares.');
 if(new Set(lotIds).size!==lotIds.length)throw Error('No puedes seleccionar el mismo solar dos veces.');
 const selected=lotIds.map(id=>{
  const lot=state.lots?.find(l=>l.id===id&&l.residenceId===residenceId);
  if(!lot)throw Error('El solar no pertenece a esta residencial.');
  if(lot.type==='private'||lot.status==='private')throw Error('No puedes asignar propiedades privadas.');
  if(!String(lot.stage??'').trim()||!String(lot.block??'').trim()||!String(lot.sourceNumber??lot.number??'').trim())
   throw Error('La etapa, el bloque y el número de solar deben estar identificados en el inventario.');
  if(lot.ownerClientId&&lot.ownerClientId!==clientId)throw Error(contractOwnerLotTitle(lot)+' ya está asignado a otro cliente.');
  const sales=(state.sales||[]).filter(s=>s.lotId===id);
  if(sales.some(s=>s.clientId!==clientId))throw Error(contractOwnerLotTitle(lot)+' tiene una venta registrada para otra persona.');
  if((state.reservations||[]).some(r=>r.lotId===id&&r.status==='active'))
   throw Error(contractOwnerLotTitle(lot)+' tiene un apartado activo. Resuelve el apartado antes de asignar.');
  if(lot.status==='reserved')throw Error(contractOwnerLotTitle(lot)+' está reservado. Revisa el apartado antes de asignar.');
  if((state.contractTexts||[]).some(d=>d.lotId===id&&d.status!=='voided'&&d.clientId!==clientId))
   throw Error(contractOwnerLotTitle(lot)+' tiene un contrato de otro cliente.');
  if((state.ownershipStatements||[]).some(s=>s.clientId&&s.clientId!==clientId&&
    (s.references||[]).some(r=>r.lotId===id)))
   throw Error(contractOwnerLotTitle(lot)+' aparece en una ficha de propietario diferente.');
  return lot;
 });
 const next=JSON.parse(JSON.stringify(state));
 let assigned=0;
 for(const selectedLot of selected){
  const lot=next.lots.find(l=>l.id===selectedLot.id);
  if(lot.ownerClientId!==clientId){lot.ownerClientId=clientId;assigned++;}
 }
 return {state:next,assigned,lots:selected.map(l=>({id:l.id,title:contractOwnerLotTitle(l)}))};
}
let contractOwnerDraft=null;
function contractOwnerCandidates(clientId){
 const rid=residence().id;
 return residenceLots().filter(l=>l.residenceId===rid&&l.type!=='private'&&l.status!=='private').sort((a,b)=>
  String(a.stage||'').localeCompare(String(b.stage||''),'es',{numeric:true})||
  String(a.block||'').localeCompare(String(b.block||''),'es',{numeric:true})||
  String(a.sourceNumber||a.number||a.id).localeCompare(String(b.sourceNumber||b.number||b.id),'es',{numeric:true})).map(l=>{
  const sale=db.sales.find(s=>s.lotId===l.id),reserved=(db.reservations||[]).some(r=>r.lotId===l.id&&r.status==='active');
  const otherStatement=(db.ownershipStatements||[]).some(s=>s.clientId&&s.clientId!==clientId&&(s.references||[]).some(r=>r.lotId===l.id));
  const otherDoc=(db.contractTexts||[]).some(d=>d.lotId===l.id&&d.status!=='voided'&&d.clientId!==clientId);
  const blocked=(!l.stage||!l.block||!(l.sourceNumber||l.number))||
    (l.ownerClientId&&l.ownerClientId!==clientId)||
    (sale&&sale.clientId!==clientId)||l.status==='reserved'||reserved||otherStatement||otherDoc;
  return {lot:l,blocked};
 });
}
function contractOwnerAssigned(clientId,rid){
 const sold=new Set((db.sales||[]).filter(s=>s.clientId===clientId).map(s=>s.lotId));
 return (db.lots||[]).filter(l=>l.residenceId===rid&&(l.ownerClientId===clientId||sold.has(l.id)));
}
function contractOwnerResults(){
 const box=document.getElementById('contract-owner-results'),draft=contractOwnerDraft;
 if(!box||!draft)return;
 const q=normalizeClientLookup(draft.search||'');
 const candidates=(db.clients||[]).filter(c=>!q||normalizeClientLookup((c.name||'')+' '+(c.identity||'')).includes(q)).slice(0,20);
 box.innerHTML=candidates.map(c=>'<button type="button" class="btn btn-outline btn-sm" style="display:block;margin:5px 0;width:100%;white-space:normal;text-align:left" data-contract-owner-client="'+esc(c.id)+'">'+esc(c.name)+' · '+esc(c.identity||'Sin identidad')+'</button>').join('')||
  '<p class="sm muted">No se encontró al cliente; regístralo primero en Clientes.</p>';
}
function contractOwnerRows(){
 const draft=contractOwnerDraft;
 const options=contractOwnerCandidates(draft.clientId);
 return draft.lotIds.map((id,i)=>'<div class="field-group" style="display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:9px 0">'+
  '<label style="flex:1;min-width:200px">Solar '+(i+1)+' · Etapa / Bloque / Número'+
  '<select aria-label="Solar '+(i+1)+'" data-contract-owner-lot="'+i+'" style="width:100%"><option value="">Selecciona etapa, bloque y solar</option>'+
  options.map(({lot,blocked})=>'<option value="'+esc(lot.id)+'" '+(id===lot.id?'selected':'')+' '+(blocked?'disabled':'')+'>'+esc(contractOwnerLotTitle(lot))+
  (lot.ownerClientId===draft.clientId?' · Ya asociado':'')+(blocked?' · No disponible':'')+'</option>').join('')+'</select></label>'+
  (draft.lotIds.length>1?'<button type="button" class="btn btn-outline btn-sm" data-contract-owner-remove="'+i+'">Quitar</button>':'')+'</div>').join('');
}
function contractOwnerRender(){
 const draft=contractOwnerDraft,root=document.querySelector('#modal-root .modal-content');
 if(!root||!draft)return;
 const client=db.clients.find(c=>c.id===draft.clientId);
 const linked=client?contractOwnerAssigned(client.id,draft.residenceId):[];
 root.innerHTML='<p>Relaciona uno o varios solares del inventario con un cliente existente. Puedes escoger etapas y bloques diferentes sin duplicar su ficha.</p>'+
  '<label>Buscar cliente por nombre o identidad<input id="contract-owner-search" type="search" autocomplete="off" placeholder="Nombre o identidad" value="'+esc(draft.search||'')+'"></label>'+
  '<div id="contract-owner-results" style="max-height:165px;overflow:auto;margin:8px 0"></div>'+
  '<div class="notice-card">'+(client?'<strong>Cliente seleccionado: '+esc(client.name)+'</strong><p class="sm">Identidad: '+esc(client.identity||'Pendiente')+'</p>'+
  '<p class="sm">Solares asociados (pueden ser provisionales sin contrato): '+(linked.length?linked.map(l=>esc(contractOwnerLotTitle(l))).join(' · '):'Ninguno en esta residencial')+'</p>':
  '<strong>Selecciona un cliente existente antes de guardar.</strong>')+'</div>'+
  '<h3 style="margin:14px 0 8px">Etapa, bloque y solar de este cliente</h3>'+
  contractOwnerRows()+
  '<button type="button" class="btn btn-outline btn-sm" data-contract-owner-add '+(draft.lotIds.length>=10?'disabled':'')+'>+ Añadir otro solar</button>'+
  '<p class="sm muted">Al guardar se vincula el propietario sin crear una venta, contrato nuevo, prima o abono. Los solares vendidos, reservados o asignados a otra persona están protegidos.</p>'+
  '<p id="contract-owner-error" role="alert" style="color:#b13f42"></p>';
 contractOwnerResults();
 const save=document.querySelector('[data-contract-owner-save]');
 if(save)save.disabled=!client||draft.busy;
}
function contractOwnerOpen(clientId=''){
 if(!contractIntakeAdmin()){toast('Solo el administrador con la nube sincronizada puede asignar solares.','error');return;}
 contractOwnerDraft={clientId:db.clients.some(c=>c.id===clientId)?clientId:'',residenceId:residence().id,search:'',lotIds:[''],busy:false};
 showModal('Asignar bloque y solares a un cliente','<div>Preparando ficha…</div>',
  '<button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button>'+
  '<button type="button" class="btn btn-primary" data-contract-owner-save>Guardar asignación</button>',true);
 contractOwnerRender();
}
async function contractOwnerSave(){
 const draft=contractOwnerDraft;if(!draft||draft.busy)return;
 if(!contractIntakeAdmin()||draft.residenceId!==residence().id)throw Error('La residencial o la sesión cambió; vuelve a abrir el formulario.');
 const snapshot=JSON.stringify(db);
 const plan=planContractOwnerAssignment(db,draft.residenceId,draft.clientId,draft.lotIds);
 if(!plan.assigned){toast('Estos solares ya estaban vinculados al cliente.');closeModal();return;}
 draft.busy=true;
 try{
  if(!contractIntakeAdmin()||JSON.stringify(db)!==snapshot)throw Error('Los datos cambiaron. Vuelve a revisar los solares.');
  cloudWrite(JSON.stringify(plan.state));db=plan.state;
  await cloudFlush();
  closeModal();contractOwnerDraft=null;render();
  if(cloudBlocked||cloudOffline||cloudQueue?.latest!==cloudQueue?.confirmed)
   toast('La asignación quedó pendiente de sincronización. Verifica la nube antes de continuar.','error');
  else toast(plan.assigned+' solar(es) vinculados al cliente. Puedes completar su contrato sin OCR.');
 }finally{draft.busy=false;}
}
const contractOwnerOldPage=contractsPage;
contractsPage=function(){
 const html=contractOwnerOldPage(),rid=residence().id;
 const assignments=(db.lots||[]).filter(l=>l.residenceId===rid&&l.ownerClientId&&getClient(l.ownerClientId))
  .sort((a,b)=>String(getClient(a.ownerClientId).name).localeCompare(String(getClient(b.ownerClientId).name),'es')||
    String(a.stage||'').localeCompare(String(b.stage||''),'es',{numeric:true})||
    String(a.block||'').localeCompare(String(b.block||''),'es',{numeric:true}));
 const panel='<section class="card" style="padding:18px;margin:14px 0"><h2>Bloques y solares de cada cliente</h2>'+
  '<p>Asigna solares a personas ya registradas y comprueba su etapa, bloque y número desde Contratos. Esto no registra ningún cobro.</p>'+
  '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary" data-contract-owner-open>Asignar solares a cliente</button>'+
  '<button type="button" class="btn btn-outline" data-contract-owner-manual>Completar ficha de contrato manual</button></div>'+
  '<div style="margin-top:12px"><strong>'+assignments.filter(contractOwnerHasConfirmedContract).length+' solares respaldados por contrato; '+assignments.filter(l=>!contractOwnerHasConfirmedContract(l)).length+' asociaciones provisionales</strong>'+
  (assignments.length?'<div class="table-scroll" style="margin-top:10px;max-height:320px;overflow:auto"><table><thead><tr><th>Cliente</th><th>Etapa</th><th>Bloque</th><th>Solar</th><th>Respaldo</th></tr></thead><tbody>'+
   assignments.slice(0,70).map(l=>'<tr><td>'+esc(getClient(l.ownerClientId).name)+'</td><td>'+esc(l.stage||'—')+'</td><td>'+esc(l.block||'—')+'</td><td>'+esc(l.sourceNumber||l.number||l.id)+'</td><td>'+(contractOwnerHasConfirmedContract(l)?'En contrato':'Provisional, sin contrato')+'</td></tr>').join('')+
   '</tbody></table></div>'+(assignments.length>70?'<p class="sm muted">Mostrando 70 solares. Abre la ficha del cliente para consultar sus demás solares.</p>':''):
   '<p class="sm muted">Sin propietarios identificados todavía en esta residencial.</p>')+'</div></section>';
 const marker='<section class="card" style="padding:18px;margin:14px 0">';
 return html.includes(marker)?html.replace(marker,panel+marker):panel+html;
};
function contractOwnerHasConfirmedContract(lot){
 return (db.contractTexts||[]).some(d=>d.status!=='voided'&&d.clientId===lot.ownerClientId&&
  (d.lotId===lot.id||(d.contractLotIds||[]).includes(lot.id)||
   db.sales.some(s=>s.id===d.saleId&&s.lotId===lot.id)));
}
const contractOwnerPreviousView=viewContractText;
viewContractText=function(id){
 contractOwnerPreviousView(id);
 const doc=(db.contractTexts||[]).find(d=>d.id===id);
 const footer=document.querySelector('#modal-root .modal-footer');
 if(doc?.clientId&&footer)footer.insertAdjacentHTML('beforeend',
  '<button type="button" class="btn btn-outline" data-contract-owner-open-client="'+esc(doc.clientId)+'">Asignar bloques y solares a este cliente</button>');
};
document.addEventListener('click',event=>{
 const el=event.target.closest?.('[data-contract-owner-open],[data-contract-owner-open-client],[data-contract-owner-manual],[data-contract-owner-client],[data-contract-owner-add],[data-contract-owner-remove],[data-contract-owner-save]');
 if(!el)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(el.hasAttribute('data-contract-owner-open-client'))return contractOwnerOpen(el.dataset.contractOwnerOpenClient);
 if(el.hasAttribute('data-contract-owner-open'))return contractOwnerOpen();
 if(el.hasAttribute('data-contract-owner-manual'))return contractIntakeOpen('','manual');
 const draft=contractOwnerDraft;if(!draft||draft.busy)return;
 if(el.hasAttribute('data-contract-owner-client')){draft.clientId=el.dataset.contractOwnerClient;draft.lotIds=[''];contractOwnerRender();return;}
 if(el.hasAttribute('data-contract-owner-add')){if(draft.lotIds.length<10){draft.lotIds.push('');contractOwnerRender();}return;}
 if(el.hasAttribute('data-contract-owner-remove')){draft.lotIds.splice(Number(el.dataset.contractOwnerRemove),1);contractOwnerRender();return;}
 if(el.hasAttribute('data-contract-owner-save'))contractOwnerSave().catch(e=>{
  contractOwnerRender();
  const msg=document.getElementById('contract-owner-error');if(msg)msg.textContent=e.message;
  toast(e.message,'error');
 });
},true);
document.addEventListener('input',event=>{
 if(event.target.id!=='contract-owner-search'||!contractOwnerDraft)return;
 contractOwnerDraft.search=event.target.value;contractOwnerResults();
},true);
document.addEventListener('change',event=>{
 if(!event.target.hasAttribute?.('data-contract-owner-lot')||!contractOwnerDraft)return;
 contractOwnerDraft.lotIds[Number(event.target.dataset.contractOwnerLot)]=event.target.value;
},true);
