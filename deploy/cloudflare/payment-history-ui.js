// Historial de abonos por fecha; las anulaciones exigen confirmación administrativa.
let pmHistoryLayer=null,pmReportsReturnFocus=null;
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
// Actualizar la ventana existente, no volver a buscar al cliente.
function pmHistoryAfterEdit(snapshot,stored,confirmed,refresh){
 if(confirmed&&pmActive==='sale'&&paymentDraft?.snapshot===snapshot&&paymentDraft.stored===stored){
  paymentDraft.snapshot=JSON.stringify(db);paymentDraft.stored=localStorage.getItem(STORAGE);
 }
 if(confirmed&&pmActive==='owner'&&ownerPaymentDraft?.snapshot===snapshot)ownerPaymentDraft.snapshot=JSON.stringify(db);
 render();
 if(pmActive==='sale'&&document.getElementById('multi-payment-form')){
  renderPaymentSelected();
 }
 if(typeof refresh==='function')refresh();
}
function pmHistoryEditForm(row,item,refresh){
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
   const stored=localStorage.getItem(STORAGE);
   cloudWrite(JSON.stringify(plan.state));db=plan.state;await cloudFlush();
   const confirmed=cloudReady&&!cloudBlocked&&!cloudOffline&&cloudQueue&&!cloudQueue.pending&&cloudQueue.latest===cloudQueue.confirmed;
   pmHistoryAfterEdit(snapshot,stored,confirmed,refresh);
   toast(confirmed?'Pago actualizado. Saldo y cuotas recalculados.':'Edición pendiente de sincronización. No repitas la operación.',confirmed?'success':'error');
  }catch(err){message.textContent=err.message;pin.value='';save.disabled=false;cancel.disabled=false;}
 });
 item.append(form);date.focus();
}
function pmHistoryVoidForm(row,item,refresh){
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
   const stored=localStorage.getItem(STORAGE);
   cloudWrite(JSON.stringify(plan.state));db=plan.state;await cloudFlush();
   const confirmed=cloudReady&&!cloudBlocked&&!cloudOffline&&cloudQueue&&!cloudQueue.pending&&cloudQueue.latest===cloudQueue.confirmed;
   pmHistoryAfterEdit(snapshot,stored,confirmed,refresh);
   toast(confirmed?'Recibo anulado. Saldo y cuotas actualizados.':'Anulación pendiente de sincronización. No repitas la operación.',confirmed?'success':'error');
  }catch(err){message.textContent=err.message;pin.value='';save.disabled=false;cancel.disabled=false;}
 });
 item.append(form);pin.focus();
}
function pmClosePaymentHistory(restore=true){
 if(pmHistoryLayer){pmHistoryLayer.remove();pmHistoryLayer=null;}
 if(restore){const target=pmReportsReturnFocus;pmReportsReturnFocus=null;if(target?.isConnected)target.focus();}
}
function pmOpenPaymentHistory(fromReports=false){
 pmClosePaymentHistory(false);
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
 header.append(heading);
 if(fromReports){const back=pmNode('button','btn btn-outline btn-sm','‹ Reportes');back.type='button';back.addEventListener('click',()=>pmOpenReports(pmReportsReturnFocus));header.append(back);}
 header.append(close);
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
  const visible=pmHistoryRows().filter(p=>(!from.value||p.date>=from.value)&&(!to.value||p.date<=to.value)&&
    pmHistoryMatches(p,q));
  count.textContent=visible.length+' registro(s) por fecha'+(visible.length?' · Último movimiento: '+(visible[0].date||'Por verificar'):'');
  if(!visible.length){list.append(pmNode('p','pm-help','No hay movimientos para estas fechas o el cliente/solar seleccionado.'));return;}
  for(const p of visible){
   const item=pmNode('article','pm-history-item');item.dataset.pmReceiptId=String(p.receiptId||p.id);
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
     edit.addEventListener('click',()=>pmHistoryEditForm(p,item,()=>refreshAfterSave(p)));item.append(edit);
     const remove=pmNode('button','btn btn-outline btn-sm','Eliminar pago');remove.type='button';remove.style.color='#b42332';remove.style.marginLeft='8px';
     remove.addEventListener('click',()=>pmHistoryVoidForm(p,item,()=>refreshAfterSave(p)));item.append(remove);
    }
   }else item.append(pmNode('small','pm-help','Documento sin recibo PDF vinculado; revisar el movimiento.'));
   list.append(item);
  }
 };
 const refreshAfterSave=p=>{
  if(!layer.isConnected||pmHistoryLayer!==layer)return;
  const scrolls=[dialog,list].map(el=>[el,el.scrollTop]);
  render();
  for(const [el,top] of scrolls)el.scrollTop=top;
  const item=[...list.children].find(el=>el.dataset.pmReceiptId===String(p.receiptId||p.id));
  (item?.querySelector('button')||close).focus({preventScroll:true});
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
 pmReportsKeyboard(layer,dialog);
 document.body.append(layer);pmHistoryLayer=layer;render();close.focus();
}

// Reporte de solo lectura. Todos los contratos del cliente en la residencial actual.

 // Consolidación por mes calendario, no por cantidad de solares. Las
 // aplicaciones se toman de recibos conciliados, sin mover dinero entre solares.

 // Proyección de presentación: mensualidad verificada del recibo al mes del
 // depósito, luego deuda anterior más antigua, y finalmente meses futuros.
 // No escribe pagos ni utiliza la prima como mensualidad.
