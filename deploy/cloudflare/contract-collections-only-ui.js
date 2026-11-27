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
  // Los pagos de fichas vinculadas a contratos siguen siendo recibos reales.
  const lotIds=new Set(scope.lots.map(l=>l.id)),clientIds=new Set(scope.clients.map(c=>c.id));
  const hasContractRefs=refs=>Array.isArray(refs)&&refs.length>0&&refs.every(r=>r.lotId&&lotIds.has(r.lotId));
  scope.ownershipStatements=(original.ownershipStatements||[]).filter(s=>s.residenceId===rid&&clientIds.has(s.clientId)&&hasContractRefs(s.references));
  const statements=new Set(scope.ownershipStatements.map(s=>s.id));
  scope.ownerPayments=(original.ownerPayments||[]).filter(p=>p.residenceId===rid&&clientIds.has(p.clientId)&&
   !p.voidedAt&&!p.deletedAt&&!p.cancelledAt&&(p.allocations||[]).length>0&&
   p.allocations.every(a=>statements.has(a.statementId)&&hasContractRefs(a.references)));
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
  const s=contractCollectionsScope(db,rid).sales.find(x=>x.clientId===id&&x.type==='credit'&&balance(x)>.009);
  if(!s){toast('No hay crédito activo.','error');return;}
  if(!cloudReady||cloudUser?.role!=='admin')return toast('Se requiere una cuenta administradora para registrar abonos.','error');
  if(b.hasAttribute('data-cc-many')){
   if(cloudBlocked||cloudBusy||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)return toast('Sincroniza primero los cambios pendientes.','error');
   if(!window.lotigestMultiDate?.openSale)return toast('Abonos varios no está disponible. Actualiza LOTIGEST.','error');
   closeModal();window.lotigestMultiDate.openSale(s.id);
  }else{closeModal();newPayment(s.id);}
 },true);

 // Workspace de cobros: lista ligera y detalle de un solo cliente.
 let ccSelection='',ccSearch='',ccMobileDetail=false,ccSort='az',ccLastScope='',ccPage=0,ccFilterKey='';
 const ccPhone=()=>typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches;
 function ccPageSlice(items,index,mobile){const size=40;if(!mobile)return {items,index:0,pages:1,start:0,end:items.length};const pages=Math.max(1,Math.ceil(items.length/size)),safe=Math.max(0,Math.min(pages-1,index));return {items:items.slice(safe*size,(safe+1)*size),index:safe,pages,start:safe*size,end:Math.min(items.length,(safe+1)*size)};}
 const ccNorm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const ccKey=(rid,id)=>JSON.stringify([rid,id]);
 const ccCash=n=>money(n/100);
 function ccModel(state,id,rid,asOf,prepared){
  try{
   const m=pmAmortizationModel(state,id,rid,asOf,reconcileInstallments,installmentDueCents,(date,i)=>dateKey(addMonths(date,i)),null,prepared);
   if(m.unmatched)throw Error('Hay recibos pendientes de conciliar.');
   const statement=pmStatementModel(m);
   return {m,statement};
  }catch(e){return {error:e.message};}
 }
 function ccMetrics(m,month){
  return {month:m.consolidated.calendar.find(x=>x.month===month)?.pending||0,overdue:m.overdueAmount,
   months:m.consolidated.monthsOverdue,price:m.price,paid:m.paid,balance:m.balance,
   percent:m.price>0?Math.max(0,Math.min(100,m.paid/m.price*100)):0};
 }
 function ccAttr(g){return ' data-cc-client="'+esc(g.id)+'" data-cc-rid="'+esc(g.rid)+'"';}
 function ccStatus(g){
  if(!g.sales.length)return ['Pendiente de activar','pending'];
  if(!g.model.m)return ['Por conciliar','pending'];
  const t=ccMetrics(g.model.m,collectionMonth);
  return t.months?['Cuota vencida ('+t.months+' '+(t.months===1?'mes':'meses')+')','late']:t.balance<=0?['Cancelado','good']:t.month>0?['Pendiente del mes','pending']:['Al día','good'];
 }
 function ccDetail(g,extra=false){
  const m=g.model.m,t=m?ccMetrics(m,collectionMonth):null,attr=ccAttr(g),status=ccStatus(g);
  const future=m?pmFutureCoverage(m.details.flatMap(d=>d.rows),m.asOf):null;
  const lots=g.lots.map(l=>l.id).join(' · '), credit=g.sales.some(s=>s.type==='credit'&&balance(s)>.009);
  const metric=(label,value,style='',sub='')=>'<div class="cc-metric '+style+'"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div>';
  return '<div class="cc-detail-head"><span class="cc-avatar">'+ic('users')+'</span><div><h2>'+esc(g.client.name)+'</h2><small>'+esc(g.client.phone||'Sin teléfono')+' · '+esc(g.residenceName)+'</small></div><span class="cc-count">'+g.lots.length+' solar(es)</span></div>'+
   '<p class="cc-lots">'+esc(lots)+'</p>'+
   (credit&&cloudUser?.role==='admin'?'<div class="cc-actions cc-pay-top"><button type="button" class="btn btn-primary" data-cc-pay'+attr+'>+ Registrar abono</button><button type="button" class="btn btn-outline" data-cc-many'+attr+'>+ Abonos varios</button></div>':'')+
   (t?'<div class="cc-metrics">'+metric('Pendiente del mes',ccCash(t.month),'',collectionMonth)+metric('Total vencido',ccCash(t.overdue),t.overdue?'cc-late':'',t.months+' mes(es)')+metric('Saldo total según amortización',ccCash(t.balance),'cc-balance')+(future?.amountCents?metric('Adelanto vigente',ccCash(future.amountCents),'',future.covered+' cuota(s) futuras cubiertas')+metric('Último vencimiento futuro cubierto',future.through||'Parcial'):'')+(future?.next?metric('Próxima cuota con saldo',ccCash(future.next.remainingCents),'',future.next.dueDate):'')+'</div>'+
   '<div class="cc-progress"><div class="cc-progress-head"><strong>Progreso de la amortización</strong><b>'+t.percent.toFixed(1)+'%</b></div><progress max="100" value="'+t.percent+'"></progress><div class="cc-progress-values">'+metric('Pagado acumulado',ccCash(t.paid))+metric('Saldo por pagar',ccCash(t.balance))+metric('Total contratado',ccCash(t.price))+'</div></div>':
   '<p class="cc-review" role="alert">'+esc(g.sales.length?'Revisar amortización: '+g.model.error:'Contrato pendiente de activación. Aún no tiene cuotas confirmadas.')+'</p>')+
   '<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Solar</th><th>Cuota mensual</th><th>Vencido</th><th>Estado</th></tr></thead><tbody>'+
    g.lots.map(l=>{const d=m?.details.find(x=>x.lot.id===l.id),s=g.sales.find(x=>x.lotId===l.id),overdue=d?.rows.filter(r=>r.dueDate<m.asOf&&r.remainingCents>0)||[],months=new Set(overdue.map(r=>r.dueDate.slice(0,7))).size;
      return '<tr><td><strong>'+esc(l.id)+'</strong><small>Etapa '+esc(l.stage||'—')+' · '+esc(l.block||'—')+'</small></td><td>'+ (s?money(installment(s)):'—')+'</td><td class="'+(months?'cc-red':'')+'">'+(d?ccCash(overdue.reduce((n,r)=>n+r.remainingCents,0)):'—')+'</td><td><span class="cc-status '+(!s||!d?'pending':months?'late':'good')+'">'+(!s?'Pendiente':!d?'Revisar':months?'Vencido ('+months+' m)':'Al día')+'</span></td></tr>';
    }).join('')+'</tbody></table></div>'+
   '<div class="cc-actions">'+
    (g.sales.length?'<button type="button" class="btn btn-outline" data-cc-statement'+attr+'>Estado de cuenta PDF</button><button type="button" class="btn btn-outline" data-cc-whatsapp'+attr+'>Enviar por WhatsApp</button>':'')+
    (!extra?'<button type="button" class="btn btn-outline" data-cc-details'+attr+'>Ver detalle</button>':'')+
    (g.lots.length>g.sales.length?'<button type="button" class="btn btn-outline" data-collection-go-contracts>Revisar contrato</button>':'')+'</div>'+
    (extra&&m?'<details class="cc-extra" open><summary>Primas y abonos</summary><p>Prima pagada: <b>'+ccCash(m.prima)+'</b> · Abonos: <b>'+ccCash(m.abonos)+'</b></p><p>Último pago: '+esc(m.last||'Sin pagos registrados')+'</p><p>La mora y el pendiente del mes pueden coincidir; no se suman dos veces.</p></details>':'')+
    (extra?g.lots.map(l=>'<p><strong>'+esc(l.id)+'</strong> <button class="btn btn-outline btn-sm" data-action="geo-bind" data-id="'+esc(l.id)+'">GPS</button> <button class="btn btn-soft btn-sm" data-action="view-lot" data-id="'+esc(l.id)+'">Detalle solar</button></p>').join(''):'');
 }
 // Cache only derived figures. Rebuild indexes each time, and reuse a model
 // only when every input affecting that client's amortization is identical.
 let ccModels=new Map(),ccCacheState=null,ccCacheOwner=null;
 function ccGroups(state,rid){
  const owner=typeof cloudUser==='undefined'?'':cloudUser?.name||'';
  if(ccCacheState!==state||ccCacheOwner!==owner){ccModels.clear();ccCacheState=state;ccCacheOwner=owner;}
  const scope=contractCollectionsScope(state,rid),groups=new Map(),asOf=businessToday();
  const clients=new Map(scope.clients.map(c=>[c.id,c])),salesByLot=new Map(scope.sales.map(s=>[s.lotId,s])),saleOrder=new Map(scope.sales.map((s,i)=>[s,i]));
  const residences=new Map((state.residences||[]).map(r=>[r.id,r.name]));
  const posted=new Set((state.historicalPayments||[]).map(p=>p.postedPaymentId).filter(Boolean)),paymentsBySale=new Map(),paymentOrder=new Map(scope.payments.map((p,i)=>[p,i]));
  for(const p of scope.payments){if(!paymentsBySale.has(p.saleId))paymentsBySale.set(p.saleId,[]);paymentsBySale.get(p.saleId).push(p);}
  for(const lot of scope.lots){
   const id=lot.ownerClientId,key=ccKey(lot.residenceId,id);
   if(!groups.has(key))groups.set(key,{key,id,rid:lot.residenceId,lots:[],sales:[],client:clients.get(id),residenceName:residences.get(lot.residenceId)||''});
   const g=groups.get(key);g.lots.push(lot);
   const sale=salesByLot.get(lot.id);if(sale?.clientId===id)g.sales.push(sale);
  }
  const nextCache=new Map();
  for(const g of groups.values()){
   if(!g.sales.length){g.model={};continue;}
   const payments=g.sales.flatMap(s=>paymentsBySale.get(s.id)||[]).sort((a,b)=>paymentOrder.get(a)-paymentOrder.get(b));
   const orderedSales=[...g.sales].sort((a,b)=>saleOrder.get(a)-saleOrder.get(b));
   const prepared={scope:{clients:[g.client],lots:g.lots,sales:orderedSales,payments},posted};
   const key=JSON.stringify([asOf,g.client.name,g.residenceName,state.company?.name,g.lots,orderedSales,payments,payments.filter(p=>posted.has(p.id)).map(p=>p.id)]);
   const cached=ccModels.get(g.key);
   // Do not cache errors: a transient dependency may become available.
   g.model=cached?.key===key?cached.model:ccModel(state,g.id,g.rid,asOf,prepared);
   if(g.model.m)nextCache.set(g.key,{key,model:g.model});
  }
  ccModels=nextCache;
  return [...groups.values()];
 }
 function ccMatch(g){
  if(collectionStageFilter!=='all'&&!g.lots.some(l=>String(l.stage||'pending')===collectionStageFilter))return false;
  const query=ccNorm(ccSearch).trim(),digits=v=>String(v??'').replace(/\D/g,''),numeric=/^[+\d\s().-]+$/.test(query)?digits(query):'';
  if(query&&!ccNorm([g.client.name,g.client.identity,g.client.phone,g.residenceName,...g.lots.flatMap(l=>[l.id,l.block,l.sourceNumber])].join(' ')).includes(query)&&!(numeric&&[g.client.identity,g.client.phone].some(v=>digits(v).includes(numeric))))return false;
  const t=g.model.m?ccMetrics(g.model.m,collectionMonth):null;
  if(collectionOverdueMonths!=='all'&&(!t||t.months!==Number(collectionOverdueMonths)))return false;
  if(collectionFilter==='all')return true;
  if(collectionFilter==='pending')return !g.sales.length;
  if(collectionFilter==='review')return g.sales.length&&!t;
  if(!t)return false;
  if(collectionFilter==='late')return t.overdue>0;
  if(collectionFilter==='notify')return t.overdue>0||t.month>0;
  if(collectionFilter==='month')return t.month>0;
  if(collectionFilter==='settled')return t.balance<=0;
  if(collectionFilter==='cash')return g.sales.every(s=>s.type==='cash');
  if(collectionFilter==='credit')return t.overdue===0&&t.balance>0&&g.sales.some(s=>s.type==='credit');
  return true;
 }
 const ccOptions=(items,selected)=>items.map(([v,label])=>'<option value="'+esc(v)+'" '+(String(v)===String(selected)?'selected':'')+'>'+esc(label)+'</option>').join('');
 const ccStyle='<style>'+
 '.cc-workspace{display:grid;grid-template-columns:minmax(235px,29%) minmax(0,1fr);gap:12px;align-items:start}.cc-pane{min-width:0;border:1px solid rgba(120,150,136,.28);border-radius:15px;background:var(--card,#fff);padding:14px;color:inherit}.cc-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 14px}.cc-toolbar input{flex:1;min-width:160px}.cc-toolbar details{position:relative}.cc-toolbar summary{cursor:pointer;list-style:none}.cc-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:10px 0}.cc-list-head,.cc-progress-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.cc-list-head select{max-width:125px}.cc-list{display:grid;gap:7px;margin-top:12px;max-height:70vh;overflow:auto}.cc-person{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:11px;background:transparent;border:1px solid rgba(120,150,136,.24);border-radius:11px;color:inherit;cursor:pointer}.cc-person.active{background:rgba(130,202,62,.13);border-color:#80b84b}.cc-person-text{flex:1;min-width:0;overflow-wrap:anywhere}.cc-person strong,.cc-person small,.cc-table td small{display:block}.cc-person small{font-size:11px}.cc-avatar{width:40px;height:40px;display:grid;place-items:center;background:rgba(130,202,62,.18);border-radius:10px;color:#32924b;flex-shrink:0}.cc-avatar svg{width:21px;height:21px}.cc-status{display:inline-block;border-radius:20px;padding:3px 8px;font-size:11px;font-weight:700;background:rgba(130,202,62,.14);color:#27874a;margin-top:5px}.cc-status.late{background:rgba(211,58,85,.12);color:#c03a55}.cc-status.pending{background:rgba(224,160,40,.16);color:#aa7929}.cc-detail-head{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.cc-detail-head h2{font-size:clamp(16px,2vw,23px);margin:0;overflow-wrap:anywhere}.cc-detail-head>div{flex:1;min-width:0}.cc-count{font-size:12px;border-radius:10px;padding:6px 9px;background:rgba(130,202,62,.15);white-space:nowrap}.cc-lots{font-size:13px;margin:12px 0}.cc-metrics,.cc-progress-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.cc-metric{min-width:0;padding:12px;border-radius:11px;background:rgba(113,150,136,.08)}.cc-metric small{display:block;font-size:12px}.cc-metric strong{display:block;font-size:clamp(15px,1.6vw,24px);margin-top:6px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.cc-metric.cc-late{background:rgba(211,58,85,.1);color:#b72f4c}.cc-metric.cc-balance{background:#175b39;color:white}.cc-progress{border:1px solid rgba(120,150,136,.25);border-radius:12px;padding:12px;margin:12px 0}.cc-progress-head b{color:#309447}.cc-progress progress{width:100%;height:12px;accent-color:#65ad33;margin:12px 0}.cc-progress-values .cc-metric{background:transparent;padding:4px 8px}.cc-progress-values .cc-metric strong{font-size:15px}.cc-table-wrap{overflow:auto;border:1px solid rgba(120,150,136,.25);border-radius:11px}.cc-table{width:100%;border-collapse:collapse;font-size:13px}.cc-table th,.cc-table td{padding:10px;text-align:left;border-bottom:1px solid rgba(120,150,136,.18);white-space:normal}.cc-table th{background:rgba(120,150,136,.1)}.cc-table td small{font-size:10px}.cc-red{color:#c03a55;font-weight:700}.cc-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}.cc-actions button{flex:1 1 auto}.cc-pay-top{margin:0 0 14px}.cc-pay-top button{flex:1 1 140px;white-space:normal;min-height:44px}.cc-review{padding:12px;border-radius:8px;background:rgba(224,160,40,.12)}.cc-back{display:none}.cc-extra{margin:12px 0}.lotigest-dark .cc-pane{background:rgba(19,48,39,.95)}'+
 '@media(max-width:760px){.cc-workspace{grid-template-columns:1fr}.cc-workspace.cc-mobile-detail .cc-list-pane{display:none}.cc-workspace:not(.cc-mobile-detail) .cc-detail-pane{display:none}.cc-back{display:inline-flex;margin-bottom:12px}.cc-list{max-height:none}.cc-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-metric.cc-balance{grid-column:1/-1}.cc-progress-values{gap:2px}.cc-progress-values .cc-metric{padding:4px}.cc-progress-values .cc-metric strong{font-size:13px}.cc-table{font-size:12px}.cc-table td,.cc-table th{padding:7px}.cc-toolbar input{width:100%}.cc-pane{padding:12px}}'+
 '</style>';
 collectionPage=function(){
  const state=db,rid=residence().id;
  if(ccLastScope!==rid){ccLastScope=rid;ccSelection='';ccMobileDetail=false;ccPage=0;}
  const filterKey=JSON.stringify([rid,ccSearch,ccSort,collectionMonth,collectionFilter,collectionStageFilter,collectionOverdueMonths]);
  if(filterKey!==ccFilterKey){ccFilterKey=filterKey;ccPage=0;}
  const all=ccGroups(state,rid),shown=all.filter(ccMatch);
  shown.sort((a,b)=>ccSort==='za'?b.client.name.localeCompare(a.client.name,'es'):ccSort==='activity'?String(b.model.m?.last||'').localeCompare(String(a.model.m?.last||'')):a.client.name.localeCompare(b.client.name,'es'));
  const slice=ccPageSlice(shown,ccPage,ccPhone());ccPage=slice.index;
  const g=shown.find(x=>x.key===ccSelection)||slice.items[0];ccSelection=g?.key||'';
  const pager=slice.pages>1?'<nav class="cc-mobile-pages" aria-label="Páginas de clientes"><button type="button" class="btn btn-outline" data-cc-page="-1" '+(slice.index===0?'disabled':'')+'>‹ Anterior</button><small>'+ (slice.start+1)+'–'+slice.end+' de '+shown.length+'</small><button type="button" class="btn btn-outline" data-cc-page="1" '+(slice.index===slice.pages-1?'disabled':'')+'>Siguiente ›</button></nav>':'';
  return header('Cobros','Clientes y solares vinculados desde Contratos. El historial anterior se conserva sin incorporarlo automáticamente a cobros.')+ccStyle+'<div class="cc-toolbar"><input type="search" id="cc-search" placeholder="Buscar cliente, identidad, teléfono o solar…" aria-label="Buscar cliente por nombre, identidad, teléfono o solar" value="'+esc(ccSearch)+'"><details><summary class="btn btn-outline">Filtros ▾</summary><div class="cc-filter-grid">'+
   '<label>Residencial<select data-residence-picker>'+ccOptions(state.residences.filter(r=>!r.hidden).map(r=>[r.id,r.name]),rid)+'</select></label>'+
   '<label>Mes<input id="debt-month" type="month" value="'+esc(collectionMonth)+'"></label><label>Etapa<select id="collection-stage-filter">'+ccOptions([['all','Todas'],['1','Etapa 1'],['2','Etapa 2'],['pending','Por confirmar']],collectionStageFilter)+'</select></label>'+
   '<label>Estado<select id="debt-filter">'+ccOptions([['all','Todos'],['notify','Por cobrar'],['late','Vencidos'],['month','Pendientes del mes'],['credit','Al día'],['settled','Cancelados'],['cash','Contado'],['pending','Pendiente de activar'],['review','Por conciliar']],collectionFilter)+'</select></label>'+
   '<label>Meses vencidos<select id="debt-overdue-months">'+ccOptions([['all','Todos'],...Array.from({length:Math.max(5,...all.map(x=>x.model.m?.consolidated.monthsOverdue||0))},(_,i)=>[i+1,i+1])],collectionOverdueMonths)+'</select></label>'+
   '<button class="btn btn-outline" data-action="debt-csv">Exportar reporte Excel</button><button class="btn btn-outline" data-action="payments-excel">Exportar primas y abonos</button><button class="btn btn-outline" data-action="debt-print">Imprimir reporte</button><button class="btn btn-outline" data-collection-new-contract>Nuevo contrato</button></div></details>'+
   '<button class="btn btn-primary" data-action="new-payment">+ Registrar cobro</button><button type="button" class="btn btn-outline" data-cc-many-picker>+ Abonos varios</button></div>'+
   '<div class="cc-workspace '+(ccMobileDetail&&g?'cc-mobile-detail':'')+'"><aside class="cc-pane cc-list-pane"><div class="cc-list-head"><strong>Clientes ('+shown.length+')</strong><select id="cc-sort" aria-label="Orden de clientes">'+ccOptions([['az','A–Z'],['za','Z–A'],['activity','Último pago']],ccSort)+'</select></div><div class="cc-list">'+slice.items.map(x=>{const status=ccStatus(x);return '<button type="button" class="cc-person '+(x.key===ccSelection?'active':'')+'" data-cc-select'+ccAttr(x)+'><span class="cc-avatar">'+ic('users')+'</span><span class="cc-person-text"><strong>'+esc(x.client.name)+'</strong><small>'+x.lots.length+' solar(es) · '+esc(x.lots.map(l=>l.id).join(', '))+'</small><span class="cc-status '+status[1]+'">'+esc(status[0])+'</span></span><span aria-hidden="true">›</span></button>';}).join('')+(!shown.length?'<p>No hay clientes con esos filtros.</p>':'')+'</div>'+pager+'</aside>'+
   '<section class="cc-pane cc-detail-pane"><button class="btn btn-soft cc-back" data-cc-back>‹ Volver a clientes</button>'+(g?ccDetail(g):'<p>Selecciona un cliente.</p>')+'</section></div>';
 };
 let ccSearchTimer;
 document.addEventListener('input',e=>{if(e.target.id!=='cc-search')return;ccSearch=e.target.value;ccPage=0;const source=e.target;
  const refresh=()=>{if(!source.isConnected||document.getElementById('cc-search')!==source)return;const pos=source.selectionStart,focused=document.activeElement===source;render();const input=document.getElementById('cc-search');if(input&&focused){input.focus();if(pos!=null)input.setSelectionRange(pos,pos);}};
  clearTimeout(ccSearchTimer);if(ccPhone())ccSearchTimer=setTimeout(refresh,140);else refresh();},true);
 document.addEventListener('change',e=>{if(e.target.id==='cc-sort'){ccSort=e.target.value;render();}},true);
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-cc-select],[data-cc-back],[data-cc-details],[data-cc-whatsapp],[data-cc-many-picker],[data-cc-page]');if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(b.hasAttribute('data-cc-page')){ccPage+=Number(b.dataset.ccPage);ccSelection='';ccMobileDetail=false;render();return;}
  if(b.hasAttribute('data-cc-many-picker')){window.lotigestMultiDate?.openMulti(true);return;}
  if(b.hasAttribute('data-cc-back')){ccMobileDetail=false;render();return;}
  const id=b.dataset.ccClient,rid=b.dataset.ccRid;
  if(b.hasAttribute('data-cc-select')){ccSelection=ccKey(rid,id);ccMobileDetail=true;render();return;}
  if(b.hasAttribute('data-cc-whatsapp')){pmOpenStatement(b,{clientId:id,rid,share:true});return;}
  const g=ccGroups(db,rid).find(x=>x.id===id);if(g)showModal('Ficha del cliente',ccDetail(g,true),'<button class="btn btn-soft" data-action="close-modal">Cerrar</button>',true);
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


