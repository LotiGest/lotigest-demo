// Ventana Pago / Abono: adapta controles reales; no inventa cuotas, clientes ni pagos.
// Los formularios originales siguen siendo la fuente de validación, guardado y recibos.
let pmActive=null,pmYear=null,pmSaveOnly=false;
const pmNode=(tag,className='',textValue)=>{const el=document.createElement(tag);if(className)el.className=className;if(textValue!==undefined)el.textContent=textValue;return el;};
function pmModal(title,subtitle){
 const modal=document.querySelector('#modal-root .modal');
 if(!modal)return null;
 modal.classList.add('lg-payment-modern');
 const heading=modal.querySelector('.modal-header h2');if(heading)heading.textContent=title;
 const caption=modal.querySelector('.modal-header>div p')||pmNode('p');
 caption.textContent=subtitle;
 if(heading&&!caption.parentNode)heading.after(caption);
 return modal;
}
// Nombre visible aun cuando el panel de búsqueda está plegado.
function pmHeaderClient(modal,client){
 const header=modal?.querySelector('.modal-header>div');if(!header)return;
 let row=header.querySelector('.pm-header-client');
 if(!row){
  row=pmNode('div','pm-header-client');
  const name=pmNode('strong','pm-header-client-name');name.setAttribute('aria-live','polite');
  const find=pmNode('button','btn btn-outline btn-sm pm-change-client','Buscar otro cliente');find.type='button';
  find.addEventListener('click',()=>{
   const form=modal.querySelector('#multi-payment-form,#owner-abono-form');if(!form)return;
   if(modal.querySelector('[type="submit"]:disabled')||document.querySelector('.pm-history-layer'))return;
   // No trasladar fechas, correlativos, importes ni fotografías de un cliente a otro.
   const dirty=[...form.querySelectorAll('input,textarea,select')].some(el=>{
    if(el.type==='file')return Boolean(el.files?.length);
    if(el.type==='checkbox'||el.type==='radio')return el.checked!==el.defaultChecked;
    if(el.matches('[data-payment-amount],[data-owner-statement],#pm-client-total,[name="receiptRef"]'))return Boolean(String(el.value||'').trim());
    if(el.matches('#multi-payment-search,[type="search"],[type="hidden"]'))return false;
    return el.tagName==='SELECT'?el.selectedIndex>0:el.value!==el.defaultValue;
   });
   if(dirty&&!window.confirm('Hay datos de un abono sin guardar. ¿Descartarlos y buscar otro cliente?'))return;
   newPayment(null,false);
  });
  row.append(name,find);header.append(row);
 }
 row.querySelector('.pm-header-client-name').textContent=client?.name||'Selecciona un cliente';
 row.querySelector('.pm-change-client').hidden=!client;
}
function pmIcon(name){return typeof ic==='function'?ic(name):'';}
function pmCard(title,icon){
 const card=pmNode('section','pm-card');
 const h=pmNode('h3');h.innerHTML=pmIcon(icon)+' '+title;
 const body=pmNode('div','pm-card-body');
 card.append(h,body);return {card,body};
}
function pmBadge(text){const el=pmNode('span','pm-tag',text);return el;}
function pmSummaryRow(label,value,cls=''){
 const row=pmNode('div','pm-summary-row '+cls),l=pmNode('span','',label),v=pmNode('strong','',value);
 row.append(l,v);return row;
}
function pmSales(){
 return Object.keys(paymentDraft?.amounts||{}).map(id=>getSale(id)).filter(Boolean);
}

let pmSelectedMonth=null;
const pmReadableDate=date=>new Intl.DateTimeFormat('es-HN',{day:'numeric',month:'long',year:'numeric',weekday:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));

