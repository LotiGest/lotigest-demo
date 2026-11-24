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
// Editar un recibo sin crear otro ni cambiar el cliente/solar.
function pmHistoryEditPlan(state,receiptId,changes,actor,reason,rebuild,receiptRules,today){
 const original=state.payments||[],selected=original.find(p=>p.id===receiptId);
 if(!selected)throw Error('El recibo ya no existe.');
 const group=original.filter(p=>selected.groupId?p.groupId===selected.groupId:p.id===selected.id);
 const ids=new Set(group.map(p=>p.id)),sales=new Map((state.sales||[]).map(s=>[s.id,s])),lots=new Map((state.lots||[]).map(l=>[l.id,l]));
 const linked=group.map(p=>sales.get(p.saleId));
 if(linked.some(s=>!s||s.type!=='credit'||!lots.has(s.lotId))||new Set(linked.map(s=>s?.clientId)).size!==1||new Set(linked.map(s=>lots.get(s?.lotId)?.residenceId)).size!==1)
  throw Error('Solo se pueden editar recibos de crédito del mismo cliente y residencial.');
 if(group.some(p=>p.historicalImportId||p.voidedAt||p.deletedAt||['voided','cancelled'].includes(p.status))||
  (state.historicalPayments||[]).some(p=>ids.has(p.postedPaymentId)))throw Error('Recibo histórico o anulado: requiere conciliación.');
 if([...(state.cashEntries||[]),...(state.receipts||[])].some(p=>ids.has(p.paymentId)||(p.groupId&&p.groupId===selected.groupId)))throw Error('Revisa los movimientos vinculados en Caja antes de editar.');
 const why=String(reason||'').trim(),date=String(changes.date||''),method=String(changes.method||'').trim();
 if(why.length<5||why.length>300)throw Error('Escribe un motivo de 5 a 300 caracteres.');
 const parsed=new Date(date+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date||date>today||linked.some(s=>date<s.date))throw Error('La fecha debe ser válida, no futura ni anterior al contrato.');
 if(!method||method.length>80)throw Error('Indica un método de pago válido.');
 const paymentType=String(changes.paymentType||'keep');
 if(!['keep','prima','abono'].includes(paymentType))throw Error('Selecciona un tipo de pago válido.');
 const reference=String(changes.reference||'').trim();
 const normalized=receiptRules.requireReceiptCorrelativo(reference);
 const without={...state,payments:original.filter(p=>!ids.has(p.id))};
 if(receiptRules.findReceiptCorrelativo(without,reference))throw Error('El correlativo ya corresponde a otro pago.');
 const next=JSON.parse(JSON.stringify(state)),changedAmounts=new Set(),affected=new Set(linked.map(s=>s.id)),prior=new Map(),dirty=new Set(),corrected=[];
 for(const p of next.payments.filter(p=>ids.has(p.id))){
  const old=original.find(x=>x.id===p.id),raw=String(changes.amounts?.[p.id]??'').replace(/,/g,'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||!Number.isSafeInteger(Math.round(Number(raw)*100))||Number(raw)<=0)throw Error('Ingresa un monto positivo con hasta dos decimales para cada solar.');
  p.amount=Number(raw);p.date=date;p.method=method;p.receiptReference=reference;p.receiptReferenceNormalized=normalized;
  if(paymentType!=='keep'){
   p.concept=paymentType==='prima'?'Prima atrasada':'Abono mensual';
   p.paymentApplication=paymentType;
   // Evitar que una clasificación anterior como prima o abono prevalezca.
   if(/^(?:prima|abono|installment)$/i.test(String(p.kind||'')))p.kind=paymentType==='prima'?'prima':'installment';
   if(/^(?:prima|abono|installment)$/i.test(String(p.type||'')))p.type=paymentType==='prima'?'prima':'installment';
  }
  if(p.amount!==Number(old.amount)||paymentType!=='keep')changedAmounts.add(p.id);
 }
 const oldIndex=new Map(original.map(p=>[p.id,p]));
 for(const p of [...next.payments].reverse()){
  if(!affected.has(p.saleId))continue;
  const sale=sales.get(p.saleId),before=prior.has(p.saleId)?prior.get(p.saleId):Math.round(Number(sale.openingPaid||0)*100);
  if(p.voidedAt||p.deletedAt||['voided','cancelled'].includes(p.status))throw Error('Hay pagos anulados que requieren conciliación.');
  const after=before+Math.round(Number(p.amount)*100);
  if(after>Math.round(Number(sale.price)*100))throw Error('El importe supera el saldo del solar.');
  if(changedAmounts.has(p.id))dirty.add(p.saleId);
  if(dirty.has(p.saleId)){
   const old=oldIndex.get(p.id);
   if(p.historicalImportId||!old.receiptInfo||!Array.isArray(old.receiptInfo.allocations)||(state.historicalPayments||[]).some(h=>h.postedPaymentId===p.id))throw Error('Hay recibos sin detalle verificable. Requiere conciliación.');
   const newInfo=rebuild(p,before/100);
   if(!newInfo||!Array.isArray(newInfo.allocations))throw Error('No fue posible recalcular las cuotas.');
   const primaCents=newInfo.allocations.filter(a=>!a.number&&/prima/i.test(String(a.label||''))).reduce((n,a)=>n+Math.round(Number(a.amount||0)*100),0);
   const installmentCents=newInfo.allocations.filter(a=>Number(a.number)>0).reduce((n,a)=>n+Math.round(Number(a.amount||0)*100),0);
   const amountCents=Math.round(Number(p.amount)*100);
   if(p.paymentApplication==='prima'&&primaCents!==amountCents)throw Error('El monto de prima atrasada supera la prima pendiente del solar en ese recibo. Revisa los pagos previos o corrige el importe.');
   if(p.paymentApplication==='abono'&&installmentCents!==amountCents)throw Error('El abono no puede aplicarse íntegramente a cuotas porque todavía hay prima pendiente. Registra primero la prima correspondiente.');
   if(/\bprima\b/i.test(String(p.concept||''))&&newInfo.allocations.some(a=>a.number))throw Error('Una prima no puede convertirse en cuota mediante edición.');
   if(!ids.has(p.id))corrected.push({id:p.id,previousReceiptInfo:old.receiptInfo});
   p.receiptInfo={...old.receiptInfo,...newInfo};
  }
  prior.set(p.saleId,after);
 }
 next.paymentEditHistory??=[];
 next.paymentEditHistory.push({at:new Date().toISOString(),by:String(actor||'Administrador'),reason:why,receiptId:selected.groupId||selected.id,
  before:group,after:next.payments.filter(p=>ids.has(p.id)),corrected});
 return {state:next,count:group.length,total:next.payments.filter(p=>ids.has(p.id)).reduce((n,p)=>n+Math.round(p.amount*100),0)};
}
function pmHistoryEditForm(row,item){
 if(item.querySelector('[data-pm-edit-form],[data-pm-void-form]'))return;
 const selected=(db.payments||[]).find(p=>p.id===row.receiptId);if(!selected)return;
 const group=db.payments.filter(p=>selected.groupId?p.groupId===selected.groupId:p.id===selected.id),snapshot=JSON.stringify(db);
 const form=pmNode('form','pm-history-item-body');form.dataset.pmEditForm='true';
 const field=(label,value,type='text')=>{
  const wrap=pmNode('label','',label),input=pmNode('input');input.type=type;input.value=String(value??'');input.required=true;wrap.append(input);form.append(wrap);return input;
 };
 form.append(pmNode('strong','','Editar recibo completo'),pmNode('p','','Conserva los solares y el mismo recibo. Confirma los montos de cada solar, el motivo y el PIN vigente de Contratos.'));
 const date=field('Fecha de pago',selected.date,'date');date.max=businessToday();
 const reference=field('Correlativo',pmHistoryReference(selected));reference.inputMode='numeric';reference.maxLength=80;reference.style.color='#b42332';
 const method=field('Método de pago',selected.method);method.maxLength=80;
 const typeLabel=pmNode('label','','Tipo de pago'),paymentType=pmNode('select');
 for(const [value,label] of [['keep','Conservar tipo actual'],['prima','Prima atrasada (no es cuota)'],['abono','Abono mensual']]){
  const option=pmNode('option','',label);option.value=value;paymentType.append(option);
 }
 paymentType.value='keep';typeLabel.append(paymentType);form.append(typeLabel);
 form.append(pmNode('small','pm-help','Tipo actual: '+(selected.concept||'Pago')+'. La prima atrasada cubre únicamente prima pendiente; el abono cubre cuotas una vez completada la prima.'));
 const inputs=new Map(),total=pmNode('strong','','');
 const update=()=>{total.textContent='Total del recibo: '+money([...inputs.values()].reduce((n,x)=>n+(Number(x.value.replace(/,/g,''))||0),0));};
 for(const p of group){
  const sale=getSale(p.saleId),lot=getLot(sale?.lotId),input=field('Etapa '+(lot?.stage||'—')+' · Bloque '+(lot?.block||'—')+' · Solar '+(lot?.sourceNumber||lot?.id||'—')+' (L)',Number(p.amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
  input.inputMode='decimal';input.style.color='#176c34';input.addEventListener('input',update);inputs.set(p.id,input);
 }
 form.append(total);update();
 const why=field('Motivo de edición','');why.minLength=5;why.maxLength=300;
 const pin=field('PIN del administrador','','password');pin.inputMode='numeric';pin.maxLength=4;pin.autocomplete='off';
 const message=pmNode('p','pm-help');message.setAttribute('role','alert');
 const cancel=pmNode('button','btn btn-outline btn-sm','Cancelar');cancel.type='button';cancel.addEventListener('click',()=>form.remove());
 const save=pmNode('button','btn btn-outline btn-sm','Guardar cambios');save.type='submit';save.style.color='#176c34';
 form.append(message,cancel,save);
 form.addEventListener('submit',async e=>{
  e.preventDefault();e.stopImmediatePropagation();if(save.disabled)return;
  try{
   if(typeof contractIntakeAdmin!=='function'||!contractIntakeAdmin()||typeof window.lotigestConfirmAdminPin!=='function')throw Error('Se requiere administrador con la nube sincronizada.');
   if(JSON.stringify(db)!==snapshot)throw Error('Los datos cambiaron. Cierra y vuelve a abrir el historial.');
   const plan=pmHistoryEditPlan(db,row.receiptId,{date:date.value,reference:reference.value,method:method.value,paymentType:paymentType.value,amounts:Object.fromEntries([...inputs].map(([id,input])=>[id,input.value]))},cloudUser.name,why.value,buildReceiptInfo,window.lotigestOwnerPayments,businessToday());
   window.lotigestConfirmAdminPin(pin.value);pin.value='';save.disabled=true;cancel.disabled=true;
   cloudWrite(JSON.stringify(plan.state));db=plan.state;await cloudFlush();
   const confirmed=cloudReady&&!cloudBlocked&&!cloudOffline&&cloudQueue&&!cloudQueue.pending&&cloudQueue.latest===cloudQueue.confirmed;
   pmClosePaymentHistory();closeModal();render();
   toast(confirmed?'Pago actualizado. Saldo y cuotas recalculados.':'Edición pendiente de sincronización. No repitas la operación.',confirmed?'success':'error');
  }catch(err){message.textContent=err.message;pin.value='';save.disabled=false;cancel.disabled=false;}
 });
 item.append(form);date.focus();
}
function pmHistoryVoidForm(row,item){
 if(item.querySelector('[data-pm-void-form],[data-pm-edit-form]'))return;
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
     const edit=pmNode('button','btn btn-outline btn-sm','Editar pago');edit.type='button';edit.style.color='#176c34';edit.style.marginLeft='8px';
     edit.addEventListener('click',()=>pmHistoryEditForm(p,item));item.append(edit);
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
