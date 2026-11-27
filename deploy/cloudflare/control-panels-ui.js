// Message drafts and manual WhatsApp handoff. Provider delivery/reading requires a connected API.
(()=>{
 const templates={reminder:'Hola, {cliente}. Te recordamos tu cuota del contrato {contrato}. Gracias por tu puntualidad.',late:'Hola, {cliente}. Tu contrato {contrato} tiene una cuota pendiente. Contáctanos para revisar tu estado de cuenta.',payment:'Hola, {cliente}. Hemos registrado tu pago del contrato {contrato}. Gracias.',finished:'¡Felicidades, {cliente}! Has liquidado el saldo del contrato {contrato}. Gracias por tu confianza.'};
 const labels={reminder:'Recordatorio de cuota',late:'Aviso de mora',payment:'Confirmación de pago',finished:'Contrato finalizado'};
 let tab='history',query='',kind='all',selected='',preview='';
 const drafts=()=>Array.isArray(db?.messageDrafts)?db.messageDrafts:[];
 const safe=x=>esc(String(x??''));
 const statusLabel=r=>r.status==='sent-manual'?'Enviado · confirmado por usuario':r.status==='whatsapp-opened'?'WhatsApp abierto · sin confirmar':'Borrador · Sin enviar';
 const timeLabel=r=>{try{return new Intl.DateTimeFormat('es-HN',{dateStyle:'short',timeStyle:'short',timeZone:'America/Tegucigalpa'}).format(new Date(r.sentAt||r.openedAt||r.date));}catch{return String(r.date||'');}};
 const recent=()=>drafts().filter(r=>['whatsapp-opened','sent-manual'].includes(r.status)).slice().sort((a,b)=>String(b.sentAt||b.openedAt||b.date).localeCompare(String(a.sentAt||a.openedAt||a.date)));
 function phoneDigits(value){
  const raw=String(value||'').trim();
  if(!/^[+\d\s()-]+$/.test(raw))return '';
  const digits=raw.replace(/\D/g,'');
  if(digits.length===8&&!raw.startsWith('+'))return '504'+digits;
  if(digits.length===11&&digits.startsWith('504'))return digits;
  return raw.startsWith('+')&&digits.length>=8&&digits.length<=15&&!digits.startsWith('0')?digits:'';
 }
 function putMessage(row){
  const next={...db,messageDrafts:[...drafts().filter(r=>r.id!==row.id),row]};
  if(typeof cloudWrite==='function'){if(!cloudReady||cloudUser?.role==='sales')throw Error('No se puede guardar la gestión con esta sesión.');cloudWrite(JSON.stringify(next));db=next;}
  else{db.messageDrafts=next.messageDrafts;save();}
  selected=row.id;preview=row.body;
 }
 function openMoraComposer(record){
  showModal('Preparar mensaje de cobro',`<form id="cp-mora-compose" data-client="${safe(record.id)}" data-residence="${safe(record.residenceId)}" data-contract="${safe(record.contract)}" data-total="${safe(record.total)}" data-cutoff="${safe(record.asOf)}"><p><strong>${safe(record.name)}</strong> · ${safe(record.contract)}</p><p>Saldo vencido confirmado: <strong>${safe(money(record.total/100))}</strong></p><label>Teléfono WhatsApp<input name="phone" type="tel" required value="${safe(record.phone)}" placeholder="+504 0000-0000"></label><label>Mensaje de cobro<textarea name="body" rows="9" required maxlength="4000">${safe(record.body)}</textarea></label><p>Revisa los datos. WhatsApp se abrirá con el mensaje listo; pulsa Enviar allí y confirma el envío en LOTIGEST.</p><p id="cp-mora-error" role="alert"></p></form>`,'<button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button><button type="submit" form="cp-mora-compose" class="btn btn-primary">Abrir WhatsApp</button>',true);
 }
 window.lotigestMoraMessages={open:openMoraComposer};
 function refreshMessageBell(){
  const popup=document.getElementById('lgNotifications');if(!popup)return;
  let box=popup.querySelector('[data-cp-message-notifications]');
  if(!box){box=document.createElement('div');box.dataset.cpMessageNotifications='true';popup.append(box);}
  const rows=recent();
  box.innerHTML='<strong>Gestiones de cobro</strong>'+ (rows.length?rows.slice(0,4).map(r=>'<button type="button" class="lg-popup-action" data-cp-open-message="'+safe(r.id)+'"><strong>'+safe(r.clientName)+'</strong><small> · '+safe(statusLabel(r))+' · '+safe(timeLabel(r))+'</small></button>').join(''):'<p>No hay gestiones de WhatsApp registradas.</p>')+'<button type="button" class="lg-popup-action" data-page="messages">Ver mensajes y notificaciones</button>';
 }
 function showMessageResult(row){
  showModal('Gestión de cobro registrada',`<p><strong>${safe(row.clientName)}</strong> · ${safe(row.contract)}</p><p>Se solicitó abrir WhatsApp con el mensaje. LOTIGEST no puede verificar el envío directamente.</p><p>Si ya pulsaste Enviar en WhatsApp, confirma aquí. También puedes confirmarlo más tarde en Mensajes y Notificaciones.</p>`,'<button type="button" class="btn btn-outline" data-action="close-modal">Confirmar después</button><button type="button" class="btn btn-primary" data-cp-confirm-sent="'+safe(row.id)+'">Confirmar que lo envié</button>',true);
 }
 function messagePage(){
  const rows=drafts().filter(r=>(kind==='all'||r.type===kind)&&[r.clientName,r.phone,r.contract].join(' ').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const cards=[['Enviados (confirmados)',String(drafts().filter(r=>r.status==='sent-manual').length)],['Por confirmar',String(drafts().filter(r=>r.status==='whatsapp-opened').length)],['Entregados','Sin verificar'],['Leídos','Sin verificar'],['Borradores',String(drafts().filter(r=>!r.status||r.status==='draft').length)]];
  return `<div class="cp-heading page-head"><div><h1>Mensajes y Notificaciones</h1><p>Cobros, recordatorios y seguimiento de clientes</p></div><span class="cp-status">WhatsApp manual · WhatsApp Business API: Pendiente de conexión</span></div><div class="cp-metrics">${cards.map(([l,v])=>`<section class="cp-card"><small>${l}</small><strong>${v}</strong></section>`).join('')}</div><div class="cp-message-layout"><section class="cp-card"><div class="cp-tabs">${[['history','Mensajes'],['templates','Plantillas'],['rules','Automatizaciones']].map(([id,l])=>`<button type="button" data-cp-tab="${id}" aria-pressed="${tab===id}">${l}</button>`).join('')}</div>${tab==='templates'?`<div class="cp-template-grid">${Object.entries(labels).map(([id,l])=>`<article class="cp-card"><h3>${l}</h3><p>${safe(templates[id])}</p><button type="button" data-cp-template="${id}">Preparar mensaje</button></article>`).join('')}</div>`:tab==='rules'?`<h2>Automatizaciones de mensajes</h2>${Object.entries(labels).map(([id,l])=>`<div class="cp-rule"><strong>${l}</strong><span>${id==='reminder'?'3 días antes del vencimiento':id==='late'?'Después del vencimiento':id==='payment'?'Al registrar un abono':'Al liquidar el contrato'}</span><small>Pendiente de conexión</small></div>`).join('')}<p>Las reglas se activarán cuando exista una conexión con WhatsApp Business.</p>`:`<div class="cp-filters"><input id="cp-search" aria-label="Buscar mensajes" placeholder="Buscar cliente, teléfono o contrato…" value="${safe(query)}"><select id="cp-kind" aria-label="Tipo de mensaje"><option value="all">Todos los tipos</option>${Object.entries(labels).map(([id,l])=>`<option value="${id}" ${kind===id?'selected':''}>${l}</option>`).join('')}</select><button type="button" data-cp-template="reminder">Nuevo mensaje</button></div><div class="cp-table"><table><thead><tr><th>Cliente</th><th>Contrato</th><th>Tipo</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${safe(r.clientName)}<small>${safe(r.phone)}</small></td><td>${safe(r.contract)}</td><td>${safe(labels[r.type])}</td><td>${safe(timeLabel(r))}</td><td>${safe(statusLabel(r))}</td><td><button type="button" data-cp-preview="${safe(r.id)}">Ver mensaje</button>${r.status==='whatsapp-opened'?`<button type="button" data-cp-confirm-sent="${safe(r.id)}">Confirmar envío</button>`:''}</td></tr>`).join(''):'<tr><td colspan="6">No hay mensajes registrados. Prepara un mensaje para un cliente.</td></tr>'}</tbody></table></div><p>${rows.length} gestiones registradas · Entrega y lectura no verificadas</p>`}</section><aside class="cp-card"><h2>Vista previa del mensaje</h2><div class="cp-preview">${preview?safe(preview):'Selecciona un borrador o prepara un mensaje para ver su contenido.'}</div><p>Los estados de entrega y lectura requieren la API de WhatsApp Business. El envío manual lo confirma el usuario.</p><button type="button" disabled>Envío automático · Conecta WhatsApp</button></aside></div>`;
 }
 function composer(type){
  const clients=(db.clients||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'es'));
  showModal('Preparar mensaje',`<form id="cp-compose"><label>Cliente<select name="clientId" required><option value="">Selecciona un cliente</option>${clients.map(c=>`<option value="${safe(c.id)}">${safe(c.name)}</option>`).join('')}</select></label><label>Contrato<input name="contract" required maxlength="100" placeholder="Número de contrato"></label><label>Mensaje<textarea name="body" rows="6" required maxlength="4000">${safe(templates[type])}</textarea></label><input type="hidden" name="type" value="${type}"><p>Se guardará como borrador. No se enviará a WhatsApp.</p></form>`,'<button type="button" class="btn btn-outline" data-action="close-modal">Cancelar</button><button type="submit" form="cp-compose" class="btn btn-primary">Guardar borrador</button>',true);
 }
 function decorate(){
  const shell=document.querySelector('.lotigest-shell');
  if(!shell){document.querySelector('.cp-dock')?.remove();document.body.classList.remove('cp-inline-payment');return;}
  let dock=document.querySelector('.cp-dock');
  if(!dock){dock=document.createElement('nav');dock.className='cp-dock';dock.setAttribute('aria-label','Accesos principales');document.body.append(dock);}
  const key=[page,document.querySelector('.lg-nav .active')?.dataset.page].join(':');
  if(dock.dataset.key!==key){dock.dataset.key=key;dock.innerHTML=[['dashboard','Inicio','home'],['contracts','Contratos','fileCheck'],['payments','Abonos','wallet'],['arrayan','Solares','map']].map(([id,label,icon])=>`<button type="button" data-page="${id}" ${page===id?'aria-current="page"':''}>${ic(icon)}<span>${label}</span></button>`).join('');}
  document.body.classList.toggle('cp-inline-payment',page==='payments'&&!!document.querySelector('#modal-root .lg-payment-modern'));
  const root=document.getElementById('modal-root');if(page==='payments'&&root?.querySelector('.lg-payment-modern')&&(!matchMedia('(max-width:700px)').matches||root.querySelector('.pm-reference-payment'))){const phone=matchMedia('(max-width:700px)').matches,target=phone?document.body:document.querySelector('.workspace');if(target&&root.parentElement!==target){if(phone)target.prepend(root);else target.append(root);}}
 }
 function init(){
  pages.messages=['Mensajes y Notificaciones','bell'];
  const content=pageContent;pageContent=function(){return page==='messages'?messagePage():content();};
 // Índices temporales: se descartan al terminar cada render para no retener datos antiguos.
 const lookupOriginals={getClient,getLot,getSale};
 let renderLookups=null;
 function renderLookup(kind,rows,id){
  if(!renderLookups)return lookupOriginals[kind](id);
  let entry=renderLookups.get(rows);
  if(!entry){entry=new Map();for(const row of rows)if(!entry.has(row.id))entry.set(row.id,row);renderLookups.set(rows,entry);}
  return entry.get(id);
 }
 getClient=function(id){return renderLookup('getClient',db.clients,id);};
 getLot=function(id){return renderLookup('getLot',db.lots,id);};
 getSale=function(id){return renderLookup('getSale',db.sales,id);};
 // La campana no debe reconstruir toda la cartera en cada navegación.
 if(typeof debtClients==='function'){
  const debtCount=debtClients;
  debtClients=function(){return renderLookups?'…':debtCount.apply(this,arguments);};
  document.addEventListener('click',event=>{
   if(!event.target.closest?.('[data-lg-action="notifications"]'))return;
   const count=document.querySelector('#lgNotifications p b');
   if(count)count.textContent=debtCount();
  },true);
 }
 // Reutilizar sumas sólo dentro del mismo render y del mismo ámbito de datos.
 let renderPaymentTotals=null;
 if(typeof paidAmount==='function'){
  const originalPaidAmount=paidAmount;
  paidAmount=function(id){
   if(!renderPaymentTotals)return originalPaidAmount.apply(this,arguments);
   let payments=renderPaymentTotals.get(db.payments);
   if(!payments){payments=new Map();renderPaymentTotals.set(db.payments,payments);}
   let sales=payments.get(db.sales);
   if(!sales){sales=new Map();payments.set(db.sales,sales);}
   if(!sales.has(id))sales.set(id,originalPaidAmount.apply(this,arguments));
   return sales.get(id);
  };
 }
 // A map draws the same lots in its counters, shapes and details. Build the
 // complete schedule once per render and index pending rows by lot.
 let renderSchedules=null;
 if(typeof schedule==='function'&&typeof arrayanRecord==='function'){
  const originalSchedule=schedule,originalRecord=arrayanRecord;
  function scheduleEntry(){
   if(!renderSchedules)return null;
   let entry=renderSchedules.get(db.sales);
   if(!entry){entry={rows:originalSchedule(),pending:new Map(),sold:new Set(db.sales.map(s=>s.lotId))};
    const month=dateKey(new Date()).slice(0,7);
    for(const row of entry.rows)if(row.remaining>.009&&(row.status==='late'||row.dueDate.slice(0,7)===month)){
     const id=row.lot?.id,list=entry.pending.get(id)||[];list.push(row);entry.pending.set(id,list);
    }
    renderSchedules.set(db.sales,entry);
   }
   return entry;
  }
  schedule=function(){return renderSchedules?scheduleEntry().rows:originalSchedule.apply(this,arguments);};
  arrayanRecord=function(f){
   if(!renderSchedules)return originalRecord.apply(this,arguments);
   const data=residenceRecords()[f.key]||{},candidate=data.lotId?getLot(data.lotId):null;
   const lot=candidate?.residenceId===residence().id?candidate:null;
   const entry=lot?scheduleEntry():null,hasSale=!!entry?.sold.has(lot?.id),rs=hasSale?(entry.pending.get(lot.id)||[]):[];
   const status=lot?(lot.status==='private'?'private':lot.status==='reserved'?'reserved':rs.length||(!hasSale&&lot.mapDebtFlag)?'debt':lot.status==='sold'?'sold':'available'):(data.status||f.initial);
   return {data,lot,status,rs};
  };
 }
 const lookupRender=render;
 render=function(){
  const previous=renderLookups,previousTotals=renderPaymentTotals,previousSchedules=renderSchedules;renderLookups=new Map();renderPaymentTotals=new Map();renderSchedules=new Map();
  try{return lookupRender.apply(this,arguments);}finally{renderLookups=previous;renderPaymentTotals=previousTotals;renderSchedules=previousSchedules;}
 };
  const oldRender=render;let lastPage=page;render=function(){const root=document.getElementById('modal-root');if(root?.closest('#app'))document.body.append(root);if(lastPage==='payments'&&page!=='payments'&&document.querySelector('#modal-root .lg-payment-modern'))closeModal();oldRender();refreshMessageBell();if(page==='payments'&&!document.querySelector('#modal-root .modal-cover')&&document.querySelector('.lotigest-shell'))newPayment(null,false);lastPage=page;decorate();if(page==='payments'&&document.querySelector('#modal-root .lg-payment-modern')&&(!matchMedia('(max-width:700px)').matches||root?.querySelector('.pm-reference-payment'))){if(matchMedia('(max-width:700px)').matches)document.body.prepend(root);else document.querySelector('.workspace')?.append(root);}};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-cp-tab],[data-cp-template],[data-cp-preview],[data-cp-confirm-sent],[data-cp-open-message]');if(!b)return;
   if(b.dataset.cpConfirmSent){const row=drafts().find(r=>r.id===b.dataset.cpConfirmSent);if(!row||row.status!=='whatsapp-opened')return;try{putMessage({...row,status:'sent-manual',sentAt:new Date().toISOString()});closeModal();render();toast('Envío confirmado por el usuario.');}catch(err){toast(err.message,'error');}return;}
   if(b.dataset.cpOpenMessage){const row=drafts().find(r=>r.id===b.dataset.cpOpenMessage);if(!row)return;tab='history';kind='all';query='';selected=row.id;preview=row.body;page='messages';render();return;}
   if(b.dataset.cpTab){tab=b.dataset.cpTab;render();}
   if(b.dataset.cpTemplate)composer(b.dataset.cpTemplate);
   if(b.dataset.cpPreview){preview=drafts().find(r=>r.id===b.dataset.cpPreview)?.body||'';render();}
  });
  document.addEventListener('change',e=>{if(e.target.id==='cp-kind'){kind=e.target.value;render();}});
  document.addEventListener('input',e=>{if(e.target.id==='cp-search'){query=e.target.value;const pos=e.target.selectionStart;render();const input=document.getElementById('cp-search');input?.focus();input?.setSelectionRange(pos,pos);}});
  document.addEventListener('submit',e=>{
   if(e.target.id==='cp-mora-compose'){
    e.preventDefault();const form=e.target,values=new FormData(form),client=getClient(form.dataset.client);
    const phone=phoneDigits(values.get('phone')),body=String(values.get('body')||'').trim(),error=form.querySelector('#cp-mora-error');
    if(!client||!phone||!body||body.length>4000){error.textContent='Revisa el teléfono, cliente y mensaje antes de continuar.';return;}
    try{
     const row={id:crypto.randomUUID(),clientId:client.id,clientName:client.name,phone:'+'+phone,contract:form.dataset.contract,type:'late',body,date:new Date().toISOString(),residenceId:form.dataset.residence,amountCents:Number(form.dataset.total),asOf:form.dataset.cutoff,status:'draft'};
     putMessage(row);
     const link=document.createElement('a');link.href='https://wa.me/'+phone+'?text='+encodeURIComponent(body);link.target='_blank';link.rel='noopener noreferrer';document.body.append(link);link.click();link.remove();
     const opened={...row,status:'whatsapp-opened',openedAt:new Date().toISOString()};putMessage(opened);refreshMessageBell();showMessageResult(opened);
    }catch(err){error.textContent=err.message;}
    return;
   }
   if(e.target.id!=='cp-compose')return;e.preventDefault();const values=new FormData(e.target),client=getClient(values.get('clientId'));if(!client)return;
   const contract=String(values.get('contract')).trim(),body=String(values.get('body')).trim().replaceAll('{cliente}',client.name).replaceAll('{contrato}',contract);if(!contract||!body)return;
   const row={id:crypto.randomUUID(),clientId:client.id,clientName:client.name,phone:client.phone||'',contract,type:values.get('type'),body,date:new Date().toISOString(),status:'draft'};
   db.messageDrafts=[...drafts(),row];save();preview=body;closeModal();render();
  });
  new MutationObserver(decorate).observe(document.getElementById('modal-root'),{childList:true,subtree:true});
  window.addEventListener('resize',decorate);
  render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
