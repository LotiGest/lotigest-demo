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
   // Las primas iniciales guardadas desde Nuevo contrato no traían receiptInfo.
   // Reconstruir únicamente ese caso comprobable, nunca un abono ambiguo.
   const verifiedInitialPrima=ids.has(p.id)&&!old.receiptInfo&&
    sale.source==='contract-manual'&&!sale.historical&&before===0&&
    /^prima$/i.test(String(old.concept||'').trim())&&
    Math.round(Number(old.amount)*100)===Math.round(Number(sale.downPayment)*100)&&
    Number(sale.downPayment)>0&&
    (state.contractTexts||[]).some(d=>d.id===sale.documentId&&d.saleId===sale.id&&
      d.lotId===sale.lotId&&d.clientId===sale.clientId&&d.status==='active'&&
      d.format==='manual'&&d.structured?.downPaymentReceived===true&&
      Math.round(Number(d.structured.down)*100)===Math.round(Number(sale.downPayment)*100));
   if(p.historicalImportId||(!verifiedInitialPrima&&!Array.isArray(old.receiptInfo?.allocations))||(state.historicalPayments||[]).some(h=>h.postedPaymentId===p.id))throw Error('Hay recibos sin detalle verificable. Requiere conciliación.');
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
 form.append(pmNode('strong','','Editar recibo completo'),pmNode('p','','Conserva los solares y el mismo recibo. Confirma los montos de cada solar, el motivo y el PIN vigente de Contratos en este equipo o en tu celular con la misma cuenta.'));
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
   save.disabled=true;cancel.disabled=true;
   await window.lotigestConfirmAdminPin(pin.value);pin.value='';
   if(JSON.stringify(db)!==snapshot)throw Error('Los datos cambiaron. Cierra y vuelve a abrir el historial.');
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
  pmNode('p','','Incluye '+group.length+' movimiento(s). El saldo y las cuotas se recalcularán; los originales quedarán en auditoría. Introduce el PIN vigente del panel Contratos (puedes consultarlo desde tu celular con la misma cuenta).'));
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
   save.disabled=true;cancel.disabled=true;
   await window.lotigestConfirmAdminPin(pin.value);pin.value='';
   if(JSON.stringify(db)!==snapshot)throw Error('Los datos cambiaron. Cierra y vuelve a abrir el historial.');
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
 layer.append(shade,dialog);dialog.append(header);if(pmActive==='sale')dialog.append(pmAmortizationActions());dialog.append(filters,count,list);
 layer.addEventListener('click',e=>{
  if(e.target===shade||e.target.closest('[data-pm-history-close]')){pmClosePaymentHistory();return;}
  if(e.target.closest('[data-action="receipt-preview"],[data-action="owner-payment-receipt"]'))
   pmClosePaymentHistory(); // deja que el manejador de recibos del programa abra el PDF
 });
 layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();pmClosePaymentHistory();}});
 document.body.append(layer);pmHistoryLayer=layer;render();close.focus();
}

