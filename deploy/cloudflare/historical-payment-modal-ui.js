// Rediseño del registro histórico real; NO transforma abonos históricos en cuotas inventadas.
// Se conservan los mismos inputs, validaciones, OCR y operación atómica de registro.
(function installHistoricalPaymentLayout(){
 let historyYear=null;
 function make(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
 function field(form,name){const input=form.querySelector('[name="'+name+'"]');return input?.closest('.field-group')||input?.closest('label')||null;}
 function chosenLots(form){return [...form.querySelectorAll('[data-manual-lot]:checked')].map(x=>getLot(x.value)).filter(Boolean);}
 function clientPayments(form){
  const clientId=form.dataset.ownerClientId,ids=new Set(chosenLots(form).map(l=>l.id));
  if(!ids.size)return [];
  return (db.ownerPayments||[]).filter(p=>p.clientId===clientId&&p.residenceId===residence().id&&
   (p.allocations||[]).some(a=>(a.references||[]).some(r=>ids.has(r.lotId))));
 }
 function formatted(cents){return money(Math.round(cents)/100);}
 function monthOf(p){const found=String(p.concept||'').match(/\bMes\s+((?:19|20)\d{2})-(0[1-9]|1[0-2])\b/i);return found?found[1]+'-'+found[2]:null;}
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
   const sum=pays.reduce((n,p)=>n+Number(p.amountCents||0),0);
   const prima=pays.filter(p=>/^prima\b/i.test(String(p.concept||''))).reduce((n,p)=>n+Number(p.amountCents||0),0);
   total.append(pmSummaryRow('Precio total del terreno','Por verificar'),
    pmSummaryRow('Prima acordada','Por verificar','pm-warning'),
    pmSummaryRow('Prima registrada',formatted(prima)),
    pmSummaryRow('Prima faltante','No calculable','pm-warning'),
    pmSummaryRow('Total de abonos registrados',formatted(sum)),
    pmSummaryRow('Saldo restante','Pendiente de contrato','pm-good'));
   total.append(make('p','pm-help','Solo se muestran pagos ya ingresados a las fichas seleccionadas; no se atribuyen deudas ni cuotas sin contrato verificado.'));
  }
  const months=(new Set(pays.map(monthOf).filter(Boolean)));
  historyCalendar(form,pays,months);
 }
 function historyCalendar(form,pays,months){
  const host=document.getElementById('pm-history-calendar-body');if(!host)return;
  host.replaceChildren();
  const currentYear=Number(businessToday().slice(0,4));
  const years=[currentYear,...pays.map(p=>Number(p.date?.slice(0,4))),...[...months].map(m=>Number(m.slice(0,4)))].filter(y=>Number.isSafeInteger(y)&&y>1900&&y<2200);
  const min=Math.min(...years),max=Math.max(...years),period=form.elements.period?.value||'';
  if(historyYear===null||historyYear<min||historyYear>max)historyYear=period?Number(period.slice(0,4)):currentYear;
  if(historyYear<min||historyYear>max)historyYear=currentYear;
  const known=months.size,unassigned=pays.filter(p=>!monthOf(p)).length;
  const metrics=make('div','pm-progress');
  for(const [label,value] of [['Abonos registrados',String(pays.length)],['Meses identificados',String(known)],['Sin mes asignado',String(unassigned)],['Mora','No calculada']]){
   const item=make('div');item.append(make('span','',label),make('strong','',value));metrics.append(item);
  }
  const nav=make('div','pm-yearbar'),prev=make('button','','‹'),next=make('button','','›');
  prev.type=next.type='button';prev.dataset.pmHistoricalYear='previous';next.dataset.pmHistoricalYear='next';
  prev.disabled=historyYear<=min;next.disabled=historyYear>=max;
  nav.append(prev,make('strong','pm-year',String(historyYear)),next);
  const grid=make('div','pm-months'),labels=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  for(let month=1;month<=12;month++){
   const key=historyYear+'-'+String(month).padStart(2,'0');
   const recorded=months.has(key),proposed=period===key;
   const cell=make('div','pm-month '+(recorded?'paid':'none')+(proposed?' pm-to-register':''));
   cell.title=recorded?'Pago asignado a '+key+' y registrado':'Sin mes asociado en los recibos registrados';
   if(proposed)cell.title+=' · Mes seleccionado para el nuevo pago';
   cell.append(make('strong','',labels[month-1]),make('small','',recorded?'✓':proposed?'+':'—'));
   grid.append(cell);
  }
  host.append(metrics,nav,grid,make('p','pm-calendar-note','Verde = mes expresamente identificado en un recibo registrado. Gris = sin mes asignado. No equivale a deuda ni indica mora.'));
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
  const ocr=form.querySelector('[data-paper-ocr-photo]')?.closest('fieldset')||[...form.querySelectorAll('fieldset')].find(x=>/OCR/i.test(x.textContent));
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
  if(date)fields.append(date);
  if(amount)fields.append(amount);
  if(period){period.classList.add('pm-span-2');fields.append(period);}
  if(ref){ref.classList.add('pm-span-2');fields.append(ref);}
  if(note){note.classList.add('pm-span-2');fields.append(note);}
  entry.body.append(fields);
  if(ocr){
   const section=make('div','pm-ocr'),details=make('details');
   details.append(make('summary','','Adjuntar o escanear comprobante (OCR opcional)'),ocr);
   section.append(details);entry.body.append(section);
  }
  if(review)entry.body.append(review);
  if(error){error.classList.add('pm-error');entry.body.append(error);}
  columns.append(summary.card,entry.card);shell.append(columns);
  const cal=pmCard('Calendario de pagos (meses históricos)','calendar');
  cal.card.classList.add('pm-calendar');
  cal.body.id='pm-history-calendar-body';cal.body.classList.add('pm-calendar-body');shell.append(cal.card);
  form.replaceChildren(shell);
  modal.querySelector('.modal-content').replaceChildren(form);
  const footer=modal.querySelector('.modal-footer');
  if(footer)footer.innerHTML='<button type="button" class="btn btn-soft pm-cancel" data-action="close-modal">Cancelar</button><button type="submit" class="btn pm-receipt" data-pm-save-mode="receipt" form="manual-history-form">▤ Guardar y generar recibo</button><button type="submit" class="btn pm-save" data-pm-save-mode="save" form="manual-history-form">✓ Guardar pago</button>';
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
  const btn=event.target.closest('[data-pm-history-type],[data-pm-method],[data-pm-historical-year]');
  if(!btn||!form.closest('.lg-payment-modern'))return;
  if(btn.dataset.pmHistoryType){
   const select=form.querySelector('[name="type"]');select.value=btn.dataset.pmHistoryType;
   form.querySelectorAll('[data-pm-history-type]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
   return;
  }
  if(btn.dataset.pmMethod){
   const select=form.querySelector('[name="method"]');select.value=btn.dataset.pmMethod;
   form.querySelectorAll('[data-pm-method]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
   return;
  }
  if(btn.dataset.pmHistoricalYear){
   const payments=clientPayments(form),years=[Number(businessToday().slice(0,4)),...payments.map(p=>Number(p.date?.slice(0,4))),...payments.map(monthOf).filter(Boolean).map(x=>Number(x.slice(0,4)))].filter(Number.isFinite);
   const min=Math.min(...years),max=Math.max(...years);
   historyYear=Math.min(max,Math.max(min,historyYear+(btn.dataset.pmHistoricalYear==='next'?1:-1)));
   historySummary(form);
  }
 });
 document.addEventListener('change',event=>{
  const form=event.target.closest?.('#manual-history-form');if(!form)return;
  if(event.target.matches('[name="period"]')&&event.target.value)historyYear=Number(event.target.value.slice(0,4));
  if(event.target.matches('[data-manual-lot],[name="period"]'))historySummary(form);
 });
})();