function pmReconciled(sales) {
 const asOf=businessToday(),payments=(db.payments||[]).filter(p=>!p.voidedAt&&!p.deletedAt&&!p.cancelledAt&&!['voided','cancelled'].includes(p.status)&&p.date<=asOf);
 const ledger=reconcileInstallments(sales,payments,asOf,installmentDueCents,(date,index)=>dateKey(addMonths(date,index)),{requireReference:true});
 return {...ledger,rows:pmReportCurrentMonthFirst(ledger.rows,payments,asOf)};
}
function pmActualSchedule(sales){
 return pmReconciled(sales.filter(s=>s?.type==='credit'&&Number(s.months)>0)).rows;
}
function pmMonthLabel(status){
 return {'paid':'Cuota pagada','paid-late':'Cuota vencida pagada','advance-covered':'Cuota cubierta por adelanto','advance':'Adelanto parcial para esta cuota',
  'partial':'Abono parcial','late':'Cuota vencida sin pagar','pending':'Pendiente'}[status]||'Sin cuota';
}
function pmCalendar(root,sales){
 root.replaceChildren();
 const validSales=sales.filter(s=>s?.type==='credit'&&Number(s.months)>0);
 const ledger=pmReconciled(validSales),rows=ledger.rows;
 const yearAll=[...new Set(rows.map(r=>Number(r.dueDate.slice(0,4))))].sort((a,b)=>a-b);
 const now=businessToday(),current=Number(now.slice(0,4));
 const todayNotice=pmNode('div','pm-current-date');
 todayNotice.append(pmNode('strong','','Fecha actual de Honduras: '+pmReadableDate(now)),pmNode('small','','Esta fecha es informativa. Los recibos antiguos conservan su fecha real de pago.'));
 root.append(todayNotice);
 if(!yearAll.length){
  root.append(pmNode('p','pm-help',validSales.length?'Revisa la fecha de primera cuota y el plazo del contrato.':'Selecciona un solar con un contrato de crédito registrado.'));
  return;
 }
 if(!yearAll.includes(pmYear))pmYear=yearAll.includes(current)?current:yearAll[0];
 const paid=rows.filter(r=>r.status==='paid'||r.status==='paid-late'||r.status==='advance-covered').length;
 const directPaid=rows.filter(r=>r.remainingCents===0&&r.dueCents>0&&r.receipts.every(p=>p.date.slice(0,7)===r.dueDate.slice(0,7))).length;
 const advances=paid-directPaid;
 const partialAdvances=rows.filter(r=>r.remainingCents>0&&r.receipts.some(p=>p.date.slice(0,7)!==r.dueDate.slice(0,7))).length;
 const pending=rows.length-paid;
 const next=rows.find(r=>r.remainingCents>0);
 const progress=pmNode('div','pm-progress');
 for(const [label,value] of [
  ['Plan de pago',rows.length+' cuotas (la prima es aparte)'],
  ['Cuotas cubiertas (sin prima)',String(paid)],
  ['Pagadas con recibo del mes',String(directPaid)],
  ['Cuotas pendientes / por conciliar',String(pending)],
  ['Cubiertas con excedente',String(advances)],
  ['Abono parcial con excedente',String(partialAdvances)],
  ['Próxima cuota por revisar',next?next.dueDate:'Sin cuotas pendientes']
 ]){
  const item=pmNode('div');item.append(pmNode('span','',label),pmNode('strong','',value));progress.append(item);
 }
 const bar=pmNode('div','pm-yearbar'),prev=pmNode('button','','‹'),year=pmNode('strong','pm-year',String(pmYear)),nextBtn=pmNode('button','','›');
 prev.type=nextBtn.type='button';prev.dataset.pmYear='previous';nextBtn.dataset.pmYear='next';
 prev.disabled=pmYear===yearAll[0];nextBtn.disabled=pmYear===yearAll[yearAll.length-1];
 bar.append(prev,year,nextBtn);
 const months=pmNode('div','pm-months'),names=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
 for(let m=1;m<=12;m++){
  const key=String(pmYear)+'-'+String(m).padStart(2,'0');
  const inMonth=rows.filter(r=>r.dueDate.slice(0,7)===key);
  let status='none';
  if(inMonth.length){
   const covered=inMonth.every(r=>r.remainingCents===0);
   const direct=inMonth.every(r=>r.receipts.length&&r.receipts.every(p=>p.date.slice(0,7)===key));
   const hasOverdue=inMonth.some(r=>r.remainingCents>0&&r.dueDate<now);
   const applied=inMonth.some(r=>r.appliedCents>0);
   status=covered?(direct?'paid':'excess-covered'):hasOverdue?'late':applied?'partial':'pending';
  }
  const glyph={'paid':'✓','paid-late':'✓','excess-covered':'↗✓','advance-covered':'↗✓','advance':'↗','late':'!','pending':'◷','partial':'◐','mixed':'◐',none:'—'}[status];
  const cell=pmNode('button','pm-month '+status+(key===now.slice(0,7)?' current':'')+(pmSelectedMonth===key?' pm-month-selected':''));
  cell.type='button';cell.dataset.pmMonth=key;cell.setAttribute('aria-pressed',String(pmSelectedMonth===key));
  cell.setAttribute('aria-label',names[m-1]+' '+pmYear+': '+(inMonth.length?inMonth.map(x=>pmReportPaymentStatus(x,now)).join('; '):'sin cuota programada'));
  cell.title=inMonth.length?inMonth.map(x=>'Cuota '+x.number+' · '+x.dueDate+' · '+pmReportPaymentStatus(x,now)).join('\n'):'Sin cuota programada';
  cell.append(pmNode('strong','',names[m-1]),pmNode('small','',glyph));
  if(inMonth.length)cell.append(pmNode('small','pm-due-day',inMonth.length===1?'Vence '+inMonth[0].dueDate.slice(8,10):inMonth.length+' cuotas'));
  if(key===now.slice(0,7))cell.append(pmNode('small','pm-today-day','Hoy '+now.slice(8,10)));
  months.append(cell);
 }
 const foot=pmNode('p','pm-calendar-note','Verde: pagada con correlativo del mes; azul: cubierta con excedente de otro mes; rojo: vencida con saldo pendiente; amarillo: pendiente o parcial antes de vencer. Pulsa un mes para ver importe, fecha y correlativo de origen. La prima no cuenta como cuota.');
 root.append(progress,bar,months,foot);
 const unknown=validSales.reduce((sum,s)=>sum+Math.max(0,Number(s.openingPaid||0)),0);
 if(unknown>0)root.append(pmNode('p','pm-calendar-note pm-calendar-warning','Saldo de apertura sin recibos mensuales fechados: '+money(unknown)+'. Se conserva en el saldo financiero, pero no colorea meses como pagados.'));
 if(ledger.unmatched.length)root.append(pmNode('p','pm-calendar-note pm-calendar-warning',ledger.unmatched.length+' pago(s) requieren conciliación (fecha, correlativo o importe). No se cuentan como cuotas confirmadas.'));
 if(pmSelectedMonth&&pmSelectedMonth.slice(0,4)===String(pmYear)){
  const selected=rows.filter(r=>r.dueDate.slice(0,7)===pmSelectedMonth);
  const details=pmNode('section','pm-month-details'),title=pmNode('h4','','Detalle de '+pmSelectedMonth);
  details.append(title);
  if(!selected.length)details.append(pmNode('p','pm-help','No hay una cuota programada para este mes.'));
  for(const row of selected){
   const sale=getSale(row.saleId),lot=getLot(sale?.lotId);
   const card=pmNode('div','pm-month-receipt');
   card.append(pmNode('strong','',pmReportPaymentStatus(row,now)+' · Cuota '+row.number+' de '+row.total));
   card.append(pmNode('small','','Etapa '+(lot?.stage||'—')+' · Bloque '+(lot?.block||'—')+' · Solar '+(lot?.sourceNumber||lot?.id||'—')+' · Vence '+row.dueDate));
   card.append(pmNode('small','','Valor cuota: '+money(row.dueCents/100)+' · Cubierto con recibos fechados: '+money(row.appliedCents/100)+' · Falta: '+money(row.remainingCents/100)));
   if(row.advanceCents>0)card.append(pmNode('small','pm-advance-text','Aplicado por anticipado: '+money(row.advanceCents/100)+(row.remainingCents===0?' · Cuota cubierta: no genera mora ni nuevo cobro':' · Aún falta '+money(row.remainingCents/100))));
   if(!row.receipts.length)card.append(pmNode('small','','No hay recibos fechados vinculados a esta cuota.'));
   for(const pay of row.receipts){
    const line=pmNode('div','pm-month-receipt-line');
    line.append(pmNode('span','',pay.date+' · '+money(pay.amountCents/100)+(pay.date.slice(0,7)!==row.dueDate.slice(0,7)?' · Excedente':'')+' · Correlativo '+(pay.reference||'Sin verificar')));
    const link=pmNode('button','btn btn-outline btn-sm','Ver / imprimir recibo');
    link.type='button';link.dataset.action='receipt-preview';link.dataset.id=pay.paymentId;
    line.append(link);card.append(line);
   }
   details.append(card);
  }
  root.append(details);
 }
}
function pmCalendarCard(sales){
 const card=pmCard('Calendario de pagos (Cronograma)','calendar');card.card.classList.add('pm-calendar');
 const legend=pmNode('div','pm-legend');
 legend.innerHTML='<span><i class="pm-dot paid"></i>Pagada con correlativo</span><span><i class="pm-dot excess-covered"></i>Cubierta con excedente</span><span><i class="pm-dot late"></i>Vencida pendiente</span><span><i class="pm-dot pending"></i>Pendiente / parcial</span>';
 const top=pmNode('div','pm-calendar-top');top.append(card.card.querySelector('h3'),legend);card.card.prepend(top);
 card.body.classList.add('pm-calendar-body');pmCalendar(card.body,sales);return card.card;
}
function pmMethodButtons(select){
 const box=pmNode('div','pm-method-buttons');
 for(const [value,label,icon] of [['Efectivo','Efectivo','wallet'],['Transferencia','Transferencia','repeat'],['Tarjeta','Tarjeta','credit']]){
  const btn=pmNode('button','',label);btn.type='button';btn.dataset.pmMethod=value;
  btn.innerHTML=pmIcon(icon)+'<span>'+label+'</span>';
  btn.setAttribute('aria-pressed',String(select.value===value));box.append(btn);
 }
 return box;
}
function pmFields(grid,form){
 const find=name=>{const el=grid.querySelector('[name="'+name+'"]');return el?(el.closest('.field-group')||el.closest('label')):null;};
 const date=find('date'),method=find('method'),concept=find('concept'),ref=find('receiptRef');
 const fields=pmNode('div','pm-fields');
 if(method){
  const native=method.querySelector('[name="method"]');
  let select=native;
  if(native?.tagName!=='SELECT'){
   // El formulario histórico usa un campo texto; sustituirlo por valores controlados.
   select=pmNode('select');select.name='method';select.required=true;
   for(const value of ['Efectivo','Transferencia','Tarjeta']){
    const option=pmNode('option','',value);option.value=value;select.append(option);
   }
   select.value=['Efectivo','Transferencia','Tarjeta'].includes(native?.value)?native.value:'Efectivo';
   native?.replaceWith(select);
  }
  const outer=pmNode('div','pm-span-2');
  const label=pmNode('label','','Tipo de pago *');
  outer.append(label,pmMethodButtons(select));
  method.style.display='none';outer.append(method);fields.append(outer);
 }
 if(date){
  const wrapper=pmNode('div','pm-date-group'),entry=date.querySelector('input[name="date"]');
  if(entry){entry.max=businessToday();entry.setAttribute('aria-label','Fecha real del pago o abono');}
  const help=pmNode('small','pm-help','Hoy en Honduras: '+pmReadableDate(businessToday())+'. Puedes ingresar una fecha anterior si registras pagos atrasados.');
  const today=pmNode('button','btn btn-outline btn-sm pm-date-today','Usar fecha de hoy');
  today.type='button';today.dataset.pmUseToday='true';
  wrapper.append(date,help,today);fields.append(wrapper);
 }
 const slot=pmNode('div','pm-slot');slot.id='pm-amount-slot';fields.append(slot);
 if(ref){ref.classList.add('pm-span-2');fields.append(ref);}
 const apply=pmNode('div','pm-field pm-span-2');apply.innerHTML='<label for="pm-apply">Aplicar a:</label><select id="pm-apply" name="paymentApplication" aria-label="Aplicación del pago"><option value="auto">Según deuda pendiente (automático)</option><option value="prima">Abono a prima pendiente (sin cuota mínima)</option></select><p class="pm-help" id="pm-apply-help">Primero prima pendiente; después, cuotas más antiguas.</p>';
 fields.append(apply);
 if(concept){concept.classList.add('pm-span-2');const input=concept.querySelector('input,textarea');if(input)input.placeholder='Ej. Abono correspondiente a noviembre de 2026';fields.append(concept);}
 grid.remove();return fields;
}
function pmQrOcr(form){
 // El OCR permanece dentro del formulario para reutilizar sus lectores y validadores.
 // Solo se muestra cuando se pulsa el acceso del pie; nunca ocupa espacio sobre Abonos.
 const widget=form.querySelector('[data-paper-ocr-photo]')?.closest('fieldset');
 if(!widget)return null;
 const section=pmNode('section','pm-ocr pm-ocr-panel');
 section.id='pm-ocr-panel';section.hidden=true;
 section.setAttribute('role','region');
 section.setAttribute('aria-label','Escanear recibo de caja · Grupo H (OCR)');
 const heading=pmNode('div','pm-ocr-heading');
 const label=pmNode('strong','','Escanear recibo de caja · Grupo H (OCR)');
 const close=pmNode('button','pm-ocr-close','✕');
 close.type='button';close.dataset.pmOcrClose='true';close.setAttribute('aria-label','Cerrar lector OCR');
 heading.append(label,close);section.append(heading,widget);return section;
}
function pmAddOcrFooter(modal){
 const footer=modal.querySelector('.modal-footer'),panel=modal.querySelector('#pm-ocr-panel');
 if(!footer||!panel||footer.querySelector('[data-pm-ocr-toggle]'))return;
 const button=pmNode('button','btn btn-outline pm-ocr-trigger');
 button.type='button';button.dataset.pmOcrToggle='true';
 button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','false');
 button.setAttribute('aria-label','Escanear recibo de caja · Grupo H (OCR)');
 button.innerHTML='<svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a2 2 0 0 1 2-2h2M16 3h2a2 2 0 0 1 2 2v3M20 16v3a2 2 0 0 1-2 2h-2M8 21H6a2 2 0 0 1-2-2v-3"/><path d="M9 6h6l2 2v10H7V6h2zM10 11h4m-4 3h4"/></svg><span>Escanear recibo<small>Grupo H (OCR)</small></span>';
 footer.append(button);
}
function pmFooter(modal,formId){
 const footer=modal.querySelector('.modal-footer');if(!footer)return;
 footer.innerHTML='<button type="button" class="btn btn-soft pm-cancel" data-action="close-modal">✕ Cancelar</button><button type="submit" class="btn pm-receipt" data-pm-save-mode="receipt" form="'+formId+'">▤ Generar recibo</button><button type="submit" class="btn pm-save" data-pm-save-mode="save" form="'+formId+'">✓ Guardar pago</button>';
 pmAddOcrFooter(modal);
}
// En pagos de venta el widget OCR se agrega DESPUÉS de showModal, cuando pmFooter
// ya se ejecutó. Reubicarlo aquí garantiza el acceso inferior y elimina el bloque superior.
function pmEnsureOcrFooter(form){
 const modal=form?.closest('.lg-payment-modern'),shell=form?.querySelector('.pm-shell');
 const widget=form?.querySelector('[data-paper-ocr-photo]')?.closest('fieldset');
 if(!modal||!shell||!widget)return;
 let panel=shell.querySelector('#pm-ocr-panel');
 if(!panel){panel=pmQrOcr(form);if(panel)shell.append(panel);}
 else if(!panel.contains(widget))panel.append(widget);
 pmAddOcrFooter(modal);
}
// La lista de asignados muestra todas las ventas elegibles del cliente,
// sin agregar importes ni seleccionar cobros implícitamente.
function pmAssignedSales(clientId){
 if(!clientId||!paymentDraft)return [];
 const rows=paymentCandidates('').filter(s=>s.clientId===clientId&&getLot(s.lotId)?.residenceId===paymentDraft.residenceId);
 const seen=new Set(rows.map(s=>s.id));
 for(const selected of pmSales())if(selected.clientId===clientId&&!seen.has(selected.id)){
  rows.push(selected);seen.add(selected.id);
 }
 return rows.sort((a,b)=>String(getLot(a.lotId)?.stage||'').localeCompare(String(getLot(b.lotId)?.stage||''),'es',{numeric:true})||
  String(getLot(a.lotId)?.block||'').localeCompare(String(getLot(b.lotId)?.block||''),'es',{numeric:true})||
  String(getLot(a.lotId)?.sourceNumber||a.lotId).localeCompare(String(getLot(b.lotId)?.sourceNumber||b.lotId),'es',{numeric:true}));
}
function pmRenderAssignedLots(tags,clientId){
 tags.replaceChildren();
 for(const sale of pmAssignedSales(clientId)){
  const lot=getLot(sale.lotId);
  const tag=pmBadge('Etapa '+(lot?.stage||'por confirmar')+' · Bloque '+(lot?.block||'—')+' · Solar '+(lot?.sourceNumber||lot?.number||lot?.id||'—'));
  tag.dataset.pmAssignedLot=sale.lotId;tag.setAttribute('aria-label','Solar incluido en el abono');tags.append(tag);
 }
}
function pmIncludeClientSales(){
 if(!paymentDraft?.clientId)return;
 for(const sale of pmAssignedSales(paymentDraft.clientId))paymentDraft.amounts[sale.id]??='';
}
function pmApplyClientTotal(raw){
 const total=String(raw??'').replace(/,/g,'').trim(),sales=pmSales();
 try{
  const rows=total?splitClientPayment(db,sales.map(s=>s.id),Math.round(Number(total)*100),null,document.getElementById('pm-apply')?.value||'auto'):[];
  const amounts=new Map(rows.map(r=>[r.saleId,String(r.amount)]));
  for(const sale of sales)paymentDraft.amounts[sale.id]=amounts.get(sale.id)||'';
  for(const input of document.querySelectorAll('[data-payment-amount]'))input.value=paymentDraft.amounts[input.dataset.paymentAmount]||'';
  updateMultiPaymentTotal();
  const error=document.getElementById('multi-payment-error');if(error)error.textContent='';
 }catch(e){
  for(const sale of sales)paymentDraft.amounts[sale.id]='';
  for(const input of document.querySelectorAll('[data-payment-amount]'))input.value='';
  const error=document.getElementById('multi-payment-error');if(error)error.textContent=e.message;
 }
}
function pmRepaintSales(){
 const form=document.querySelector('#multi-payment-form');
 if(!form||pmActive!=='sale'||!form.closest('.lg-payment-modern'))return;
 pmIncludeClientSales();
 const sales=pmSales(),single=sales.length===1,client=sales.length?getClient(sales[0].clientId):null;
 const name=document.getElementById('pm-client-name'),identity=document.getElementById('pm-client-id'),tags=document.getElementById('pm-lot-tags');
 if(name)name.textContent=client?.name||'Selecciona un cliente';
 pmHeaderClient(form.closest('.lg-payment-modern'),client);
 if(identity)identity.textContent=client?.identity?'Identidad: '+client.identity:'Residencial: '+residence().name;
 if(tags)pmRenderAssignedLots(tags,client?.id||paymentDraft?.clientId);
 const summary=document.getElementById('pm-summary');
 if(summary){
  summary.replaceChildren();
  if(!sales.length)summary.append(pmNode('p','pm-help','Selecciona un cliente y sus solares para ver los valores reales de su contrato.'));
  else{
   const price=sales.reduce((a,s)=>a+Number(s.price||0),0),agreed=sales.reduce((a,s)=>a+Number(s.downPayment||0),0),paid=sales.reduce((a,s)=>a+paidAmount(s.id),0);
   const paidPrima=sales.reduce((a,s)=>a+Math.min(Number(s.downPayment||0),paidAmount(s.id)),0);
   const remaining=sales.reduce((a,s)=>a+balance(s),0);
   const ledger=pmReconciled(sales),confirmed=ledger.rows.filter(r=>r.status==='paid'||r.status==='paid-late'||r.status==='advance-covered').length;
   const monthlyCents=ledger.rows.reduce((t,r)=>t+r.confirmedCents,0);
   const advances=ledger.rows.reduce((t,r)=>t+r.advanceCents,0);
   summary.append(pmSummaryRow('Precio total del terreno'+(single?'':'s'),money(price)),pmSummaryRow('Prima acordada (no es cuota)',money(agreed)),pmSummaryRow('Prima aplicada en la contabilidad',money(paidPrima)));
   summary.append(pmSummaryRow('Prima faltante',money(Math.max(0,agreed-paidPrima)),agreed-paidPrima>.009?'pm-warning':''));
   summary.append(pmSummaryRow('Saldo inicial a financiar (precio − prima)',money(Math.max(0,price-agreed))));
   summary.append(pmSummaryRow('Cuotas cubiertas con recibos (sin prima)',String(confirmed)+' cuotas'));
   summary.append(pmSummaryRow('Abonos a cuotas identificadas',money(monthlyCents/100)));
   summary.append(pmSummaryRow('Adelantos aplicados a meses futuros',money(advances/100)));
   summary.append(pmSummaryRow('Total contabilizado (prima y demás pagos)',money(paid)));
   summary.append(pmSummaryRow('Saldo restante actual',money(remaining),'pm-good'));
   const regular=sales.filter(s=>s.type==='credit'&&Number(s.months)>0).map(s=>({sale:s,cents:installmentDueCents(s,1)}));
   const amount=regular.reduce((n,s)=>n+s.cents,0);
   for(const item of regular){const lot=getLot(item.sale.lotId);summary.append(pmSummaryRow('Cuota base · Solar '+(lot?.sourceNumber||lot?.number||lot?.id||'—'),money(item.cents/100),'pm-base-monthly'));}
   if(regular.length)summary.append(pmSummaryRow('Cuota mensual base total ('+regular.length+' solar'+(regular.length===1?'':'es')+')',money(amount/100),'pm-monthly-total'));

   if(ledger.unmatched.length||sales.some(s=>Number(s.openingPaid)>0))
    summary.append(pmNode('p','pm-help','Hay movimientos históricos o saldos iniciales sin mes comprobado: se conservan en el saldo financiero, pero NO suman cuotas pagadas.'));
  }
 }
 pmUpdateLastPayment(client?.id||'',residence().id);
 const historyBtn=document.querySelector('#multi-payment-form .pm-history-launch');if(historyBtn)historyBtn.disabled=!sales.length;
 const selected=document.getElementById('multi-payment-selected'),slot=document.getElementById('pm-amount-slot'),search=document.getElementById('pm-searchbox');
 if(selected)selected.classList.toggle('hidden-single',single||!sales.length);
 if(search)search.classList.toggle('has-selection',!!sales.length);
 const clientFold=document.getElementById('pm-fold-client');
 if(clientFold){const had=clientFold.dataset.hasClient==='true',has=!!sales.length;clientFold.querySelector('summary').textContent=has?'Cliente / solares · '+(client?.name||'Seleccionado'):'Buscar cliente / solares';if(had!==has||!has)clientFold.open=!has;clientFold.dataset.hasClient=String(has);}
 if(slot){
  slot.replaceChildren();
  if(single){
   const label=selected?.querySelector('label:has([data-payment-amount])');
   if(label){label.firstChild.textContent='Monto a abonar (L) *';slot.append(label);}
  }else if(sales.length){
   const label=pmNode('label','','Monto total del abono (L) *'),input=pmNode('input');
   input.type='number';input.min='0.01';input.step='0.01';input.required=true;input.id='pm-client-total';
   const total=Object.values(paymentDraft.amounts).reduce((n,a)=>n+Number(a||0),0);input.value=total?String(total):'';
   input.addEventListener('input',()=>pmApplyClientTotal(input.value));label.append(input);slot.append(label);
   slot.append(pmNode('p','pm-help','Se reparte automáticamente según la prima pendiente o la cuota de cada solar.'));
   // Mantener los controles originales para el guardado, sin pedir un importe por solar.
   if(selected)for(const input of selected.querySelectorAll('[data-payment-amount]')){input.readOnly=true;input.required=false;}
   if(selected)for(const input of selected.querySelectorAll('[data-pm-currency]'))input.required=false;
  }else slot.append(pmNode('p','pm-help','Selecciona un cliente para ingresar un pago.'));
 }
 const application=document.getElementById('pm-apply');
 if(application){
  const primaFaltante=sales.reduce((total,s)=>total+Math.max(0,Number(s.downPayment||0)-paidAmount(s.id)),0);
  application.options[0].textContent=primaFaltante>.009?'Prima pendiente y después mensual (automático)':'Abono mensual (automático)';
  const primaOption=application.querySelector('option[value="prima"]');
  if(primaOption)primaOption.disabled=primaFaltante<=.009;
  if(primaFaltante<=.009&&application.value==='prima')application.value='auto';
  const help=document.getElementById('pm-apply-help');
  if(help)help.textContent=application.value==='prima'?'Prima pendiente: '+money(primaFaltante)+'. Puedes abonar cualquier monto positivo hasta completarla, sin cuota mínima.':'Primero prima pendiente; después, cuotas más antiguas.';
  application.onchange=()=>{
   const total=document.getElementById('pm-client-total');if(total&&total.value)pmApplyClientTotal(total.value);
   const concept=form.elements.concept;
   if(concept&&application.value==='prima')concept.value='Abono a prima pendiente';
   if(help)help.textContent=application.value==='prima'?'Prima pendiente: '+money(primaFaltante)+'. Sin cuota mínima.':'Primero prima pendiente; después, cuotas más antiguas.';
   const error=document.getElementById('multi-payment-error');if(error&&(!total||!total.value))error.textContent='';
  };
 }
 const distribution=document.getElementById('pm-distribution');
 if(distribution)distribution.hidden=true;
 const calendar=document.getElementById('pm-calendar-body');if(calendar)pmCalendar(calendar,sales);
}
// Diseño compacto: las secciones informativas conservan sus nodos y eventos.
function pmFold(title,...nodes){
 const details=pmNode('details','pm-fold'),header=pmNode('summary','pm-fold-title',title);
 details.append(header,...nodes.filter(Boolean));return details;
}
function pmCompactSales(form,shell,search,person,last,historyBar,summary,cal,entry,fields){
 const modal=form.closest('.lg-payment-modern');if(!modal)return;
 modal.classList.add('pm-compact-payment');
 // La búsqueda y los solares son accesibles sin desplazar el formulario de pago.
 const client=pmFold('Buscar cliente / solares',search,person);
 client.id='pm-fold-client';client.open=!pmSales().length;
 const lastFold=pmFold('Último pago registrado',last,historyBar);
 const contract=pmFold('Resumen del contrato',summary);
 const statement=summary.querySelector('.pm-statement-launch');
 if(statement)contract.firstElementChild.after(statement);
 const calendar=pmFold('Calendario de pagos (Cronograma)',cal);
 const monthly=pmNode('section','notice-card');monthly.dataset.monthlyBanner='true';
 const monthlyFold=pmFold('Cuota mensual de los solares',monthly);
 // El importe y el correlativo usan los inputs existentes, no copias.
 const amount=fields.querySelector('#pm-amount-slot');
 const reference=fields.querySelector('[name="receiptRef"]');
 const referenceField=reference&&[...fields.children].find(el=>el.contains(reference));
 if(amount)fields.prepend(amount);
 if(referenceField){referenceField.classList.add('pm-primary-reference');if(amount)amount.after(referenceField);}
 const date=fields.querySelector('.pm-date-group');
 if(date){date.classList.add('pm-primary-date');(referenceField||amount)?.after(date);}
 const secondary=Array.from(fields.children).filter(el=>el!==amount&&el!==referenceField&&el!==date);
 if(secondary.length){const options=pmFold('Opciones del pago',...secondary);options.classList.add('pm-payment-options');fields.append(options);}
 const sections=pmNode('div','pm-fold-list');
 sections.append(client,lastFold,monthlyFold,contract,calendar);
 // El panel Abono nunca se pliega y ocupa todo el ancho útil de la ventana.
 shell.prepend(entry,sections);
 entry.querySelector('h3').textContent='Abono';
 form.addEventListener('invalid',event=>{for(let el=event.target.parentElement;el&&el!==form;el=el.parentElement){if(el.tagName==='DETAILS')el.open=true;}},true);
}
function pmSalesDecorate(){
 const form=document.getElementById('multi-payment-form');
 if(!form)return;
 pmActive='sale';pmYear=null;pmSelectedMonth=null;
 const modal=pmModal('Registrar Pago / Abono','Registra un nuevo pago, abono o prima del cliente.');
 const grid=form.querySelector('.form-grid'),searchInput=form.querySelector('#multi-payment-search'),searchLabel=form.querySelector('label[for="multi-payment-search"]'),results=form.querySelector('#multi-payment-results'),selected=form.querySelector('#multi-payment-selected'),total=form.querySelector('#multi-payment-total'),error=form.querySelector('#multi-payment-error');
 if(!modal||!grid||!searchInput||!selected||!results)return;
 modal.classList.add('pm-sales-wide');
 const ocr=pmQrOcr(form),fields=pmFields(grid,form);
 const shell=pmNode('div','pm-shell pm-sales-shell');
 const search=pmNode('section','pm-searchbox');search.id='pm-searchbox';if(searchLabel)search.append(searchLabel);search.append(searchInput,results);shell.append(search);
 const person=pmNode('div','pm-clientbar');
 const a=pmNode('div','pm-clientbox');a.innerHTML=pmIcon('users')+'<div><small>Cliente</small><strong id="pm-client-name"></strong><p id="pm-client-id"></p></div>';
 const b=pmNode('div','pm-clientbox');b.innerHTML=pmIcon('pin')+'<div><small>Solar(es) asignado(s)</small><div id="pm-lot-tags"></div></div>';
 person.append(a,b);shell.append(person);
 const last=pmNode('section','pm-last-payment');last.id='pm-last-payment';last.setAttribute('role','status');last.setAttribute('aria-live','polite');person.append(last);
 const historyBar=pmNode('div','pm-history-toolbar');
 const historyBtn=pmNode('button','btn btn-outline pm-history-launch','Reportes');
 historyBtn.type='button';historyBtn.dataset.pmReportsOpen='true';historyBtn.setAttribute('aria-haspopup','dialog');
 historyBar.append(historyBtn);person.append(historyBar);
 const main=pmNode('div','pm-grid pm-sales-grid');
 const summary=pmCard('Resumen del contrato','layers');summary.body.id='pm-summary';
 const statement=pmNode('button','btn pm-statement-launch','Estado de cuenta');statement.type='button';statement.setAttribute('aria-haspopup','dialog');statement.setAttribute('aria-label','Descargar o enviar estado de cuenta');statement.addEventListener('click',()=>pmOpenStatement(statement));summary.card.querySelector('h3').append(statement);

 const entry=pmCard('Registrar nuevo pago','wallet');entry.body.append(fields);
 if(ocr)shell.append(ocr);
 if(total){total.style.display='none';entry.body.append(total);}
 const dist=pmNode('div','pm-distribution');dist.id='pm-distribution';dist.append(pmNode('h4','','Distribución del abono por solar'));selected.classList.add('pm-selected');dist.append(selected);entry.body.append(dist);
 if(error){error.classList.add('pm-error');entry.body.append(error);}
 summary.card.classList.add('pm-contract-column');entry.card.classList.add('pm-entry-column');
 const cal=pmCalendarCard([]);cal.querySelector('.pm-calendar-body').id='pm-calendar-body';
 main.append(summary.card,cal,entry.card);shell.append(main);
 form.replaceChildren(shell);pmFooter(modal,'multi-payment-form');
 pmCompactSales(form,shell,search,person,last,historyBar,summary.card,cal,entry.card,fields);
 main.remove();
 pmRepaintSales();
 if(typeof monthlyRefresh==='function')monthlyRefresh();
}
function pmOwnerDecorate(){
 const form=document.getElementById('owner-abono-form');
 if(!form)return;
 pmActive='owner';pmYear=null;
 const modal=pmModal('Registrar Pago / Abono','Registra un abono a una o varias fichas del propietario.');
 const grid=form.querySelector('.form-grid'),refs=form.querySelector('[data-owner-statement]')?.closest('div[style*="max-height"]')||form.querySelector('div[style*="max-height"]'),total=form.querySelector('#owner-abono-total'),error=form.querySelector('#owner-abono-error'),confirm=form.querySelector('input[name="reviewed"]')?.closest('label');
 if(!modal||!grid||!refs)return;
 const ocr=pmQrOcr(form),fields=pmFields(grid,form);
 // En las fichas el importe se distribuye en los campos originales por solar.
 const slot=fields.querySelector('#pm-amount-slot');if(slot){slot.id='pm-owner-slot';slot.append(pmNode('p','pm-help','Indica los montos por solar o como abono conjunto en la ficha.'));}
 const apply=fields.querySelector('#pm-apply')?.closest('.pm-field');if(apply)apply.remove();
 const shell=pmNode('div','pm-shell');
 const client=getClient(ownerPaymentDraft?.clientId),docs=(db.ownershipStatements||[]).filter(s=>s.clientId===ownerPaymentDraft?.clientId&&s.residenceId===ownerPaymentDraft.residenceId);
 const person=pmNode('div','pm-clientbar'),a=pmNode('div','pm-clientbox'),b=pmNode('div','pm-clientbox');
 a.innerHTML=pmIcon('users')+'<div><small>Cliente</small><strong>'+esc(client?.name||'—')+'</strong><p>'+(client?.identity?'Identidad: '+esc(client.identity):'Residencial: '+esc(residence().name))+'</p></div>';
 b.innerHTML=pmIcon('pin')+'<div><small>Solar(es) de la ficha</small><div>'+docs.flatMap(s=>(s.references||[]).map(r=>'<span class="pm-tag">Etapa '+esc(r.stage||'por confirmar')+' · Bloque '+esc(r.block)+' · Solar '+esc(r.lot||r.solar||'—')+'</span>')).join('')+'</div></div>';
 person.append(a,b);shell.append(person);
 const last=pmNode('section','pm-last-payment');last.id='pm-last-payment';last.setAttribute('role','status');last.setAttribute('aria-live','polite');shell.append(last);
 const historyBar=pmNode('div','pm-history-toolbar');
 const historyBtn=pmNode('button','btn btn-outline pm-history-launch','Reportes');
 historyBtn.type='button';historyBtn.dataset.pmReportsOpen='true';historyBtn.setAttribute('aria-haspopup','dialog');
 historyBar.append(historyBtn);shell.append(historyBar);
 const main=pmNode('div','pm-grid'),left=pmCard('Resumen de fichas','layers'),right=pmCard('Registrar nuevo pago','wallet');
 let count=0,totalDocumented=0,allKnown=true;
 for(const doc of docs){
  const v=lotigestOwnerPayments.ownerStatementBalance(db,doc);
  if(v==null){allKnown=false;continue;}totalDocumented+=v;count++;
 }
 const status=lotigestPrimaStatus(ownerPaymentDraft?.clientId,ownerPaymentDraft?.residenceId,
  [...new Set(docs.flatMap(s=>(s.references||[]).map(r=>r.lotId).filter(Boolean)))]);
 const alert=pmNode('div','pm-prima-alert '+(lotigestPrimaHighlight(status)?'pm-prima-unpaid':
  status.kind==='paid'||status.kind==='recorded'?'pm-prima-ok':'pm-prima-unknown'));
 alert.append(pmNode('strong','',lotigestPrimaLabel(status)));
 if(lotigestPrimaHighlight(status))alert.append(pmNode('small','','Prima sin registrar o incompleta: revisa el recibo y selecciona el pago correspondiente antes de guardarlo.'));
 left.body.append(alert);
 left.body.append(pmSummaryRow('Prima acordada',status.agreedCents===null?'Por verificar':money(status.agreedCents/100)),
  pmSummaryRow('Prima registrada',status.paidCents===null?'Por verificar':money(status.paidCents/100)),
  pmSummaryRow('Prima faltante',status.remainingCents===null?'Importe por verificar':money(status.remainingCents/100),
   lotigestPrimaHighlight(status)?'pm-warning':''));
 left.body.append(pmSummaryRow('Fichas vinculadas',String(docs.length)),pmSummaryRow('Solares referenciados',String(docs.flatMap(s=>s.references||[]).length)));
 left.body.append(pmSummaryRow('Saldo documentado',allKnown&&count?money(totalDocumented/100):'Por confirmar','pm-good'));
 left.body.append(pmNode('p','pm-help','Las fichas sin contrato de crédito verificado no se presentan como cuotas pagadas ni como mora.'));
 right.body.append(fields);
 if(total){total.classList.add('pm-summary-row','pm-good');right.body.append(total);}
 const distribution=pmNode('div','pm-owner-allocations');distribution.append(refs);right.body.append(distribution);
 if(ocr)shell.append(ocr);
 if(confirm)right.body.append(confirm);
 if(error){error.classList.add('pm-error');right.body.append(error);}
 main.append(left.card,right.card);shell.append(main);
 const cal=pmCard('Calendario de pagos (Cronograma)','calendar');cal.body.append(pmNode('p','pm-help','Las fichas de propietario no tienen un calendario de cuotas verificable hasta que se registren el contrato, las fechas y el plazo. Puedes registrar el abono sin inventar meses pagados.'));
 shell.append(cal.card);form.replaceChildren(shell);pmFooter(modal,'owner-abono-form');
 pmHeaderClient(modal,client);
 pmUpdateLastPayment(client?.id||'',ownerPaymentDraft?.residenceId);
}
// Interceptor único: cualquiera que sea el acceso (Cuotas, Clientes, Fichas, Cobros),
// el formulario se estiliza al crearse. No dependemos del botón que lo abrió.
function pmPickerDecorate(){
 const input=document.getElementById('owner-payment-search');
 const results=document.getElementById('owner-payment-customers');
 if(!input||!results)return;
 const modal=pmModal('Registrar Pago / Abono','Busca al cliente para consultar sus solares y registrar el pago.');
 if(!modal)return;
 const content=modal.querySelector('.modal-content');
 const shell=pmNode('div','pm-shell');
 const card=pmCard('Seleccionar cliente y solares','users');
 const person=pmNode('div','pm-clientbox');
 person.innerHTML=pmIcon('users')+'<div><small>Cliente</small><strong>Selecciona al propietario</strong><p>Los pagos y solares aparecerán desde los registros guardados.</p></div>';
 card.body.append(person);
 const label=pmNode('label','','Buscar por nombre o seleccionar ficha');
 label.htmlFor='owner-payment-search';
 input.placeholder='Escribe el nombre del cliente…';
 input.style.width='100%';
 results.classList.add('pm-picker-results');
 results.style.maxHeight='min(46dvh,440px)';
 results.style.overflow='auto';
 card.body.append(label,input,results);
 shell.append(card.card);
 // Sustituye únicamente el contenido del buscador, sin destruir los controles originales.
 content.replaceChildren(shell);
 const footer=modal.querySelector('.modal-footer');
 if(footer)footer.innerHTML='<button type="button" class="btn btn-soft pm-cancel" data-action="close-modal">Cancelar</button>';
}
const pmOriginalShowModal=showModal;
showModal=function(title,content,footer='',wide=false,subtitle=''){
 const result=pmOriginalShowModal(title,content,footer,wide,subtitle);
 if(document.getElementById('multi-payment-form'))pmSalesDecorate();
 else if(document.getElementById('owner-abono-form'))pmOwnerDecorate();
 else if(document.getElementById('owner-payment-search'))pmPickerDecorate();
 return result;
};
choosePaymentMode=function(){newPayment(null,false);};
const pmPreviousPaymentResults=renderPaymentResults;
renderPaymentResults=function(){
 const result=pmPreviousPaymentResults(),root=document.getElementById('multi-payment-results');
 if(!root||!paymentDraft)return result;
 const seen=new Set();
 for(const button of root.querySelectorAll('[data-action="multi-payment-add"]')){
  const sale=getSale(button.dataset.id);if(!sale)continue;
  if(seen.has(sale.clientId)){button.remove();continue;}
  seen.add(sale.clientId);button.textContent=getClient(sale.clientId)?.name||'Cliente';
 }
 return result;
};
const pmOriginalSelected=renderPaymentSelected;
renderPaymentSelected=function(){pmIncludeClientSales();const ret=pmOriginalSelected();if(pmActive==='sale')pmRepaintSales();return ret;};
const pmOriginalReceiptPreview=paymentReceiptPreview;
paymentReceiptPreview=function(id){if(pmSaveOnly){pmSaveOnly=false;return;}return pmOriginalReceiptPreview(id);};
const pmOriginalOwnerPreview=ownerPaymentPreview;
ownerPaymentPreview=function(id){if(pmSaveOnly){pmSaveOnly=false;return;}return pmOriginalOwnerPreview(id);};
document.addEventListener('click',e=>{
 const toggle=e.target.closest?.('[data-pm-ocr-toggle]'),close=e.target.closest?.('[data-pm-ocr-close]');
 if(toggle||close){
  const modal=(toggle||close).closest('.lg-payment-modern');
  const panel=modal?.querySelector('#pm-ocr-panel'),footer=modal?.querySelector('.modal-footer');
  if(!panel||!footer)return;
  const opening=Boolean(toggle)&&panel.hidden;
  modal.style.setProperty('--pm-ocr-footer-size',Math.ceil(footer.getBoundingClientRect().height)+'px');
  panel.hidden=!opening;
  const control=footer.querySelector('[data-pm-ocr-toggle]');
  if(control)control.setAttribute('aria-expanded',String(opening));
  if(opening)panel.querySelector('[data-pm-ocr-close]')?.focus();
  else control?.focus();
  e.preventDefault();return;
 }
 if(e.target.closest('[data-pm-reports-open]')){pmOpenReports(e.target.closest('[data-pm-reports-open]'));return;}
 if(e.target.closest('[data-pm-history-open]')){pmOpenPaymentHistory();return;}
 const todayButton=e.target.closest('[data-pm-use-today]');
 if(todayButton&&document.querySelector('.lg-payment-modern')){
  const dateInput=todayButton.closest('form')?.querySelector('[name="date"]');
  if(dateInput){dateInput.value=businessToday();dateInput.dispatchEvent(new Event('change',{bubbles:true}));}
  return;
 }
 const clickedMonth=e.target.closest('[data-pm-month]');
 if(clickedMonth&&document.querySelector('.lg-payment-modern')){
  pmSelectedMonth=clickedMonth.dataset.pmMonth;
  const host=document.getElementById('pm-calendar-body');if(host)pmCalendar(host,pmSales());return;
 }
 const yearBtn=e.target.closest('[data-pm-year]');
 if(yearBtn&&document.querySelector('.lg-payment-modern')){
  const years=[...new Set(pmActualSchedule(pmSales()).map(r=>Number(r.dueDate.slice(0,4))))].sort((a,b)=>a-b);
  const index=years.indexOf(pmYear),next=years[index+(yearBtn.dataset.pmYear==='next'?1:-1)];
  if(next!==undefined){pmYear=next;const container=document.getElementById('pm-calendar-body');if(container)pmCalendar(container,pmSales());}return;
 }
 const method=e.target.closest('[data-pm-method]');
 if(method&&document.querySelector('.lg-payment-modern')){
  const sel=document.querySelector('.lg-payment-modern form select[name="method"]');
  if(sel){sel.value=method.dataset.pmMethod;sel.dispatchEvent(new Event('change',{bubbles:true}));document.querySelectorAll('.lg-payment-modern [data-pm-method]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===method)));}
 }
 const save=e.target.closest('[data-pm-save-mode]');
 if(save&&document.querySelector('.lg-payment-modern'))pmSaveOnly=save.dataset.pmSaveMode==='save';
 if(e.target.closest('[data-action="close-modal"]')){pmActive=null;pmSaveOnly=false;}
},true);
// Los importes actualizan el borrador por el manejador original; no reconstruir el campo mientras se escribe.
document.addEventListener('submit',e=>{
 if(!e.target.matches('#multi-payment-form,#owner-abono-form'))return;
 // Los botones ya fijaron el modo en click; Enter genera el recibo por defecto.
 setTimeout(()=>{pmSaveOnly=false;if(!document.querySelector('.lg-payment-modern'))pmActive=null;},0);
},false);

// Cierra el lector al presionar Escape; el formulario conserva su estado intacto.
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 const modal=document.querySelector('#modal-root .lg-payment-modern'),panel=modal?.querySelector('#pm-ocr-panel');
 if(!panel||panel.hidden)return;
 panel.hidden=true;
 const trigger=modal.querySelector('[data-pm-ocr-toggle]');
 if(trigger){trigger.setAttribute('aria-expanded','false');trigger.focus();}
 event.preventDefault();event.stopImmediatePropagation();
},true);