// Reporte de solo lectura. Todos los contratos del cliente en la residencial actual.
function pmAmortizationModel(state,clientId,rid,asOf,reconcile,dueCents,addMonth){
 const scope=contractCollectionsScope(state,rid),client=scope.clients.find(x=>x.id===clientId),sales=scope.sales.filter(x=>x.clientId===clientId);
 if(!client||!sales.length)throw Error('Selecciona un cliente con contrato registrado.');
 const ids=new Set(sales.map(s=>s.id)),posted=new Set((state.historicalPayments||[]).map(p=>p.postedPaymentId).filter(Boolean));
 const all=scope.payments.filter(p=>ids.has(p.saleId)&&!['voided','cancelled'].includes(p.status));
 if(all.some(p=>p.historicalImportId||posted.has(p.id)))throw Error('Concilia los cobros importados contabilizados antes de emitir el reporte.');
 const cents=x=>Math.round(Number(x||0)*100),sum=(arr,fn)=>arr.reduce((n,x)=>n+fn(x),0);
 if(all.some(p=>!p.date||!Number.isSafeInteger(cents(p.amount))||cents(p.amount)<=0))throw Error('Hay pagos sin fecha o importe válido.');
 const payments=all.filter(p=>p.date<=asOf),ledger=reconcile(sales,payments,asOf,dueCents,addMonth);
 const status=x=>!x.dueCents?'Sin importe':!x.remainingCents?(x.lastPaidAt>x.dueDate?'Pagada atrasada':x.lastPaidAt<x.dueDate?'Pagada adelantada':'Pagada'):x.dueDate<asOf?(x.appliedCents?'Vencida parcial':'Vencida sin pagar'):x.appliedCents?'Parcial':'Pendiente';
 const details=sales.map(s=>{
  const lot=scope.lots.find(l=>l.id===s.lotId),rows=ledger.rows.filter(x=>x.saleId===s.id).map(x=>({...x,displayStatus:status(x)}));
  if(s.type==='credit'&&rows.length!==Number(s.months))throw Error('Calendario incompleto: revisa fechas y plazo.');
  const list=payments.filter(p=>p.saleId===s.id).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const price=cents(s.price),agreed=cents(s.downPayment),opening=cents(s.openingPaid),paid=opening+sum(list,p=>cents(p.amount));
  let balance=price-opening;
  const history=list.map(p=>{
   balance-=cents(p.amount);
   const app=rows.filter(x=>x.receipts.some(a=>a.paymentId===p.id)).map(x=>'C'+x.number+' '+x.dueDate.slice(0,7)+(p.date>x.dueDate?' atrasada':p.date<x.dueDate?' adelanto':''));
   const prima=sum((p.receiptInfo?.allocations||[]).filter(a=>!a.number&&/prima/i.test(String(a.label||''))),a=>cents(a.amount));
   if(prima)app.unshift('Prima L '+(prima/100).toFixed(2));
   return {date:p.date,reference:pmHistoryReference(p)||'Sin folio',concept:p.concept||'Pago',amount:cents(p.amount),balance,application:app.join('; ')||'Aplicación por verificar'};
  });
  return {sale:s,lot,rows,history,price,agreed,opening,paid,primaApplied:Math.min(agreed,paid),balance:price-paid};
 });
 const price=sum(details,x=>x.price),paid=sum(details,x=>x.paid),agreed=sum(details,x=>x.agreed),prima=sum(details,x=>x.primaApplied);
 const rows=details.flatMap(x=>x.rows),pending=rows.filter(x=>x.remainingCents>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)),overdue=pending.filter(x=>x.dueDate<asOf);
 return {client:client.name,residence:state.residences?.find(x=>x.id===rid)?.name||'Residencial',company:state.company?.name||'GRUPO H',asOf,details,price,paid,agreed,prima,balance:price-paid,opening:sum(details,x=>x.opening),abonos:Math.max(0,paid-prima),count:rows.length,covered:rows.filter(x=>x.dueCents>0&&!x.remainingCents).length,latePaid:rows.filter(x=>x.displayStatus==='Pagada atrasada').length,overdueCount:overdue.length,overdueAmount:sum(overdue,x=>x.remainingCents),next:pending[0]||null,last:payments.map(p=>p.date).sort().at(-1)||null,unmatched:ledger.unmatched.length};
}
function pmAmortizationPdf(model){
 const green='0.045 0.30 0.17',light='0.90 0.96 0.89',ink='0.10 0.18 0.15',red='0.70 0.12 0.16',orange='0.70 0.34 0.08',blue='0.12 0.35 0.62',gray='0.38 0.43 0.40';
 const pages=[];let cmds=[],y=0;
 const escape=s=>String(s??'').replace(/[^\x20-\xFF]/g,c=>({'—':'-','–':'-','’':"'"}[c]||' ')).replace(/([\\()])/g,'\\$1');
 const rect=(x,b,w,h,color)=>cmds.push(color+' rg '+[x,b,w,h].join(' ')+' re f');
 const txt=(s,x,b,size=10,bold=false,color=ink)=>cmds.push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x+' '+b+' Tm ('+escape(s)+') Tj ET');
 const wrap=(s,n)=>{const out=[];let line='';for(const token of String(s??'').split(/\s+/)){if(line&&line.length+token.length+1>n){out.push(line);line='';}if(token.length>n){if(line){out.push(line);line='';}for(let i=0;i<token.length;i+=n)out.push(token.slice(i,i+n));}else line+=(line?' ':'')+token;}if(line)out.push(line);return out.length?out:[''];};
 const cash=c=>'L '+(Number(c)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const date=s=>s?String(s).split('-').reverse().join('/'):'—';
 const footer=()=>{rect(32,40,548,1,green);txt('Documento generado por LOTIGEST PRO · '+model.company,32,26,8,false,gray);txt('Página '+(pages.length+1),526,26,8,false,gray);pages.push(cmds.join('\n'));cmds=[];};
 const start=()=>{rect(0,780,612,12,green);rect(32,741,548,2,green);txt('LOTIGEST PRO',32,757,24,true,green);txt('Amortización del cliente',330,758,15,true);txt('Corte: '+date(model.asOf),32,725,9,false,gray);txt('Estado de cuenta',330,725,9,false,gray);y=706;};
 const ensure=h=>{if(y-h<54){footer();start();}};
 const line=(s,size=10,bold=false,color=ink)=>{for(const l of wrap(s,Math.floor(548/(size*.58)))){ensure(size+5);txt(l,32,y,size,bold,color);y-=size+5;}};
 const section=s=>{ensure(42);rect(32,y-20,548,23,green);txt(s,40,y-12,11,true,'1 1 1');y-=32;};
 const tiles=items=>{for(let i=0;i<items.length;i+=3){ensure(49);items.slice(i,i+3).forEach(([label,value],j)=>{const x=32+j*184;rect(x,y-41,178,42,light);txt(label,x+7,y-12,8,false,green);txt(value,x+7,y-29,11,true);});y-=47;}};
 const table=(title,headers,widths,data)=>{
  const heading=()=>{ensure(75);section(title.length>78?title.slice(0,75)+'...':title);let x=32;rect(32,y-17,548,20,light);headers.forEach((h,i)=>{txt(h,x+4,y-10,8,true,green);x+=widths[i];});y-=19;};
  heading();
  for(let i=0;i<data.length;i++){
   const row=data[i],cells=row.cells.map((v,j)=>wrap(v,Math.max(4,Math.floor((widths[j]-8)/4.7)))),max=Math.max(...cells.map(x=>x.length));
   for(let offset=0;offset<max;){
    if(y-17<54){footer();start();heading();}
    const take=Math.min(max-offset,Math.max(1,Math.floor((y-60)/11))),h=take*11+6;
    rect(32,y-h,548,h,i%2?'0.96 0.98 0.96':'1 1 1');let x=32;
    cells.forEach((ls,j)=>{ls.slice(offset,offset+take).forEach((s,k)=>txt(s,x+4,y-10-k*11,8,j===cells.length-1&&!!row.color,j===cells.length-1&&row.color?row.color:ink));x+=widths[j];});
    rect(32,y-h,548,.4,'0.83 0.88 0.84');y-=h;offset+=take;
   }
  }y-=9;
 };
 start();section('Datos del cliente y del contrato');line('Cliente: '+model.client,13,true);line('Residencial: '+model.residence);line('Contratos incluidos: '+model.details.length+' · Corte: '+date(model.asOf));
 for(const d of model.details)line('Etapa '+(d.lot.stage||'—')+' · Bloque '+(d.lot.block||'—')+' · Solar '+(d.lot.sourceNumber||d.lot.number||d.lot.id)+' | Contrato: '+date(d.sale.date)+' | '+(d.sale.type==='credit'?d.sale.months+' cuotas':'Contado'),9);
 section('Resumen del contrato');
 tiles([['Precio total',cash(model.price)],['Prima acordada',cash(model.agreed)],['Prima aplicada',cash(model.prima)],['Saldo inicial a financiar',cash(model.price-model.agreed)],['Abonos sobre prima',cash(model.abonos)],['Saldo restante',cash(model.balance)],['Cuotas cubiertas',model.covered+' / '+model.count],['Cuotas vencidas pendientes',String(model.overdueCount)],['Monto vencido pendiente',cash(model.overdueAmount)],['Prima pendiente',cash(model.agreed-model.prima)],['Total contabilizado',cash(model.paid)],['Interés contractual','0%']]);
 ensure(110);section('Progreso del pago');
 const pct=model.price?Math.max(0,Math.min(100,100*model.paid/model.price)):0;
 txt(pct.toFixed(1)+'% pagado',32,y,15,true,green);txt('Total contabilizado: '+cash(model.paid),280,y,11,true);y-=18;rect(32,y-7,548,10,'0.88 0.90 0.88');rect(32,y-7,548*pct/100,10,green);y-=22;
 line('Último pago: '+date(model.last)+' | Cuotas pagadas con atraso: '+model.latePaid);
 line('Primera cuota pendiente: '+(model.next?date(model.next.dueDate)+' · '+cash(model.next.remainingCents):'Sin cuotas pendientes'),10,true);
 if(model.opening)line('Saldo inicial abonado sin recibo individual: '+cash(model.opening),9,false,gray);
 if(model.unmatched)line('Aviso: '+model.unmatched+' movimiento(s) requieren verificar su aplicación mensual. El saldo incluye los pagos registrados.',9,true,orange);
 line('Verde: pagada · Naranja: pagada atrasada · Azul: adelanto · Rojo: vencida pendiente.',9,false,gray);
 for(const d of model.details){
  const lot='Etapa '+(d.lot.stage||'—')+' / Bloque '+(d.lot.block||'—')+' / Solar '+(d.lot.sourceNumber||d.lot.number||d.lot.id);
  ensure(110);section(lot);line('Precio: '+cash(d.price)+' | Prima pactada: '+cash(d.agreed)+' | Saldo actual: '+cash(d.balance),10,true);
  line('Prima aplicada contablemente: '+cash(d.primaApplied)+' | Prima pendiente: '+cash(d.agreed-d.primaApplied),9);
  if(d.rows.length)table('Cuotas · '+lot,['No.','Vence','Últ. pago','Cuota','Aplicado','Pendiente','Estado'],[28,68,68,91,91,91,111],d.rows.map(r=>({cells:[r.number,date(r.dueDate),date(r.lastPaidAt),cash(r.dueCents),cash(r.appliedCents),cash(r.remainingCents),r.displayStatus],color:r.displayStatus.startsWith('Vencida')?red:r.displayStatus==='Pagada atrasada'?orange:r.displayStatus==='Pagada adelantada'?blue:r.displayStatus==='Pagada'?green:gray})));
  else line('Venta al contado: no tiene mensualidades.');
  if(d.history.length)table('Recibos · '+lot,['Fecha','Correlativo','Concepto / cuotas','Recibido','Saldo'],[65,90,205,94,94],d.history.map(p=>({cells:[date(p.date),p.reference,p.concept+' · '+p.application,cash(p.amount),cash(p.balance)]})));
  else line('Sin recibos registrados a la fecha de corte.');
 }
 footer();
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+pages.map((_,i)=>(5+i*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 pages.forEach((stream,i)=>objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+(6+i*2)+' 0 R >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'));
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});const xref=pdf.length;pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 return new Blob([Uint8Array.from(pdf,x=>x.charCodeAt(0)&255)],{type:'application/pdf'});
}
async function pmDeliverAmortization(share){
 try{
  if(!cloudReady||cloudBlocked||cloudOffline||!cloudQueue||cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)throw Error('Sincroniza los cambios con Cloudflare antes de emitir el reporte.');
  const clients=new Set(pmSales().map(s=>s.clientId));if(clients.size!==1)throw Error('Selecciona un solo cliente.');
  const report=pmAmortizationModel(db,[...clients][0],residence().id,businessToday(),reconcileInstallments,installmentDueCents,(date,i)=>dateKey(addMonths(date,i)));
  const blob=pmAmortizationPdf(report),name='LOTIGEST_Amortizacion_'+report.asOf+'.pdf';
  if(share&&typeof File==='function'){const file=new File([blob],name,{type:'application/pdf'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Amortización LOTIGEST PRO'});return;}}
  download(name,blob,'application/pdf');toast(share?'PDF descargado. Adjunta el archivo al chat del cliente en WhatsApp.':'Reporte de amortización descargado.');
 }catch(e){if(e.name!=='AbortError')toast(e.message||'No se pudo generar el reporte.','error');}
}
function pmAmortizationActions(){
 const actions=pmNode('div','pm-history-toolbar');
 for(const [label,share] of [['Amortización PDF',false],['Compartir amortización',true]]){
  const b=pmNode('button','btn btn-outline btn-sm',label);b.type='button';b.addEventListener('click',()=>pmDeliverAmortization(share));actions.append(b);
 }return actions;
}
