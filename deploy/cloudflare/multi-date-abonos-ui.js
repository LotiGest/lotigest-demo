(function installLotigestMultiDateAbonos(){
 'use strict';
 let mdState=null,mdSaving=false,mdSaved=null,mdLastPaymentTarget=null,mdStage='data',mdReviewedKey=null;
 const mdById=id=>mdState?.rows.find(r=>r.id===id);
 const mdRoot=()=>document.getElementById('md-abonos-form');
 const mdToday=()=>businessToday();
 const mdFmt=amount=>money(Number(amount)||0);
 const mdSafe=val=>esc(String(val??''));

 const mdMonths=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 // Escritura rápida: 251125 → 25/11/2025. No se requieren plecas;
 // un año de dos cifras siempre significa 20xx (25 = 2025).
 function mdDateAutoSlash(raw,caret){
  const text=String(raw??'');
  if(!/^[0-9\s/.\-]*$/.test(text)||/^\d{4}-\d{1,2}-\d{1,2}$/.test(text))
   return {display:text,caret:caret??text.length};
  const digits=text.replace(/\D/g,'').slice(0,8);
  const prefix=text.slice(0,caret??text.length).replace(/\D/g,'').length;
  const show=d=>d.slice(0,2)+(d.length>2?'/'+d.slice(2,4):'')+(d.length>4?'/'+d.slice(4):'');
  return {display:show(digits),caret:show(digits.slice(0,prefix)).length};
 }
 function mdDateISO(raw){
  const text=String(raw??'').trim().replace(/\s+/g,' ');
  const clean=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const fullYear=y=>String(y).length===2?2000+Number(y):Number(y);
  let year,month,day,m=clean.match(/^((?:19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
  if(m){year=+m[1];month=+m[2];day=+m[3];}
  else if((m=clean.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|(?:19|20)\d{2})$/))){day=+m[1];month=+m[2];year=fullYear(m[3]);}
  else if((m=clean.match(/^(\d{2})(\d{2})(\d{2}|(?:19|20)\d{2})$/))){day=+m[1];month=+m[2];year=fullYear(m[3]);}
  else if((m=clean.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\.?\s+(?:de\s+)?(\d{2}|(?:19|20)\d{2})$/))){
   const names=mdMonths.map(s=>s.toLowerCase());
   const full=names.findIndex(n=>n===m[2]);
   const shortened=names.findIndex(n=>n.startsWith(m[2])&&m[2].length>=3);
   month=(full>=0?full:shortened)+1;day=+m[1];year=fullYear(m[3]);
  }else return null;
  if(!Number.isInteger(year)||year<1990||year>2100||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1||day>31)return null;
  const iso=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  const date=new Date(iso+'T12:00:00Z');
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===iso?iso:null;
 }
 function mdHumanDate(iso){
  const m=String(iso||'').match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if(!m||!mdDateISO(iso))return '';
  return Number(m[3])+' '+mdMonths[Number(m[2])-1]+' '+m[1];
 }
 function mdMoneyInput(raw){
  return typeof pmLempiraParts==='function'?pmLempiraParts(raw):
   {value:String(raw??'').replace(/,/g,''),display:String(raw??'')};
 }
 function mdMoneyText(raw){
  if(!raw)return '';
  return typeof pmLempiraFormat==='function'?pmLempiraFormat(raw):
   Number(raw).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 }

 // Último pago por venta o por ficha, nunca por cliente completo.
 function mdLastPaymentFor(state,data,statementId,highest=false){
  if(!state||!data)return null;
  const owner=state.kind==='owner';
  const source=owner?(data.ownerPayments||[]).filter(p=>p.clientId===state.clientId&&p.residenceId===state.residenceId)
   :(data.payments||[]).filter(p=>(state.saleIds||[state.saleId]).includes(p.saleId));
  const grouped=[];
  for(const p of source){
   if(p.voidedAt||['voided','cancelled'].includes(p.status))continue;
   if(!owner&&p.groupId){const found=grouped.find(x=>x.groupId===p.groupId);if(found){found.amount=Number(found.amount)+Number(p.amount);continue;}}
   grouped.push({...p});
  }
  return grouped.map(p=>({
   date:p.date,recordedAt:p.recordedAt,reference:p.receiptReference||p.receiptRef||p.originalReceiptRef||p.receiptReferenceNormalized||'',
   concept:p.concept||'',amount:owner?(p.allocations||[]).filter(a=>a.statementId===statementId).reduce((n,a)=>n+Number(a.amountCents||0),0)/100:Number(p.amount),
   voidedAt:p.voidedAt,status:p.status
  })).filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(String(p.date||''))&&p.date<=mdToday()&&Number.isFinite(p.amount)&&p.amount>0&&
   !p.voidedAt&&!['voided','cancelled'].includes(p.status))
  .filter(p=>!highest||/^\d+$/.test(p.reference)).sort((a,b)=>{
   if(highest){const x=BigInt(a.reference),y=BigInt(b.reference);if(x!==y)return x>y?-1:1;}
   return b.date.localeCompare(a.date)||String(b.recordedAt||'').localeCompare(String(a.recordedAt||''));
  })[0]||null;
 }
 function mdLastPaymentBody(state,data,statementId){
  const p=mdLastPaymentFor(state,data,statementId);
  if(!p)return '<strong class="md-last-empty">No hay pagos registrados con fecha y monto para '+(state.kind==='sale'?'este solar.':'esta ficha.')+'</strong>';
  const high=mdLastPaymentFor(state,data,statementId,true);
  return '<div class="md-last-grid">'+
   '<div class="md-last-cell md-last-date"><span class="md-last-cell-icon" aria-hidden="true">▦</span><span class="md-last-cell-details"><small>Fecha</small><strong>'+mdSafe(mdHumanDate(p.date)||p.date)+'</strong></span></div>'+
   '<div class="md-last-cell md-last-ref"><span class="md-last-cell-icon" aria-hidden="true">#</span><span class="md-last-cell-details"><small>Correlativo</small><strong class="md-last-folio">'+mdSafe(p.reference||'Sin correlativo')+'</strong></span></div>'+
   '<div class="md-last-cell md-last-amount"><span class="md-last-cell-icon" aria-hidden="true">L</span><span class="md-last-cell-details"><small>Monto '+(state.kind==='owner'?'aplicado':'pagado')+'</small><strong class="md-last-money">'+mdSafe(mdFmt(p.amount))+'</strong></span></div>'+
   '</div>'+(high&&high.reference!==p.reference?'<p class="md-last-description">Mayor correlativo registrado: <strong class="md-last-folio"># '+mdSafe(high.reference)+'</strong> · '+mdSafe(mdHumanDate(high.date))+' · '+mdSafe(mdFmt(high.amount))+'</p>':'')+(/\bprima\b/i.test(p.concept)?'<small class="md-last-description">Prima inicial; no cuenta como cuota mensual.</small>':'');
 }
 function mdLastPaymentMarkup(state,data,statementId,rowId){
  return '<aside class="md-last-payment" role="status" '+(rowId?'data-md-last-payment-row="'+mdSafe(rowId)+'"':'data-md-last-payment')+'>'+
   '<div class="md-last-heading"><span class="md-last-heading-icon" aria-hidden="true">▤</span><strong>Último pago '+(state.kind==='owner'?'de esta ficha':'registrado')+'</strong></div>'+
   '<div class="md-last-content">'+mdLastPaymentBody(state,data,statementId)+'</div></aside>';
 }

 function mdCreateEntry(){
  return {id:'MDR'+crypto.randomUUID().replace(/-/g,''),date:'',dateText:'',amount:'',receiptRef:'',statementId:mdState?.docs?.[0]?.id||'',photo:null,preview:null,status:'',dateEdited:false,amountEdited:false,amountSuggested:false,refEdited:false,refSuggested:false,expanded:false};
 }
 function mdStartSale(saleId){
  if(!cloudReady||cloudUser?.role!=='admin')return toast('Se requiere acceso de administrador para registrar abonos.','error');
  const sale=getSale(saleId),lot=getLot(sale?.lotId),client=getClient(sale?.clientId);
  if(!sale||!lot||!client||sale.type!=='credit'||balance(sale)<.01)return toast('Selecciona un solar con crédito y saldo pendiente.','error');
  if(cloudBlocked||cloudBusy||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)return toast('Sincroniza primero los cambios pendientes antes de registrar varios pagos.','error');
  const clientSales=db.sales.filter(x=>x.clientId===client.id&&x.type==='credit'&&getLot(x.lotId)?.residenceId===lot.residenceId&&balance(x)>.009);
  mdState={kind:'sale',saleId:sale.id,saleIds:clientSales.map(x=>x.id),clientId:client.id,residenceId:lot.residenceId,clientName:client.name,lotLabel:clientSales.map(x=>{const l=getLot(x.lotId);return 'Etapa '+(l.stage||'—')+' · Bloque '+l.block+' · Solar '+(l.sourceNumber||l.id);}).join(' / ')+' · Abono total repartido según las cuotas',snapshot:JSON.stringify(db),rows:[],docs:[]};
  mdState.rows.push(mdCreateEntry());mdState.rows.push(mdCreateEntry());
  mdState.rows[0].expanded=true;
  if(typeof nextReceiptSuggestion==='function'){const ref=nextReceiptSuggestion(db);if(ref){mdState.rows[0].receiptRef=ref;mdState.rows[0].refSuggested=true;}}
  mdLastPaymentTarget={kind:'sale',saleId:sale.id};
  mdSaved=null;mdShow();
 }
 function mdStartOwner(clientId,rid){
  if(!cloudReady||cloudUser?.role!=='admin')return toast('Se requiere acceso de administrador para registrar abonos.','error');
  const client=getClient(clientId);if(!client)return toast('No se encontró el propietario.','error');
  const docs=(db.ownershipStatements||[]).filter(x=>x.clientId===clientId&&x.residenceId===rid&&!(x.contractIds||[]).some(id=>(db.historicalContracts||[]).find(c=>c.id===id)?.saleId));
  if(!docs.length){
   const sale=db.sales.find(x=>x.clientId===clientId&&getLot(x.lotId)?.residenceId===rid&&balance(x)>.009);
   if(sale)return mdStartSale(sale.id);
   return toast('No existen fichas de solares con saldo para registrar varios abonos.','error');
  }
  if(cloudBlocked||cloudBusy||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)return toast('Sincroniza primero los cambios pendientes antes de registrar varios pagos.','error');
  mdState={kind:'owner',clientId,residenceId:rid,clientName:client.name,lotLabel:'Fichas de propietario · '+docs.length+' documento(s)',docs,snapshot:JSON.stringify(db),rows:[]};
  mdState.rows.push(mdCreateEntry());mdState.rows.push(mdCreateEntry());
  mdState.rows[0].expanded=true;
  if(typeof nextReceiptSuggestion==='function'){const ref=nextReceiptSuggestion(db);if(ref){mdState.rows[0].receiptRef=ref;mdState.rows[0].refSuggested=true;}}
  mdLastPaymentTarget={kind:'owner',clientId,residenceId:rid};
  mdSaved=null;mdShow();
 }
 function mdStartOwnerToken(token){
  const group=collectionGroupFromToken(token),rid=group.rid;
  if(!group.group||!rid)return toast('No se encontró la ficha del solar.','error');
  const clients=[...new Set(group.group.statements.map(s=>s.clientId).filter(Boolean))];
  if(clients.length===1)return mdStartOwner(clients[0],rid);
  if(clients.length<1)return toast('Este solar no tiene propietario confirmado.','error');
  showModal('Elegir propietario para varios abonos','<p>Confirma el propietario antes de registrar los recibos.</p>'+clients.map(id=>'<button type="button" class="btn btn-outline" data-md-pick-owner="'+mdSafe(id)+'" data-md-rid="'+mdSafe(rid)+'">'+mdSafe(getClient(id)?.name||id)+'</button>').join(''),'<button class="btn btn-soft" data-action="close-modal">Cancelar</button>',true);
 }
 function mdRowMarkup(row,index){
  const open=Boolean(row.expanded);
  const options=mdState.kind==='owner'?'<label class="md-lot-choice">Ficha / solares<select data-md-field="statementId" data-md-id="'+mdSafe(row.id)+'">'+mdState.docs.map(s=>'<option value="'+mdSafe(s.id)+'" '+(s.id===row.statementId?'selected':'')+'>'+mdSafe(s.sourceName||'Ficha')+' · '+mdSafe((s.references||[]).map(r=>'B '+r.block+' / S '+r.lot).join(', ')||'Solar por confirmar')+'</option>').join('')+'</select></label>':'';
  return '<article class="md-row'+(open?'':' md-row-collapsed')+'" data-md-row="'+mdSafe(row.id)+'">'+
   '<div class="md-row-top"><button type="button" class="md-row-toggle" data-md-toggle-row="'+mdSafe(row.id)+'" aria-controls="md-row-body-'+mdSafe(row.id)+'" aria-expanded="'+open+'"><span class="md-row-icon" aria-hidden="true">▤</span><strong>Abono '+(index+1)+'</strong><span class="md-row-summary" data-md-summary="'+mdSafe(row.id)+'">'+mdRowSummary(row)+'</span></button>'+
   '<div class="md-row-actions"><button type="button" class="md-manual-focus" data-md-edit="'+mdSafe(row.id)+'" aria-label="Escribir fecha, monto y correlativo del abono '+(index+1)+'">✎ Escribir</button>'+
   '<button type="button" class="md-trash" title="Quitar este abono" aria-label="Quitar abono '+(index+1)+'" data-md-remove="'+mdSafe(row.id)+'">✕</button>'+
   '<button type="button" class="md-row-chevron" data-md-toggle-row="'+mdSafe(row.id)+'" aria-controls="md-row-body-'+mdSafe(row.id)+'" aria-expanded="'+open+'" aria-label="'+(open?'Contraer':'Desplegar')+' abono '+(index+1)+'"><span aria-hidden="true">'+(open?'⌃':'⌄')+'</span></button></div></div>'+
   '<div class="md-row-body" id="md-row-body-'+mdSafe(row.id)+'"'+(open?'':' hidden')+'>'+options+
    (mdState.kind==='owner'&&mdState.docs.length>1?mdLastPaymentMarkup(mdState,db,row.statementId,row.id):'')+
   '<div class="md-manual-head"><span>Escribe la fecha del recibo · Enter avanza al siguiente abono.</span></div>'+
   '<div class="md-fields"><label class="md-date-label">Fecha *<span class="md-date-control"><input type="text" inputmode="numeric" autocomplete="off" spellcheck="false" data-md-field="date" data-md-id="'+mdSafe(row.id)+'" value="'+mdSafe(row.dateText??mdHumanDate(row.date))+'" placeholder="DD/MM/AA · sin /" enterkeyhint="next" aria-label="Escribe los seis números de la fecha sin plecas; ejemplo 251125 es 25 de noviembre de 2025" required><span class="md-date-calendar" aria-hidden="true">▦</span><input type="date" class="md-native-date" data-md-picker="'+mdSafe(row.id)+'" aria-label="Elegir fecha en calendario" value="'+mdSafe(row.date||'')+'" max="'+mdSafe(mdToday())+'" tabindex="0"></span></label>'+
   '<label class="md-amount-label">Monto (L) *<span class="md-money-control"><span class="md-money-symbol" aria-hidden="true">L</span><input type="text" inputmode="decimal" autocomplete="off" data-md-field="amount" data-md-id="'+mdSafe(row.id)+'" value="'+mdSafe(mdMoneyText(row.amount))+'" placeholder="Ej. 12,000.00" enterkeyhint="next" aria-label="Escribir monto manual del abono en lempiras" required></span></label>'+
   '<label class="md-ref-label">Correlativo *<span class="md-ref-line"><span aria-hidden="true" class="md-ref-symbol">#</span><input type="text" inputmode="numeric" maxlength="80" pattern="[0-9]+" data-md-field="receiptRef" data-md-id="'+mdSafe(row.id)+'" value="'+mdSafe(row.receiptRef)+'" placeholder="Ej. 00006159" enterkeyhint="done" aria-label="Correlativo editable. Enter propone el siguiente correlativo y avanza al siguiente abono" required></span></label></div>'+
   '<div class="md-photo-row"><label class="md-scan-icon" title="Escanear o seleccionar foto" aria-label="Escanear recibo"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="8" width="10" height="9" rx="2"/><circle cx="12" cy="12.5" r="1.7"/></svg><span class="md-scan-caption">Escanear recibo</span><input type="file" accept="image/jpeg,image/png,image/webp" data-md-photo="'+mdSafe(row.id)+'" hidden></label>'+
   (row.preview?'<img src="'+mdSafe(row.preview)+'" class="md-photo-preview" alt="Recibo de este abono">':'')+
   '<span class="md-photo-status" data-md-photo-status="'+mdSafe(row.id)+'">'+mdSafe(row.status||(row.photo?'Recibo adjunto':'OCR opcional · escribe los datos manualmente o escanea'))+'</span>'+(row.photo?'<button type="button" class="md-ocr-retry" data-md-retry="'+mdSafe(row.id)+'" aria-label="Reintentar lectura OCR del recibo">Reintentar OCR</button>':'')+'</div>'+
   '<p class="md-ref-feedback" data-md-feedback="'+mdSafe(row.id)+'" role="status"></p></div></article>';
 }
 function mdRowSummary(row){
  const date=row.date?mdHumanDate(row.date):'';
  const ref=String(row.receiptRef||'').trim();
  const amount=Number(row.amount);
  const hasAmount=String(row.amount||'').trim()&&Number.isFinite(amount)&&amount>0;
  return '<span class="md-summary-date">'+(date?'Fecha: '+mdSafe(date.replace(/^(\d{1,2}) (\S+) (\d{4})$/u,(_,d,m,y)=>d+' de '+m.toLocaleLowerCase('es')+' '+y)):'Fecha pendiente')+'</span>'+
   '<span class="md-summary-ref">'+(ref?'# '+mdSafe(ref):'Sin correlativo')+'</span>'+
   '<span class="md-summary-amount">'+(hasAmount?'L '+mdSafe(mdMoneyText(row.amount)):'Sin monto')+'</span>'+
   (row.amountSuggested&&!row.date?'<small class="md-summary-suggested">Monto sugerido</small>':'');
 }
 function mdShow(){
  mdStage='data';mdReviewedKey=null;
  const contract=mdState.kind==='sale'?(db.contractTexts||[]).find(d=>d.saleId===mdState.saleId&&d.status!=='voided'):mdState.docs?.[0];
  const contractLabel=contract?.number||contract?.id||mdState.saleId||'Ficha de propietario';
  const last=mdLastPaymentFor(mdState,db,mdState.docs?.[0]?.id);
  const lastLine='<aside class="md-last-inline" role="status">▤ <span>Último pago: '+(last?mdSafe(mdHumanDate(last.date))+' · <b class="md-inline-ref">'+mdSafe(last.reference||'Sin correlativo')+'</b> · <b class="md-inline-money">'+mdSafe(mdFmt(last.amount))+'</b>':'Sin pagos registrados')+'</span></aside>';
  const header='<div class="md-client md-client-reference"><span class="md-client-avatar" aria-hidden="true"><svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/></svg></span><div><strong>'+mdSafe(mdState.clientName)+'</strong><span>Contrato: <b>'+mdSafe(contractLabel)+'</b></span><small>'+mdSafe(mdState.lotLabel.replace(/ · Abono total repartido según las cuotas$/,''))+'</small></div></div>'+lastLine+
    '<form id="md-abonos-form"><div id="md-abonos-list"></div><div class="md-wizard-totals"><button type="button" class="btn btn-outline md-add" data-md-add>+ Agregar abono</button><div class="md-total"><span><strong data-md-count>2</strong> abonos · Total <strong data-md-total>L 0.00</strong></span></div></div><p class="md-error" data-md-error role="alert"></p></form>';
  showModal('Abonos varios',header,'<button class="btn btn-outline" type="button" data-md-back>← Atrás</button><button class="btn btn-primary" type="button" data-md-next>Siguiente →</button><button class="btn btn-primary" type="button" data-md-save hidden>Guardar abonos</button>',true);
  const modal=document.querySelector('#modal-root .modal');if(modal)modal.classList.add('lg-multi-date-modal','md-wizard','md-reference-wizard');
  const modalHeader=modal?.querySelector('.modal-header');if(modalHeader){const brand=document.createElement('div');brand.className='md-brand-reference';brand.innerHTML='<span aria-hidden="true">▱</span> LOTIGEST <b>PRO</b>';modalHeader.prepend(brand);}
  const footerNote=document.createElement('small');footerNote.className='md-wizard-footer-note';footerNote.textContent='Revisarás el listado antes de guardar.';modal?.querySelector('.modal-footer')?.append(footerNote);
  const form=mdRoot();if(form){const steps=document.createElement('nav');steps.className='md-wizard-steps';steps.setAttribute('aria-label','Pasos del registro');steps.innerHTML='<span data-md-step-label="data"><i>1</i> Datos</span><span class="md-step-line" aria-hidden="true"></span><span data-md-step-label="review"><i>2</i> Revisión</span><span class="md-step-line" aria-hidden="true"></span><span data-md-step-label="confirm"><i>3</i> Confirmación</span>';modal.querySelector('.modal-content').prepend(steps);const tabs=document.createElement('nav');tabs.className='md-wizard-tabs';tabs.setAttribute('aria-label','Abonos del borrador');form.prepend(tabs);const review=document.createElement('section');review.id='md-review';review.hidden=true;form.append(review);}
  mdRenderRows();
 }
 function mdRenderRows(){
  const list=document.getElementById('md-abonos-list');if(!list||!mdState)return;
  list.innerHTML=mdState.rows.map(mdRowMarkup).join('');
  mdRefresh();mdWizardPaint();
 }
 function mdReviewSignature(rows){return JSON.stringify(rows.map(r=>[r.id,r.date,r.cents,r.raw,r.statementId,r.photo?.name||'',r.photo?.size||0,r.photo?.lastModified||0]));}
 function mdWizardPaint(){
  const modal=mdRoot()?.closest('.modal');if(!modal||!mdState)return;
  modal.dataset.mdStage=mdStage;
  const active=mdState.rows.find(r=>r.expanded)||mdState.rows[0];
  for(const row of mdState.rows){const card=document.querySelector('[data-md-row="'+row.id+'"]');if(card){card.hidden=mdStage!=='data'||row!==active;if(row===active){card.classList.remove('md-row-collapsed');card.querySelector('.md-row-body').hidden=false;}}}
  const activeTitle=active&&modal.querySelector('[data-md-row="'+active.id+'"] .md-row-toggle strong');if(activeTitle)activeTitle.textContent='Abono '+(mdState.rows.indexOf(active)+1)+' de '+mdState.rows.length;
  const tabs=modal.querySelector('.md-wizard-tabs');if(tabs)tabs.innerHTML=mdState.rows.map((r,i)=>'<button type="button" data-md-goto="'+mdSafe(r.id)+'" aria-current="'+(r===active?'step':'false')+'">Abono '+(i+1)+'</button>').join('');
  for(const label of modal.querySelectorAll('[data-md-step-label]'))label.classList.toggle('active',label.dataset.mdStepLabel===mdStage);
  const review=document.getElementById('md-review');if(review)review.hidden=mdStage!=='review';
  const save=modal.querySelector('[data-md-save]'),next=modal.querySelector('[data-md-next]');if(save)save.hidden=mdStage!=='review';if(next){next.hidden=mdStage!=='data';next.textContent=mdState.rows.indexOf(active)===mdState.rows.length-1?'Revisar listado →':'Siguiente →';}
 }
 function mdReview(){
  try{
   const rows=mdValidate();const plans=mdPreviewAllocations(rows);mdReviewedKey=mdReviewSignature(rows);mdStage='review';
   const host=document.getElementById('md-review');if(!host)return;
   const cents=rows.reduce((n,r)=>n+r.cents,0);
   host.innerHTML='<h3>Revisar abonos</h3><p>Verifica fechas, correlativos y montos antes de guardar.</p><div class="md-review-table"><table><thead><tr><th>Fecha</th><th>Correlativo</th><th>Monto</th><th>Acciones</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+mdSafe(mdHumanDate(r.date))+'</td><td class="md-review-ref">'+mdSafe(r.raw)+'</td><td class="md-review-money">'+mdSafe(mdFmt(r.cents/100))+(plans.has(r.id)?'<div class="sm muted">Cuota conjunta: '+mdSafe(mdFmt(plans.get(r.id).minimumCents/100))+(plans.get(r.id).shortfallCents>0?'<br>Abono parcial · consulta el faltante en el calendario':'')+'<br>Excedente: '+mdSafe(mdFmt(plans.get(r.id).excessCents/100))+'<br>'+plans.get(r.id).allocations.map(a=>{const s=db.sales.find(s=>s.id===a.saleId),l=getLot(s?.lotId);return mdSafe('B '+(l?.block||'—')+' / S '+(l?.sourceNumber||l?.id||'—')+': '+mdFmt(a.amount));}).join('<br>')+'</div>':'')+'</td><td><button type="button" data-md-goto="'+mdSafe(r.id)+'">Editar</button><button type="button" data-md-review-remove="'+mdSafe(r.id)+'">Quitar</button></td></tr>').join('')+'</tbody></table></div><div class="md-review-total">'+rows.length+' abono(s) · Total a registrar <strong>'+mdSafe(mdFmt(cents/100))+'</strong></div><p>Aún no se ha registrado ningún pago.</p><label class="md-review-confirm"><input type="checkbox" id="md-review-confirm"> He revisado la información</label>';
   mdWizardPaint();host.scrollIntoView?.({block:'start',behavior:'smooth'});
  }catch(e){mdError(e.message||'Revisa los abonos antes de continuar.');}
 }
 function mdBackToData(id){mdStage='data';mdReviewedKey=null;const row=id?mdById(id):mdState?.rows.find(r=>r.expanded)||mdState?.rows[0];if(row)mdExpandRow(row.id);mdWizardPaint();if(row)mdFocusField(row.id,'date');}
 function mdReturnToAbonos(){
  if(!mdSaved?.confirmed)return;
  closeModal();page='payments';render();
  if(mdSaved.kind==='sale'&&getSale(mdSaved.saleId)&&balance(getSale(mdSaved.saleId))>.009)newPayment(mdSaved.saleId,false);
  const total=mdSaved.items.reduce((n,r)=>n+Math.round(r.amount*100),0)/100;
  const banner=document.createElement('section');banner.className='md-result-banner';banner.setAttribute('role','status');banner.innerHTML='<strong>✓ '+mdSaved.items.length+' abonos guardados</strong><p>'+mdSafe(mdSaved.client)+' · Total registrado <b>'+mdSafe(mdFmt(total))+'</b></p><small>Cada abono conserva su fecha y correlativo.</small><button type="button" class="btn btn-outline" data-md-show-saved>Ver recibos</button>';
  const header=document.querySelector('#modal-root .modal-header');if(header)header.after(banner);else document.querySelector('.workspace-inner')?.prepend(banner);
 }
 function mdExpandRow(id){
  if(!mdState||!mdById(id))return false;
  const changed=mdState.rows.some(r=>Boolean(r.expanded)!==(r.id===id));
  mdState.rows.forEach(r=>{r.expanded=r.id===id;});
  if(changed)mdRenderRows();
  return true;
 }
 function mdToggleRow(id){
  const row=mdById(id);if(!row||!mdState)return;
  const shouldOpen=!row.expanded;
  mdState.rows.forEach(r=>{r.expanded=shouldOpen&&r.id===id;});
  mdRenderRows();
 }
 // Compatible con instalaciones que aún conservan el módulo anterior.
 function mdDuplicateMessage(state,raw){
  const api=window.lotigestOwnerPayments;
  if(typeof api?.findReceiptCorrelativo!=='function')throw Error('No se cargó la validación de recibos. Conserva los datos ingresados antes de actualizar LOTIGEST.');
  const match=api.findReceiptCorrelativo(state,raw);
  if(!match)return '';
  const p=match.kind==='venta'?state.payments?.find(x=>x.id===match.id):match.kind==='propietario'?state.ownerPayments?.find(x=>x.id===match.id):state.historicalPayments?.find(x=>x.id===match.id);
  const sale=state.sales?.find(x=>x.id===p?.saleId),contract=state.historicalContracts?.find(x=>x.id===p?.contractId);
  const name=state.clients?.find(x=>x.id===(sale?.clientId||p?.clientId||contract?.clientId))?.name||p?.clientName||p?.receiptInfo?.clientName||contract?.clientName||'Sin identificar';
  const fallback='El correlativo '+match.normalized+' ya está registrado. Cliente: '+name+(p?.date?' · Fecha: '+p.date:'')+'.';
  if(typeof api.receiptCorrelativoMessage==='function'){
   try{return api.receiptCorrelativoMessage(state,raw)||fallback;}catch{}
  }
  return fallback;
 }
 function mdRefresh(){
  if(!mdState)return;
  const entered=mdState.rows.filter(mdRowHasPayment);
  const total=entered.reduce((acc,r)=>acc+(Number(r.amount)||0),0);
  const totalEl=document.querySelector('[data-md-total]'),count=document.querySelector('[data-md-count]');
  if(totalEl)totalEl.textContent=mdFmt(total);if(count)count.textContent=String(entered.length);
  for(const r of mdState.rows){const summary=document.querySelector('[data-md-summary="'+r.id+'"]');if(summary)summary.innerHTML=mdRowSummary(r);}
  const references=new Map();
  for(const r of mdState.rows){
   const key=window.lotigestOwnerPayments?.normalizeReceiptCorrelativo(r.receiptRef);
   if(key==null||!r.receiptRef.trim())continue;
   references.set(key,(references.get(key)||0)+1);
  }
  for(const r of mdState.rows){
   const ref=r.receiptRef.trim(),key=window.lotigestOwnerPayments?.normalizeReceiptCorrelativo(ref);
   const el=document.querySelector('[data-md-feedback="'+r.id+'"]');
   if(!el)continue;
   let warning='';
   if(ref&&key===null)warning='El correlativo debe contener solamente números.';
   else if(ref&&references.get(key)>1)warning='Correlativo '+key+' repetido entre estas fechas.';
   else if(ref&&window.lotigestOwnerPayments?.findReceiptCorrelativo(db,ref))warning=mdDuplicateMessage(db,ref);
   el.textContent=warning||(ref?(r.refSuggested?'Correlativo sugerido (editable): ':'Se comprobará como ')+key:'');
   el.classList.toggle('invalid',Boolean(warning));
   const row=document.querySelector('[data-md-row="'+r.id+'"]');row?.classList.toggle('md-duplicate',Boolean(warning));
  }
 }
 function mdUpdateField(input){
  const row=mdById(input.dataset.mdId);if(!row)return;
  const field=input.dataset.mdField;
  if(!['date','amount','receiptRef','statementId'].includes(field))return;
  if(field==='date'){
   const old=input.value,caret=input.selectionStart??old.length;
   const formatted=mdDateAutoSlash(old,caret);
   if(formatted.display!==old){
    input.value=formatted.display;
    try{input.setSelectionRange(formatted.caret,formatted.caret);}catch{}
   }
   row.dateText=input.value;
   row.date=mdDateISO(input.value)||'';
   row.dateEdited=true;
  }else if(field==='amount'){
   const original=input.value,caret=input.selectionStart??original.length;
   const parsed=mdMoneyInput(original);
   const prefix=mdMoneyInput(original.slice(0,caret)).display;
   row.amount=parsed.value;
   input.value=parsed.display;
   try{input.setSelectionRange(prefix.length,prefix.length);}catch{}
   row.amountEdited=true;row.amountSuggested=false;
  }else{
   row[field]=input.value;
   if(field==='receiptRef'){row.refEdited=true;row.refSuggested=false;}
   if(field==='statementId'&&mdState.kind==='owner'){
    const summary=document.querySelector('[data-md-last-payment-row="'+row.id+'"] .md-last-content');
    if(summary)summary.innerHTML=mdLastPaymentBody(mdState,db,row.statementId);
   }
  }
  mdRefresh();
 }
 function mdRemove(id){
  if(!mdState)return;
  if(mdState.rows.length<=1)return toast('Mantén al menos un abono.','error');
  const row=mdById(id);if(row?.preview&&String(row.preview).startsWith('blob:'))URL.revokeObjectURL(row.preview);
  mdState.rows=mdState.rows.filter(r=>r.id!==id);mdRenderRows();
 }
 function mdError(message){
  const el=document.querySelector('[data-md-error]');if(el)el.textContent=message;
  toast(message,'error');
 }
 async function mdCompressPhoto(file){
  try{
   const bitmap=await createImageBitmap(file);
   const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
   bitmap.close();canvas.width=canvas.height=1;
   return blob&&blob.size<file.size?new File([blob],'recibo.jpg',{type:'image/jpeg'}):file;
  }catch{return file;}
 }
 async function mdPhotoChanged(input){
  const row=mdById(input.dataset.mdPhoto),file=input.files?.[0];if(!row||!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){
   input.value='';mdError('El recibo debe ser JPG, PNG o WebP de hasta 12 MB.');return;
  }
  if(row.preview&&String(row.preview).startsWith('blob:'))URL.revokeObjectURL(row.preview);
  row.scanOriginal=file;
  row.photo=await mdCompressPhoto(file);
  if(!mdState||!mdById(row.id))return;
  row.preview=await mdReadPreview(row.photo);row.status='Recibo cargado · leyendo OCR…';
  mdRenderRows();
  await mdOcr(row);
 }

 function mdOcrAngles(width,height){
  // El talonario se fotografía con frecuencia en vertical aunque se lee acostado.
  return height>width*1.12?[-90,90,0]:[0,-90,90];
 }
 function mdRotateReceipt(bitmap,angle){
  const max=2200,scale=Math.min(1.6,max/Math.max(bitmap.width,bitmap.height));
  const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
  const rotated=angle!==0,canvas=document.createElement('canvas');
  canvas.width=rotated?h:w;canvas.height=rotated?w:h;
  const ctx=canvas.getContext('2d',{willReadFrequently:false});
  if(!ctx)throw Error('Este navegador no pudo preparar la fotografía.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(angle===-90){ctx.translate(0,canvas.height);ctx.rotate(-Math.PI/2);}
  else if(angle===90){ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);}
  ctx.drawImage(bitmap.image||bitmap,0,0,w,h);
  return canvas;
 }
 async function mdReadPreview(file){
  let bmp=null,canvas=null;
  try{
   bmp=typeof decodeContractIntakeImage==='function'?await decodeContractIntakeImage(file):await createImageBitmap(file);
   const scale=Math.min(1,430/Math.max(bmp.width,bmp.height));
   canvas=document.createElement('canvas');
   canvas.width=Math.round(bmp.width*scale);canvas.height=Math.round(bmp.height*scale);
   canvas.getContext('2d').drawImage(bmp.image||bmp,0,0,canvas.width,canvas.height);
   return canvas.toDataURL('image/jpeg',.7);
  }catch{return URL.createObjectURL(file);}
  finally{bmp?.close();if(canvas)canvas.width=canvas.height=1;}
 }
 function mdOcrProgress(row,message){
  if(!mdById(row.id))return;
  row.status=message;
  const el=document.querySelector('[data-md-photo-status="'+row.id+'"]');
  if(el)el.textContent=message;
 }
 async function mdOcr(row){
  let bitmap=null,worker=null,canvas=null;
  if(!row?.photo||!mdById(row.id))return;
  if(row.ocrBusy)return;
  row.ocrBusy=true;
  try{
   const parser=window.lotigestPaperReceipt?.extractPaperReceipt;
   if(typeof parser!=='function')throw Error('No se encontró el extractor de recibos de Grupo H.');
   mdOcrProgress(row,'Cargando el lector OCR del dispositivo…');
   bitmap=typeof decodeContractIntakeImage==='function'
    ?await decodeContractIntakeImage(row.scanOriginal||row.photo)
    :await createImageBitmap(row.scanOriginal||row.photo);
   const T=typeof loadContractIntakeOcr==='function'
    ?await loadContractIntakeOcr()
    :await loadContractOcr();
   if(!T?.createWorker)throw Error('El lector OCR no se inicializó.');
   const root=location.origin+'/ocr/v5/';
   worker=await T.createWorker('spa',1,{
    workerPath:root+'worker.min.js',
    workerBlobURL:false,
    corePath:root+'core',
    langPath:root+'lang',
    cachePath:'lotigest-recibos-grupoh-v1',
    logger:status=>{
     if(status.status==='recognizing text'&&mdById(row.id))
      mdOcrProgress(row,'Leyendo recibo: '+Math.round((status.progress||0)*100)+'%');
    }
   });
   let best={date:null,amount:null,reference:null,warnings:[]},bestScore=-1;
   const rotations=mdOcrAngles(bitmap.width,bitmap.height);
   for(let index=0;index<rotations.length;index++){
    mdOcrProgress(row,'Reconociendo recibo (orientación '+(index+1)+' de '+rotations.length+')…');
    canvas=mdRotateReceipt(bitmap,rotations[index]);
    const result=await worker.recognize(canvas);
    const parsed=parser(result?.data?.text||'');
    const score=(parsed.reference?4:0)+(parsed.date?3:0)+(parsed.amount!=null?3:0);
    if(score>bestScore){best=parsed;bestScore=score;}
    canvas.width=canvas.height=1;canvas=null;
    if(score===10)break;
   }
   if(!mdById(row.id))return;
   const extracted=[];
   if(best.date&&!row.dateEdited&&best.date<=mdToday()){
    row.date=best.date;row.dateText=mdHumanDate(best.date);extracted.push('fecha: '+row.dateText);
   }
   if(best.amount!=null&&!row.amountEdited){
    row.amount=String(best.amount);row.amountSuggested=false;extracted.push('Por Lps.: '+mdMoneyText(row.amount));
   }
   if(best.reference&&!row.refEdited){
    row.receiptRef=String(best.reference);row.refSuggested=false;extracted.push('N.º '+row.receiptRef);
   }
   row.status=extracted.length
    ?'OCR: '+extracted.join(' · ')+(extracted.length<3?' · completa lo que falte':'')+' · revisa antes de guardar'
    :'El OCR no pudo reconocer N.º, fecha ni Por Lps.; escribe los datos o pulsa Reintentar OCR.';
   mdRenderRows();
  }catch(e){
   if(mdById(row.id)){
    row.status='No se pudo leer: '+String(e?.message||'Fallo del lector OCR').slice(0,140)+'. Puedes escribir los datos o pulsar Reintentar OCR.';
    mdRenderRows();
   }
  }finally{
   row.ocrBusy=false;delete row.scanOriginal;
   bitmap?.close();
   if(canvas)canvas.width=canvas.height=1;
   if(worker)try{await worker.terminate();}catch{}
  }
 }
 function mdValidate(){
  if(!mdState||!mdState.rows.length)throw Error('Agrega al menos un abono.');
  if(!cloudReady||cloudUser?.role!=='admin'||cloudBlocked||cloudBusy||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)throw Error('Sincroniza la aplicación antes de registrar varios abonos.');
  if(JSON.stringify(db)!==mdState.snapshot)throw Error('Los datos cambiaron. Vuelve a abrir el formulario para evitar duplicaciones.');
  const existingKeys=new Set(),result=[];
  const lastFilled=mdState.rows.findLastIndex(mdRowHasPayment);
  if(lastFilled<0)throw Error('Ingresa al menos un abono antes de guardar.');
  for(const [i,row] of mdState.rows.slice(0,lastFilled+1).entries()){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(+new Date(row.date+'T12:00:00Z'))||new Date(row.date+'T12:00:00Z').toISOString().slice(0,10)!==row.date||row.date>mdToday())throw Error('Revisa la fecha del abono '+(i+1)+'. No puede ser futura.');
   const val=Number(row.amount),cents=Math.round(val*100);
   if(row.amount===''||!Number.isSafeInteger(cents)||cents<=0||Math.abs(cents-val*100)>.001)throw Error('Monto inválido en el abono '+(i+1)+'.');
   const raw=String(row.receiptRef||'').trim(),normalized=window.lotigestOwnerPayments.requireReceiptCorrelativo(raw);
   if(existingKeys.has(normalized))throw Error('El correlativo '+normalized+' está repetido entre estas fechas.');
   const duplicate=mdDuplicateMessage(db,raw);if(duplicate)throw Error(duplicate);
   existingKeys.add(normalized);
   if(mdState.kind==='owner'&&!mdState.docs.some(d=>d.id===row.statementId))throw Error('Selecciona una ficha válida en el abono '+(i+1)+'.');
   if(row.photo&&(!window.lotigestFiles||row.photo.size>12*1024*1024))throw Error('No se puede conservar la fotografía del abono '+(i+1)+'.');
   result.push({...row,amount:val,cents,raw,normalized,position:i});
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||a.position-b.position);
 }
 function mdPreviewAllocations(rows){
  const plans=new Map();if(mdState.kind!=='sale')return plans;
  const working=JSON.parse(JSON.stringify(db));
  for(const row of rows){
   let plan;try{plan=planMonthlyClientPayment(working,mdState.saleIds||[mdState.saleId],row.cents,row.date);}catch(e){throw Error('Abono '+(row.position+1)+' · Recibo '+row.raw+': '+e.message);}
   plans.set(row.id,plan);
   for(const a of plan.allocations)working.payments.push({id:'preview-'+row.id+'-'+a.saleId,saleId:a.saleId,amount:a.amount,date:row.date,concept:'Abono mensual'});
  }
  return plans;
 }
 async function mdSave(){
  if(mdSaving||!mdState)return;
  if(mdStage!=='review'){mdReview();return;}
  try{if(mdReviewSignature(mdValidate())!==mdReviewedKey){mdReview();return;}if(!document.getElementById('md-review-confirm')?.checked){mdError('Confirma que has revisado el prelistado antes de guardar.');return;}}catch(e){mdError(e.message);return;}
  mdSaving=true;const btn=document.querySelector('[data-md-save]');if(btn)btn.disabled=true;
  try{
   const ordered=mdValidate();let next=JSON.parse(JSON.stringify(db)),saved=[],attachments=[];
   const sale=mdState.kind==='sale'?next.sales.find(s=>s.id===mdState.saleId):null;
   const lot=sale?next.lots.find(l=>l.id===sale.lotId):null;
   if(sale&&(!lot||sale.type!=='credit'))throw Error('El contrato o solar cambió.');
   for(const row of ordered){
    let id;
    const photoKey=row.photo?'AbonoFoto_'+crypto.randomUUID().replace(/-/g,''):null;
    if(mdState.kind==='sale'){
     const {allocations}=planMonthlyClientPayment(next,mdState.saleIds||[sale.id],row.cents,row.date);
     const groupId=uid('RC');
     // Un recibo por fecha: todas sus distribuciones deben compartir el QR.
     const verifyToken=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
     for(const [index,allocation] of allocations.entries()){
      const target=next.sales.find(s=>s.id===allocation.saleId);
      if(typeof assertMonthlyPayment==='function')assertMonthlyPayment(next,[target.lotId],allocation.cents);
      const priorPaid=(Number(target.openingPaid)||0)+next.payments.filter(p=>p.saleId===target.id).reduce((n,p)=>n+Number(p.amount||0),0);
      const payment={id:groupId+'-'+(index+1),groupId,saleId:target.id,date:row.date,amount:allocation.amount,concept:'Abono mensual · Registro por fechas',method:'Efectivo',receiptReference:row.raw,receiptReferenceNormalized:row.normalized,recordedAt:new Date().toISOString(),...(photoKey?{receiptImageKey:photoKey}:{}),verifyToken};
      payment.receiptInfo=buildReceiptInfo(payment,priorPaid);next.payments.unshift(payment);
      if(index===0)id=payment.id;
     }
    }else{
     const outcome=window.lotigestOwnerPayments.createOwnerPayment(next,{id:'OP-'+crypto.randomUUID(),clientId:mdState.clientId,residenceId:mdState.residenceId,date:row.date,method:'Efectivo',concept:'Abono mensual · Registro por fechas',receiptRef:row.raw,reviewed:true,allocations:[{statementId:row.statementId,referenceIndex:null,amount:row.amount}]});
     next=outcome.state;id=outcome.receipt.id;
     const receipt=next.ownerPayments.find(p=>p.id===id);if(photoKey)receipt.receiptImageKey=photoKey;
     receipt.verifyToken=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
    }
    saved.push({id,kind:mdState.kind,ref:row.raw,date:row.date,amount:row.amount,photoKey});
    if(photoKey)attachments.push({key:photoKey,file:row.photo});
   }
   for(const {key,file} of attachments)await window.lotigestFiles.queue(key,file);
   cloudWrite(JSON.stringify(next));db=next;
   await cloudFlush();
   const confirmed=!!cloudQueue&&!cloudBlocked&&!cloudOffline&&!cloudQueue.pending&&cloudQueue.latest===cloudQueue.confirmed;
   mdSaved={items:saved,confirmed,client:mdState.clientName,kind:mdState.kind,saleId:mdState.saleId,clientId:mdState.clientId,residenceId:mdState.residenceId};
   for(const row of mdState.rows)if(row.preview&&String(row.preview).startsWith('blob:'))URL.revokeObjectURL(row.preview);
   mdState=null;
   // Actualizar tarjetas y saldo antes de volver a presentar los recibos.
   if(confirmed)mdReturnToAbonos();else mdShowSaved();
   if(!confirmed)toast('Los abonos quedaron en este dispositivo pendientes de sincronización. No compartas comprobantes hasta confirmar el guardado en Cloudflare.','error');
   else toast(saved.length+' abonos individuales guardados en Cloudflare.');
  }catch(e){mdError(e.message||'No se pudieron guardar los abonos.');}
  finally{mdSaving=false;if(btn?.isConnected)btn.disabled=false;}
 }
 function mdShowSaved(){
  if(!mdSaved)return;
  const confirmed=mdSaved.confirmed;
  const body='<div class="md-success"><h3>'+(confirmed?'✓ Pagos guardados por separado':'Pagos pendientes de sincronización')+'</h3><p>'+mdSafe(mdSaved.client)+' · '+mdSaved.items.length+' recibo(s) individuales</p>'+
   (confirmed?'<p>Ya puedes descargarlos por separado o generar un solo PDF con todas las fechas para compartirlo.</p>':'<p>Se conservó una copia local. Verifica la sincronización de Cloudflare antes de enviar los recibos.</p>')+'</div>'+
   '<div class="md-saved-list">'+mdSaved.items.map((p,i)=>'<div class="md-saved-item"><span>Abono '+(i+1)+' · '+mdSafe(p.date)+' · '+mdFmt(p.amount)+'<small>Correlativo '+mdSafe(p.ref)+'</small></span><span class="md-saved-actions">'+(confirmed?'<button type="button" data-md-pdf="'+mdSafe(p.id)+'" data-md-kind="'+mdSafe(p.kind)+'">PDF</button>':'')+(p.photoKey?'<button type="button" data-md-view-photo="'+mdSafe(p.photoKey)+'">Foto</button>':'')+'</span></div>').join('')+'</div>';
  const footer=confirmed?'<button class="btn btn-outline" type="button" data-md-download-all>Descargar todos (PDF)</button><button class="btn btn-primary" type="button" data-md-share-all>Enviar todos</button><button class="btn btn-outline" type="button" data-md-another>Guardar y registrar otro</button><button class="btn btn-soft" type="button" data-action="close-modal">Cerrar</button>':'<button class="btn btn-soft" type="button" data-action="close-modal">Cerrar</button>';
  showModal('Abonos · Recibos separados',body,footer,true);
  document.querySelector('#modal-root .modal')?.classList.add('lg-multi-date-modal','lg-payment-modern');
 }
 function mdCombinedPdf(){
  if(!mdSaved?.confirmed)throw Error('Confirma el guardado en Cloudflare antes de compartir recibos.');
  const parts=[],items=mdSaved.items;
  for(const [i,item] of items.entries()){
   const p=item.kind==='owner'?(db.ownerPayments||[]).find(p=>p.id===item.id):db.payments.find(p=>p.id===item.id);
   if(!p)throw Error('Un recibo ya no está en la sesión. Actualiza los datos.');
   if(i)parts.push({pageBreak:true});
   parts.push({text:'RECIBO INDIVIDUAL '+(i+1)+' DE '+items.length,size:16,bold:true});
   parts.push({text:'Correlativo de caja: '+p.receiptReference,size:12,bold:true});
   parts.push({text:'Fecha: '+fmtDate(p.date)});
   if(item.kind==='owner'){
    parts.push({text:'Cliente: '+p.clientName});
    parts.push({text:'Residencial: '+p.residenceName});
    for(const a of p.allocations||[])parts.push({text:(a.references||[]).map(r=>'Bloque '+r.block+' · Solar '+r.solar).join(', ')});
    parts.push({text:'TOTAL RECIBIDO: '+mdFmt(p.amountCents/100),size:15,bold:true,gap:16});
   }else{
    const receiptPayments=paymentReceiptRows(p.id),info=receiptInfo(p);
    parts.push({text:'Cliente: '+info.clientName});
    for(const part of receiptPayments){const detail=receiptInfo(part);parts.push({text:'Residencial: '+detail.residence+' · Bloque '+detail.block+' · Solar '+detail.solar+' · Abono '+mdFmt(part.amount)});}
    for(const a of info.allocations||[])parts.push({text:a.label+' · '+mdFmt(a.amount)});
    parts.push({text:'Deuda anterior: '+mdFmt(receiptPayments.reduce((n,p)=>n+Number(receiptInfo(p).before),0))});
    parts.push({text:'TOTAL RECIBIDO: '+mdFmt(receiptPayments.reduce((n,p)=>n+Number(p.amount),0)),size:15,bold:true,gap:16});
    parts.push({text:'DEUDA PENDIENTE: '+mdFmt(receiptPayments.reduce((n,p)=>n+Number(receiptInfo(p).after),0)),bold:true});
   }
   parts.push({text:'Recibo independiente. Para verificar el código QR, consulta su PDF individual.',size:9});
  }
  return {blob:receiptLetterPdf(parts,db.company.name||'GRUPO H','VARIOS-'+items.length),name:'LOTIGEST_PRO_'+items.length+'_recibos.pdf'};
 }
 async function mdShareAll(share){
  try{
   const {blob,name}=mdCombinedPdf(),file=new File([blob],name,{type:'application/pdf'});
   if(share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Recibos LOTIGEST PRO'});return;}
   download(name,blob,'application/pdf');
   toast(share?'PDF descargado. Selecciona WhatsApp y adjúntalo al chat del cliente.':'Todos los recibos descargados en un solo PDF.');
  }catch(e){if(e.name!=='AbortError')toast(e.message||'No se pudieron generar los recibos.','error');}
 }
 async function mdViewPhoto(key){
  try{
   let image=await window.lotigestFiles?.get(key);
   if(!image){const res=await fetch('/api/app/file?'+new URLSearchParams({key}),{credentials:'same-origin',cache:'no-store'});if(!res.ok)throw Error('El archivo aún no está disponible en la nube.');image=await res.blob();}
   const url=URL.createObjectURL(image),link=document.createElement('a');
   link.href=url;link.target='_blank';link.rel='noopener noreferrer';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){toast(e.message||'No se pudo abrir la foto.','error');}
 }
 // En el historial del recibo se puede consultar la fotografía de caja.
 const mdPriorSalePreview=paymentReceiptPreview;
 paymentReceiptPreview=function(id){
  const result=mdPriorSalePreview(id),p=db.payments.find(p=>p.id===id);
  if(p?.receiptImageKey){
   const host=document.querySelector('#modal-root .modal-content');
   if(host){const button=document.createElement('button');button.type='button';button.className='btn btn-outline';button.dataset.mdViewPhoto=p.receiptImageKey;button.textContent='▣ Ver fotografía del recibo de caja';host.append(button);}
  }
  return result;
 };
 const mdPriorOwnerPreview=ownerPaymentPreview;
 ownerPaymentPreview=function(id){
  const result=mdPriorOwnerPreview(id),p=(db.ownerPayments||[]).find(p=>p.id===id);
  if(p?.receiptImageKey){
   const host=document.querySelector('#modal-root .modal-content');
   if(host){const button=document.createElement('button');button.type='button';button.className='btn btn-outline';button.dataset.mdViewPhoto=p.receiptImageKey;button.textContent='▣ Ver fotografía del recibo de caja';host.append(button);}
  }
  return result;
 };

 function mdOpenManyWithShortcut(forcePicker=false){
  if(!cloudReady||cloudUser?.role!=='admin')return toast('Se requiere una cuenta administradora para registrar abonos.','error');
  if(document.querySelector('#modal-root .modal'))return toast('Cierra la ventana actual antes de abrir abonos múltiples.','error');
  const activeResidence=['collections','payments'].includes(page)&&typeof residence==='function'?residence()?.id:null;
  const target=forcePicker?null:mdLastPaymentTarget;
  if(target?.kind==='sale'){
   const sale=getSale(target.saleId),lot=getLot(sale?.lotId);
   if(sale?.type==='credit'&&balance(sale)>.01&&(!activeResidence||lot?.residenceId===activeResidence))return mdStartSale(sale.id);
  }
  if(target?.kind==='owner'&&getClient(target.clientId)&&(!activeResidence||target.residenceId===activeResidence))return mdStartOwner(target.clientId,target.residenceId);
  // Sin solar activo, ofrecer un selector; no se cobra un lote por suposición.
  const pool=activeResidence&&typeof contractCollectionsScope==='function'?contractCollectionsScope(db,activeResidence).sales:db.sales||[];
  const sales=pool.filter(s=>s.type==='credit'&&balance(s)>.009&&(!activeResidence||getLot(s.lotId)?.residenceId===activeResidence));
  if(!sales.length)return toast('No hay contratos con saldo disponibles para registrar abonos.','error');
  showModal('Elegir cliente para varios abonos','<p>Elige al cliente e ingresa el total de cada abono. Se repartirá según la cuota de sus solares.</p><label>Cliente<input id="md-shortcut-search" placeholder="Nombre, bloque o solar" autocomplete="off"></label><div id="md-shortcut-results" style="max-height:50dvh;overflow-y:auto"></div>','<button type="button" class="btn btn-soft" data-action="close-modal">Cancelar</button>',true);
  function matches(query){
   const normalized=String(query||'').trim().toLocaleLowerCase('es');
   const seen=new Set();
   return sales.filter(s=>{
    const lot=getLot(s.lotId),client=getClient(s.clientId);
    return (client?.name||'').toLocaleLowerCase('es').includes(normalized)||
      (String(lot?.block||'')+' '+String(lot?.sourceNumber||lot?.id||'')).toLocaleLowerCase('es').includes(normalized);
   }).filter(s=>{const key=s.clientId+'|'+getLot(s.lotId)?.residenceId;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,60);
  }
  const results=document.getElementById('md-shortcut-results');
  const repaint=query=>{
   if(!results)return;
   results.innerHTML=matches(query).map(s=>{
    const lot=getLot(s.lotId),client=getClient(s.clientId);
    return '<button type="button" class="btn btn-outline" data-md-shortcut-sale="'+mdSafe(s.id)+'" style="display:block;width:100%;text-align:left;margin:5px 0;white-space:normal">'+mdSafe(client?.name||'Cliente')+(!activeResidence?' · '+mdSafe(db.residences.find(r=>r.id===lot?.residenceId)?.name||'Residencial'):'')+'</button>';
   }).join('')||'<p>No se encontraron solares con saldo.</p>';
  };
  repaint('');
  document.getElementById('md-shortcut-search')?.addEventListener('input',e=>repaint(e.target.value));
 }
 window.lotigestMultiDate={openSale:mdStartSale,openOwner:mdStartOwner,openSingle:mdOpenOneWithShortcut,openMulti:mdOpenManyWithShortcut};


 // Atajos para captura rápida. Enter no registra pagos: solo avanza entre campos
 // y, al terminar un abono, pasa al siguiente o crea una fila vacía.
 function mdFocusField(id,field,select=true){
  const input=document.querySelector('[data-md-id="'+id+'"][data-md-field="'+field+'"]');
  if(!input)return false;
  input.focus();
  if(select&&typeof input.select==='function')input.select();
  if(typeof input.scrollIntoView==='function')input.scrollIntoView({block:'center',behavior:'smooth'});
  return true;
 }
 // BigInt evita perder dígitos de correlativos largos. Nunca saltar números sin confirmación.
 function mdNextCorrelativo(raw){
  const digits=String(raw??'').trim();
  if(!/^\d{1,80}$/.test(digits)||BigInt(digits)<=0n)return '';
  const next=String(BigInt(digits)+1n);
  return next.length<=80?next:'';
 }
 function mdSuggestNextReference(previous,next){
  if(!previous||!next||next.refEdited||(next.receiptRef&&!next.refSuggested))return false;
  const suggestion=mdNextCorrelativo(previous.receiptRef);
  if(!suggestion)return false;
  next.receiptRef=suggestion;next.refSuggested=true;return true;
 }
 function mdSuggestNextAmount(previous,next){
  if(!previous||!next||next.amountEdited||next.photo||(next.amount&&!next.amountSuggested))return false;
  const raw=String(previous.amount||'').trim(),amount=Number(raw),cents=Math.round(amount*100);
  if(!raw||!Number.isSafeInteger(cents)||cents<=0||Math.abs(cents-amount*100)>.001)return false;
  next.amount=String(cents/100);next.amountSuggested=true;return true;
 }
 function mdRowHasPayment(row){
  // Una fila con sugerencias solamente no cuenta en el total ni se registra.
  return Boolean(String(row.dateText||row.date||'').trim()||row.photo||(!row.amountSuggested&&String(row.amount||'').trim())||(!row.refSuggested&&String(row.receiptRef||'').trim()));
 }
 function mdNextRow(row){
  if(!mdState||!row)return;
  const index=mdState.rows.indexOf(row);
  if(index===-1)return;
  if(!row.date||row.date>mdToday())return mdFocusField(row.id,'date')&&toast('Revisa la fecha del abono antes de continuar.','error');
  const amount=Number(row.amount);
  if(!String(row.amount||'').trim()||!Number.isFinite(amount)||amount<=0)return mdFocusField(row.id,'amount')&&toast('Ingresa un monto válido antes de continuar.','error');
  let normalized;
  try{normalized=window.lotigestOwnerPayments.requireReceiptCorrelativo(row.receiptRef);}
  catch(e){mdFocusField(row.id,'receiptRef');toast(e.message,'error');return;}
  if(mdState.rows.some(other=>other!==row&&window.lotigestOwnerPayments.normalizeReceiptCorrelativo(other.receiptRef)===normalized)||
     window.lotigestOwnerPayments.findReceiptCorrelativo(db,row.receiptRef)){
   mdFocusField(row.id,'receiptRef');toast(mdDuplicateMessage(db,row.receiptRef)||'El correlativo '+normalized+' está repetido entre estas fechas.','error');return;
  }
  if(index+1>=mdState.rows.length){mdReview();return;}
  const next=mdState.rows[index+1];
  mdSuggestNextReference(row,next);mdSuggestNextAmount(row,next);
  mdExpandRow(next.id);mdRenderRows();
  mdFocusField(next.id,'date');
 }
 function mdRememberPayment(target){
  const action=target?.closest?.('[data-action="new-payment"],[data-action="collection-owner-abono"],[data-md-start-sale],[data-md-start-owner],[data-action="view-lot"]');
  if(!action)return;
  if(action.hasAttribute('data-md-start-sale')||action.dataset.action==='new-payment'){
   const id=action.dataset.mdStartSale||action.dataset.id;
   if(getSale(id))mdLastPaymentTarget={kind:'sale',saleId:id};
  }else if(action.dataset.action==='view-lot'){
   const sale=(db.sales||[]).find(s=>s.lotId===action.dataset.id&&s.type==='credit'&&balance(s)>.01);
   if(sale)mdLastPaymentTarget={kind:'sale',saleId:sale.id};
  }else if(action.hasAttribute('data-md-start-owner')||action.dataset.action==='collection-owner-abono'){
   try{
    const token=action.dataset.mdStartOwner||action.dataset.id;
    const {rid,group}=collectionGroupFromToken(token);
    const owners=[...new Set((group?.statements||[]).map(s=>s.clientId).filter(Boolean))];
    if(owners.length===1)mdLastPaymentTarget={kind:'owner',clientId:owners[0],residenceId:rid};
    else mdLastPaymentTarget=null;
   }catch{mdLastPaymentTarget=null;}
  }
 }
 function mdOpenOneWithShortcut(){
  if(!cloudReady||cloudUser?.role!=='admin')return toast('Debes iniciar sesión como administrador para registrar abonos.','error');
  // No perder un formulario con pagos pendientes al utilizar el atajo.
  if(mdRoot())return toast('Termina o cancela los abonos múltiples antes de abrir un pago individual.','error');
  if(document.querySelector('#modal-root .modal'))return toast('Cierra la ventana actual antes de abrir otro abono.','error');
  const chosen=mdLastPaymentTarget;
  const currentResidence=typeof residence==='function'?residence()?.id:null;
  // Un contexto de otra residencial o de otra pantalla no se reutiliza a ciegas.
  const sale=chosen?.kind==='sale'?getSale(chosen.saleId):null;
  const saleResidence=sale?getLot(sale.lotId)?.residenceId:null;
  if(['collections','payments'].includes(page)&&sale&&balance(sale)>.01&&(!currentResidence||saleResidence===currentResidence)){
   newPayment(sale.id,false);return;
  }
  if(['collections','payments'].includes(page)&&chosen?.kind==='owner'&&getClient(chosen.clientId)&&(!currentResidence||chosen.residenceId===currentResidence)){
   openOwnerAbono(chosen.clientId,chosen.residenceId);return;
  }
  // Sin solar seleccionado abre el selector ordinario para elegir cliente.
  newPayment(null,false);
 }

 document.addEventListener('click',event=>{
  const control=event.target.closest?.('[data-md-next],[data-md-back],[data-md-goto],[data-md-review-remove],[data-md-show-saved]');if(!control)return;
  event.preventDefault();event.stopImmediatePropagation();if(mdSaving)return;
  if(control.hasAttribute('data-md-show-saved')){mdShowSaved();return;}
  if(!mdState)return;
  if(control.hasAttribute('data-md-next')){const row=mdState.rows.find(r=>r.expanded)||mdState.rows[0];mdNextRow(row);}
  else if(control.hasAttribute('data-md-back')){if(mdStage==='review')mdBackToData();else{const i=mdState.rows.findIndex(r=>r.expanded);mdBackToData(mdState.rows[Math.max(0,i-1)]?.id);}}
  else if(control.hasAttribute('data-md-goto'))mdBackToData(control.dataset.mdGoto);
  else if(control.hasAttribute('data-md-review-remove')){mdStage='data';mdReviewedKey=null;mdRemove(control.dataset.mdReviewRemove);mdReview();mdWizardPaint();}
 },true);
 document.addEventListener('click',event=>{
  mdRememberPayment(event.target);
  const action=event.target.closest?.('[data-md-start-sale],[data-md-start-owner],[data-md-shortcut-sale],[data-md-pick-owner],[data-md-edit],[data-md-toggle-row],[data-md-add],[data-md-remove],[data-md-retry],[data-md-one],[data-md-many],[data-md-save],[data-md-pdf],[data-md-download-all],[data-md-share-all],[data-md-another],[data-md-view-photo]');
  if(!action)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(action.hasAttribute('data-md-start-sale'))mdStartSale(action.dataset.mdStartSale);
  else if(action.hasAttribute('data-md-start-owner'))mdStartOwnerToken(action.dataset.mdStartOwner);
  else if(action.hasAttribute('data-md-pick-owner'))mdStartOwner(action.dataset.mdPickOwner,action.dataset.mdRid);
  else if(action.hasAttribute('data-md-shortcut-sale'))mdStartSale(action.dataset.mdShortcutSale);
  else if(action.hasAttribute('data-md-edit')){
   const id=action.dataset.mdEdit;
   mdExpandRow(id);
   const input=document.querySelector('[data-md-field="date"][data-md-id="'+id+'"]');
   if(input){input.focus();input.select();}
  }
  else if(action.hasAttribute('data-md-toggle-row'))mdToggleRow(action.dataset.mdToggleRow);
  else if(action.hasAttribute('data-md-add')){
   mdStage='data';mdReviewedKey=null;
   if(mdState.rows.length>=24)return mdError('Se admiten como máximo 24 recibos por operación.');
   const row=mdCreateEntry();mdSuggestNextReference(mdState.rows.at(-1),row);mdSuggestNextAmount(mdState.rows.at(-1),row);mdState.rows.push(row);mdExpandRow(row.id);mdFocusField(row.id,'date');
  }
  else if(action.hasAttribute('data-md-remove'))mdRemove(action.dataset.mdRemove);
  else if(action.hasAttribute('data-md-retry')){
   const row=mdById(action.dataset.mdRetry);
   if(row?.photo&&!row.ocrBusy)mdOcr(row);
  }
  else if(action.hasAttribute('data-md-one')){if(mdState?.kind==='sale'){const id=mdState.saleId;mdState=null;baseNewPayment(id,false);}else if(mdState?.kind==='owner'){const {clientId,residenceId}=mdState;mdState=null;openOwnerAbono(clientId,residenceId);}}
  else if(action.hasAttribute('data-md-save'))mdSave();
  else if(action.hasAttribute('data-md-pdf')){if(action.dataset.mdKind==='owner')deliverOwnerPayment(action.dataset.mdPdf,false);else deliverPaymentReceipt(action.dataset.mdPdf,false);}
  else if(action.hasAttribute('data-md-another')){if(mdSaved?.kind==='sale')mdStartSale(mdSaved.saleId);else if(mdSaved?.kind==='owner')mdStartOwner(mdSaved.clientId,mdSaved.residenceId);}
  else if(action.hasAttribute('data-md-download-all'))mdShareAll(false);
  else if(action.hasAttribute('data-md-share-all'))mdShareAll(true);
  else if(action.hasAttribute('data-md-view-photo'))mdViewPhoto(action.dataset.mdViewPhoto);
 },true);
 document.addEventListener('input',event=>{if(event.target.closest?.('#md-abonos-form')&&event.target.matches('[data-md-field]'))mdUpdateField(event.target);},true);
 document.addEventListener('change',event=>{
  if(!event.target.closest?.('#md-abonos-form'))return;
  if(event.target.matches('[data-md-photo]'))mdPhotoChanged(event.target);
  else if(event.target.matches('[data-md-picker]')){
   const row=mdById(event.target.dataset.mdPicker);
   if(!row)return;
   const iso=mdDateISO(event.target.value);
   if(!iso)return;
   row.date=iso;row.dateText=mdHumanDate(iso);row.dateEdited=true;
   const visible=document.querySelector('[data-md-field="date"][data-md-id="'+row.id+'"]');
   if(visible)visible.value=row.dateText;
   mdRefresh();
  }
  else if(event.target.matches('[data-md-field]'))mdUpdateField(event.target);
 },true);
 document.addEventListener('blur',event=>{
  if(!event.target.closest?.('#md-abonos-form'))return;
  const input=event.target,row=mdById(input.dataset?.mdId);
  if(!row)return;
  if(input.matches('[data-md-field="date"]')){
   const iso=mdDateISO(input.value);
   if(iso){row.date=iso;row.dateText=mdHumanDate(iso);input.value=row.dateText;}
   else{row.date='';row.dateText=input.value;}
  }else if(input.matches('[data-md-field="amount"]')){
   input.value=mdMoneyText(row.amount);
  }
  mdRefresh();
 },true);

 document.addEventListener('focusin',event=>{
  const input=event.target;
  // Si el OCR ya rellenó la fecha, seleccionarla entera para poder cambiarla.
  // Los abonos nuevos comienzan siempre con la fecha vacía.
  if(input?.matches?.('#md-abonos-form [data-md-field="date"]')){
   try{input.select();}catch{}
  }
 },true);
 document.addEventListener('keydown',event=>{
  const key=String(event.key||'').toLowerCase();
  // La configuración central de atajos reemplaza el Ctrl+B antiguo.
  if(!window.lotigestShortcuts?.ready&&(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&key==='b'){
   if(event.target?.closest?.('[contenteditable="true"]'))return;
   event.preventDefault();
   event.stopImmediatePropagation();
   mdOpenOneWithShortcut();
   return;
  }
  if(key!=='enter'||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.isComposing)return;
  const input=event.target;
  if(!input?.closest?.('#md-abonos-form')||!input.matches?.('[data-md-field]'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const row=mdById(input.dataset.mdId);
  if(!row)return;
  const field=input.dataset.mdField;
  if(field==='date'){
   const iso=mdDateISO(input.value);
   if(!iso||iso>mdToday()){mdFocusField(row.id,'date');toast('Introduce una fecha válida.','error');return;}
   row.date=iso;row.dateText=mdHumanDate(iso);input.value=row.dateText;
   mdFocusField(row.id,'amount');
  }else if(field==='amount'){
   const amount=Number(row.amount);
   if(!String(row.amount||'').trim()||!Number.isFinite(amount)||amount<=0){
    mdFocusField(row.id,'amount');toast('Introduce el monto del abono.','error');return;
   }
   input.value=mdMoneyText(row.amount);
   mdFocusField(row.id,'receiptRef');
  }else if(field==='receiptRef'){
   mdNextRow(row);
  }else if(field==='statementId'){
   mdFocusField(row.id,'date');
  }
 },true);
 document.addEventListener('submit',event=>{if(event.target.id==='md-abonos-form'){event.preventDefault();event.stopImmediatePropagation();mdReview();}},true);
})();
