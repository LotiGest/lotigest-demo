// Residenciales, solares y cobros muestra solo altas desde Contratos.
// No se tocan los datos originales en D1. Los documentos pendientes también
// se ven (sin inventar una venta ni habilitar el cobro antes de activarlos).
(function installContractCollectionsOnly(){
 let currentScope=null;
 const withScope=fn=>{
  const original=db;
  db=contractCollectionsScope(original,residence().id);
  currentScope=db;
  try{return fn();}finally{db=original;currentScope=null;}
 };
 // Los detalles de Abonos se abren después de renderizar el panel. Mantener
 // allí el mismo alcance de contratos, sin tocar la base ni los recibos.
 const withContractPaymentView=(rid,fn)=>{
  const original=db,scope=contractCollectionsScope(original,rid);
  const posted=new Set((original.historicalPayments||[]).map(p=>p.postedPaymentId).filter(Boolean));
  scope.payments=scope.payments.filter(p=>!p.historicalImportId&&!posted.has(p.id));
  db=scope;
  try{return fn();}finally{db=original;}
 };
 if(typeof pmHistoryRows==='function'){
  const prior=pmHistoryRows;
  pmHistoryRows=function(...args){
   return withContractPaymentView(residence().id,()=>prior(...args));
  };
 }
 if(typeof pmLatestClientPayments==='function'){
  const prior=pmLatestClientPayments;
  pmLatestClientPayments=function(clientId,rid){
   return withContractPaymentView(rid,()=>prior(clientId,rid));
  };
 }
 if(typeof lotigestPrimaStatus==='function'){
  const prior=lotigestPrimaStatus;
  lotigestPrimaStatus=function(clientId,rid,selectedLotIds){
   return withContractPaymentView(rid,()=>prior(clientId,rid,selectedLotIds));
  };
 }
 const previousPage=collectionPage;
 collectionPage=function(){
  return withScope(()=>{
   const count=db.contractTexts.length,active=db.sales.length,
    pending=db.contractTexts.filter(d=>d.status!=='active').length;
   let html=previousPage();
   // No más importación que vuelva a poblar el panel con pagos y propietarios del Excel.
   html=html.replace(/<button\b[^>]*data-action="ledger-import"[^>]*>[\s\S]*?<\/button>/g,'');
   const note='<section class="card contract-collection-note" data-contract-collection-source>'+
    '<h3>Clientes y solares desde Contratos</h3>'+
    '<p>En este panel únicamente aparecen los clientes y solares que hayas vinculado desde <strong>Contratos → Nuevo contrato</strong>. Las importaciones anteriores, los clientes sin contrato y sus abonos antiguos no se muestran aquí. El inventario del mapa, las medidas y los registros originales se conservan.</p>'+
    '<p><strong>'+count+' ficha(s) contractual(es)</strong> · '+active+
    ' compra(s) activada(s) · '+pending+' ficha(s) pendiente(s) de activar.</p>'+
    '<button type="button" class="btn btn-primary" data-collection-new-contract>Ingresar nuevo contrato</button>'+
    (cloudUser?.role==='admin'?'<button type="button" class="btn btn-outline" data-collection-review-legacy>Revisar limpieza de asociaciones anteriores</button>':'')+
    (!count?'<p class="contract-collection-empty">Todavía no hay clientes ni solares ingresados desde Contratos para esta residencial.</p>':'')+
    '</section>';
   // Insertar antes del primer bloque de estadísticas, conservando el diseño del módulo.
   const at=html.indexOf('<div class="cards-four"');
   return at>=0?html.slice(0,at)+note+html.slice(at):note+html;
  });
 };

 // En la misma pantalla, Registrar abono nunca abre el selector histórico
 // de propietarios importados sin contrato. Solo se ofrecen ventas con ficha.
 const previousNewPayment=newPayment;
 const previousPaymentCandidates=paymentCandidates;
 paymentCandidates=function(query=''){
  const candidates=previousPaymentCandidates(query);
  if(page!=='collections')return candidates;
  const scoped=contractCollectionsScope(db,residence().id);
  const allowed=new Set(scoped.sales.map(s=>s.id));
  return candidates.filter(s=>allowed.has(s.id));
 };
 newPayment=function(saleId,useOcr=false){
  if(!saleId&&!useOcr&&page==='collections')return baseNewPayment(null,false);
  return previousNewPayment(saleId,useOcr);
 };
 const previousCard=ordinaryCollectionCard;
 ordinaryCollectionCard=function(x){
  if(!currentScope)return previousCard(x);
  const doc=currentScope.contractTexts.find(d=>d.lotId===x.lot.id);
  if(!doc||x.sale)return previousCard(x);
  const client=getClient(doc.clientId);
  return '<article class="card contract-collection-pending" data-collection-contract="'+esc(doc.id)+'">'+
   '<strong>'+esc(client?.name||'Cliente por completar')+'</strong>'+
   '<p class="sm">Etapa '+esc(x.lot.stage||'—')+' · Bloque '+esc(x.lot.block||'—')+
   ' · Solar '+esc(x.lot.sourceNumber||x.lot.number||x.lot.id)+'</p>'+
   '<p class="contract-collection-state">Contrato pendiente de activación · Aún no hay cuotas ni abonos confirmados.</p>'+
   '<p class="sm">Área: '+inventoryArea(x.lot)+' m² · Precio inventario: '+inventoryPrice(x.lot)+'</p>'+
   '<button class="btn btn-outline btn-sm" type="button" data-collection-go-contracts>Revisar contrato</button></article>';
 };

 // Una ficha por cliente y residencial: los filtros determinan qué clientes
 // aparecen, pero nunca convierten un subtotal filtrado en su saldo completo.
 function customerCollectionTotals(rows){
  const active=rows.filter(x=>x.sale),sales=[...new Map(active.map(x=>[x.sale.id,x.sale])).values()];
  const cents=n=>Math.round(Number(n||0)*100),total=(items,fn)=>items.reduce((a,x)=>a+cents(fn(x)),0)/100;
  const paid=s=>paidAmount(s.id);
  const months=new Set(active.flatMap(x=>x.overdue.map(r=>r.dueDate.slice(0,7))));
  return {sales,price:total(sales,s=>s.price),paid:total(sales,paid),
   prima:total(sales,s=>Math.min(Number(s.downPayment||0),paid(s))),
   abonos:total(sales,s=>Math.max(0,paid(s)-Number(s.downPayment||0))),
   monthly:total(sales,s=>installment(s)),month:total(active,x=>x.monthAmount),
   overdue:total(active,x=>x.lateAmount),balance:total(sales,s=>balance(s)),
   months:months.size,pending:rows.length-active.length};
 }
 function customerRows(clientId,rid){
  return ledgers().filter(x=>x.lot.residenceId===rid&&
   (x.sale?.clientId||x.lot.ownerClientId)===clientId);
 }
 function customerSolarLabel(x){
  return 'Etapa '+(x.lot.stage||'—')+' · Bloque '+(x.lot.block||'—')+' · Solar '+(x.lot.sourceNumber||x.lot.number||x.lot.id);
 }
 function customerSummary(t){
  const cells=[['Precio contratado',t.price],['Prima pagada',t.prima],['Abonos a cuotas',t.abonos],['Total pagado',t.paid],['Cuota mensual total',t.monthly],['Pendiente del mes',t.month],['Total vencido',t.overdue],['Saldo total por pagar',t.balance]];
  return '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0">'+cells.map(([label,v])=>'<div style="min-width:0;border:1px solid rgba(120,150,136,.3);border-radius:10px;padding:9px"><small>'+esc(label)+'</small><br><strong style="overflow-wrap:anywhere;color:'+(label==='Total vencido'&&v>0?'#c2445a':label==='Total pagado'||label==='Abonos a cuotas'?'#16864b':'inherit')+'">'+money(v)+'</strong></div>').join('')+'</div><small>El vencido puede incluir el pendiente del mes; no se suman nuevamente.</small>';
 }
 function customerActions(clientId,rid,t,detail=false){
  const attr=' data-cc-client="'+esc(clientId)+'" data-cc-rid="'+esc(rid)+'"';
  const credit=t.sales.find(s=>s.type==='credit');
  return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">'+
   (!detail?'<button class="btn btn-soft btn-sm" type="button" data-cc-ficha'+attr+'>Ficha del cliente</button>':'')+
   (credit?'<button class="btn btn-primary btn-sm" type="button" data-cc-pay'+attr+'>Abonar total</button><button class="btn btn-outline btn-sm" type="button" data-cc-many'+attr+'>Varios abonos</button>':'')+
   (t.sales.length?'<button class="btn btn-outline btn-sm" type="button" data-cc-statement'+attr+'>Estado de cuenta / WhatsApp</button>':'')+
   (t.pending?'<button class="btn btn-outline btn-sm" type="button" data-collection-go-contracts>Revisar contratos pendientes</button>':'')+'</div>';
 }
 function customerCard(clientId,rid,rows){
  const client=getClient(clientId),t=customerCollectionTotals(rows);
  return '<article class="card" style="border-top:5px solid '+(t.overdue>0?'#9d2441':'#15975d')+';border-radius:12px;padding:15px;min-width:0">'+
   '<strong style="font-size:18px">'+esc(client?.name||'Cliente')+'</strong><p class="sm">'+esc(client?.phone||'')+' · '+rows.length+' solar(es)</p>'+
   (t.months?'<p style="color:#b83c54;font-weight:750">Cuotas vencidas de '+t.months+' mes(es)</p>':'')+
   rows.map(x=>'<p class="sm" style="margin:5px 0">'+esc(customerSolarLabel(x))+(x.sale?'':' · Pendiente de activación')+'</p>').join('')+
   customerSummary(t)+customerActions(clientId,rid,t)+'</article>';
 }
 const previousSolarCards=collectionSolarCards;
 collectionSolarCards=function(list,rid){
  if(!currentScope)return previousSolarCards(list,rid);
  const filtered=list.filter(x=>collectionStageFilter==='all'||String(x.lot.stage||'pending')===collectionStageFilter);
  const clients=new Set(filtered.map(x=>x.sale?.clientId||x.lot.ownerClientId).filter(Boolean));
  const all=ledgers().filter(x=>x.lot.residenceId===rid),groups=new Map();
  for(const x of all){const id=x.sale?.clientId||x.lot.ownerClientId;if(id&&clients.has(id)){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(x);}}
  return [...groups].map(([id,rows])=>customerCard(id,rid,rows)).join('')+
   filtered.filter(x=>!x.sale?.clientId&&!x.lot.ownerClientId).map(ordinaryCollectionCard).join('');
 };
 function withCustomerScope(rid,fn){
  const original=db;db=contractCollectionsScope(original,rid);
  try{return fn();}finally{db=original;}
 }
 function openCustomerFicha(id,rid){
  const content=withCustomerScope(rid,()=>{
   const rows=customerRows(id,rid);if(!rows.length)return null;
   const t=customerCollectionTotals(rows),client=getClient(id);
   return '<h3>'+esc(client.name)+'</h3><p class="sm">'+esc(client.phone||'')+' · '+rows.length+' solares</p>'+customerSummary(t)+
    '<h3>Detalle por solar</h3>'+rows.map(x=>'<section class="card" style="padding:12px;margin:8px 0"><strong>'+esc(customerSolarLabel(x))+'</strong>'+
     (x.sale?'<p>Cuota: '+money(installment(x.sale))+' · Pagado: '+money(paidAmount(x.sale.id))+'<br>Vencido: '+money(x.lateAmount)+' · Saldo: '+money(balance(x.sale))+'</p>':'<p>Contrato pendiente de activación</p>')+
     '<button class="btn btn-outline btn-sm" data-action="geo-bind" data-id="'+esc(x.lot.id)+'">Ubicar en GPS</button> <button class="btn btn-soft btn-sm" data-action="view-lot" data-id="'+esc(x.lot.id)+'">Detalle solar</button></section>').join('')+customerActions(id,rid,t,true);
  });
  if(content)showModal('Ficha consolidada del cliente',content,'<button class="btn btn-soft" data-action="close-modal">Cerrar</button>',true);
 }
 document.addEventListener('click',event=>{
  const b=event.target.closest?.('[data-cc-ficha],[data-cc-pay],[data-cc-many],[data-cc-statement]');if(!b)return;
  event.preventDefault();event.stopImmediatePropagation();
  const id=b.dataset.ccClient,rid=b.dataset.ccRid;
  if(b.hasAttribute('data-cc-ficha'))return openCustomerFicha(id,rid);
  if(b.hasAttribute('data-cc-statement'))return pmOpenStatement(b,{clientId:id,rid});
  if(residence().id!==rid){toast('Selecciona primero la residencial del cliente.','error');return;}
  const s=contractCollectionsScope(db,rid).sales.find(x=>x.clientId===id&&x.type==='credit');
  if(!s){toast('No hay crédito activo.','error');return;}
  closeModal();
  if(b.hasAttribute('data-cc-many')){
   const launch=document.createElement('button');launch.type='button';launch.dataset.mdStartSale=s.id;document.body.append(launch);try{launch.click();}finally{launch.remove();}
  }else newPayment(s.id);
 },true);
 // Todos los reportes y exportaciones de este módulo parten de la misma vista.
 const previousRows=collectionPaymentRows;
 collectionPaymentRows=function(...args){
  if(currentScope)return previousRows(...args);
  return withScope(()=>previousRows(...args));
 };
 const previousClients=collectionClientRows;
 collectionClientRows=function(...args){
  if(currentScope)return previousClients(...args);
  return withScope(()=>previousClients(...args));
 };
 const previousDebt=debtReport;
 debtReport=function(...args){return withScope(()=>previousDebt(...args));};
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-collection-new-contract],[data-collection-go-contracts],[data-collection-review-legacy]');
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(button.hasAttribute('data-collection-review-legacy')){page='lots';render();return;}
  page='contracts';render();
  if(button.hasAttribute('data-collection-new-contract')){
   contractIntakeOpen('','manual');
  }
 },true);
})();
