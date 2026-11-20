// LOTIGEST: mostrar la ficha contractual completa en Cliente, Terrenos y Mapa.
// Vínculo inmediato sin fingir cobros o ventas; solo admin puede revisar documentos privados.
function contractFichaByLot(lotId){
 return (db.contractTexts||[]).find(d=>d.lotId===lotId&&['photo+ocr','manual'].includes(d.format)&&d.status!=='voided')||null;
}
function contractFichaByClient(clientId){
 return (db.contractTexts||[]).filter(d=>d.clientId===clientId&&['photo+ocr','manual'].includes(d.format)&&d.status!=='voided');
}
function contractFichaTitle(doc){
 const client=getClient(doc.clientId),lot=getLot(doc.lotId);
 return '<strong>'+esc(client?.name||doc.structured?.name||'Cliente por completar')+'</strong>'+
 '<p class="sm">Etapa '+esc(lot?.stage||'—')+' · Bloque '+esc(lot?.block||'—')+' · Solar '+esc(lot?.sourceNumber||lot?.id||'—')+
 (doc.status==='pending-sale'?' · Pendiente de activar crédito':' · Contrato activo')+'</p>';
}
function contractFichaLink(doc){
 return '<button type="button" class="btn btn-outline btn-sm" data-contract-ficha-view="'+esc(doc.id)+'">Ver ficha completa</button>';
}
function contractFichaShort(doc){
 const c=getClient(doc.clientId),p=doc.structured||{};
 return '<section class="notice-card" style="margin:12px 0;padding:12px">'+
 '<b>Cliente vinculado al contrato:</b> '+esc(c?.name||p.name||'Sin nombre')+
 '<p class="sm">DNI: '+esc(c?.identity||p.identity||'—')+' · Bloque '+esc(p.block||getLot(doc.lotId)?.block||'—')+
 ' · Solar '+esc(p.number||getLot(doc.lotId)?.sourceNumber||'—')+'</p>'+
 '<p class="sm">Precio pactado: '+money(p.price||0)+' · Prima pactada: '+money(p.down||0)+'</p>'+
 '<p class="sm muted">La ficha ya tiene propietario asignado; aún no se han registrado abonos desde esta importación.</p>'+
 contractFichaLink(doc)+'</section>';
}
const contractFichaBuyerInventoryBase=buyerInventorySummary;
buyerInventorySummary=function(l){
 const doc=contractFichaByLot(l.id);
 if(!db.sales.some(s=>s.lotId===l.id)){
  if(doc)return '<span><strong>'+esc(getClient(doc.clientId)?.name||doc.structured?.name||'Sin nombre')+'</strong><br><small>Contrato registrado · Pendiente de activar crédito</small></span>';
  const owner=getClient(l.ownerClientId);
  if(owner)return '<strong>'+esc(owner.name)+'</strong><br><small>Cliente asociado · Falta completar contrato</small>';
 }
 return contractFichaBuyerInventoryBase(l);
};
const contractFichaInventoryInfoBase=inventoryInfo;
inventoryInfo=function(l){
 const info=contractFichaInventoryInfoBase(l),doc=contractFichaByLot(l.id);
 const owner=!doc&&l.ownerClientId?getClient(l.ownerClientId):null;
 return info+(doc?contractFichaShort(doc):owner?
 '<section class="notice-card"><strong>Cliente del solar: '+esc(owner.name)+'</strong><p class="sm">Identidad: '+esc(owner.identity||'Sin identidad')+'</p><p class="sm muted">Falta asociar la ficha contractual completa.</p>'+
 '<button class="btn btn-outline btn-sm" type="button" data-contract-ficha-new="'+esc(owner.id)+'">Completar desde contrato</button></section>':'');
};
const contractFichaViewClientBase=viewClient;
viewClient=function(clientId){
 contractFichaViewClientBase(clientId);
 const client=getClient(clientId),documents=contractFichaByClient(clientId);
 if(!client)return;
 const root=document.querySelector('#modal-root .modal-content'),footer=document.querySelector('#modal-root .modal-footer');
 if(root){
  const block='<section class="card" style="padding:12px;margin-top:12px"><h3>Contratos y solares asociados</h3>'+
   (documents.length?
    documents.map(doc=>'<div style="margin:12px 0;padding-bottom:10px;border-bottom:1px solid #d8e5db">'+contractFichaTitle(doc)+
     contractIntakeDescription(doc)+'</div>').join(''):
    '<p class="sm muted">Este cliente todavía no tiene una ficha estructurada de contrato. Puedes completarla desde una fotografía, sin duplicar el cliente.</p>')+'</section>';
  root.insertAdjacentHTML('beforeend',block);
 }
 if(footer)footer.insertAdjacentHTML('beforeend','<button type="button" class="btn btn-outline" data-contract-ficha-new="'+esc(clientId)+'">Completar ficha desde contrato</button>');
};
const contractFichaViewLotBase=viewLot;
viewLot=function(lotId){
 contractFichaViewLotBase(lotId);
 const doc=contractFichaByLot(lotId),root=document.querySelector('#modal-root .modal-content');
 if(doc&&root)root.insertAdjacentHTML('beforeend',contractIntakeDescription(doc));
};
const contractFichaSolarBase=openSolarWindow;
openSolarWindow=function(lotId){
 contractFichaSolarBase(lotId);
 const doc=contractFichaByLot(lotId),lot=getLot(lotId);
 if(!lot)return;
 const root=document.querySelector('#modal-root .modal-content');
 if(!doc){
  const owner=getClient(lot.ownerClientId);
  if(owner&&root)root.insertAdjacentHTML('afterbegin','<div class="notice-card">Cliente asociado: <strong>'+esc(owner.name)+'</strong> · Sin ficha contractual completa. <button class="btn btn-outline btn-sm" type="button" data-contract-ficha-new="'+esc(owner.id)+'">Completar contrato</button></div>');
  return;
 }
 if(root)root.insertAdjacentHTML('afterbegin',
  '<details open style="margin:12px 0"><summary><strong>'+esc(getClient(doc.clientId)?.name||'Cliente registrado')+' — Ver ficha del contrato</strong></summary>'+
  contractIntakeDescription(doc)+'</details>');
 if(doc.status==='pending-sale'){
  const form=document.getElementById('solar-form'),submit=document.getElementById('solar-submit');
  if(form)form.dataset.canOperate='no';
  if(submit){submit.disabled=true;submit.textContent='Contrato pendiente de activar';}
 }
};
const contractFichaPlanSolarBase=planSolarAction;
planSolarAction=function(data){
 const doc=contractFichaByLot(data.lotId);
 if(doc?.status==='pending-sale')throw Error('Este solar ya está vinculado a un contrato. Abre Contratos para activar su crédito, no registres otra venta.');
 const lot=getLot(data.lotId);
 if(lot?.ownerClientId&&!db.sales.some(s=>s.lotId===lot.id))throw Error('Este solar ya tiene cliente registrado. Completa su contrato antes de vender o apartarlo otra vez.');
 return contractFichaPlanSolarBase(data);
};
const contractFichaPlanBuyerHistoryBase=planBuyerHistory;
planBuyerHistory=function(data,lot){
 if(lot&&contractFichaByLot(lot.id)?.status==='pending-sale')
  throw Error('El solar ya tiene ficha contractual. Debes activar esa ficha en Contratos antes de importar una compra.');
 if(lot?.ownerClientId&&!db.sales.some(s=>s.lotId===lot.id))
  throw Error('El solar ya tiene cliente asociado. Completa su contrato en vez de duplicar la compra.');
 return contractFichaPlanBuyerHistoryBase(data,lot);
};
document.addEventListener('click',event=>{
 const view=event.target.closest?.('[data-contract-ficha-view]'),create=event.target.closest?.('[data-contract-ficha-new]');
 if(!view&&!create)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(view)return viewContractText(view.dataset.contractFichaView);
 contractIntakeOpen(create.dataset.contractFichaNew,'manual');
},true);
// Seleccionar un cliente existente solo completa datos VACÍOS; no cambia nombres ni DNI automáticamente.
document.addEventListener('change',event=>{
 if(!event.target.matches?.('#contract-intake-form select[name="clientId"]'))return;
 const client=getClient(event.target.value),form=event.target.closest('form');if(!client||!form)return;
 for(const key of ['name','identity','address','rtn','maritalStatus','occupation']){
  const field=form.elements.namedItem(key);if(field&&!String(field.value||'').trim())field.value=String(client[key]||'');
 }
 const status=document.getElementById('contract-intake-alert');
 if(status)status.textContent='Comprueba que el nombre y DNI leídos coincidan con el cliente seleccionado; no se fusionarán datos diferentes.';
},true);