// Panel de mora independiente; no modifica ni guarda cobros, fechas o contratos.
(function installMoraPanel(){
 const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const cash=n=>money(n/100);
 const allowed=()=>typeof cloudUser!=='undefined'&&cloudUser?.role==='admin';
 const monthLabel=m=>new Intl.DateTimeFormat('es-HN',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-15T12:00:00Z'));
 function moraRecords(onlyClient=null){
  const rid=residence().id,today=businessToday(),scope=contractCollectionsScope(db,rid);
  const groups=new Map();
  for(const sale of scope.sales.filter(s=>s.type==='credit'&&(!onlyClient||s.clientId===onlyClient))){
   if(!groups.has(sale.clientId))groups.set(sale.clientId,[]);
   groups.get(sale.clientId).push(sale);
  }
  const records=[],review=[];
  for(const [id,sales] of groups){
   const client=scope.clients.find(c=>c.id===id),name=client?.name||'Cliente';
   try{
    const model=pmAmortizationModel(db,id,rid,today,reconcileInstallments,installmentDueCents,(date,i)=>dateKey(addMonths(date,i)),null,{scope});
    // Check both the ledger and the financial balance; uncertainty is not mora verified.
    if(model.unmatched)throw Error('Hay recibos pendientes de conciliar.');
    pmStatementModel(model);
    const rows=model.details.filter(d=>d.primaApplied>=d.agreed).flatMap(d=>d.rows.filter(r=>r.dueDate<today&&r.remainingCents>0).map(r=>({...r,lot:d.lot,contract:d.contractNumber})));
    if(!rows.length)continue;
    const months=[...new Set(rows.map(r=>r.dueDate.slice(0,7)))].sort();
    const total=rows.reduce((n,r)=>n+r.remainingCents,0);
    records.push({id,name,phone:client?.phone||'',contract:[...new Set(rows.map(r=>r.contract))].join(' / '),residenceId:rid,residenceName:model.residence,asOf:today,rows,months,total,partial:rows.filter(r=>r.appliedCents>0).length,search:norm([name,client?.identity,...sales.map(s=>s.lotId),...rows.map(r=>r.contract),...months.map(monthLabel)].join(' '))});
   }catch(err){review.push({name,reason:err.message});}
  }
  records.sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'es'));
  return {records,review,today};
 }
 function moraPage(){
  if(!allowed())return '<section class="card card-padding">Acceso reservado a administración.</section>';
  const {records,review,today}=moraRecords();
  const total=records.reduce((n,r)=>n+r.total,0),num=records.reduce((n,r)=>n+r.rows.length,0);
  const tile=(l,v)=>'<section class="card mora-metric"><small>'+esc(l)+'</small><strong>'+esc(v)+'</strong></section>';
  const items=records.map(r=>{
   const months=r.months.map(m=>'<span class="mora-month">'+esc(monthLabel(m))+'</span>').join(' ');
   const detail=r.rows.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||String(a.contract).localeCompare(String(b.contract))).map(x=>{
    const lot=x.lot,where='Etapa '+(lot?.stage||'—')+' · Bloque '+(lot?.block||'—')+' · Solar '+(lot?.sourceNumber||lot?.id||'—');
    return '<tr><td>'+esc(monthLabel(x.dueDate.slice(0,7)))+'<small>'+esc(x.dueDate)+'</small></td><td>'+esc(where)+'<small>'+esc(x.contract)+'</small></td><td>'+esc(cash(x.dueCents))+'</td><td>'+esc(cash(x.appliedCents))+'<small>'+esc(x.receipts.map(p=>'#'+p.reference+' · '+cash(p.amountCents)).join('; '))+'</small></td><td class="mora-amount">'+esc(cash(x.remainingCents))+'</td><td>'+esc(x.appliedCents?'Cuota pagada incompleta':'Vencida sin abono')+'</td></tr>';
   }).join('');
   return '<article class="card mora-client" data-mora-record data-search="'+esc(r.search)+'" data-count="'+r.months.length+'" data-partial="'+r.partial+'"><div class="mora-client-head"><div><h3>'+esc(r.name)+'</h3><small>'+r.months.length+' mes(es) vencido(s) · '+r.rows.length+' cuota(s) de solar</small></div><strong class="mora-amount">'+esc(cash(r.total))+'</strong></div><div class="mora-months">'+months+'</div><details><summary>Ver meses, recibos y faltantes</summary><div class="mora-table"><table><thead><tr><th>Mes / vencimiento</th><th>Solar / contrato</th><th>Cuota</th><th>Abonado / recibos</th><th>Faltante</th><th>Estado</th></tr></thead><tbody>'+detail+'</tbody></table></div></details><div class="mora-actions"><button type="button" class="btn btn-outline" data-mora-statement="'+esc(r.id)+'">Estado de cuenta PDF</button><button type="button" class="btn btn-primary mora-send" data-mora-message="'+esc(r.id)+'">Enviar cobro por WhatsApp</button></div></article>';
  }).join('');
  return '<section class="mora-panel"><div class="page-head"><div><h1>Mora</h1><p>Mensualidades vencidas por cliente · Corte '+esc(today)+'</p></div></div>'+residencePicker()+
   '<div class="mora-metrics">'+tile('Clientes con mora',String(records.length))+tile('Cuotas vencidas',String(num))+tile('Total vencido confirmado',cash(total))+tile('Clientes por conciliar',String(review.length))+'</div>'+
   '<div class="card mora-filters"><label>Buscar cliente, contrato, solar o mes<input id="mora-search" type="search" placeholder="Buscar…"></label><label>Meses adeudados<select id="mora-count"><option value="all">Todos</option><option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 o más meses</option></select></label><label>Tipo<select id="mora-partial"><option value="all">Todas</option><option value="partial">Con cuota incompleta</option></select></label></div>'+
   '<p class="sm muted">Solo vencimientos anteriores a hoy. Los meses cubiertos con otros recibos y las cuotas futuras no se incluyen. Los importes de las cuotas incompletas corresponden al faltante, no al valor total.</p>'+
   '<div class="mora-list">'+items+'</div><p class="card card-padding" id="mora-empty" '+(records.length?'hidden':'')+'>No hay clientes con mora confirmada para estos filtros.</p>'+
   (review.length?'<section class="card card-padding"><h3>Por conciliar · No incluidos en los totales</h3>'+review.map(r=>'<p><b>'+esc(r.name)+'</b> · '+esc(r.reason)+'</p>').join('')+'</section>':'')+'</section>';
 }
 const originalContent=pageContent;pageContent=function(...args){return page==='mora'?moraPage():originalContent.apply(this,args);};
 const originalRender=render;render=function(...args){
  if(allowed()){
   if(!pages.mora){
    const entries=Object.entries(pages);for(const key of Object.keys(pages))delete pages[key];
    for(const [key,value] of entries){pages[key]=value;if(key==='collections')pages.mora=['Mora','bookClock'];}
    if(!pages.mora)pages.mora=['Mora','bookClock'];
   }
  }else{delete pages.mora;if(page==='mora')page='dashboard';}
  return originalRender.apply(this,args);
 };
 function filterMora(){
  if(page!=='mora'||!allowed())return;
  const q=norm(document.getElementById('mora-search')?.value||''),n=document.getElementById('mora-count')?.value||'all',p=document.getElementById('mora-partial')?.value||'all';let count=0;
  for(const el of document.querySelectorAll('[data-mora-record]')){
   const size=Number(el.dataset.count),visible=el.dataset.search.includes(q)&&(n==='all'||(n==='3'?size>=3:size===Number(n)))&&(p==='all'||Number(el.dataset.partial)>0);
   el.hidden=!visible;if(visible)count++;
  }
  const empty=document.getElementById('mora-empty');if(empty)empty.hidden=count>0;
 }
 document.addEventListener('input',e=>{if(e.target.id==='mora-search')filterMora();});
 document.addEventListener('change',e=>{if(['mora-count','mora-partial'].includes(e.target.id))filterMora();});
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-mora-statement],[data-mora-message]');if(!b||page!=='mora'||!allowed())return;
  try{
   if(b.dataset.moraMessage){
    const fresh=moraRecords(b.dataset.moraMessage).records[0];
    if(!fresh)throw Error('No hay mora confirmada para este cliente. Actualiza el panel.');
    const monthTotals=fresh.months.map(m=>monthLabel(m)+': '+cash(fresh.rows.filter(r=>r.dueDate.slice(0,7)===m).reduce((n,r)=>n+r.remainingCents,0)));
    const body='Hola, '+fresh.name+'. Le saludamos de '+(db.company?.name||'GRUPO H')+'. Le recordamos que su contrato '+fresh.contract+' en '+fresh.residenceName+' presenta el siguiente saldo vencido al '+fresh.asOf+':\n'+monthTotals.join('\n')+'\nTotal pendiente de cuotas vencidas: '+cash(fresh.total)+'.\nAgradecemos su atención. Si ya realizó el pago, por favor comuníquese con nosotros para verificarlo. Muchas gracias.';
    window.lotigestMoraMessages.open({...fresh,body});return;
   }
   pmOpenStatement(b,{clientId:b.dataset.moraStatement,rid:residence().id});
  }catch(err){toast(err.message,'error');}
 });
})();
