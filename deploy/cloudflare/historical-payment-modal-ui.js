// Rediseño del registro histórico real; NO transforma abonos históricos en cuotas inventadas.
// Se conservan los mismos inputs, validaciones, OCR y operación atómica de registro.
(function installHistoricalPaymentLayout(){
 let historyYear=null;
 function make(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
 function field(form,name){const input=form.querySelector('[name="'+name+'"]');return input?.closest('.field-group')||input?.closest('label')||null;}
 function chosenLots(form){return [...form.querySelectorAll('[data-manual-lot]:checked')].map(x=>getLot(x.value)).filter(Boolean);}
 function validMonth(value){return /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/.test(String(value||''));}
 function monthOf(p){
  if(validMonth(p.period))return p.period;
  if(validMonth(p.paymentMonth))return p.paymentMonth;
  if(validMonth(p.installmentMonth))return p.installmentMonth;
  const found=String(p.concept||'').match(/\bMes\s+((?:19|20)\d{2})-(0[1-9]|1[0-2])\b/i);
  return found?found[1]+'-'+found[2]:null;
 }
 function validPaymentDate(p){
  const date=String(p.date||'');
  return /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date)?date:null;
 }
 // La fecha original del recibo propone un mes; cualquier mes elegido por el usuario prevalece.
 function syncHistoricalPeriod(form,force=false){
  const period=form.elements.period,date=form.elements.date,type=form.elements.type;
  if(!period||!date||!type)return;
  if(type.value==='PRIMA'){
   if(period.value||period.dataset.pmPeriodEdited==='true'){period.value='';period.dataset.pmPeriodEdited='false';}
   return;
  }
  if(type.value!=='ABONO'||(!force&&period.dataset.pmPeriodEdited==='true'))return;
  const valid=validPaymentDate({date:date.value});
  if(!valid)return;
  period.value=valid.slice(0,7);
  period.dataset.pmPeriodEdited='false';
  historyYear=Number(valid.slice(0,4));
 }
 // Solo incluye pagos vinculados por identificador de solar, no por coincidencia de nombre.
 // El pago conjunto se cuenta una vez, aunque incluya varios solares.
 function clientPayments(form){
  const clientId=form.dataset.ownerClientId,rid=residence().id,ids=new Set(chosenLots(form).map(l=>l.id));
  // Sin solares marcados, consultar todos los abonos DEL MISMO cliente, sin
  // seleccionar solares para un nuevo cobro. Al marcar uno, filtrar su historial.
  const linkedRef=r=>r&&(!ids.size||ids.has(r.lotId));
  const owner=(db.ownerPayments||[]).filter(p=>!p.voidedAt&&!p.deletedAt&&!p.cancelledAt&&!['voided','cancelled','annulled'].includes(p.status)&&p.clientId===clientId&&p.residenceId===rid&&
   (p.allocations||[]).some(a=>(a.references||[]).some(linkedRef)));
  const statements=(db.ownershipStatements||[]).filter(s=>s.clientId===clientId&&s.residenceId===rid&&
   (s.references||[]).some(linkedRef));
  const linkedHistoricalIds=new Set(statements.flatMap(s=>s.paymentIds||[]));
  const historical=(db.historicalPayments||[]).filter(p=>
   !p.voidedAt&&!p.deletedAt&&!p.cancelledAt&&!['voided','cancelled','annulled'].includes(p.status)&&
   (p.clientId===clientId||linkedHistoricalIds.has(p.id))&&p.residenceId===rid&&
   (!ids.size||ids.has(p.lotId)||(p.references||[]).some(linkedRef)||linkedHistoricalIds.has(p.id)&&
    statements.some(s=>(s.paymentIds||[]).includes(p.id))));
  const owners=owner.map(p=>({...p,origin:'owner',verifiedPeriod:Boolean(monthOf(p))}));
  // Los movimientos antiguos sin mes explícito NO se declaran cuotas pagadas.
  const imported=historical.map(p=>({...p,origin:'imported',verifiedPeriod:Boolean(monthOf(p))&&
   !(p.issues||[]).length,amountCents:p.amountCents==null?null:Number(p.amountCents)}));
  return owners.concat(imported);
 }
 function formatted(cents){return money(Math.round(cents)/100);}
 function historySummary(form){
  const total=document.getElementById('pm-history-total'),client=document.getElementById('pm-history-name');
  const identity=document.getElementById('pm-history-identity'),lotsBox=document.getElementById('pm-history-lots');
  const c=getClient(form.dataset.ownerClientId),selected=chosenLots(form),pays=clientPayments(form);
  if(client)client.textContent=c?.name||'Propietario por verificar';
  if(identity)identity.textContent=c?.identity?'Identidad: '+c.identity:'Residencial: '+residence().name;
  if(lotsBox){lotsBox.replaceChildren();if(selected.length){
    selected.forEach(l=>{const badge=make('span','pm-tag','Etapa '+(l.stage||'por confirmar')+' · Bloque '+l.block+' · Solar '+(l.sourceNumber||l.number||l.id));lotsBox.append(badge);});
   }else lotsBox.append(make('small','','Selecciona uno o varios solares de la ficha'));
  }
  if(total){
   total.replaceChildren();
   const owner=pays.filter(p=>p.origin==='owner');
   const sum=owner.reduce((n,p)=>n+Number(p.amountCents||0),0);
   const status=lotigestPrimaStatus(form.dataset.ownerClientId,residence().id,selected.length?selected.map(l=>l.id):null);
   const alert=make('div','pm-prima-alert '+(lotigestPrimaHighlight(status)?'pm-prima-unpaid':
    status.kind==='paid'||status.kind==='recorded'?'pm-prima-ok':'pm-prima-unknown'));
   alert.append(make('strong','',lotigestPrimaLabel(status)));
   if(lotigestPrimaHighlight(status))alert.append(make('small','','Puedes registrar la prima aquí: selecciona «Prima», introduce su fecha real y el importe, y conserva el recibo.'));
   else if(status.kind==='unknown')alert.append(make('small','','No se puede declarar una prima impaga sin comprobante o condiciones del contrato.'));
   total.append(alert);
   total.append(pmSummaryRow('Prima acordada',status.agreedCents===null?'Por verificar':formatted(status.agreedCents)),
    pmSummaryRow('Prima registrada',status.paidCents===null?'Por verificar':formatted(status.paidCents)),
    pmSummaryRow('Prima faltante',status.remainingCents===null?'Monto por verificar':formatted(status.remainingCents),
     lotigestPrimaHighlight(status)?'pm-warning':''),
    pmSummaryRow('Abonos manuales registrados',formatted(sum)),
    pmSummaryRow('Saldo del contrato','Por verificar','pm-good'));
   total.append(make('p','pm-help','La prima importada no se suma nuevamente a los recibos históricos. Si falta contrato, el importe pactado permanece por verificar.'));
  }
  historyCalendar(form,pays);
 }
 function historyCalendar(form,pays){
  const host=document.getElementById('pm-history-calendar-body');if(!host)return;
  host.replaceChildren();
  const today=businessToday(),currentYear=Number(today.slice(0,4));
  const todayBadge=make('div','pm-current-date');
  todayBadge.append(make('strong','','Fecha actual de Honduras: '+pmReadableDate(today)),
   make('small','','La prima es un pago inicial, no una mensualidad. Puedes registrar recibos históricos con su fecha original.'));
  host.append(todayBadge);
  const period=form.elements.period?.value||'';
  const documentedYears=pays.flatMap(p=>[Number(validPaymentDate(p)?.slice(0,4)),Number(monthOf(p)?.slice(0,4))])
   .filter(y=>Number.isInteger(y)&&y>=1900&&y<=currentYear);
  const firstYear=Math.min(currentYear-20,...documentedYears);
  // No se exige tener abonos anteriores para consultar o elegir 2024, 2023, etc.
  const minYear=Math.max(1900,firstYear),maxYear=currentYear;
  if(historyYear===null||historyYear<minYear||historyYear>maxYear)
   historyYear=validMonth(period)?Number(period.slice(0,4)):
    documentedYears.length?Math.max(...documentedYears):currentYear;
  historyYear=Math.min(maxYear,Math.max(minYear,historyYear));
  const confirmed=new Set(),underReview=new Set(),withoutPeriod=new Map();
  for(const p of pays){
   const month=monthOf(p),date=validPaymentDate(p);
   if(month&&p.verifiedPeriod)confirmed.add(month);
   else if(month)underReview.add(month);
   else if(date){
    const key=date.slice(0,7);
    withoutPeriod.set(key,(withoutPeriod.get(key)||0)+1);
   }
  }
  const metrics=make('div','pm-progress');
  for(const [label,value] of [
   ['Movimientos vinculados',String(pays.length)],
   ['Meses con abono asociado',String(confirmed.size)],
   ['Meses por revisar',String(underReview.size)],
   ['Pagos sin mes asignado',String(pays.filter(p=>!monthOf(p)).length)]
  ]){
   const item=make('div');item.append(make('span','',label),make('strong','',value));metrics.append(item);
  }
  const nav=make('div','pm-yearbar pm-historical-yearbar'),prev=make('button','','‹'),next=make('button','','›'),year=make('select');
  prev.type=next.type='button';prev.dataset.pmHistoricalYear='previous';next.dataset.pmHistoricalYear='next';
  prev.disabled=historyYear<=minYear;next.disabled=historyYear>=maxYear;
  year.id='pm-history-year-select';year.setAttribute('aria-label','Elegir año de los meses históricos');
  for(let y=maxYear;y>=minYear;y--){
   const option=make('option','',String(y));option.value=String(y);option.selected=y===historyYear;year.append(option);
  }
  const heading=make('label','pm-year-label','Año');heading.append(year);
  nav.append(prev,heading,next);
  const grid=make('div','pm-months pm-historical-months'),names=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  for(let m=1;m<=12;m++){
   const key=String(historyYear)+'-'+String(m).padStart(2,'0');
   const attached=confirmed.has(key),review=underReview.has(key),dated=withoutPeriod.get(key)||0;
   const selected=period===key;
   const status=attached?'paid':review?'mixed':dated?'pending':'none';
   const cell=make('button','pm-month '+status+(selected?' pm-to-register':''));
   cell.type='button';cell.dataset.pmHistoricalMonth=key;
   cell.setAttribute('aria-pressed',String(selected));
   cell.setAttribute('aria-label',names[m-1]+' '+historyYear+(attached?', abono asociado':review?', revisar historial':dated?', '+dated+' pago(s) por asignar':', sin registro'));
   cell.title=attached?'Existe un abono con este mes indicado en su recibo (no confirma cuota completa).':
    review?'El mes figura en un documento importado pendiente de revisión.':
    dated?dated+' pago(s) con fecha en este mes, pero sin cuota identificada.':'Sin mes asignado en los recibos';
   cell.append(make('strong','',names[m-1]),make('small','',attached?'✓':review?'◐':dated?'?':selected?'+':'—'));
   grid.append(cell);
  }
  const legend=make('p','pm-calendar-note','Selecciona un mes para asignarlo al nuevo abono. Verde: abono asociado a ese mes; amarillo: recibo fechado sin mes indicado; morado: historial por revisar; gris: sin registro. Un abono no prueba que la cuota completa esté pagada.');
  const hint=make('p','pm-calendar-note pm-historical-selection',validMonth(period)?'Mes elegido para este nuevo pago: '+period:'Elige un mes en el calendario o déjalo sin asignar si el recibo no lo indica.');
  host.append(metrics,nav,grid,legend,hint);
  // No inventar mensualidades: la fecha del recibo ubica el movimiento en el
  // calendario, mientras la cuota real requiere verificación del contrato.
  const list=make('section','pm-historical-reconciled');
  const title=make('h4','','Abonos relacionados con los solares seleccionados');
  const count=make('p','pm-help',pays.length+' movimiento(s) vinculados por cliente, etapa, bloque y solar. El mes de ingreso no confirma por sí solo la mensualidad.');
  const table=document.createElement('table');
  table.className='pm-reconcile-table';
  const head=document.createElement('thead');
  head.innerHTML='<tr><th>Fecha</th><th>Etapa / Bloque / Solar</th><th>Mes del pago</th><th>Cuota correspondiente</th><th>Monto</th><th>Acción</th></tr>';
  const body=document.createElement('tbody');
  const visible=pays.filter(p=>{
   const month=monthOf(p),date=validPaymentDate(p);
   return month?.slice(0,4)===String(historyYear)||date?.slice(0,4)===String(historyYear);
  }).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  const printed=new Set();
  for(const p of visible){
   const unique=p.origin+':'+p.id;
   if(printed.has(unique))continue;
   printed.add(unique);
   const row=document.createElement('tr');
   const date=validPaymentDate(p),assigned=monthOf(p);
   const ids=[...new Set([p.lotId,...(p.references||[]).map(r=>r.lotId)].filter(Boolean))];
   const lotDescriptions=ids.map(id=>getLot(id)).filter(Boolean).map(l=>
    'Etapa '+(l.stage||'—')+' · '+l.block+' / '+(l.sourceNumber||l.number||l.id));
   const fallback=(p.references||[]).map(ref=>'Etapa '+(ref.stage||p.stage||'—')+
    ' · '+(ref.block||p.block||'—')+' / '+(ref.lot||p.lot||'—'));
   const cells=[
    date||'Por verificar',
    (lotDescriptions.length?lotDescriptions:fallback).join(' · ')||'Referencia por verificar',
    date?date.slice(0,7):'Sin fecha',
    assigned?assigned+' · según recibo':'Sin confirmar · mes del pago '+(date?.slice(0,7)||'por verificar'),
    Number.isInteger(p.amountCents)?formatted(p.amountCents):'Por verificar'
   ];
   for(const value of cells)row.append(make('td','',value));
   const action=make('td');
   if(p.origin==='imported'&&!p.postedPaymentId){
    const edit=make('button','btn btn-outline btn-sm','Confirmar mensualidad');
    edit.type='button';edit.dataset.action='ledger-row-edit';edit.dataset.id=p.id;
    action.append(edit);
   }else action.append(make('small','',p.origin==='owner'?'Consultar el recibo':'Ya contabilizado'));
   row.append(action);body.append(row);
  }
  if(!body.childElementCount){
   const cell=make('td','pm-help','No hay movimientos en este año para los solares seleccionados.');
   cell.colSpan=6;const row=make('tr');row.append(cell);body.append(row);
  }
  table.append(head,body);
  const scroll=make('div','pm-reconcile-scroll');scroll.append(table);
  list.append(title,count,scroll);host.append(list);
 }
 function historicalPicker(){
  const input=document.getElementById('manual-history-search'),results=document.getElementById('manual-history-owners');
  if(!input||!results)return;
  const modal=pmModal('Registrar Pago / Abono','Selecciona el cliente que tiene solares y recupera sus pagos anteriores.');
  if(!modal)return;
  const content=modal.querySelector('.modal-content'),shell=make('div','pm-shell'),card=pmCard('Buscar propietario','users');
  input.style.width='100%';input.placeholder='Nombre del propietario';
  results.classList.add('pm-picker-results');
  card.body.append(make('p','pm-help','Los pagos se registrarán una sola vez y con su fecha original, sin inventar contratos.'));
  const label=make('label','','Buscar cliente');label.htmlFor='manual-history-search';
  card.body.append(label,input,results);shell.append(card.card);content.replaceChildren(shell);
  const footer=modal.querySelector('.modal-footer');
  if(footer)footer.innerHTML='<button class="btn btn-soft pm-cancel" data-action="close-modal">Cerrar</button>';
 }
 function historicalForm(){
  const form=document.getElementById('manual-history-form');if(!form)return;
  const modal=pmModal('Registrar Pago / Abono','Registro histórico desde Contratos · Primas y abonos anteriores.');
  if(!modal)return;
  historyYear=null;
  const grid=form.querySelector('.form-grid'),list=form.querySelector('[data-manual-lot]')?.closest('div[style*="max-height"]');
  const review=form.querySelector('[name="reviewed"]')?.closest('label'),error=form.querySelector('#manual-history-error');
  if(!grid||!list)return;
  const date=field(form,'date'),amount=field(form,'amount'),type=field(form,'type'),method=field(form,'method'),
   ref=field(form,'receiptRef'),period=field(form,'period'),note=field(form,'note');
  const ocr=pmQrOcr(form);
  const shell=make('div','pm-shell'),bar=make('div','pm-clientbar'),customer=make('div','pm-clientbox'),lots=make('div','pm-clientbox');
  customer.innerHTML=pmIcon('users')+'<div><small>Cliente</small><strong id="pm-history-name"></strong><p id="pm-history-identity"></p></div>';
  lots.innerHTML=pmIcon('pin')+'<div><small>Solar(es) seleccionados</small><div id="pm-history-lots"></div></div>';
  bar.append(customer,lots);shell.append(bar);
  const columns=make('div','pm-grid'),summary=pmCard('Resumen del contrato','layers'),entry=pmCard('Registrar nuevo pago','wallet');
  summary.body.id='pm-history-total';
  const selectPanel=make('div','pm-historical-lots');
  selectPanel.append(make('h4','','Seleccionar solares del recibo'),make('p','pm-help','Si marcas varios solares se guarda un solo pago conjunto, sin repartirlo ni duplicarlo.'),list);
  entry.body.append(selectPanel);
  const fields=make('div','pm-fields');
  if(type){
   const select=type.querySelector('select');const wrap=make('div','pm-span-2');
   wrap.append(make('label','','Aplicar pago a: *'));
   const buttons=make('div','pm-method-buttons');
   for(const [value,title] of [['PRIMA','Prima'],['ABONO','Abono mensual / histórico']]){
    const b=make('button','',title);b.type='button';b.dataset.pmHistoryType=value;
    b.setAttribute('aria-pressed',String(select?.value===value));buttons.append(b);
   }
   type.hidden=true;wrap.append(buttons,type);fields.append(wrap);
  }
  if(method){
   const select=method.querySelector('select'),wrap=make('div','pm-span-2');
   wrap.append(make('label','','Método de pago: *'),pmMethodButtons(select));
   method.hidden=true;wrap.append(method);fields.append(wrap);
  }
  if(date){
   const wrapper=make('div','pm-date-group'),input=date.querySelector('input[name="date"]');
   if(input){input.max=businessToday();input.setAttribute('aria-label','Fecha real del recibo histórico');}
   const note=make('small','pm-help','Hoy en Honduras: '+pmReadableDate(businessToday())+'. Conserva la fecha original para pagos atrasados.');
   const button=make('button','btn btn-outline btn-sm pm-date-today','Usar fecha de hoy');
   button.type='button';button.dataset.pmUseToday='true';
   wrapper.append(date,note,button);fields.append(wrapper);
  }
  if(amount)fields.append(amount);
  if(ref){ref.classList.add('pm-span-2');fields.append(ref);}
  if(period){period.classList.add('pm-span-2');period.append(make('small','pm-help','El mes se completa según la fecha real del abono. Puedes corregirlo si el recibo corresponde a otra mensualidad.'));fields.append(period);}
  if(note){note.classList.add('pm-span-2');fields.append(note);}
  entry.body.append(fields);
  if(ocr)shell.append(ocr);
  if(review)entry.body.append(review);
  if(error){error.classList.add('pm-error');entry.body.append(error);}
  const cal=pmCard('Calendario de pagos (meses históricos)','calendar');
  cal.card.classList.add('pm-calendar');
  cal.body.id='pm-history-calendar-body';cal.body.classList.add('pm-calendar-body');
  // Visible desde el comienzo del formulario, incluso en la pantalla de un celular.
  shell.append(cal.card);
  columns.append(summary.card,entry.card);shell.append(columns);
  form.replaceChildren(shell);
  modal.querySelector('.modal-content').replaceChildren(form);
  const footer=modal.querySelector('.modal-footer');
  if(footer){footer.innerHTML='<button type="button" class="btn btn-soft pm-cancel" data-action="close-modal">Cancelar</button><button type="submit" class="btn pm-receipt" data-pm-save-mode="receipt" form="manual-history-form">▤ Guardar y generar recibo</button><button type="submit" class="btn pm-save" data-pm-save-mode="save" form="manual-history-form">✓ Guardar pago</button>';pmAddOcrFooter(modal);}
  syncHistoricalPeriod(form,true);
  historySummary(form);
 }
 const previousShowModal=showModal;
 showModal=function(title,content,footer='',wide=false,subtitle=''){
  const result=previousShowModal(title,content,footer,wide,subtitle);
  if(document.getElementById('manual-history-form'))historicalForm();
  else if(document.getElementById('manual-history-owners'))historicalPicker();
  return result;
 };
 document.addEventListener('click',event=>{
  const form=document.getElementById('manual-history-form');
  if(!form)return;
  const btn=event.target.closest('[data-pm-history-type],[data-pm-method],[data-pm-historical-year],[data-pm-historical-month]');
  if(!btn||!form.closest('.lg-payment-modern'))return;
  if(btn.dataset.pmHistoryType){
   const select=form.querySelector('[name="type"]');select.value=btn.dataset.pmHistoryType;
   form.querySelectorAll('[data-pm-history-type]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
   syncHistoricalPeriod(form,select.value==='ABONO');
   historySummary(form);
   return;
  }
  if(btn.dataset.pmMethod){
   const select=form.querySelector('[name="method"]');select.value=btn.dataset.pmMethod;
   form.querySelectorAll('[data-pm-method]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
   return;
  }
  if(btn.dataset.pmHistoricalMonth){
   const month=btn.dataset.pmHistoricalMonth;
   if(!validMonth(month)||form.elements.type?.value==='PRIMA')return;
   const field=form.elements.period;
   if(!field)return;
   field.value=field.value===month?'':month;
   field.dataset.pmPeriodEdited='true';
   if(field.value)historyYear=Number(field.value.slice(0,4));
   field.dispatchEvent(new Event('change',{bubbles:true}));
   return;
  }
  if(btn.dataset.pmHistoricalYear){
   const year=Number(businessToday().slice(0,4)),min=Math.max(1900,year-20);
   historyYear=Math.min(year,Math.max(min,(historyYear||year)+(btn.dataset.pmHistoricalYear==='next'?1:-1)));
   historySummary(form);
  }
 });
 document.addEventListener('input',event=>{
  const form=event.target.closest?.('#manual-history-form');
  if(form&&event.target.matches('[name="date"]')){syncHistoricalPeriod(form);historySummary(form);}
 });
 document.addEventListener('change',event=>{
  const form=event.target.closest?.('#manual-history-form');if(!form)return;
  if(event.target.id==='pm-history-year-select'){
   historyYear=Number(event.target.value);historySummary(form);return;
  }
  if(event.target.matches('[name="period"]')){
   event.target.dataset.pmPeriodEdited='true';
   if(event.target.value)historyYear=Number(event.target.value.slice(0,4));
  }
  if(event.target.matches('[name="date"],[name="type"]'))syncHistoricalPeriod(form);
  if(event.target.matches('[data-manual-lot],[name="period"],[name="date"],[name="type"]'))historySummary(form);
 });
})();
