// Panel independiente: el OCR ayuda a identificar, nunca confirma un abono sin revisión.
let ocrAbonosDraft=null;
const beforeOcrPanelContent=pageContent;
pageContent=function(){
 if(page!=='ocr-abonos')return beforeOcrPanelContent();
 if(cloudUser?.role!=='admin')return header('Acceso restringido','Solo administradores pueden revisar recibos y pagos OCR.');
 return residencePicker()+ocrAbonosPage();
};
function ocrAvailableClients(){
 const rid=residence().id;
 return db.clients.filter(c=>lotigestOcrAbonos.ownerLotsForOcr(db,c.id,rid).length);
}
function ocrAbonosPage(){
 if(ocrAbonosDraft&&ocrAbonosDraft.rid!==residence().id)ocrAbonosDraft=null;
 return header('Pagos de abonos OCR','Escanea recibos Grupo H, identifica propietario y solares, verifica duplicados y revisa las cuotas sin inventar deudas.')+
 `<section class="card card-padding" style="margin:14px 0">
 <h2>1. Leer recibo de caja</h2>
 <form id="ocr-abonos-form">${receiptOcrWidget()}</form>
 <p class="sm">La fotografía se procesa en tu dispositivo. No crea cobros hasta que confirmes el cliente, los solares y el recibo original.</p>
 </section>
 <section class="card card-padding" style="margin:14px 0"><h2>2. Identificar propietario, solares y pago</h2>
 <div id="ocr-abonos-detail">${ocrAbonosDraft?ocrDetailsMarkup(): '<p>Escanea un recibo para buscar al propietario y revisar los datos.</p>'}</div></section>
 <section class="card card-padding" style="margin:14px 0"><h2>3. Calendario de meses</h2>
 <div id="ocr-abonos-months">${ocrAbonosDraft?.clientId?ocrMonthsMarkup(ocrAbonosDraft.clientId):'<p>Al identificar al propietario se mostrará su historial y, si tiene un contrato con fechas verificadas, el calendario mensual.</p>'}</div>
 </section>`;
}
function ocrHtmlLot(l){
 return 'Etapa '+(l.stage||'por confirmar')+' · Bloque '+l.block+' · Solar '+(l.sourceNumber||l.number||l.id);
}
function ocrDetailsMarkup(){
 const d=ocrAbonosDraft;if(!d)return '';
 const rid=residence().id,clients=ocrAvailableClients();
 const visible=d.clientId&&clients.some(c=>c.id===d.clientId)?clients:[...clients];
 const lots=d.clientId?lotigestOcrAbonos.ownerLotsForOcr(db,d.clientId,rid):[];
 const duplicate=lotigestOcrAbonos.receiptDuplicate(db,{...d.fields,reference:d.reference,amount:d.amount,date:d.date},rid,d.clientId,d.selectedLotIds);
 const warnings=[...d.matchWarnings,...d.fields.warnings,...(duplicate.warning?[duplicate.warning]:[])];
 const dateValue=d.date&&d.date<=businessToday()?d.date:'';
 const options=visible.map(c=>`<option value="${esc(c.id)}" ${d.clientId===c.id?'selected':''}>${esc(c.name)}${c.identity?' · '+esc(c.identity):''}</option>`).join('');
 return `<p>El OCR sugiere los datos; debes confirmar cada campo.</p>
 <label>Nombre leído en el recibo<input id="ocr-name" readonly value="${esc(d.fields.name||'No identificado')}"></label>
 <label>Propietario registrado<select id="ocr-client" required><option value="">Seleccionar propietario</option>${options}</select></label>
 <p class="sm">${d.clientId?'Coincidencia en LOTIGEST: '+esc(getClient(d.clientId)?.name||''): 'No se confirmó automáticamente el nombre. Elige la persona correcta.'}</p>
 <fieldset style="border:1px solid var(--border,#cbd5db);padding:10px;border-radius:9px"><legend>Solares del propietario</legend>
 ${lots.length?lots.map(l=>`<label style="display:block;padding:6px"><input type="checkbox" data-ocr-solar value="${esc(l.id)}" ${d.selectedLotIds.includes(l.id)?'checked':''}> ${esc(ocrHtmlLot(l))}</label>`).join(''):'Selecciona un cliente que tenga solares en esta residencial.'}
 </fieldset>
 ${lots.length>1?'<p class="sm">Si el recibo cubre varios solares, selecciónalos. El importe se conserva una sola vez y no se divide automáticamente.</p>':''}
 <div class="form-grid" style="margin-top:14px">
 <label>Fecha del pago<input id="ocr-date" type="date" max="${businessToday()}" value="${esc(dateValue)}" required></label>
 <label>Monto recibido (L.)<input id="ocr-amount" type="number" min=".01" step=".01" value="${d.amount==null?'':esc(String(d.amount))}" required></label>
 ${receiptMethodField().replace('name="method"','name="ocrMethod" id="ocr-method"')}
 <label>Folio del recibo original<input id="ocr-reference" maxlength="80" value="${esc(d.reference||'')}" required></label></div>
 <div id="ocr-duplicate" role="alert" style="margin:10px 0">${duplicate.duplicate?'<p style="color:#bd3742;font-weight:bold">'+esc(duplicate.reason)+'</p>':''}</div>
 ${warnings.length?'<div class="notice-card">'+warnings.map(w=>'<p>'+esc(w)+'</p>').join('')+'</div>':''}
 <label style="display:block;margin:12px 0"><input id="ocr-reviewed" type="checkbox"> Verifiqué el recibo original, la persona, los solares, la fecha y que no está registrado anteriormente.</label>
 <p id="ocr-action-error" role="alert" style="color:#bd3742"></p>
 <button type="button" class="btn btn-primary" data-action="ocr-confirm" ${duplicate.duplicate?'disabled':''}>Continuar al formulario de abono</button>`;
}
function ocrMonthsMarkup(clientId){
 const rows=lotigestOcrAbonos.verifiedInstallments(db,clientId,residence().id,businessToday());
 const counts={paid:0,late:0,partial:0,pending:0};for(const row of rows)counts[row.status]=(counts[row.status]||0)+1;
 const grouped=new Map();
 for(const r of rows){if(!grouped.has(r.lotId))grouped.set(r.lotId,[]);grouped.get(r.lotId).push(r);}
 const monthName=m=>{const [y,n]=m.split('-');return new Intl.DateTimeFormat('es-HN',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(Number(y),Number(n)-1,10)));};
 const colors={paid:['#e2f7ec','#086b40','Pagado'],late:['#ffe5e5','#aa2424','Vencido'],partial:['#fff0cf','#835806','Parcial'],pending:['#eaf0f7','#4a617b','Pendiente']};
 if(!rows.length){
   const paid=(db.ownerPayments||[]).filter(p=>p.clientId===clientId&&p.residenceId===residence().id);
   const historic=(db.historicalPayments||[]).filter(p=>p.clientId===clientId&&p.residenceId===residence().id);
   return `<p><strong>Calendario contractual por verificar.</strong> No se pintan meses en rojo sin precio, fecha de vencimiento y plazo confirmados.</p>
   <p>Recibos de propietario: ${paid.length} · Movimientos históricos: ${historic.length}</p>
   ${paid.length?'<h3>Pagos registrados</h3>'+paid.slice(0,40).map(p=>'<div style="padding:8px;border-bottom:1px solid #ccc"><span style="background:#e2f7ec;color:#086b40;padding:4px 8px;border-radius:6px">Registrado</span> · '+esc(p.date)+' · '+money(p.amountCents/100)+' · '+esc(p.concept)+'</div>').join(''):''}`;
 }
 return `<p><strong>${counts.paid} pagados</strong> · ${counts.late} vencidos · ${counts.partial} parciales · ${counts.pending} pendientes.</p>
 <p class="sm">Verde: cuota totalmente cubierta; rojo: cuota vencida con saldo; amarillo: abono parcial; gris: próxima cuota. La prima y pagos documentales no se aplican automáticamente a mensualidades sin conciliación del contrato.</p>
 ${[...grouped.entries()].map(([lotId,list])=>`<h3>${esc(ocrHtmlLot(getLot(lotId)))}</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px">
 ${list.map(r=>{const [bg,color,label]=colors[r.status];return `<div style="border-radius:9px;background:${bg};color:${color};padding:10px"><strong>${esc(monthName(r.month))}</strong><p style="margin:5px 0">${label}</p><small>Cuota: ${money(r.dueCents/100)}<br>Pendiente: ${money(r.remainingCents/100)}</small></div>`;}).join('')}
 </div>`).join('')}`;
}
const originalApplyReceiptOcr=receiptApplyOcr;
receiptApplyOcr=function(button){
 const form=button.closest('form');
 if(form?.id!=='ocr-abonos-form')return originalApplyReceiptOcr(button);
 const fields=window.lotigestPaperReceipt?.extractPaperReceipt(form.querySelector('[data-paper-ocr-text]')?.value||'');
 if(!fields){receiptOcrStatus(form,'No se cargó el extractor de recibos.');return;}
 const raw=form.querySelector('[data-paper-ocr-text]')?.value||'',rid=residence().id;
 const match=lotigestOcrAbonos.matchOcrReceipt(db,fields,raw,rid);
 ocrAbonosDraft={rid,fields,rawText:raw,clientId:match.clientId,selectedLotIds:match.selectedLotIds,matchWarnings:match.warnings,reference:fields.reference||'',date:fields.date||'',amount:fields.amount};
 const details=$('#ocr-abonos-detail'),months=$('#ocr-abonos-months');
 if(details)details.innerHTML=ocrDetailsMarkup();
 if(months)months.innerHTML=match.clientId?ocrMonthsMarkup(match.clientId):'<p>Elige al cliente para consultar sus meses.</p>';
 receiptOcrStatus(form,'Texto detectado: verifica cliente, solares, fecha e importe. Comprueba los recibos duplicados.');
};
function ocrRefreshDuplicate(){
 const d=ocrAbonosDraft,form=$('#ocr-abonos-detail');if(!d||!form)return;
 d.reference=$('#ocr-reference')?.value||'';d.date=$('#ocr-date')?.value||'';d.amount=$('#ocr-amount')?.value||'';
 const result=lotigestOcrAbonos.receiptDuplicate(db,{reference:d.reference,date:d.date,amount:d.amount},d.rid,d.clientId,d.selectedLotIds);
 const status=$('#ocr-duplicate');if(status)status.innerHTML=result.duplicate?'<p style="color:#bd3742;font-weight:bold">'+esc(result.reason)+'</p>':result.warning?'<p style="color:#835806">'+esc(result.warning)+'</p>':'<p style="color:#086b40">Folio sin coincidencias registradas.</p>';
 const button=form.querySelector('[data-action="ocr-confirm"]');if(button)button.disabled=!!result.duplicate;
}
function ocrOwnerChanged(id){
 if(!ocrAbonosDraft)return;
 ocrAbonosDraft.clientId=id||null;const lots=id?lotigestOcrAbonos.ownerLotsForOcr(db,id,residence().id):[];
  const ref=lotigestOcrAbonos.ocrReference(ocrAbonosDraft.rawText||'');const candidates=lots.filter(l=>ref.block&&ref.solar&&String(l.block).toUpperCase()===ref.block&&String(Number(l.sourceNumber||l.number))===String(Number(ref.solar))&&(ref.stage==null||Number(l.stage)===ref.stage));ocrAbonosDraft.selectedLotIds=candidates.length===1?[candidates[0].id]:lots.length===1?[lots[0].id]:[];
 const details=$('#ocr-abonos-detail');if(details)details.innerHTML=ocrDetailsMarkup();
 const months=$('#ocr-abonos-months');if(months)months.innerHTML=id?ocrMonthsMarkup(id):'Elige un propietario.';
}
function ocrContinue(){
 const d=ocrAbonosDraft;if(!d||d.rid!==residence().id){toast('Escanea un recibo de esta residencial.','error');return;}
 const setError=m=>{const el=$('#ocr-action-error');if(el)el.textContent=m;else toast(m,'error');};
 d.clientId=$('#ocr-client')?.value||null;
 d.selectedLotIds=[...document.querySelectorAll('[data-ocr-solar]:checked')].map(x=>x.value);
 d.reference=$('#ocr-reference')?.value?.trim()||'';d.date=$('#ocr-date')?.value||'';d.amount=$('#ocr-amount')?.value||'';
 const method=$('#ocr-method')?.value||'Efectivo';
 if(!d.clientId||!getClient(d.clientId))return setError('Confirma primero el propietario.');
 if(!d.selectedLotIds.length||d.selectedLotIds.length>30)return setError('Selecciona entre uno y 30 solares del cliente.');
 const owners=lotigestOcrAbonos.ownerLotsForOcr(db,d.clientId,d.rid);
 if(d.selectedLotIds.some(id=>!owners.some(l=>l.id===id)))return setError('Los solares seleccionados no pertenecen al propietario.');
 if(!d.reference||d.reference.length>80)return setError('Escribe el folio impreso en el recibo para impedir duplicados.');
 const dateValid=lotigestLedger.parseHistoryDate(d.date);if(!dateValid||dateValid>businessToday())return setError('Verifica la fecha real del pago.');
 const cents=Math.round(Number(d.amount)*100);if(!Number.isSafeInteger(cents)||cents<=0||Math.abs(Number(d.amount)*100-cents)>.00001)return setError('Confirma un monto positivo con hasta dos decimales.');
 const dupe=lotigestOcrAbonos.receiptDuplicate(db,{reference:d.reference,date:d.date,amount:d.amount},d.rid,d.clientId,d.selectedLotIds);
 if(dupe.duplicate)return setError(dupe.reason);
 if(!$('#ocr-reviewed')?.checked)return setError('Debes confirmar que revisaste el recibo, la persona, los solares y los posibles duplicados.');
 if(!['Efectivo','Transferencia','Tarjeta'].includes(method))return setError('Selecciona un método de pago válido.');
 // El ingreso sigue el flujo que ya valida saldos y conserva los recibos.
 const selectedSales=db.sales.filter(s=>d.selectedLotIds.includes(s.lotId)&&s.clientId===d.clientId&&balance(s)>.009);
 if(selectedSales.length===1&&d.selectedLotIds.length===1){
   const sale=selectedSales[0];baseNewPayment(sale.id,false);
   const form=$('#multi-payment-form');if(!form)return setError('No se abrió el formulario de ventas.');
   if(form.elements.date)form.elements.date.value=d.date;
   if(form.elements.method)form.elements.method.value=method;
   if(form.elements.receiptRef){form.elements.receiptRef.value=d.reference;form.elements.receiptRef.dispatchEvent(new Event('input',{bubbles:true}));}
   if(form.elements.concept)form.elements.concept.value='Abono respaldado por recibo OCR';
   if(paymentDraft?.amounts&&Number(d.amount)<=balance(sale)){paymentDraft.amounts[sale.id]=d.amount;renderPaymentSelected();}
   else toast('Monto mayor que el saldo de la venta: corrígelo antes de guardar.','error');
   return;
 }
 openOwnerAbono(d.clientId,d.rid);
 const manual=$('#manual-history-form'),owner=$('#owner-abono-form');
 const form=manual||owner;if(!form)return setError('Revisa las fichas o ventas de este cliente antes de abonar.');
 if(form.elements.date)form.elements.date.value=d.date;
 if(form.elements.method)form.elements.method.value=method;
 if(form.elements.receiptRef){form.elements.receiptRef.value=d.reference;form.elements.receiptRef.dispatchEvent(new Event('input',{bubbles:true}));}
 if(manual){
   if(form.elements.amount)form.elements.amount.value=d.amount;
   for(const cb of form.querySelectorAll('[data-manual-lot]'))cb.checked=d.selectedLotIds.includes(cb.value);
   return;
 }
 const assignments=[...owner.querySelectorAll('[data-owner-statement]')];
 const matches=assignments.map(el=>{
  const statement=(db.ownershipStatements||[]).find(s=>s.id===el.dataset.ownerStatement);
  if(!statement)return null;
  const index=el.dataset.ownerReference==='group'?null:Number(el.dataset.ownerReference);
  try{const refs=lotigestOwnerPayments.ownerAllocationReferences(db,statement,index).map(r=>r.lotId).filter(Boolean);return {el,refs};}catch{return null;}
 }).filter(Boolean);
 const target=matches.find(m=>m.refs.length===d.selectedLotIds.length&&m.refs.every(id=>d.selectedLotIds.includes(id)));
 if(target&&Number(d.amount)>0){target.el.value=d.amount;target.el.dispatchEvent(new Event('input',{bubbles:true}));}
 else toast('El recibo afecta varios solares o fichas; distribuye manualmente su importe antes de guardar.','error');
}
document.addEventListener('change',e=>{
 const el=e.target;
 if(el.id==='ocr-client')ocrOwnerChanged(el.value);
 if(el.matches?.('[data-ocr-solar]')&&ocrAbonosDraft){ocrAbonosDraft.selectedLotIds=[...document.querySelectorAll('[data-ocr-solar]:checked')].map(x=>x.value);ocrRefreshDuplicate();}
 if(['ocr-reference','ocr-date','ocr-amount'].includes(el.id))ocrRefreshDuplicate();
});
document.addEventListener('input',e=>{if(['ocr-reference','ocr-date','ocr-amount'].includes(e.target.id))ocrRefreshDuplicate();});
document.addEventListener('click',e=>{if(e.target.closest?.('[data-action="ocr-confirm"]'))ocrContinue();});
