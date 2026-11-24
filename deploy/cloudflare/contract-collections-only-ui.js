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