function pmReportCurrentMonthFirst(originalRows,payments,asOf){
 const rows=originalRows.map(r=>({...r,appliedCents:0,confirmedCents:0,advanceCents:0,remainingCents:r.dueCents,receipts:[],lastPaidAt:null}));
 const verified=new Map();
 for(const r of originalRows)for(const p of r.receipts){
  const prior=verified.get(p.paymentId)||{saleId:r.saleId,cents:0};
  if(prior.saleId!==r.saleId)throw Error('Recibo aplicado a otro solar.');
  prior.cents+=p.amountCents;verified.set(p.paymentId,prior);
 }
 for(const p of [...payments].sort((a,b)=>a.date.localeCompare(b.date)||String(a.recordedAt||'').localeCompare(String(b.recordedAt||''))||a.id.localeCompare(b.id))){
  const v=verified.get(p.id);if(!v)continue;
  let remaining=v.cents;
  if(v.saleId!==p.saleId||remaining>Math.round(Number(p.amount)*100))throw Error('La aplicación verificada supera el recibo.');
  const month=p.date.slice(0,7),available=rows.filter(r=>r.saleId===p.saleId&&r.remainingCents>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const sequence=[...available.filter(r=>r.dueDate.slice(0,7)===month),...available.filter(r=>r.dueDate.slice(0,7)<month),...available.filter(r=>r.dueDate.slice(0,7)>month)];
  for(const row of sequence){
   if(!remaining)break;
   const value=Math.min(remaining,row.remainingCents),target=row.dueDate.slice(0,7),advance=month<target;
   remaining-=value;row.remainingCents-=value;row.appliedCents+=value;
   if(advance)row.advanceCents+=value;else row.confirmedCents+=value;
   row.receipts.push({paymentId:p.id,date:p.date,amountCents:value,groupId:p.groupId||p.id,reference:pmHistoryReference(p),method:p.method||'',advance});
  }
  if(remaining)throw Error('No se pudo aplicar el importe mensual verificado.');
 }
 for(const row of rows){
  row.lastPaidAt=row.receipts.map(r=>r.date).sort().at(-1)||null;
  row.coveredByAdvance=row.dueCents>0&&!row.remainingCents&&row.advanceCents>0;
  row.status=row.dueCents>0&&!row.remainingCents?(row.coveredByAdvance?'advance-covered':row.lastPaidAt>row.dueDate?'paid-late':'paid'):row.dueDate<asOf?'late':row.appliedCents?'partial':'pending';
 }
 return rows;
}
// Saldo anticipado al corte, no confundir con adelantos ya consumidos.
function pmFutureCoverage(rows,asOf){
 const future=rows.filter(r=>r.dueCents>0&&r.dueDate.slice(0,7)>asOf.slice(0,7));
 const covered=future.filter(r=>r.remainingCents===0);
 const partial=future.filter(r=>r.remainingCents>0&&r.appliedCents>0);
 const pending=rows.filter(r=>r.remainingCents>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0]||null;
 return {covered:covered.length,partial:partial.length,amountCents:future.reduce((n,r)=>n+r.appliedCents,0),through:covered.map(r=>r.dueDate).sort().at(-1)||null,next:pending};
}
function pmReportPaymentStatus(row,asOf){
 if(!row.dueCents)return 'Sin cuota';
 if(!row.remainingCents)return row.dueDate.slice(0,7)>asOf.slice(0,7)?'Pagada por adelantado':'Pagada';
 if(row.appliedCents&&row.dueDate.slice(0,7)>asOf.slice(0,7))return 'Adelanto parcial';
 if(row.appliedCents)return row.receipts.some(r=>r.date.slice(0,7)!==row.dueDate.slice(0,7))?'Abono con excedente':'Abono parcial';
 return row.dueDate<asOf?'Pendiente vencida':'Pendiente';
}
function pmConsolidatedMonths(rows,payments,asOf){
 const months=new Map(),groups=new Map(),byPayment=new Map(),paymentIndex=new Map(payments.map(p=>[p.id,p]));
 const cash=p=>Math.round(Number(p.amount)*100);
 const monthFor=key=>{
  if(!months.has(key))months.set(key,{month:key,due:0,applied:0,pending:0,overdue:0,received:0,monthlyReceived:0,priorApplied:0,currentApplied:0,futureApplied:0,rows:[],sourceMonths:new Set(),sources:new Map(),deposits:new Map(),applications:new Map(),excessApplied:0});
  return months.get(key);
 };
 for(const row of rows){
  const m=monthFor(row.dueDate.slice(0,7));m.rows.push(row);m.due+=row.dueCents;m.applied+=row.appliedCents;m.pending+=row.remainingCents;
  if(row.dueDate<asOf)m.overdue+=row.remainingCents;
  for(const receipt of row.receipts){
   const key=receipt.date.slice(0,7);m.sourceMonths.add(key);
   const p=paymentIndex.get(receipt.paymentId),ref=p?(pmHistoryReference(p)||'Sin folio'):'Sin folio',sourceKey=key+' / '+ref;
   const applicationKey=p?.groupId||receipt.groupId||receipt.paymentId;
   if(!m.applications.has(applicationKey))m.applications.set(applicationKey,{date:receipt.date,reference:ref,amount:0});
   m.applications.get(applicationKey).amount+=receipt.amountCents;
   if(key!==m.month){m.excessApplied+=receipt.amountCents;m.sources.set(sourceKey,(m.sources.get(sourceKey)||0)+receipt.amountCents);}
   if(!byPayment.has(receipt.paymentId))byPayment.set(receipt.paymentId,[]);
   byPayment.get(receipt.paymentId).push({month:m.month,amount:receipt.amountCents});
  }
 }
 for(const p of payments){
  const key=p.date.slice(0,7),m=monthFor(key),id=p.groupId||p.id,amount=cash(p);
  m.received+=amount;
  if(!m.deposits.has(id))m.deposits.set(id,{date:p.date,reference:pmHistoryReference(p)||'Sin folio',amount:0});
  m.deposits.get(id).amount+=amount;
  if(!groups.has(id))groups.set(id,{id,date:p.date,reference:pmHistoryReference(p)||'Sin folio',received:0,monthly:0,prior:0,current:0,future:0,targets:new Map(),concepts:new Set()});
  const g=groups.get(id);if(g.date!==p.date)throw Error('Un recibo agrupado tiene fechas distintas. Revisa el historial.');
  g.received+=amount;g.concepts.add(p.concept||'Pago');
  const applications=byPayment.get(p.id)||[];
  if(applications.reduce((n,x)=>n+x.amount,0)>amount)throw Error('Las cuotas aplicadas superan el importe de un recibo. Revisa el historial.');
  for(const x of applications){
   g.monthly+=x.amount;m.monthlyReceived+=x.amount;
   if(x.month<key){g.prior+=x.amount;m.priorApplied+=x.amount;}
   else if(x.month===key){g.current+=x.amount;m.currentApplied+=x.amount;}
   else{g.future+=x.amount;m.futureApplied+=x.amount;}
   g.targets.set(x.month,(g.targets.get(x.month)||0)+x.amount);
  }
 }
 const keys=[...months.keys()].sort();
 if(keys.length){
  const first=keys[0],last=keys.at(-1);
  const d=new Date(first+'-01T12:00:00Z');
  while(d.toISOString().slice(0,7)<=last){monthFor(d.toISOString().slice(0,7));d.setUTCMonth(d.getUTCMonth()+1);}
 }
 const cutoff=asOf.slice(0,7);
 const calendar=[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(m=>{
  const due=m.due>0,closed=m.month<cutoff,covered=due&&m.pending===0;
  const late=covered&&m.rows.some(r=>r.lastPaidAt>r.dueDate),early=covered&&m.rows.every(r=>r.lastPaidAt&&r.lastPaidAt<r.dueDate);
  const noDeposit=m.month<=cutoff&&m.received===0;
  const status=!due?'Sin cuota programada':covered?(late?'Pagada atrasada':early?'Pagada adelantada':'Pagada'):m.overdue?(m.applied?'Vencida parcial':'Vencida sin pagar'):m.applied?'Parcial':'Pendiente';
  return {...m,deposits:[...m.deposits.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.reference.localeCompare(b.reference)),applications:[...m.applications.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.reference.localeCompare(b.reference)),sourceMonths:[...m.sourceMonths].sort(),sources:[...m.sources.entries()].sort((a,b)=>a[0].localeCompare(b[0])),covered,late,noDeposit,closed,status,reportStatus:!due?'Sin cuota':covered?'Pagada':m.applied?(m.excessApplied?'Abono con excedente':'Abono parcial'):m.overdue?'Pendiente vencida':'Pendiente',excess:m.monthlyReceived-m.due};
 });
 const receipts=[...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).map(g=>{
  const base=months.get(g.date.slice(0,7))?.due||0;
  return {...g,base,excess:g.monthly-base,nonMonthly:g.received-g.monthly,targets:[...g.targets.entries()].sort((a,b)=>a[0].localeCompare(b[0])),concepts:[...g.concepts]};
 });
 const scheduled=calendar.filter(m=>m.due>0),unpaid=scheduled.filter(m=>m.overdue>0);
 return {calendar,receipts,monthCount:scheduled.length,monthsCovered:scheduled.filter(m=>m.covered).length,
  monthsLate:scheduled.filter(m=>m.late).length,monthsOverdue:unpaid.length,monthsNoDeposit:scheduled.filter(m=>m.noDeposit&&m.closed).length,
  currentMonth:scheduled.find(m=>m.month===cutoff)||null,nextMonth:scheduled.find(m=>m.pending>0)||null,
  noDepositCovered:scheduled.filter(m=>m.noDeposit&&m.covered),unpaid,overdueAmount:unpaid.reduce((n,m)=>n+m.overdue,0)};
}
function pmAmortizationModel(state,clientId,rid,asOf,reconcile,dueCents,addMonth,lotId=null){
 const scope=contractCollectionsScope(state,rid),client=scope.clients.find(x=>x.id===clientId),sales=scope.sales.filter(x=>x.clientId===clientId&&(lotId===null||x.lotId===lotId));
 if(!client||!sales.length)throw Error(lotId===null?'Selecciona un cliente con contrato registrado.':'El solar seleccionado no pertenece a un contrato vigente de este cliente.');
 const ids=new Set(sales.map(s=>s.id)),posted=new Set((state.historicalPayments||[]).map(p=>p.postedPaymentId).filter(Boolean));
 const all=scope.payments.filter(p=>ids.has(p.saleId)&&!['voided','cancelled'].includes(p.status)&&!p.voidedAt&&!p.deletedAt&&!p.cancelledAt);
 if(all.some(p=>p.historicalImportId||posted.has(p.id)))throw Error('Concilia los cobros importados contabilizados antes de emitir el reporte.');
 const cents=x=>Math.round(Number(x||0)*100),sum=(arr,fn)=>arr.reduce((n,x)=>n+fn(x),0);
 if(all.some(p=>!p.date||!Number.isSafeInteger(cents(p.amount))||cents(p.amount)<=0))throw Error('Hay pagos sin fecha o importe válido.');
 const payments=all.filter(p=>p.date<=asOf),ledger=reconcile(sales,payments,asOf,dueCents,addMonth,{requireReference:true}),projected=pmReportCurrentMonthFirst(ledger.rows,payments,asOf);
 const status=x=>!x.dueCents?'Sin importe':!x.remainingCents?(x.lastPaidAt>x.dueDate?'Pagada atrasada':x.lastPaidAt<x.dueDate?'Pagada adelantada':'Pagada'):x.dueDate<asOf?(x.appliedCents?'Vencida parcial':'Vencida sin pagar'):x.appliedCents?'Parcial':'Pendiente';
 const details=sales.map(s=>{
  const lot=scope.lots.find(l=>l.id===s.lotId),rows=projected.filter(x=>x.saleId===s.id).map(x=>({...x,displayStatus:status(x),reportStatus:pmReportPaymentStatus(x,asOf)}));
  if(s.type==='credit'&&rows.length!==Number(s.months))throw Error('Calendario incompleto: revisa fechas y plazo.');
  const list=payments.filter(p=>p.saleId===s.id).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const price=cents(s.price),agreed=cents(s.downPayment),opening=cents(s.openingPaid),paid=opening+sum(list,p=>cents(p.amount));
  let balance=price-opening;
  const history=list.map(p=>{
   balance-=cents(p.amount);
   const app=ledger.rows.filter(x=>x.saleId===s.id&&x.receipts.some(a=>a.paymentId===p.id)).map(x=>'C'+x.number+' '+x.dueDate.slice(0,7));
   const prima=sum((p.receiptInfo?.allocations||[]).filter(a=>!a.number&&/prima/i.test(String(a.label||''))),a=>cents(a.amount));
   if(prima)app.unshift('Prima L '+(prima/100).toFixed(2));
   return {date:p.date,reference:pmHistoryReference(p)||'Sin folio',concept:p.concept||'Pago',amount:cents(p.amount),balance,application:app.join('; ')||'Aplicación por verificar'};
  });
  return {sale:s,lot,rows,history,price,agreed,opening,paid,primaApplied:Math.min(agreed,paid),balance:price-paid};
 });
 const price=sum(details,x=>x.price),paid=sum(details,x=>x.paid),agreed=sum(details,x=>x.agreed),prima=sum(details,x=>x.primaApplied);
 const rows=details.flatMap(x=>x.rows),pending=rows.filter(x=>x.remainingCents>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)),overdue=pending.filter(x=>x.dueDate<asOf);
 const consolidated=pmConsolidatedMonths(rows,payments,asOf);
 return {residenceId:rid,branding:typeof lgDocumentBranding==='function'?lgDocumentBranding(rid,state):null,consolidated,policy:'current-month-first',individual:lotId!==null,client:client.name,residence:state.residences?.find(x=>x.id===rid)?.name||'Residencial',company:state.company?.name||'GRUPO H',asOf,details,price,paid,agreed,prima,balance:price-paid,opening:sum(details,x=>x.opening),abonos:Math.max(0,paid-prima),count:rows.length,covered:rows.filter(x=>x.dueCents>0&&!x.remainingCents).length,latePaid:rows.filter(x=>x.displayStatus==='Pagada atrasada').length,overdueCount:overdue.length,overdueAmount:sum(overdue,x=>x.remainingCents),next:pending[0]||null,last:payments.map(p=>p.date).sort().at(-1)||null,unmatched:ledger.unmatched.length};
}
// El depósito real y la aplicación a una cuota son dos vistas del mismo dinero.
function pmAmortizationReceiptLines(items,cash,date){
 return (items||[]).map(r=>date(r.date)+' #'+r.reference+' '+cash(r.amount)).join('\n');
}
function pmAmortizationPdf(model){
 const cl=model.branding?.company||null,rl=model.branding?.residential||null;
 const green='0.045 0.30 0.17',light='0.90 0.96 0.89',ink='0.10 0.18 0.15',red='0.70 0.12 0.16',orange='0.70 0.34 0.08',blue='0.12 0.35 0.62',gray='0.38 0.43 0.40';
 const pages=[];let cmds=[],y=0;
 const escape=s=>String(s??'').replace(/[^\x20-\xFF]/g,c=>({'—':'-','–':'-','’':"'"}[c]||' ')).replace(/([\\()])/g,'\\$1');
 const rect=(x,b,w,h,color)=>cmds.push(color+' rg '+[x,b,w,h].join(' ')+' re f');
 const txt=(s,x,b,size=10,bold=false,color=ink)=>cmds.push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x+' '+b+' Tm ('+escape(s)+') Tj ET');
 const wrap=(s,n)=>{const out=[];let line='';for(const token of String(s??'').split(/\s+/)){if(line&&line.length+token.length+1>n){out.push(line);line='';}if(token.length>n){if(line){out.push(line);line='';}for(let i=0;i<token.length;i+=n)out.push(token.slice(i,i+n));}else line+=(line?' ':'')+token;}if(line)out.push(line);return out.length?out:[''];};
 const cash=c=>'L '+(Number(c)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const date=s=>s?String(s).split('-').reverse().join('/'):'—';
 const footer=()=>{rect(32,40,548,1,green);txt('Documento generado por LOTIGEST PRO · '+model.company,32,26,8,false,gray);txt('Página '+(pages.length+1),526,26,8,false,gray);pages.push(cmds.join('\n'));cmds=[];};
 const start=()=>{rect(0,780,612,12,green);rect(32,741,548,2,green);if(cl||rl){if(cl)cmds.push(lgDocLogoCommand(cl,'CompanyLogo',32,744,95,34));if(rl)cmds.push(lgDocLogoCommand(rl,'ResLogo',cl?137:32,744,170,34));}else txt('LOTIGEST PRO',32,757,24,true,green);txt(model.individual?'Amortización por solar':'Amortización consolidada',330,758,15,true);txt('Corte: '+date(model.asOf),32,725,9,false,gray);txt(String(model.company).slice(0,37)+' · Estado de cuenta',330,725,9,false,gray);y=706;};
 const ensure=h=>{if(y-h<54){footer();start();}};
 const line=(s,size=10,bold=false,color=ink)=>{for(const l of wrap(s,Math.floor(548/(size*.58)))){ensure(size+5);txt(l,32,y,size,bold,color);y-=size+5;}};
 const section=s=>{ensure(42);rect(32,y-20,548,23,green);txt(s,40,y-12,11,true,'1 1 1');y-=32;};
 const tiles=items=>{for(let i=0;i<items.length;i+=3){ensure(49);items.slice(i,i+3).forEach(([label,value,tone],j)=>{const x=32+j*184;rect(x,y-41,178,42,tone===red?'0.99 0.91 0.91':tone===blue?'0.90 0.95 0.99':light);rect(x,y-41,178,2,tone||green);txt(label,x+7,y-12,8,false,tone||green);txt(value,x+7,y-29,11,true,tone||ink);});y-=47;}};
 const table=(title,headers,widths,data)=>{
  const heading=()=>{ensure(75);section(title.length>78?title.slice(0,75)+'...':title);let x=32;rect(32,y-17,548,20,green);headers.forEach((h,i)=>{txt(h,x+4,y-10,8,true,'1 1 1');x+=widths[i];});y-=19;};
  heading();
  for(let i=0;i<data.length;i++){
   const row=data[i],cells=row.cells.map((v,j)=>String(v??'').split('\n').flatMap(line=>wrap(line,Math.max(4,Math.floor((widths[j]-8)/4.7))))),max=Math.max(...cells.map(x=>x.length));
   for(let offset=0;offset<max;){
    if(y-17<54){footer();start();heading();}
    const take=Math.min(max-offset,Math.max(1,Math.floor((y-60)/11))),h=take*11+6;
    rect(32,y-h,548,h,i%2?'0.96 0.98 0.96':'1 1 1');if(row.color)rect(580-widths.at(-1),y-h,widths.at(-1),h,row.color===red?'0.99 0.90 0.90':row.color===blue?'0.89 0.94 0.99':row.color===green?'0.89 0.96 0.89':'0.95 0.96 0.96');let x=32;
    cells.forEach((ls,j)=>{ls.slice(offset,offset+take).forEach((s,k)=>txt(s,x+4,y-10-k*11,8,j===cells.length-1&&!!row.color,j===cells.length-1&&row.color?row.color:ink));x+=widths[j];});
    rect(32,y-h,548,.4,'0.83 0.88 0.84');y-=h;offset+=take;
   }
  }y-=9;
 };

 const con=model.consolidated,monthLabel=k=>k?String(k).split('-').reverse().join('/'):'—';
 const signed=n=>(n<0?'-':n>0?'+':'')+cash(Math.abs(n));
 const shade=m=>m.covered?green:m.excessApplied>0?blue:m.overdue>0?red:gray;
 const latest=con.receipts.at(-1),quota=con.currentMonth?.due??con.nextMonth?.due??0;
 start();section('Datos del cliente y del contrato');
 line('Cliente: '+model.client,13,true);line('Residencial: '+model.residence+' · '+(model.individual?'Reporte individual':model.details.length+' solar(es) incluidos'));
 for(const d of model.details)line('Etapa '+(d.lot.stage||'—')+' · Bloque '+(d.lot.block||'—')+' · Solar '+(d.lot.sourceNumber||d.lot.number||d.lot.id)+' | '+(d.sale.type==='credit'?d.sale.months+' cuotas':'Contado'),9);
 tiles([['Cuota mensual del corte',cash(quota),green],['Último depósito',cash(latest?.received||0),green],['Excedente del último recibo',cash((latest?.prior||0)+(latest?.future||0)),blue],['Meses cubiertos',String(con.monthsCovered),green],['Meses vencidos pendientes',String(con.monthsOverdue),red],['Monto en mora',cash(con.overdueAmount),red]]);
 line('Distribución de este estado de cuenta: primero el mes del depósito, luego las cuotas anteriores más antiguas y después las futuras. Se usan solo mensualidades verificadas; los recibos originales no cambian.',9,false,gray);
 if(model.unmatched)line('Aviso: '+model.unmatched+' movimiento(s) requieren conciliar su aplicación. No se imputan a cuotas sin respaldo.',9,true,orange);
 if(model.opening)line('Saldo inicial sin recibo individual: '+cash(model.opening),9,false,gray);
 if(con.calendar.length)table(model.individual?'Control mensual · solar seleccionado':'Amortización mensual consolidada',['Mes','Depósito / folio','Cuota total','Aplicado / folio','Excedente*','Saldo','Estado'],[45,113,65,113,65,65,82],con.calendar.map(m=>({cells:[
  monthLabel(m.month),
  (m.month>model.asOf.slice(0,7)?'—':cash(m.received))+(m.deposits?.length?'\n'+pmAmortizationReceiptLines(m.deposits,cash,date):''),
  cash(m.due),
  cash(m.applied)+(m.applications?.length?'\n'+pmAmortizationReceiptLines(m.applications,cash,date):''),
  cash(m.excessApplied),cash(m.pending),
  (m.covered&&m.month>model.asOf.slice(0,7)?'Pagada por adelanto':m.reportStatus)+(m.noDeposit?' · Sin depósito':'')],color:shade(m)})));
 line('* Depósito / folio: fecha y monto real de cada recibo. Aplicado / folio: fecha, correlativo e importe que cubre esta cuota, incluso por adelanto. Excedente: aplicación de otros meses. No sumar depósitos y aplicaciones.',9,false,gray);
 if(latest){
  section('Distribución del último pago · correlativo '+latest.reference);
  tiles([['Recibido',cash(latest.received),green],['Cuota programada del mes',cash(latest.base)],['Aplicado a meses anteriores',cash(latest.prior),blue],['Aplicado al mes del depósito',cash(latest.current),green],['Aplicado a meses futuros',cash(latest.future),blue],['Prima u otro importe no aplicado',cash(latest.nonMonthly)]]);
  if(latest.targets.length)table('Aplicación del último recibo',['Mes','Aplicación del recibo','Saldo del mes al corte','Estado'],[85,145,145,173],latest.targets.map(([key,v])=>{const m=con.calendar.find(x=>x.month===key);return {cells:[monthLabel(key),cash(v),cash(m?.pending||0),m?.reportStatus||'Sin cuota'],color:m?shade(m):gray};}));
 }
 section('Información del contrato');
 tiles([['Precio total',cash(model.price)],['Prima acordada',cash(model.agreed)],['Prima aplicada',cash(model.prima)],['Saldo inicial a financiar',cash(model.price-model.agreed)],['Prima pendiente',cash(model.agreed-model.prima)],['Saldo restante',cash(model.balance)],['Abonos sobre prima',cash(model.abonos)],['Total contabilizado',cash(model.paid)],['Meses sin depósito (cerrados)',String(con.monthsNoDeposit)]]);
 line('Verde: pagada. Azul: abono con excedente, aún con saldo. Rojo: saldo vencido pendiente.',9,false,gray);
 if(con.receipts.length)table(model.individual?'Depósitos asignados a este solar':'Depósitos reales · recibos agrupados',['Fecha / folio','Recibido','Cuota del mes','Diferencia*','Aplicación a cuotas'],[87,89,89,89,194],con.receipts.map(g=>({cells:[date(g.date)+' / '+g.reference,cash(g.received),cash(g.base),signed(g.excess),'Cuotas: '+cash(g.monthly)+' · Anteriores '+cash(g.prior)+' · Del mes '+cash(g.current)+' · Futuras '+cash(g.future)+(g.nonMonthly?' · Prima u otro no aplicado: '+cash(g.nonMonthly):'')+(g.targets.length?' · '+g.targets.map(([k,v])=>monthLabel(k)+': '+cash(v)).join('; '):'')]})));
 line('* Diferencia: importe mensual verificado menos cuota del mes. El destino de los excedentes se detalla por correlativo.',9,false,gray);
 if(con.unpaid.length){
  table('Meses vencidos con saldo pendiente',['Mes','Cuota total','Aplicado','Mora al corte'],[90,150,150,158],con.unpaid.map(m=>({cells:[monthLabel(m.month),cash(m.due),cash(m.applied),cash(m.overdue)],color:red})));
 }else line('No hay mensualidades vencidas pendientes al corte.',10,true,green);
 if(con.noDepositCovered.length){
  section('Observaciones · meses cubiertos sin depósito');
  for(const m of con.noDepositCovered)line(monthLabel(m.month)+': sin depósito'+(m.closed?'':' al corte')+'; cuota cubierta con recibos de '+m.sourceMonths.map(monthLabel).join(', ')+'.',9);
 }
 const elapsed=con.calendar.filter(m=>m.month<=model.asOf.slice(0,7)).slice(-12);
 if(elapsed.length){
  ensure(165);section('Depósitos frente a cuota · últimos 12 meses');
  const top=y,baseY=y-82,max=Math.max(1,...elapsed.flatMap(m=>[m.received,m.due])),step=548/elapsed.length;
  elapsed.forEach((m,i)=>{const x=32+i*step,w=Math.min(15,step*.28);rect(x+step*.18,baseY,w,Math.max(m.received/max*75,m.received?1:0),green);rect(x+step*.50,baseY,w,m.due/max*75,orange);if(!m.received)rect(x+step*.18,baseY,w,1,red);txt(monthLabel(m.month),x+2,baseY-12,7,false,gray);});
  y=baseY-25;line('Verde: depósitos reales. Naranja: cuota del mes. Marca roja: sin depósito al corte.',9,false,gray);
 }
 for(const d of model.details){
  const lot='Etapa '+(d.lot.stage||'—')+' / Bloque '+(d.lot.block||'—')+' / Solar '+(d.lot.sourceNumber||d.lot.number||d.lot.id);
  ensure(110);section(lot);line('Precio: '+cash(d.price)+' | Prima pactada: '+cash(d.agreed)+' | Saldo actual: '+cash(d.balance),10,true);
  line('Prima aplicada contablemente: '+cash(d.primaApplied)+' | Prima pendiente: '+cash(d.agreed-d.primaApplied),9);
  if(d.rows.length)table('Cuotas · '+lot,['No.','Vence','Últ. pago','Cuota','Aplicado / folio','Pendiente','Estado'],[28,62,62,70,143,85,98],d.rows.map(r=>({cells:[r.number,date(r.dueDate),date(r.lastPaidAt),cash(r.dueCents),cash(r.appliedCents)+(r.receipts.length?'\n'+pmAmortizationReceiptLines(r.receipts.map(p=>({date:p.date,reference:p.reference||'Sin folio',amount:p.amountCents})),cash,date):''),cash(r.remainingCents),r.reportStatus],color:r.reportStatus==='Pagada'?green:r.reportStatus==='Abono con excedente'?blue:r.remainingCents>0&&r.dueDate<model.asOf?red:gray})));
  else line('Venta al contado: no tiene mensualidades.');
  if(d.history.length)table('Recibos originales · '+lot,['Fecha','Correlativo','Aplicación guardada','Recibido','Saldo'],[65,90,205,94,94],d.history.map(p=>({cells:[date(p.date),p.reference,p.concept+' · '+p.application,cash(p.amount),cash(p.balance)]})));
  else line('Sin recibos registrados a la fecha de corte.');
 }
 footer();
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+pages.map((_,i)=>(5+i*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 pages.forEach((stream,i)=>objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> '+(cl||rl?'/XObject << '+(cl?'/CompanyLogo '+(5+pages.length*2)+' 0 R ':'')+(rl?'/ResLogo '+(5+pages.length*2+(cl?1:0))+' 0 R ':'')+'>>':'')+' >> /Contents '+(6+i*2)+' 0 R >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'));
 if(cl)objects.push(lgDocLogoObject(cl));if(rl)objects.push(lgDocLogoObject(rl));
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});const xref=pdf.length;pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 return new Blob([Uint8Array.from(pdf,x=>x.charCodeAt(0)&255)],{type:'application/pdf'});
}
async function pmDeliverAmortization(share,lotId=null,expectedClient=null){
 try{
  if(!cloudReady||cloudBlocked||cloudOffline||!cloudQueue||cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)throw Error('Sincroniza los cambios con Cloudflare antes de emitir el reporte.');
  const clients=new Set(pmSales().map(s=>s.clientId));if(clients.size!==1)throw Error('Selecciona un solo cliente.');
  const clientId=[...clients][0];if(expectedClient!==null&&clientId!==expectedClient)throw Error('El cliente cambió. Vuelve a elegir el reporte.');
  const report=pmAmortizationModel(db,clientId,residence().id,businessToday(),reconcileInstallments,installmentDueCents,(date,i)=>dateKey(addMonths(date,i)),lotId);
  const slug=s=>String(s??'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60);
  const lot=report.details[0].lot;
  const tag=report.individual?'Etapa_'+slug(lot.stage)+'_Bloque_'+slug(lot.block)+'_Solar_'+slug(lot.sourceNumber||lot.number||lot.id):'Consolidada';
  const blob=pmAmortizationPdf(report),name='LOTIGEST_Amortizacion_'+tag+'_'+report.asOf+'.pdf';
  if(share&&typeof File==='function'){const file=new File([blob],name,{type:'application/pdf'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Amortización LOTIGEST PRO'});return;}}
  download(name,blob,'application/pdf');toast(share?'PDF descargado. Adjunta el archivo al chat del cliente en WhatsApp.':'Reporte de amortización descargado.');
 }catch(e){if(e.name!=='AbortError')toast(e.message||'No se pudo generar el reporte.','error');}
}
function pmAmortizationChoices(state,clientId,rid){
 const scope=contractCollectionsScope(state,rid);
 return scope.sales.filter(s=>s.clientId===clientId).map(s=>{
  const l=scope.lots.find(x=>x.id===s.lotId);
  return {id:s.lotId,label:'Etapa '+(l.stage||'—')+' · Bloque '+(l.block||'—')+' · Solar '+(l.sourceNumber||l.number||l.id)};
 }).sort((a,b)=>a.label.localeCompare(b.label,'es',{numeric:true}));
}
function pmReportsKeyboard(layer,dialog){
 layer.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();pmClosePaymentHistory();return;}
  if(e.key!=='Tab')return;
  const controls=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length);
  if(!controls.length)return;
  const first=controls[0],last=controls.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 });
}
function pmOpenReports(trigger=null){
 if(!['sale','owner'].includes(pmActive))return;
 pmClosePaymentHistory(false);if(trigger?.isConnected)pmReportsReturnFocus=trigger;
 const layer=pmNode('div','pm-history-layer pm-reports-layer'),shade=pmNode('div','pm-history-shade');
 const dialog=pmNode('section','pm-history-window pm-reports-window');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','pm-reports-title');
 const header=pmNode('div','pm-history-head'),heading=pmNode('div'),title=pmNode('h2','','Reportes de pagos');
 title.id='pm-reports-title';heading.append(title,pmNode('p','','Selecciona el reporte que deseas consultar o compartir.'));
 const close=pmNode('button','btn btn-soft','Cerrar ×');close.type='button';close.addEventListener('click',()=>pmClosePaymentHistory());header.append(heading,close);
 const content=pmNode('div','pm-reports-content');
 const history=pmNode('section','pm-report-option');
 history.append(pmNode('h3','','Historial de pagos por fecha'),pmNode('p','','Consulta los depósitos reales, correlativos y recibos registrados.'));
 const open=pmNode('button','btn btn-outline','Abrir historial');open.type='button';open.addEventListener('click',()=>pmOpenPaymentHistory(true));history.append(open);content.append(history);
 if(pmActive==='sale'){
  const clients=new Set(pmSales().map(s=>s.clientId));
  const client=clients.size===1?[...clients][0]:null;
  const choices=client?pmAmortizationChoices(db,client,residence().id):[];
  const report=pmNode('section','pm-report-option');
  report.append(pmNode('h3','','Amortización PDF'),pmNode('p','','Reporte individual por solar o consolidado de todos los terrenos.'));
  const label=pmNode('label','','Seleccionar solares'),select=pmNode('select');select.setAttribute('aria-label','Solares del reporte');label.append(select);report.append(label);
  const all=pmNode('option','','Todos los solares ('+choices.length+') · Consolidado');all.value='';select.append(all);
  for(const choice of choices){const option=pmNode('option','',choice.label);option.value=choice.id;select.append(option);}
  select.disabled=!choices.length;
  const buttons=pmNode('div','pm-report-buttons');
  for(const [name,share] of [['Descargar PDF',false],['Compartir PDF',true]]){
   const b=pmNode('button',share?'btn btn-outline':'btn btn-primary',name);b.type='button';b.disabled=!choices.length;
   b.addEventListener('click',()=>pmDeliverAmortization(share,select.value||null,client));buttons.append(b);
  }
  report.append(buttons);if(!choices.length)report.append(pmNode('p','','Selecciona un cliente con contrato vigente para emitir el PDF.'));content.append(report);
 }
 dialog.append(header,content);layer.append(shade,dialog);shade.addEventListener('click',()=>pmClosePaymentHistory());pmReportsKeyboard(layer,dialog);
 document.body.append(layer);pmHistoryLayer=layer;close.focus();
}

const pmStatementArrayanLogo="/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABwUFRkVEhwZFxkgHhwiK0cuKycnK1c+QjRHZ1tta2VbZGJygKSLcnmbe2JkjsKQm6mut7m3bonJ18ey1qS0t7D/2wBDAR4gICslK1QuLlSwdWR1sLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLD/wAARCADgAlgDASIAAhEBAxEB/8QAGgABAAIDAQAAAAAAAAAAAAAAAAQFAQMGAv/EADQQAAICAgEDAgQEBQQDAQAAAAABAgMEEQUSITFBURMiYXEUMjM0FSNTgZEkQlKhBkNyY//EABgBAQEBAQEAAAAAAAAAAAAAAAABAgME/8QAHhEBAQEBAAMBAQEBAAAAAAAAAAERAhIhMUEDE1H/2gAMAwEAAhEDEQA/AOkAAAAAAAAAAAAAAAAAAAAAADAGQAAAAAGDIAAAAAAAAAGDIAbMADIMADIAAAAAAAAAAAAAAAAAAAAAAAAAAAxs1zurr/PJIDaCuu5fHr8Pqf0IVnPS/wBkP8k1NXw2czLmsh+Ho8fxfK/5jU8nU7Gzl1zGUvMtm2HOXL80Uxp5OjBT1c7W+1kWvsTqs6i38s0NXUoHlNPumeiqAAAAAAAAAAAAAAAAAAAAAAAAGu61VR6mbCLm/omerkWMRzYSaXgkpqS2vBU9cbIRhGPze5Z0Jxqin5McdbV6mPVlirj1MjLOi34Zsy/0WQqbYxgk4b+uh11ZcJPSyhPripe5i2xVw6mKmpQTS0vY1Zdbsr0vJu30n68wzIykk15JSe0QKJwbULIpNE9eDPF1bMarrlSk2bIy6op+5Ez/AMsfuSKf0o/YS+0ZssVcepkdZ0D3mfos8UVQlQtxJbdEiuyNi3F7PZAo/l5UoLwTzXN2FR7cqNc+lruKslWT0kyJkS6crbWyRj2xnZpQaMzraueks0PJirej1N5V3xcsl68ovfWEmrCyxVwc34RmqasgpL1IUruvEkn5RJxP0IidbcMxv8Ee3KhB6XdnvIm41SaI+JUpRc5d3sW1I9wzIt6kmiTFpraNU6IT8o2RioxSRed/SsW2KuPUzNc1ZBSXqaM39FnrE/QiN9iQaLsiNOt+pub0Vty/EXteiHfWEmrCuxWQUl6nrZDwp+a36EwvN2FmNVt6raT9TbF7SZCzfzwJdf5F9iS+8HsAG0AAAAAAAAADG0ANN+TXRHc5JELP5WGPuEH1S+hQXZFuRNucm9+hGbVplc1JtxpX9yrsyLrpblJsk4nF3ZHdrpi/Vl1j8VRSk2uqXuEy1z1WHfd+WDZMq4W6a+Z6OijCMVqKSPQxfFSw4FL80jZ/A6tfmZbgYuRTS4Kv0kzRZwU1+WaL8DDI5W3i8iv/AG7X0IrjZU+6cWdppGi7EpuWpwTGM3lzmNyl9Gk31L6l1icpVetSfTL6kPK4TzKl/wBmVFlNlEtTi4sHuOyUk/Bk5rB5WylqFj6onQUXwvgpQknsNStwAKoAAAAAAAAAAAAAAAAAABFzv0SUeZQU1qS2Z6mwitdfw1CxLt6lhXLrgmjLri46a7GVFRWkuxnnnxW3WnK/RZFovrhDUl3+xYSipLTW0ePgV/8AFDrnbqys1yUoprweMi11RTS2bVFJaS0g4prTRqz0itusjbKLhH5iwr38OO/YwqYRe1FGzROZhbqHyH5Y/ckU/pR+x6lBT/MtmUklpFz3prRmfosj1ZcYVKOnsnSipLTWzz8CH/FGbzbfSyxFxYSna7ZInGFHXgyakyYlqtvkoZXVLwSaMiuyWoxN0qoSe3FMRqhF7jFIzOcq69kCPfNZYHj4cerq0t+5eudTVdmUutuUfDJmJ+hH7G2UFJaktmYxUVpLSJOcura8Ww64Ne5DpueO3CaeiwPE6oz/ADJMt5v4kqNLNj2UE2yVCTlFN+TzGmEX2ijYXmX9KjZv6LPWJ+hE3SipLTWxGKitIZ70a8ifRU2Qaseya61LWyylFSWmthRSWkuxOufJZcVsYSxr4uT2pFl5RiVcZa2t6PQ55xLUHPenBm2jJhPUVvZvlXGf5lsxGmEXtRSJnvTWxAA6IAAAAAABhsDEmktspeT5Tp3VS+/rJHrluR6Iuqp9/VopaKZ5Nqiltsms2kK532ainKTL3A4mFSU7V1S9iTgYEMWtbW5+5NBJjEYqK0lpGTDkorbejRfkxrrcovZcbk1IBAqzuqLbibnkbinHRcq+FSQQLM9QnpLZJqyI2RT35GF4sjcDw56kor1PZGWTA2aZ2tvph59wN3ZmjIxasmOrI/3NlcemOm9s96A5bO42zGbcV1QNWHm2Ytiafy+qOsnXGyLjJbTOe5PjXQ3ZWtxfkzjFmfF3i5UMmtSg+/sSDkcPLni3Jr8vqjqce+N9SnB9mWNStwAKoAAAAAAAAAAAMFNy/IWU2qup69WEtxdAhcZkyyMZSm9vZNCgBhgZBUZHNQptlD4fVr12TcLMjl19UVrXoE1KBg05V34el2a3oK3gq8Xl1k3KtV6367LMDII2ZlLFq63HZW/x+P8AR/7ImroFL/H4/wBL/sfx+O/0v+xpsXQNdNnxqoz1rYtthVBynLSQVsBUW85XCWoQc17+DNHOVTlqcXD6hNWxk8V2Qtj1Qkmj0VWQRcrNqxY/O+/sVz5+O+1W19wmrsEHE5GrKek9S9iamRWTBkFGDJHzMn8LS7OnZWfx+P8AS/7ImroFRXztcpanBxXuWVGRXfHqrkmDW0yYIOdyKw5JOHVsqpwKX+Px/o/9j+Px/pf9k1PKLoyQcDPWZvUOnRvysj8NRK1revQK3gqsTl1kXKtV639S0RU1kABQAACDyWWsah6fzPsiZOSjFyfhLZynI5LycltP5V4JUtR9zyLveUmdJx2FHGqUpJdbIPC4W38aa7ehYZNdrsTg/l9UJNOOdb1k19TW/B6d0V69iucdOUujSXnZjUtNt/I/B0x28Il32K6txrl3IcYSqrbsW17CFcqWpPwyzUY2VrqSeyfGt8VZXJx00tRZhxm59S/KWF9EZ0tJePBqw4xnTKD8rsy6f6RFljSsluDTXqbK4TpsUXHaXqTKq4Y8X/2eZX12QfTJb8DUvdvphW9Cdsl9EabMmc3GVfj1Pd1kYVKPTs800xmk1Pa9iSM8yfpLKa7Sfn1RpWTKFvy+Pqb1iuUpdSSXobK8Va+dJsrW8t1NvxI7NprrqjWtRNhiuVxk8TgpxcZLaZ6ARy/KYLxreqK+Rnvic10WquT+RsvsrHjkUyhJHJ3VSx7nB9nFmWL6dnFppNeGZK3icr49HS380SxRpqMgAKAAAAAABhgYnLpi2/Q5DNtd2VOXpvsdJyd/wMScl5fY5Xu23/2ZrHVX/Az3jyXsy4RQ8BP5pxL0sajJoy7VVROTfhdjcVPOX9FKgvLBVBY5WzlLy/JacFf03Ot+GjxxWL8auxtdtdiLVJ42avTpkRierrriHyn7KZKrmpwjJeqIvK/splbUXEfvYHUnLcR+9gdShE5+IufivKp6IvRTWcJZXBydi7fQ6M1ZX7ef2FWxyFdbstUE+7eizjwVnZ/EX+CBi/u4/wD0dfD8i+xIzJK10wdNCjJ76Uc7yebK+9wi30o6HKl04839DlceKty4Rl4ci1ak4vE25EetvpT9zzl8XbjR6t9SOmhFRgkvCRi6KnVJNdtDDx9Oe4nNlVcq5P5X2Okb+XZx1idWU+nypHW0Pqog36xQOb6cvyFsrcue32T0iZRw3xcfrcu7XY18pg2V3ysjFuMns1Y/JX466U9pejIz++2quu3Hyl0qXyy9PU6ymTnVGT8tFZh8lRkTUbIKM2Wsda7eCxqPQCBWlfzP7NnO4uO8m1Vp6Z0XM/sn9ym4j97EjF+vd3DXVwbT6iNiZNmJeu7ST00da0mjl+XrVebLXZMFmOlpsVtamvDRSc/+pAncLNywo7IPP/qQC34h4XHyzFJxlrRK/gNn9Rf4IONm24yaretm7+L5H/IjMxc8dgSw+rqlvZ75b9hYY4vInkY/VN7Znl/2FhW/xR8R+9gdSvBy3E/vYnUrwInLIAK0AGGBXcxk/BxumL+aXY57Fqd98YLvt9yZzV7sy3HfaJI4LH25WyX2MsfauqKlVVGCWkke2tmUZNN/GuVcZLTW0eXTBx10rS9DaGVdqtujJW9L/IeVZKEWqZOS3/gk5S0urpb9CBOz4Umor77NT27cydJP4myUVGP5jxByx8uKl4sX/ZpqvdVinKO4Py/YlchqVEbYf7XvZm+nPvJWLa7uuUntw14NaioQXbWyfRNWURl6NEevV+RNv8kfBZVneIsoTlDUn39D1TP4KS7tssZVRa7o0wxtOW/XwXWp3LER5Nvxn5S9iwpt647Z4rx1GOpfM/ciznOE5QUdRInrr1FipxfhodSXqVcG4R8sxKyycWkmmMP8ky3LfV0UxcpGzHjbrdslt+nsQ8WU4SSkvLLNeCYx1zgUnOYqcVdFePJdmnKqV1EoP1RlixzXGZDoyY9+z7HVxe4p+5xdkXVc14aZ1XG3fGxIPffwInKWACtAAAAAAYZk8zfTFv2Ao+eu241p/dEWWN0cYrGu7ZryZPLz2vrouOQpUOMcUvyoyx9V3BS1lNe6OkOV4qfRmxR1XoWLyM5bl7/i5bSe0ux0eVZ8LHnP2RytVcsnKimm9vuKdPeNyFuNX0VqOvqjRba7bXZLW37HTR4rGUVuC2QOW4+umlTqWtP0JjOek7ib/i4kU/KPfK/sZlVwdzhdKt+JFrynfCmVr8UXEfvYnUKS90cXFzhLcdpm38Tkf85E1mXHYKSfho1ZX7ef2KPiLrbMrU5Sa+peZX7ef2NNuUxf3cfudfD8q+xyOKn+Lj29Tro/lX2JEjxkQ66ZR90cluWPlba7xkdiyl5XjXZL41S2/VA6WWLkwyKoyi0+x5zMqFFMm2t68HLxndjy1Fyg17CUrsiaUuqcgm+ma4vIylry5HXVx+HTFP8A2oq+K4506ttXzei9i29NBeYrLeWo+I65Q3313PdvG42TX1qPTtehV8pg2VXSsjHcG9kWOZkwh0Rskl7BGu2Hwb5RjLfS+zOrwJueJXJ+WjmcbFtyrfyvu+7Oqx6vg0xh7LRIsbUADTSv5n9kyl4jX41F1zP7N69zmYSnCXVHaZL9YtdhbfXVFylJJI5bPv8AxOXKcfDekapWXWvTlKTLHjuKnOxWXLUV30Q3VrxdLpw4J+vcref/AFIF9FKMUl4RQ8+m7IFW/GrisKnJU/i72vqWP8HxPd/5Ofrttq30OS37Hv8AFZH/ADkRI6nGx68eHTW+xo5b9hYQuFusssl1yb+5N5b9hMq/ij4lpZsdnUqUfdf5OLi5wl1R2mbfxOR/zkRmXHYKSfqjJzvE33Tykpyk19ToUVtk8WyUK5SfhI9kXkZdGJY/oVXKXydl82/c6jjKvhYcF79zl6l8S6K/5M7CiPRTCPstGYxz9bQAabAwYAxrZDvwY2T6k9MkztjB93oiXZ0oW9MUte5Y3x5fjbHEgqXW1vZWynLHVmLb3i/yssY5W5JNa7EXNUL4dU9bT7NDLS8XqmJk9GAt+nY81uyvTg/l3s10NKKrS1He2T4Y9dj+JHx40XMbnPh9anlSjpN72a/xdit+hslR0bcltvwboUwjXuzTfuXVt5jbXcnV1y0kQLsueRNwx4ppeZNGucbMuz4NScaV5fuWVVFdNXRFa7Gf1x32h1dFkeiUtNexKjTXJxafghddUbHFR0n2PavWM1CPdGnW838WHRHaej2a6rFZBS9zYYcboGjIA5bmKvh5j169yfwNu4Th7M18/X80Z/2NPBz6cvp90ZYnqukABpsAAAAACHyV3wcWT9X4JZR87ftxqTJUrRw1Hxcl2y8IueRj1Ydi+ho4ij4WMpNd5dybfHqpkvoEnxyeHLozIv6nXwe4pnG/kyPtI67Hl1UQf0EOXucFOLjJbRrhjVQl1RgkzcN6K0HmcI2LUltEDM5Suh9EPmkRMXk77cuMJpJNkTVvDGqhJSjBJnuUIzi4yW0egVWj8HR/Tj/gfhKP6cf8G2yyNcXKT0kU+TzDbcaI716kT0ta8equW4QSZtaUlp+GVvFZlmVCXxPKZZFGlYlKltQSZu9DICsBpMyYA0zxaZ/mgn/YzDGqr7xgl/Y2gGCRkADzKCktSSaNDwqG9utEgEHmFcILUYpfY9mDOygANgeZwjNakto0/g6P6a/wb9gI1Rxqo+IJGxJLwegFYNdlFdj+eKf3NoAj/g6P6aH4Oj+mjeRsrOqxY/PLv7ET0210V1vcIpHqcIzi4yW0ytp5qqyxQcWt+pZpqSTXhg+tP4Oj+nEz+Do/pxNxkpjTDHqrluMEmbTIChA5d6w5E8r+Y/ZyCX453DW8qv8A+kdjHwjjsL93V/8ASOxXgzGeWQAabDDAbAr8vHsst3Hwaun+bGuUNv3Jt859lVKO/ZmmGVFWKN8eiXo/c06TqxGs2twlLvvseYwXT0Tl3fgsJUVTmptpsi2VKjIjLW4MeTX+iNBJXuqL+dLZYRnKij5/JW5T+Dytc12Uibv8XmJb+SBPJjr+lv15k7JtOW0/QxKyfhePU98jkqitRjpzfZI9Y0JLE6rF8zWxqzuNNEba5dWuz9iRkTnBqXUlH1NCz1VXJ2LWl2Kx8grbXK1OS9ELWe+sqw0rbd1x/uzbXCN89SXePqV/8RulJfCp8eOxuhbyMn1Rp1seR/ouUo1w14SNdmVXWk2/JV2Wcio/PBaEJWWQ/mQT17CEm+1zCanFSXhnsgYmZXLVfS4te5O2Rmqnno7x4v2ZWcS9ZsS151/6ZfcqeK/exMsX66oAGm2QAAAAHmTUU2/Q5i5vL5LS7/MX3I3fBxZy33fYqeEp+JfK1rsRmr6qChXGK9EZktxa+hkFacfmR6Mua9mdNx0+vEh9EUHLQ6MyX17ltwlnVi69mRifVmQeVulRitw8vsTjTk48cipwkVpVcbiVOv49slOXnuzXizhLkZ2zlGMI+DTmYVuGvlsfS32WxTxVk6XbOXSmtmWVpZzGNCfT3l9UTqrY2wU4vszjJx6ZuK76Z1fGwcMOtP2LFl1W8tbKzKjR1OMfU3W004WBLo05NeX6kjkOPWV8yepL1KS3Hu/ELHc3J/cFWXGXU4uM5TmupveiTTy2PdaoLaf1KfL46WLQpyn/AGI+DB2ZUEvcmprr9hmF2SIvI5Kx8dtP5n2RprWnO5SGNuMfmn7FfHnburvCOiujGzKv13cpMssriVRifET+Zd2Rnb9WX8UpWMrm/Poj3ichVltqG017nKOT1077FpwUG8iUvoTSda6JGTCPNsuiuUn6LZptrnlU1z6ZWJP2NsWpLa7o5C+2V2U5Jvu+x1GFGUcWCl50RNb5SUU23pI015dNsumE02ROZyfg43Qn80iq4dSnmJp+PI1NdORsvMrxYbm+/ojdbYqq5TfhI5TMyJZORJt9t9hVtxNlztvV8sFosMTlK7qnKeoteUQcfiOvG67O0muyKqXVVOUd/Qms7jpKeWottVaUk36lgmchgR6syv7nXRWkWNS6SkoxbfhFJfzcoXOMIJpPyXN/6M/scbb+rL7i1OrjqqsyNmH8fxpHN3WWZmS2ty2+xLna6uJhBPvNkriMTpqd0l3fgifVHKMq5tPyjqeKtduHFvyuxzeZ+5s+5e8E/wDSNfUQ5+rVAIGmwAACFykd4cyaacuHXjzj7oJXJYr6cmtv/kjsYNSgmji5fJZ9mddhzU8at/REjPKQACttdliri2yKs6M24pdyRkVu2txRXQxLIS6n6Go68Tmz20TdnxW++9km2E5xi21067mK7ZTucXEw063KM5eTWOl9+mmpuNmutuK9zN98pza3pIzHHlGXU9dJi+MGnZH08jJGpOY1OtZP5m9x8NFhh1wxseU23t+dkSrpdLnXJOXqasrLlKhUxe5SZm44/wBPH7Hqj/WZjuseoQfYsb8tRr3Xp+hHjRDHwEpvTflmmmcZRaqfVL2JGeJz+sXUfikpzbXfukZqw6KW5dp69zfZF16b7bXg8Kn4a3LepGsjr481sozI9Si64penYsK5qa2ivhhPXVF/YmY0Jxhqfklkc+5z+NOfCcofLtkbFqs+bs0W2l6mOlLwiaTvJiHh0zhKTnr/AATUNAjFuqfn5/yox9yBw0erNX0Rt52zqyFD2PfAV7tlP2WjLn+r9AygabAAABgxKSim36AUnO3NyhSv7k7iqPg4kfd9ymk/xvJ68rZ01cVCCivCRGYyZAK057nq9XRmvDR74Cfecf7kjna+rHUvZlbw1nRlpb89iMfrpw2ktsw5JLbeiszuQT/k0fNOXbt6FaasiTzc6NUfyQfcsMrVeFZrtqJq47E+BDrn3nLybOR7YVn2Ifjlql8S+K/5M7CmPRVGPsjlOPj1Zla+p1q8CM8vF9qpqlN+iKzjKnddPJn32+30PHI5Dyb441T8vT0WmNSqKYwXoitKznpaqjEh8JX1ZXV7Ejn380B/4/HvNkZ/V6c7zlzneq14iX9tkaq3OTSSOSzL/wARkyn7sVeqs+Cxk27mvsW2ZB2YtkUtto08XBRwofUcjmRxqWt/O12BPUctZFwscZLTRecBD5JyKSfU5dU99/c6Hgl/pd/UiT6tCJydjrwptevYllJzWZFx+BDu/L+ha1arMCv4uXCP1OtS6Y69jm+EinlNv0L/ACblTRKb9EEjn+au+LldKfaJ74JbyZfYg2KVvXc/DZP4H9zL7E/Wf1O5u514/Qn3kVPF4/x8pbW4ruyb/wCQb3D2PXAVrpnP18Bq+6uenUdL2OT5CqVWTLqXlnU5F0aKpTk+yRymZdPJtla/y77FqdJHDV/EzU/budQc9wC1ky/+ToRF5+PN36UvscdetXz+503I5aoqcV3nLskc3k02VyUrPMu5KnTYm8idNS7pHUV1KqhQXotFFweP15Dsa7R8HQvuixY5DMWsqzfuXnBL/Sv7lNyUenMn9y54P9q/uRJ9Wh4utVUHOXhHpspuRyHk3xxqu+/OjTVWeJkrKr60tEg0YtKopjBG8KGJLaaMmGByPIVfBzJpLt5Lrg71Zj/Db+aJH53H/Lcl9GQuJyPgZST8S7EYnquqBiL2tmStsMw0ejAGtVQT2orZDy6IO1Sc0jfmZcMWtyb7+iK7DotzL/xFz1D0iNWd2fFhH4VlKgppirFhCLT7plXyOFZjt20Sl0+y9CHTyuTV5l1L2Gs+dSOQxbMNynTtVy86I3GqNmZH4np37k6PMV3wcL6+zK26P4bJ3B6XlGWU7mcrqmqoPsvJv4THUIu2b7vwU0N5GQup92y7bhXKEYya0ka5mt/z5876WU1XNrq12PbhGS7pFU1bO/cdtbLatPoW/Jq+m+p4spaWkZ0DJlhgGQBg8zkoxbZ7K/lclUY0lv5peAlc/nWu7KlL69i94Wn4eL1a/Mc/RB3Xxiu7bOuorVVMYL0RGeW1AArYY2ZKnk891P4Nf535Iibdm00/nmtlfl8xXKqUK022vJrxeLld/MyJN79CNytNVU41VL5vUJWnAyPw1rsdbmyz/jbX/oZKwMKFeNDrgnJrZJ/DVf00CRWrnP8A8GZXN/8A4ssfw1P9ND8LT/TX+AqmzeS/E0Sh8F9/UqaZyquUodpI66WPV0tKCXb2OVyoOnKkteH2Ix0tI0Z2Wl12dMX7FhicfXjd13n7szxtvxcOD9ddyWVsNOXW7MayK8tG8wyq5HFl+GzE59tMtsvlYuHRR3lI3ZnEwvn1xfTIYnE10S6pfNIjMjHF4brTtt7zkWegloyVVRztLlSppeCFxGXXjuSsetnQ21xtg4yW0yos4OMrNxlpESxoysqzkbVTSn8Pfc0cjgvFcXFdmvJe4mFXix1Bd/c230QvrcJraGGb9UmHyyoxvhyW5LwaqoXcnkqU99Gyw/gdPXvfb2LCjHroh0wWgkl/VPzGGoQhOuPaK09GriM+GPF12PSZf2Vxsi4yW0yus4SictptDFxjJ5WMo9GOnKbI8+Pk8Oy2zvbLuWONx1OP3S2/dktxTjprsFxy3F5EcbJ3PsiTyWd+Kmqqn8r8kjK4brscqmltm3B4mNE+uz5pLwRn2h5uN+H42uOu77s8cE/9TJfQnc72xo/cgcH+6f2KfKn83ju2lTXoVvGZ6xJSU12+h0s4qcXGS2mV1vC0zl1JuIWz9VuTl28jcq618m/BOv45Q4/oivmXcm4uBVir5IrfuSXFPswY5Xj8n8Jk7ku3hl1Zy9EYbg3KXojORxNF8ur8rFHEUUy2/m+4JMR8PHsy7/xF6+X/AGomZmBXlRSfZrwyXGKitJaRkq40YuLDFr6Y/wB2bzICud52jpsViXZnvhcqFcZQnJL17lvl40cmpwkUFnE5EbGora35JjGXU3kOVWvhUd5PttG3isNw/nW95y7njA4lVNTu7stktLSCx6ABWgAAR8yhX484NenY5KcZUXNPs4s7RlFzWHp/HgvuSs9RP4vKWRjpN/MiecjgZTxb09/K/KOqptjbWpRe0wS62EbLyoY1blJ9/RGcnIhj1uUn39EVtFFmdb8a7tBPsirWMfHszrvjX9oJ9kSs2+WO666mopki66vEp29JJdkV9uapRV06eqHv7ERKwrnlUyVmnrsVXJ8c6ZOypfL7IsMXkMTxHUNk1zqvj09UWmD640k3vrprm/LJXJce6JOytbgQJS/kwj7GWPiRxtXxMj7E2cJKb7NmniKnOU2np6LiDpogvizjs6c3I9H8+5xHrCrcaV1eSWitny1MX01rqf0Nkc5xlFWwcVLwTdZvW3U4yjzFqS2vB6CAAAxJpLb9DluVyvxGQ0n8q7ItOXz1VW6oP5n5KLGplkXqKW9vuRm1Z8Ji7n8aS8eC/RpxqI0UxgvRG8RZMAAVWGUvK4U/i/iKttl2eWtpp+CCq4/klODhZ8so+5Agnmcrvykxy9Kx8jqh26iZwVGoyta7sMLiK1FJeEejCMlbAABhnO85R0XqxLszoyv5XG+PjPXldyVnqaicDenGVTffyi6RyODe8bKi29ejOsrmpwUk+zEJdewAVoAAAAAAAAAAGG0ltkDI5WiiXT1dT+h55bJdVSrh+aZpo4iE8dfFb6332E1OxMuGXDqgSiLh4cMSDjD1JQUAAAwZAFPz71RBe7IPB/uiX/5C/wCXUvqReCW8p/YyxfrpEZANNgAAAAAAAAAAGNGQAAAAAAAAAPFtcbYOMvDPZgDk+Qw5Ytr0vlb7M3cdyTxtws7wL/KxoZNbjJf3OXy8SzFsakvl9GZYvpLndZlZlbsT6G+y9C8turxaNvS0vBzFOXKMq+t7jBllRXZyd3XY9Vx8IpK9V128lf12bVSe0i1ePW6fhdPy60ZUY1VNR7KKKynNsldFOzacteCtfFbyODLFsbSbg/DIsL7K9dM2v7nXXUxyKumS8nL52HPFtaa+X0ZlmyrXA5CGTX8G/W37lZyNEcfJcY+PJEi3Fpp6aPd107pdU3t6DOs1ZFlSahLWzy52Wy05OTfueqode0lt+hZ4WLXi1/iMns/RMg3cdx3wofGtW5a7IkRl+Mcq5w1rwyJbze/lpr/yb6VlWVO3tGXlR0abbKLp4tnwbvy+kiyTTIFdkM2v4dq6bF6exrx8l49/4a6X/wAsKsyDyGfHFraT+d+EeM/k4Y8GoNSn9DnbbbMi1uXzNhL1jFk55Frk9uUmdDxWCsevrmvnaNHE8Z0autXf0RdJaQiSf9EZAK2AAAAAKPl6LbsmCjFuJaYlKoojBLul3N7in6DQTPbKAAUAAA8yipRafqegBy/KYUse5zivkZv4vkZxnGiXdPwXttMLodM1tESni6abviLbZGcTl4MhArQAAAAAAAAYZkAUec/icpXB+EXUVqK+xR8mnVyFdnoXVc1OEWvVEZjYACtAAABmNnmclGLk/CQFBz1vVfGHstnrgIPrlP08Ffm3fHyZS9N6RfcNR8LETfmXcyxPqyAQNNgAAAAAAAAAAAAAAAAAAAAAAABHycaGTW4yS+5IAHJ5vH2Y0n23H3PGJmWYsvlfb2OssrjZHpktops3httzpf8AYmMWJeLydOTHpl8svZkmGPStOMI++zlJ1WUy1JOLRIx+TvofnaJprqjRlYsMmtxmv7ldXzsGvnj3PNvOx1/Lj3LrWxqyuLox6nOU+/sU71vsb8nLtyZNzfb2NBmude6bXVYpryjblZdmVLcn29iMeoy6ZJ+wSLbiuOc2rbV29F7lldkTqvjXGHy+5V1c1OuCj0Lt7Hm7mbJr5YpMut7Isc6MK/58ZKNi/wCynys13W9aXfWtkey626XzSb36EnE423Ia3FxiDdRYwnfPSTk2XvG8WqtWWrb9iXh8fVixWluXuTCyLIJJLS7IyAVoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAruVxfj09UV80fBF4rPUdUWvTXZbLpra0U3JcY5N20/m86IlXKaa7GTmsfk78WSham0vRllVzFE132imrMET+I42t/ERpt5fHguzbGmrBtJbKTluRSi6a339WRszl7Lk41/LEiY+NblWdk3v1Izb+GDjSychRXjfc62uCrrjFLSSI+DhwxKkkvm9WSwsmAAK0AAAAAAAAAAAAAAAAAAAAAAAAAAAYZkAaLsaq5anBMrMng4vvTLT9mXRgYmOUu4zJr38ja90RZVzg9Si1/Y7Vo1zprmtSin/YmJ4uM0wda+Pxpf+tHn+F439NExPFymgot+EzrFxmMv/WjZDDor/LWhh4uVrxL7fyVyZOx+Fun+q+lHRKEV4SRnRcXxQMbiqKEm49Uvdk5RSWktHoBrGDIBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYDRkARcjBpyPzQW/crLuCe265di9BExzEuHyU+x6hwuRJ/N2OkAxPFT0cJCLTtey0qorpjqEUjYZKuMaMgBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/Z";

function pmStatementCash(cents){return 'L '+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function pmStatementDate(date){return new Date(date+'T12:00:00Z').toLocaleDateString('es-HN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});}
function pmStatementMonth(key){const m=new Date(key+'-01T12:00:00Z').toLocaleDateString('es-HN',{month:'long',year:'numeric',timeZone:'UTC'});return m.charAt(0).toUpperCase()+m.slice(1);}
function pmStatementModel(report){
 if(report.unmatched)throw Error('Hay pagos por conciliar. Verifica los recibos antes de enviar un estado de cuenta.');
 const monthly=report.details.filter(d=>d.sale.type==='credit');
 // Los contratos de contado también tienen estado de cuenta, sin mensualidades.
 for(const d of monthly){
  const applied=d.rows.reduce((n,r)=>n+r.appliedCents,0);
  if(applied!==Math.max(0,d.paid-d.agreed))throw Error('El saldo mensual no coincide con los recibos conciliados del solar '+(d.lot.sourceNumber||d.lot.number||d.lot.id)+'. Revisa los abonos antes de enviar.');
 }
 const months=report.consolidated.calendar.filter(m=>m.due>0),cut=report.asOf.slice(0,7);
 const pending=months.map(m=>({month:m.month,amount:m.rows.filter(r=>r.dueDate<=report.asOf).reduce((n,r)=>n+r.remainingCents,0)})).filter(m=>m.amount>0);
 const covered=months.filter(m=>m.month<=cut&&m.covered&&m.rows.every(r=>r.dueDate<=report.asOf)).at(-1);
 const base=months.find(m=>m.month===cut)?.due??months.find(m=>m.month>cut)?.due??0;
 const normalized=report.residence.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return {branding:report.branding,client:report.client,residence:report.residence,logo:/altos\s+del\s+arrayan/.test(normalized),asOf:report.asOf,
  properties:report.details.map(d=>'Etapa '+(d.lot.stage||'—')+' · Bloque '+(d.lot.block||'—')+' · Solar '+(d.lot.sourceNumber||d.lot.number||d.lot.id)),
  price:report.price,paid:report.paid,abonos:report.abonos,paidPrima:report.prima,balance:report.balance,lastCovered:covered?pmStatementMonth(covered.month):'Sin mensualidad completa al corte',base,pending,total:pending.reduce((n,m)=>n+m.amount,0),prima:Math.max(0,report.agreed-report.prima)};
}
function pmStatementPdf(m){
 const brand=m.branding||null,rl=brand?brand.residential:m.logo?{data:'data:image/jpeg;base64,'+pmStatementArrayanLogo,width:600,height:224}:null,cl=brand?.company||null;
 const green='0.075 0.27 0.21',gray='0.30 0.35 0.33',light='0.93 0.96 0.94',gold='0.65 0.60 0.30',white='1 1 1';
 const pages=[];let cmds=[],y=0;
 const escape=s=>String(s??'').replace(/[^\x20-\xFF]/g,'-').replace(/([\\()])/g,'\\$1');
 const rect=(x,b,w,h,color)=>cmds.push(color+' rg '+[x,b,w,h].join(' ')+' re f');
 const txt=(s,x,b,size=11,bold=false,color=green)=>cmds.push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x+' '+b+' Tm ('+escape(s)+') Tj ET');
 const wrap=(s,n)=>{let line='',out=[];for(const token of String(s).split(/\s+/)){if(line&&line.length+token.length+1>n){out.push(line);line='';}if(token.length>n){if(line){out.push(line);line='';}for(let i=0;i<token.length;i+=n)out.push(token.slice(i,i+n));}else line+=(line?' ':'')+token;}if(line)out.push(line);return out.length?out:[''];};
 const right=(s,b,size=11,bold=false,color=green)=>txt(s,Math.max(300,550-String(s).length*size*.56),b,size,bold,color);
 const footer=()=>{rect(62,57,488,.7,'0.78 0.82 0.80');txt(m.residence.slice(0,80),62,43,8,false,gray);right('Página '+(pages.length+1),43,8,false,gray);pages.push(cmds.join('\n'));cmds=[];};
 const start=()=>{rect(0,780,612,12,green);if(cl)cmds.push(lgDocLogoCommand(cl,'CompanyLogo',62,665,110,95));if(rl){if(brand)cmds.push(lgDocLogoCommand(rl,'Logo',cl?220:171,655,270,110));else cmds.push('q 270 0 0 '+(270*224/600)+' 171 655 cm /Logo Do Q');}else{wrap(m.residence,cl?30:39).slice(0,3).forEach((s,i)=>txt(s,cl?200:62,737-i*23,18,true));}txt('ESTADO DE CUENTA',194,630,20,true);rect(62,613,488,1.4,gold);y=590;};
 const ensure=h=>{if(y-h<80){footer();start();}};
 const field=(label,value)=>{const lines=wrap(value,41);ensure(20+lines.length*14);txt(label,65,y,10,false,gray);lines.forEach((s,i)=>right(s,y-i*14,10,true));y-=Math.max(22,lines.length*14+7);};
 const tableHeader=()=>{ensure(52);rect(62,y-23,488,26,green);txt('MES PENDIENTE',74,y-14,10,true,white);txt('SALDO DE CUOTA',432,y-14,10,true,white);y-=29;};
 start();field('Cliente',m.client);field('Propiedad',m.properties.join(' / '));field('Último mes cubierto',m.lastCovered);field('Cuota mensual del corte',pmStatementCash(m.base));field('Fecha de corte',pmStatementDate(m.asOf));field('Prima pagada',pmStatementCash(m.paidPrima));field('Abonos',pmStatementCash(m.abonos));field('Total pagado',pmStatementCash(m.paid));field('Saldo total por pagar',pmStatementCash(m.balance));y-=8;tableHeader();
 if(!m.pending.length){txt('Sin mensualidades pendientes al corte.',74,y-12,11,true);y-=32;}
 m.pending.forEach((p,i)=>{if(y-25<100){footer();start();field('Cliente',m.client);tableHeader();}rect(62,y-24,488,24,i%2?white:light);txt(pmStatementMonth(p.month),74,y-15,11,false,gray);right(pmStatementCash(p.amount),y-15,11,false);y-=27;});
 y-=12;ensure(105);rect(62,y-52,488,52,green);txt('TOTAL PENDIENTE ('+m.pending.length+' MESES)',74,y-15,11,true,white);right(pmStatementCash(m.total),y-40,19,true,white);y-=70;
 txt('Saldo de mensualidades al corte, sin intereses ni recargos por mora.',65,y,9,false,gray);y-=15;
 if(m.prima)txt('Prima pendiente no incluida en el total: '+pmStatementCash(m.prima),65,y,9,false,gray);
 footer();
 const logo=rl?Array.from(atob(rl.data.split(',')[1]),ch=>ch.charCodeAt(0).toString(16).padStart(2,'0')).join('')+'>':null;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+pages.map((_,i)=>(6+i*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',logo?'<< /Type /XObject /Subtype /Image /Width '+rl.width+' /Height '+rl.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length '+logo.length+' >>\nstream\n'+logo+'\nendstream':'<< >>'];
 pages.forEach((stream,i)=>objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> '+(logo||cl?'/XObject << '+(logo?'/Logo 5 0 R ':'')+(cl?'/CompanyLogo '+(6+pages.length*2)+' 0 R ':'')+'>>':'')+' >> /Contents '+(7+i*2)+' 0 R >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'));
 if(cl)objects.push(lgDocLogoObject(cl));
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});const xref=pdf.length;pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 return new Blob([Uint8Array.from(pdf,x=>x.charCodeAt(0)&255)],{type:'application/pdf'});
}
function pmStatementPreview(root,m){
 root.replaceChildren();
 if(m.branding){for(const [key,label] of [['company','Logo de la empresa'],['residential',m.residence]]){const logo=m.branding[key];if(logo){const img=pmNode('img','pm-statement-logo');img.alt=label;img.src=logo.data;root.append(img);}}if(!m.branding.residential)root.append(pmNode('h3','',m.residence));}else if(m.logo){const img=pmNode('img','pm-statement-logo');img.alt=m.residence;img.src='data:image/jpeg;base64,'+pmStatementArrayanLogo;root.append(img);}else root.append(pmNode('h3','',m.residence));
 root.append(pmNode('h3','','ESTADO DE CUENTA'));
 for(const [label,value] of [['Cliente',m.client],['Propiedad',m.properties.join(' / ')],['Último mes cubierto',m.lastCovered],['Cuota mensual del corte',pmStatementCash(m.base)],['Fecha de corte',pmStatementDate(m.asOf)],['Prima pagada',pmStatementCash(m.paidPrima)],['Abonos',pmStatementCash(m.abonos)],['Total pagado',pmStatementCash(m.paid)],['Saldo total por pagar',pmStatementCash(m.balance)]]){
  const row=pmNode('div','pm-statement-field');row.append(pmNode('span','',label),pmNode('strong','',value));root.append(row);
 }
 const head=pmNode('div','pm-statement-table-head');head.append(pmNode('span','','MES PENDIENTE'),pmNode('span','','SALDO DE CUOTA'));root.append(head);
 for(const p of m.pending){const row=pmNode('div','pm-statement-month');row.append(pmNode('span','',pmStatementMonth(p.month)),pmNode('strong','',pmStatementCash(p.amount)));root.append(row);}
 if(!m.pending.length)root.append(pmNode('p','','Sin mensualidades pendientes al corte.'));
 const total=pmNode('div','pm-statement-total');total.append(pmNode('span','','TOTAL PENDIENTE ('+m.pending.length+' MESES)'),pmNode('strong','',pmStatementCash(m.total)));root.append(total);
 root.append(pmNode('small','','Saldo de mensualidades al corte, sin intereses ni recargos por mora.'));
 if(m.prima)root.append(pmNode('small','','Prima pendiente no incluida: '+pmStatementCash(m.prima)));
}
function pmOpenStatement(trigger,context=null){
 try{
  const clients=context?new Set([context.clientId]):new Set(pmSales().map(s=>s.clientId));if((!context&&pmActive!=='sale')||clients.size!==1)throw Error('Selecciona un solo cliente con contrato.');
  const clientId=[...clients][0],rid=context?.rid||residence().id,client=getClient(clientId),choices=pmAmortizationChoices(db,clientId,rid);
  if(!client||!choices.length)throw Error('No hay contrato vigente del cliente.');
  pmClosePaymentHistory(false);if(trigger?.isConnected)pmReportsReturnFocus=trigger;
  const layer=pmNode('div','pm-history-layer'),shade=pmNode('div','pm-history-shade'),dialog=pmNode('section','pm-history-window pm-reports-window pm-statement-window');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Estado de cuenta');
  const header=pmNode('div','pm-history-head'),heading=pmNode('div');heading.append(pmNode('h2','','Estado de cuenta'),pmNode('p','','Vista previa del PDF para el cliente.'));
  const close=pmNode('button','btn btn-soft','Cerrar ×');close.type='button';close.onclick=()=>pmClosePaymentHistory();header.append(heading,close);
  const content=pmNode('div','pm-statement-content'),controls=pmNode('div','pm-statement-controls'),preview=pmNode('div','pm-statement-paper');
  const field=(title,input)=>{const label=pmNode('label','',title);label.append(input);controls.append(label);return input;};
  controls.append(pmNode('strong','','Destinatario: '+client.name));
  const select=field('Solares',pmNode('select'));const all=pmNode('option','','Todos los solares ('+choices.length+')');all.value='';select.append(all);
  for(const item of choices){const option=pmNode('option','',item.label);option.value=item.id;select.append(option);}
  const phone=field('WhatsApp (destino editable)',pmNode('input'));phone.type='tel';phone.value=client.phone||'';
  const message=field('Mensaje',pmNode('textarea'));message.rows=7;message.maxLength=2000;message.value='';let lastSuggested='';
  controls.append(pmNode('p','pm-help','En celular, elige WhatsApp y confirma el contacto al compartir. En PC, se descarga el PDF y se abre el chat para adjuntarlo manualmente.'));
  const alert=pmNode('p','pm-error');alert.setAttribute('role','status');controls.append(alert);
  const actions=pmNode('div','pm-report-buttons');
  const downloadBtn=pmNode('button','btn btn-outline','Descargar PDF'),shareBtn=pmNode('button','btn btn-primary','Enviar por WhatsApp');
  for(const b of [downloadBtn,shareBtn])b.type='button';
  actions.append(downloadBtn,shareBtn);content.append(controls,preview);dialog.append(header,content,actions);layer.append(shade,dialog);
  let model=null;
  const fresh=()=>{
   if(!cloudReady||cloudBlocked||cloudOffline||!cloudQueue||cloudQueue.pending||cloudQueue.latest!==cloudQueue.confirmed)throw Error('Sincroniza los cambios antes de emitir el estado de cuenta.');
   const active=context?new Set(contractCollectionsScope(db,rid).sales.filter(s=>s.clientId===clientId).map(s=>s.clientId)):new Set(pmSales().map(s=>s.clientId));if(active.size!==1||!active.has(clientId)||(!context&&residence().id!==rid))throw Error('El cliente cambió. Cierra y vuelve a abrir el estado de cuenta.');
   return pmStatementModel(pmAmortizationModel(db,clientId,rid,businessToday(),reconcileInstallments,installmentDueCents,(date,i)=>dateKey(addMonths(date,i)),select.value||null));
  };
  const refresh=()=>{try{model=fresh();pmStatementPreview(preview,model);const suggested=lgStatementMessage(model,db.company.name||'GRUPO H',clientWhatsappPhone(lgWhatsAppStatementSettings().phone));if(!message.value||message.value===lastSuggested)message.value=suggested;lastSuggested=suggested;alert.textContent='';downloadBtn.disabled=shareBtn.disabled=false;}catch(e){model=null;preview.replaceChildren(pmNode('p','',e.message));alert.textContent=e.message;downloadBtn.disabled=shareBtn.disabled=true;}};
  select.onchange=refresh;
  const deliver=async share=>{
   try{
    const updated=fresh();if(JSON.stringify(updated)!==JSON.stringify(model)){refresh();throw Error('Los datos cambiaron. Revisa la vista previa y vuelve a confirmar.');}
    const pdf=pmStatementPdf(updated),name='LOTIGEST_Estado_de_cuenta_'+updated.asOf+'.pdf';
    if(!share){download(name,pdf,'application/pdf');return;}
    const summary=message.value;
    const target=clientWhatsappPhone(phone.value);if(!target)throw Error('Ingresa un número válido de WhatsApp.');
    if(typeof File==='function'){
     const file=new File([pdf],name,{type:'application/pdf'});
     if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Estado de cuenta',text:summary+'\nDestino: +'+target});return;}
    }
    // No WhatsApp API configured: open the addressed chat, never claim attachment or automatic send.
    download(name,pdf,'application/pdf');
    window.open('https://wa.me/'+target+'?text='+encodeURIComponent(summary),'_blank','noopener,noreferrer');
    alert.textContent='PDF descargado. Adjunta el archivo al chat y confirma el envío.';
   }catch(e){if(e.name!=='AbortError')alert.textContent=e.message||'No se pudo compartir el PDF.';}
  };
  downloadBtn.onclick=()=>deliver(false);shareBtn.onclick=()=>deliver(true);
  shade.onclick=()=>pmClosePaymentHistory();pmReportsKeyboard(layer,dialog);document.body.append(layer);pmHistoryLayer=layer;refresh();if(context?.share&&!shareBtn.disabled)shareBtn.focus();else close.focus();
 }catch(e){toast(e.message,'error');}
}
