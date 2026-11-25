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

 // Workspace de cobros: lista ligera y detalle de un solo cliente.
 let ccSelection='',ccSearch='',ccMobileDetail=false,ccSort='az',ccLastScope='';
 const ccNorm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const ccKey=(rid,id)=>JSON.stringify([rid,id]);
 const ccCash=n=>money(n/100);
 function ccModel(state,id,rid){
  try{
   const m=pmAmortizationModel(state,id,rid,businessToday(),reconcileInstallments,installmentDueCents,(date,i)=>dateKey(addMonths(date,i)));
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
  const lots=g.lots.map(l=>l.id).join(' · '), credit=g.sales.some(s=>s.type==='credit');
  const metric=(label,value,style='',sub='')=>'<div class="cc-metric '+style+'"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div>';
  return '<div class="cc-detail-head"><span class="cc-avatar">'+ic('users')+'</span><div><h2>'+esc(g.client.name)+'</h2><small>'+esc(g.client.phone||'Sin teléfono')+' · '+esc(g.residenceName)+'</small></div><span class="cc-count">'+g.lots.length+' solar(es)</span></div>'+
   '<p class="cc-lots">'+esc(lots)+'</p>'+
   (t?'<div class="cc-metrics">'+metric('Pendiente del mes',ccCash(t.month),'',collectionMonth)+metric('Total vencido',ccCash(t.overdue),t.overdue?'cc-late':'',t.months+' mes(es)')+metric('Saldo total según amortización',ccCash(t.balance),'cc-balance')+'</div>'+
   '<div class="cc-progress"><div class="cc-progress-head"><strong>Progreso de la amortización</strong><b>'+t.percent.toFixed(1)+'%</b></div><progress max="100" value="'+t.percent+'"></progress><div class="cc-progress-values">'+metric('Pagado acumulado',ccCash(t.paid))+metric('Saldo por pagar',ccCash(t.balance))+metric('Total contratado',ccCash(t.price))+'</div></div>':
   '<p class="cc-review" role="alert">'+esc(g.sales.length?'Revisar amortización: '+g.model.error:'Contrato pendiente de activación. Aún no tiene cuotas confirmadas.')+'</p>')+
   '<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Solar</th><th>Cuota mensual</th><th>Vencido</th><th>Estado</th></tr></thead><tbody>'+
    g.lots.map(l=>{const d=m?.details.find(x=>x.lot.id===l.id),s=g.sales.find(x=>x.lotId===l.id),overdue=d?.rows.filter(r=>r.dueDate<m.asOf&&r.remainingCents>0)||[],months=new Set(overdue.map(r=>r.dueDate.slice(0,7))).size;
      return '<tr><td><strong>'+esc(l.id)+'</strong><small>Etapa '+esc(l.stage||'—')+' · '+esc(l.block||'—')+'</small></td><td>'+ (s?money(installment(s)):'—')+'</td><td class="'+(months?'cc-red':'')+'">'+(d?ccCash(overdue.reduce((n,r)=>n+r.remainingCents,0)):'—')+'</td><td><span class="cc-status '+(!s||!d?'pending':months?'late':'good')+'">'+(!s?'Pendiente':!d?'Revisar':months?'Vencido ('+months+' m)':'Al día')+'</span></td></tr>';
    }).join('')+'</tbody></table></div>'+
   '<div class="cc-actions">'+(credit?'<button type="button" class="btn btn-primary" data-cc-pay'+attr+'>Abonar total</button>':'')+
    (g.sales.length?'<button type="button" class="btn btn-outline" data-cc-statement'+attr+'>Estado de cuenta PDF</button><button type="button" class="btn btn-outline" data-cc-whatsapp'+attr+'>Enviar por WhatsApp</button>':'')+
    (!extra?'<button type="button" class="btn btn-outline" data-cc-details'+attr+'>Ver detalle</button>':'')+
    (extra&&credit?'<button type="button" class="btn btn-outline" data-cc-many'+attr+'>Varios abonos</button>':'')+
    (g.lots.length>g.sales.length?'<button type="button" class="btn btn-outline" data-collection-go-contracts>Revisar contrato</button>':'')+'</div>'+
    (extra&&m?'<details class="cc-extra" open><summary>Primas y abonos</summary><p>Prima pagada: <b>'+ccCash(m.prima)+'</b> · Abonos: <b>'+ccCash(m.abonos)+'</b></p><p>Último pago: '+esc(m.last||'Sin pagos registrados')+'</p><p>La mora y el pendiente del mes pueden coincidir; no se suman dos veces.</p></details>':'')+
    (extra?g.lots.map(l=>'<p><strong>'+esc(l.id)+'</strong> <button class="btn btn-outline btn-sm" data-action="geo-bind" data-id="'+esc(l.id)+'">GPS</button> <button class="btn btn-soft btn-sm" data-action="view-lot" data-id="'+esc(l.id)+'">Detalle solar</button></p>').join(''):'');
 }
 function ccGroups(state,rid){
  const scope=contractCollectionsScope(state,rid),groups=new Map();
  for(const lot of scope.lots){
   const id=lot.ownerClientId,key=ccKey(lot.residenceId,id);
   if(!groups.has(key))groups.set(key,{key,id,rid:lot.residenceId,lots:[],sales:[],client:scope.clients.find(c=>c.id===id),residenceName:state.residences.find(r=>r.id===lot.residenceId)?.name||''});
   const g=groups.get(key);g.lots.push(lot);
   const sale=scope.sales.find(s=>s.lotId===lot.id&&s.clientId===id);if(sale)g.sales.push(sale);
  }
  for(const g of groups.values())g.model=g.sales.length?ccModel(state,g.id,g.rid):{};
  return [...groups.values()];
 }
 function ccMatch(g){
  if(collectionStageFilter!=='all'&&!g.lots.some(l=>String(l.stage||'pending')===collectionStageFilter))return false;
  if(ccSearch&&!ccNorm([g.client.name,g.client.identity,g.client.phone,g.residenceName,...g.lots.flatMap(l=>[l.id,l.block,l.sourceNumber])].join(' ')).includes(ccNorm(ccSearch)))return false;
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
 '.cc-workspace{display:grid;grid-template-columns:minmax(235px,29%) minmax(0,1fr);gap:12px;align-items:start}.cc-pane{min-width:0;border:1px solid rgba(120,150,136,.28);border-radius:15px;background:var(--card,#fff);padding:14px;color:inherit}.cc-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 14px}.cc-toolbar input{flex:1;min-width:160px}.cc-toolbar details{position:relative}.cc-toolbar summary{cursor:pointer;list-style:none}.cc-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:10px 0}.cc-list-head,.cc-progress-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.cc-list-head select{max-width:125px}.cc-list{display:grid;gap:7px;margin-top:12px;max-height:70vh;overflow:auto}.cc-person{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:11px;background:transparent;border:1px solid rgba(120,150,136,.24);border-radius:11px;color:inherit;cursor:pointer}.cc-person.active{background:rgba(130,202,62,.13);border-color:#80b84b}.cc-person-text{flex:1;min-width:0;overflow-wrap:anywhere}.cc-person strong,.cc-person small,.cc-table td small{display:block}.cc-person small{font-size:11px}.cc-avatar{width:40px;height:40px;display:grid;place-items:center;background:rgba(130,202,62,.18);border-radius:10px;color:#32924b;flex-shrink:0}.cc-avatar svg{width:21px;height:21px}.cc-status{display:inline-block;border-radius:20px;padding:3px 8px;font-size:11px;font-weight:700;background:rgba(130,202,62,.14);color:#27874a;margin-top:5px}.cc-status.late{background:rgba(211,58,85,.12);color:#c03a55}.cc-status.pending{background:rgba(224,160,40,.16);color:#aa7929}.cc-detail-head{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.cc-detail-head h2{font-size:clamp(16px,2vw,23px);margin:0;overflow-wrap:anywhere}.cc-detail-head>div{flex:1;min-width:0}.cc-count{font-size:12px;border-radius:10px;padding:6px 9px;background:rgba(130,202,62,.15);white-space:nowrap}.cc-lots{font-size:13px;margin:12px 0}.cc-metrics,.cc-progress-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.cc-metric{min-width:0;padding:12px;border-radius:11px;background:rgba(113,150,136,.08)}.cc-metric small{display:block;font-size:12px}.cc-metric strong{display:block;font-size:clamp(15px,1.6vw,24px);margin-top:6px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.cc-metric.cc-late{background:rgba(211,58,85,.1);color:#b72f4c}.cc-metric.cc-balance{background:#175b39;color:white}.cc-progress{border:1px solid rgba(120,150,136,.25);border-radius:12px;padding:12px;margin:12px 0}.cc-progress-head b{color:#309447}.cc-progress progress{width:100%;height:12px;accent-color:#65ad33;margin:12px 0}.cc-progress-values .cc-metric{background:transparent;padding:4px 8px}.cc-progress-values .cc-metric strong{font-size:15px}.cc-table-wrap{overflow:auto;border:1px solid rgba(120,150,136,.25);border-radius:11px}.cc-table{width:100%;border-collapse:collapse;font-size:13px}.cc-table th,.cc-table td{padding:10px;text-align:left;border-bottom:1px solid rgba(120,150,136,.18);white-space:normal}.cc-table th{background:rgba(120,150,136,.1)}.cc-table td small{font-size:10px}.cc-red{color:#c03a55;font-weight:700}.cc-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}.cc-actions button{flex:1 1 auto}.cc-review{padding:12px;border-radius:8px;background:rgba(224,160,40,.12)}.cc-back{display:none}.cc-extra{margin:12px 0}.lotigest-dark .cc-pane{background:rgba(19,48,39,.95)}'+
 '@media(max-width:760px){.cc-workspace{grid-template-columns:1fr}.cc-workspace.cc-mobile-detail .cc-list-pane{display:none}.cc-workspace:not(.cc-mobile-detail) .cc-detail-pane{display:none}.cc-back{display:inline-flex;margin-bottom:12px}.cc-list{max-height:none}.cc-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-metric.cc-balance{grid-column:1/-1}.cc-progress-values{gap:2px}.cc-progress-values .cc-metric{padding:4px}.cc-progress-values .cc-metric strong{font-size:13px}.cc-table{font-size:12px}.cc-table td,.cc-table th{padding:7px}.cc-toolbar input{width:100%}.cc-pane{padding:12px}}'+
 '</style>';
 collectionPage=function(){
  const state=db,rid=residence().id;
  if(ccLastScope!==rid){ccLastScope=rid;ccSelection='';ccMobileDetail=false;}
  const all=ccGroups(state,rid),shown=all.filter(ccMatch);
  shown.sort((a,b)=>ccSort==='za'?b.client.name.localeCompare(a.client.name,'es'):ccSort==='activity'?String(b.model.m?.last||'').localeCompare(String(a.model.m?.last||'')):a.client.name.localeCompare(b.client.name,'es'));
  const g=shown.find(x=>x.key===ccSelection)||shown[0];ccSelection=g?.key||'';
  return ccStyle+'<div class="cc-toolbar"><input type="search" id="cc-search" placeholder="Buscar cliente, teléfono o solar…" aria-label="Buscar cliente" value="'+esc(ccSearch)+'"><details><summary class="btn btn-outline">Filtros ▾</summary><div class="cc-filter-grid">'+
   '<label>Residencial<select data-residence-picker>'+ccOptions(state.residences.filter(r=>!r.hidden).map(r=>[r.id,r.name]),rid)+'</select></label>'+
   '<label>Mes<input id="debt-month" type="month" value="'+esc(collectionMonth)+'"></label><label>Etapa<select id="collection-stage-filter">'+ccOptions([['all','Todas'],['1','Etapa 1'],['2','Etapa 2'],['pending','Por confirmar']],collectionStageFilter)+'</select></label>'+
   '<label>Estado<select id="debt-filter">'+ccOptions([['all','Todos'],['notify','Por cobrar'],['late','Vencidos'],['month','Pendientes del mes'],['credit','Al día'],['settled','Cancelados'],['cash','Contado'],['pending','Pendiente de activar'],['review','Por conciliar']],collectionFilter)+'</select></label>'+
   '<label>Meses vencidos<select id="debt-overdue-months">'+ccOptions([['all','Todos'],...Array.from({length:Math.max(5,...all.map(x=>x.model.m?.consolidated.monthsOverdue||0))},(_,i)=>[i+1,i+1])],collectionOverdueMonths)+'</select></label>'+
   '<button class="btn btn-outline" data-action="debt-csv">Exportar reporte Excel</button><button class="btn btn-outline" data-action="payments-excel">Exportar primas y abonos</button><button class="btn btn-outline" data-action="debt-print">Imprimir reporte</button><button class="btn btn-outline" data-collection-new-contract>Nuevo contrato</button></div></details>'+
   '<button class="btn btn-primary" data-action="new-payment">+ Registrar cobro</button></div>'+
   '<div class="cc-workspace '+(ccMobileDetail&&g?'cc-mobile-detail':'')+'"><aside class="cc-pane cc-list-pane"><div class="cc-list-head"><strong>Clientes ('+shown.length+')</strong><select id="cc-sort" aria-label="Orden de clientes">'+ccOptions([['az','A–Z'],['za','Z–A'],['activity','Último pago']],ccSort)+'</select></div><div class="cc-list">'+shown.map(x=>{const status=ccStatus(x);return '<button type="button" class="cc-person '+(x.key===ccSelection?'active':'')+'" data-cc-select'+ccAttr(x)+'><span class="cc-avatar">'+ic('users')+'</span><span class="cc-person-text"><strong>'+esc(x.client.name)+'</strong><small>'+x.lots.length+' solar(es) · '+esc(x.lots.map(l=>l.id).join(', '))+'</small><span class="cc-status '+status[1]+'">'+esc(status[0])+'</span></span><span aria-hidden="true">›</span></button>';}).join('')+(!shown.length?'<p>No hay clientes con esos filtros.</p>':'')+'</div></aside>'+
   '<section class="cc-pane cc-detail-pane"><button class="btn btn-soft cc-back" data-cc-back>‹ Volver a clientes</button>'+(g?ccDetail(g):'<p>Selecciona un cliente.</p>')+'</section></div>';
 };
 document.addEventListener('input',e=>{if(e.target.id!=='cc-search')return;ccSearch=e.target.value;const pos=e.target.selectionStart;render();const input=document.getElementById('cc-search');if(input){input.focus();if(pos!=null)input.setSelectionRange(pos,pos);}},true);
 document.addEventListener('change',e=>{if(e.target.id==='cc-sort'){ccSort=e.target.value;render();}},true);
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-cc-select],[data-cc-back],[data-cc-details],[data-cc-whatsapp]');if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
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
