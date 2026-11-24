// Historial de abonos por fecha; las anulaciones exigen confirmación administrativa.
let pmHistoryLayer=null;
function pmHistoryReference(p){
 // El folio original es texto: no convertir a Number ni usar el ID interno.
 return String(p.receiptReference||p.receiptRef||p.originalReceiptRef||p.receiptReferenceNormalized||'').trim();
}
function pmHistoryMatches(p,q){
 return !q||[p.id,p.reference,p.concept,p.kind,...(p.parts||[]),...(p.lots||[])].join(' ').toLowerCase().includes(q)||
  (/^\d+$/.test(q)&&String(p.reference||'').replace(/^0+(?=\d)/,'')===q.replace(/^0+(?=\d)/,''));
}
function pmHistoryRows(){
 const out=[];
 if(pmActive==='sale'){
  const sales=pmSales(),byId=new Map(sales.map(s=>[s.id,s]));
  const groups=new Map();
  for(const p of db.payments||[]){
   if(!byId.has(p.saleId)||p.voidedAt||p.deletedAt)continue;
   const key=String(p.groupId||p.id);
   if(!groups.has(key))groups.set(key,{id:key,date:p.date||'',amountCents:0,parts:[],lots:new Set(),
    method:p.method||'',concept:p.concept||'',reference:pmHistoryReference(p),receiptId:p.id,action:'receipt-preview',kind:'Recibo registrado'});
   const entry=groups.get(key),sale=byId.get(p.saleId),lot=getLot(sale.lotId);
   const reference=pmHistoryReference(p);
   if(reference&&!entry.reference)entry.reference=reference;
   else if(reference&&entry.reference!==reference&&!entry.reference.split(' / ').includes(reference))entry.reference+=' / '+reference;
   entry.amountCents+=Math.round(Number(p.amount||0)*100);
   if(lot)entry.lots.add('Etapa '+(lot.stage||'—')+' · Bloque '+(lot.block||'—')+' · Solar '+(lot.sourceNumber||lot.id));
   const allocations=p.receiptInfo?.allocations;
   if(Array.isArray(allocations)&&allocations.length){
    for(const a of allocations){
     const period=String(a.month||'');
     const advance=Boolean(period&&p.date&&p.date.slice(0,7)<period);
     const text=a.number?'Cuota '+a.number+(period?' ('+period+')':'')+(advance?' · adelantada':''):
      String(a.label||'Prima / pago inicial');
     entry.parts.push(text+' · '+money(Number(a.amount||0)));
    }
   }else entry.parts.push('Aplicación mensual no identificada · verificar recibo');
  }
  out.push(...groups.values());
 }else if(pmActive==='owner'){
  const clientId=ownerPaymentDraft?.clientId,rid=ownerPaymentDraft?.residenceId;
  if(!clientId||!rid)return [];
  for(const p of db.ownerPayments||[]){
   if(p.clientId!==clientId||p.residenceId!==rid||p.voidedAt||p.deletedAt)continue;
   const lots=new Set();
   for(const a of p.allocations||[])for(const ref of a.references||[])
    lots.add('Etapa '+(ref.stage||'—')+' · Bloque '+(ref.block||'—')+' · Solar '+(ref.solar||ref.lot||'—'));
   out.push({id:p.id,date:p.date||'',amountCents:Number(p.amountCents||0),method:p.method||'',concept:p.concept||'',reference:pmHistoryReference(p),
    kind:/\bprima\b/i.test(String(p.concept||''))?'Prima registrada':'Abono en ficha',
    parts:[String(p.concept||'')||'Abono del propietario; consultar asignación'],
    lots,receiptId:p.id,action:'owner-payment-receipt'});
  }
  // Historial importado sin recibo publicado: conservarlo visible pero no sumarlo dos veces.
  for(const p of db.historicalPayments||[]){
   if(p.clientId!==clientId||p.residenceId!==rid||p.postedPaymentId||p.voidedAt||p.deletedAt)continue;
   out.push({id:p.id,date:p.date||'',amountCents:p.amountCents==null?null:Number(p.amountCents),
    method:p.method||'',concept:p.concept||'',reference:pmHistoryReference(p),kind:'Historial importado por revisar',
    parts:['Movimiento documental: no confirma cuota mensual hasta su conciliación'],
    lots:new Set([('Bloque '+(p.block||'—')+' · Solar '+(p.lot||p.solar||'—'))]),
    action:null,receiptId:null});
  }
 }
 return out.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.id).localeCompare(String(a.id)));
}
// Anular un recibo de crédito completo. Archiva originales y vuelve a aplicar
// solo las cuotas posteriores afectadas, sin alterar dinero de otros recibos.
function pmHistoryVoidPlan(state,receiptId,actor,reason,rebuild){
 const original=state.payments||[],selected=original.find(p=>p.id===receiptId);
 if(!selected)throw Error('El recibo ya no existe.');
 const group=original.filter(p=>selected.groupId?p.groupId===selected.groupId:p.id===selected.id);
 const sales=new Map((state.sales||[]).map(s=>[s.id,s])),lots=new Map((state.lots||[]).map(l=>[l.id,l]));
 const linked=group.map(p=>sales.get(p.saleId));
 const clients=new Set(linked.map(s=>s?.clientId)),residences=new Set(linked.map(s=>lots.get(s?.lotId)?.residenceId));
 if(linked.some(s=>!s||s.type!=='credit'||!lots.has(s.lotId))||clients.size!==1||residences.size!==1)
  throw Error('Solo se pueden anular recibos de crédito del mismo cliente y residencial.');
 const ids=new Set(group.map(p=>p.id));
 if(group.some(p=>p.historicalImportId||p.voidedAt||p.deletedAt||p.cancelledAt)||
  (state.historicalPayments||[]).some(p=>ids.has(p.postedPaymentId)))
  throw Error('Este recibo histórico o anulado requiere conciliación administrativa.');
 if((state.cashEntries||[]).some(p=>ids.has(p.paymentId)||p.groupId&&p.groupId===selected.groupId)||
  (state.receipts||[]).some(p=>ids.has(p.paymentId)||p.groupId&&p.groupId===selected.groupId))
  throw Error('El recibo tiene movimientos independientes vinculados. Revisa Caja antes de anular.');
 const why=String(reason||'').trim();if(why.length<5||why.length>300)throw Error('Escribe un motivo de 5 a 300 caracteres.');
 const next=JSON.parse(JSON.stringify(state)),affected=new Set(group.map(p=>p.saleId)),prior=new Map(),changed=new Set(),corrected=[];
 const index=new Map(next.payments.map(p=>[p.id,p]));
 // El registro original está ordenado del último guardado al primero.
 for(const p of [...original].reverse()){
  if(!affected.has(p.saleId))continue;
  const sale=sales.get(p.saleId),before=prior.has(p.saleId)?prior.get(p.saleId):Math.round(Number(sale.openingPaid||0)*100);
  if(ids.has(p.id)){changed.add(p.saleId);prior.set(p.saleId,before);continue;}
  if(p.voidedAt||p.deletedAt||p.cancelledAt)throw Error('Hay pagos anulados anteriores que requieren conciliación.');
  if(changed.has(p.saleId)){
   if(p.historicalImportId||!p.receiptInfo||!Array.isArray(p.receiptInfo.allocations))throw Error('Hay recibos posteriores sin detalle verificable. Requiere conciliación.');
   const target=index.get(p.id),newInfo=rebuild(target,before/100);
   if(!newInfo||!Array.isArray(newInfo.allocations))throw Error('No fue posible recalcular las cuotas.');
   corrected.push({id:p.id,previousReceiptInfo:target.receiptInfo});
   target.receiptInfo=newInfo;
  }
  prior.set(p.saleId,before+Math.round(Number(p.amount)*100));
 }
 next.payments=next.payments.filter(p=>!ids.has(p.id));
 next.paymentVoidHistory??=[];
 next.paymentVoidHistory.push({at:new Date().toISOString(),by:String(actor||'Administrador'),reason:why,
  receiptId:selected.groupId||selected.id,reference:pmHistoryReference(selected),payments:group,corrected});
 return {state:next,count:group.length,total:group.reduce((n,p)=>n+Math.round(Number(p.amount)*100),0)};
}
function pmHistoryCanVoid(row){
 if(typeof cloudUser==='undefined'||cloudUser?.role!=='admin'||row.action!=='receipt-preview')return false;
 const selected=(db.payments||[]).find(p=>p.id===row.receiptId);
 if(!selected)return false;
 return (db.payments||[]).filter(p=>selected.groupId?p.groupId===selected.groupId:p.id===selected.id)
  .every(p=>(db.sales||[]).some(s=>s.id===p.saleId&&s.type==='credit')&&!p.historicalImportId);
}
function pmHistoryVoidForm(row,item){
 if(item.querySelector('[data-pm-void-form]'))return;
 const form=pmNode('form','pm-history-item-body');form.dataset.pmVoidForm='true';
 const selected=(db.payments||[]).find(p=>p.id===row.receiptId);
 if(!selected)return;
 const group=db.payments.filter(p=>selected.groupId?p.groupId===selected.groupId:p.id===selected.id);
 const snapshot=JSON.stringify(db);
 form.append(pmNode('strong','','Anular recibo completo · '+money(group.reduce((n,p)=>n+Number(p.amount),0))),
  pmNode('p','','Incluye '+group.length+' movimiento(s). El saldo y las cuotas se recalcularán; los originales quedarán en auditoría. Introduce el PIN vigente del panel Contratos.'));
 const pinLabel=pmNode('label','','PIN del administrador'),pin=pmNode('input');pin.type='password';pin.inputMode='numeric';pin.maxLength=4;pin.required=true;pin.autocomplete='off';pinLabel.append(pin);
 const whyLabel=pmNode('label','','Motivo de anulación'),why=pmNode('input');why.required=true;why.minLength=5;why.maxLength=300;whyLabel.append(why);
 const message=pmNode('p','pm-help');message.setAttribute('role','alert');
 const cancel=pmNode('button','btn btn-outline btn-sm','Cancelar');cancel.type='button';cancel.addEventListener('click',()=>form.remove());
 const save=pmNode('button','btn btn-outline btn-sm','Confirmar anulación');save.type='submit';save.style.color='#b42332';
 form.append(pinLabel,whyLabel,message,cancel,save);
 form.addEventListener('submit',async e=>{
  e.preventDefault();e.stopImmediatePropagation();
  if(save.disabled)return;
  try{
   if(typeof contractIntakeAdmin!=='function'||!contractIntakeAdmin()||typeof window.lotigestConfirmAdminPin!=='function')throw Error('Se requiere administrador con la nube sincronizada.');
   if(JSON.stringify(db)!==snapshot)throw Error('Los datos cambiaron. Cierra y vuelve a abrir el historial.');
   const plan=pmHistoryVoidPlan(db,row.receiptId,cloudUser.name,why.value,buildReceiptInfo);
   window.lotigestConfirmAdminPin(pin.value);pin.value='';save.disabled=true;cancel.disabled=true;
   cloudWrite(JSON.stringify(plan.state));db=plan.state;await cloudFlush();
   const confirmed=cloudReady&&!cloudBlocked&&!cloudOffline&&cloudQueue&&!cloudQueue.pending&&cloudQueue.latest===cloudQueue.confirmed;
   pmClosePaymentHistory();closeModal();render();
   toast(confirmed?'Recibo anulado. Saldo y cuotas actualizados.':'Anulación pendiente de sincronización. No repitas la operación.',confirmed?'success':'error');
  }catch(err){message.textContent=err.message;pin.value='';save.disabled=false;cancel.disabled=false;}
 });
 item.append(form);pin.focus();
}
function pmClosePaymentHistory(){
 if(pmHistoryLayer){pmHistoryLayer.remove();pmHistoryLayer=null;}
}
function pmOpenPaymentHistory(){
 const rows=pmHistoryRows();
 pmClosePaymentHistory();
 const layer=pmNode('div','pm-history-layer'),shade=pmNode('div','pm-history-shade');
 const dialog=pmNode('section','pm-history-window');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-labelledby','pm-history-title');
 const header=pmNode('div','pm-history-head');
 const heading=pmNode('div'),title=pmNode('h2','','Historial de pagos por fecha');
 title.id='pm-history-title';
 heading.append(title,pmNode('p','pm-help','Recibos ordenados del más reciente al más antiguo. Cada fecha muestra el pago recibido, el solar y las cuotas aplicadas.'));
 const close=pmNode('button','btn btn-soft pm-history-close','Cerrar ×');
 close.type='button';close.dataset.pmHistoryClose='true';
 header.append(heading,close);
 const filters=pmNode('div','pm-history-filters');
 const start=pmNode('label','','Desde'),from=pmNode('input');
 from.type='date';from.id='pm-history-from';start.append(from);
 const end=pmNode('label','','Hasta'),to=pmNode('input');
 to.type='date';to.id='pm-history-to';end.append(to);
 const clear=pmNode('button','btn btn-outline btn-sm','Todas las fechas');clear.type='button';
 const search=pmNode('label','','Filtrar concepto / recibo'),text=pmNode('input');
 text.type='search';text.placeholder='Correlativo, cuota o solar';search.append(text);
 filters.append(start,end,search,clear);
 const count=pmNode('p','pm-history-count');
 const list=pmNode('div','pm-history-list');
 const render=()=>{
  list.replaceChildren();
  const q=String(text.value||'').trim().toLowerCase();
  const visible=rows.filter(p=>(!from.value||p.date>=from.value)&&(!to.value||p.date<=to.value)&&
    pmHistoryMatches(p,q));
  count.textContent=visible.length+' registro(s) por fecha'+(visible.length?' · Último movimiento: '+(visible[0].date||'Por verificar'):'');
  if(!visible.length){list.append(pmNode('p','pm-help','No hay movimientos para estas fechas o el cliente/solar seleccionado.'));return;}
  for(const p of visible){
   const item=pmNode('article','pm-history-item');
   const row=pmNode('div','pm-history-item-head');
   row.append(pmNode('strong','',p.date||'Fecha por verificar'),pmNode('strong','',p.amountCents===null?'Importe por verificar':money(p.amountCents/100)));
   item.append(row);
   const folio=pmNode('strong','pm-history-folio','Correlativo: '+(p.reference||'Sin correlativo registrado'));
   folio.style.cssText='display:block;font-weight:700;color:#b42332;overflow-wrap:anywhere;margin:6px 0';
   if(p.reference)folio.style.cssText+=';background:#fff1f2;border-radius:6px;padding:4px 8px;width:fit-content';
   item.append(folio,pmNode('span','pm-history-tag',p.kind+' · '+p.id));
   const body=pmNode('div','pm-history-item-body');
   body.append(pmNode('p','',p.method?'Método: '+p.method:'Método no indicado'));
   if(p.concept)body.append(pmNode('p','',p.concept));
   if(p.lots?.size)body.append(pmNode('p','','Solar(es): '+[...p.lots].join(' | ')));
   if(p.parts?.length)body.append(pmNode('p','','Aplicación: '+p.parts.join(' | ')));
   item.append(body);
   if(p.action&&p.receiptId){
    const button=pmNode('button','btn btn-outline btn-sm','Ver / imprimir recibo');
    button.type='button';button.dataset.action=p.action;button.dataset.id=p.receiptId;
    item.append(button);
    if(pmHistoryCanVoid(p)){
     const remove=pmNode('button','btn btn-outline btn-sm','Eliminar pago');remove.type='button';remove.style.color='#b42332';remove.style.marginLeft='8px';
     remove.addEventListener('click',()=>pmHistoryVoidForm(p,item));item.append(remove);
    }
   }else item.append(pmNode('small','pm-help','Documento sin recibo PDF vinculado; revisar el movimiento.'));
   list.append(item);
  }
 };
 from.addEventListener('change',render);to.addEventListener('change',render);
 text.addEventListener('input',render);
 clear.addEventListener('click',()=>{from.value='';to.value='';text.value='';render();});
 layer.append(shade,dialog);dialog.append(header,filters,count,list);
 layer.addEventListener('click',e=>{
  if(e.target===shade||e.target.closest('[data-pm-history-close]')){pmClosePaymentHistory();return;}
  if(e.target.closest('[data-action="receipt-preview"],[data-action="owner-payment-receipt"]'))
   pmClosePaymentHistory(); // deja que el manejador de recibos del programa abra el PDF
 });
 layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();pmClosePaymentHistory();}});
 document.body.append(layer);pmHistoryLayer=layer;render();close.focus();
}
