// Presentation and message drafts only. Delivery requires a connected provider.
(()=>{
 const templates={reminder:'Hola, {cliente}. Te recordamos tu cuota del contrato {contrato}. Gracias por tu puntualidad.',late:'Hola, {cliente}. Tu contrato {contrato} tiene una cuota pendiente. Contáctanos para revisar tu estado de cuenta.',payment:'Hola, {cliente}. Hemos registrado tu pago del contrato {contrato}. Gracias.',finished:'¡Felicidades, {cliente}! Has liquidado el saldo del contrato {contrato}. Gracias por tu confianza.'};
 const labels={reminder:'Recordatorio de cuota',late:'Aviso de mora',payment:'Confirmación de pago',finished:'Contrato finalizado'};
 let tab='history',query='',kind='all',selected='',preview='';
 const drafts=()=>Array.isArray(db?.messageDrafts)?db.messageDrafts:[];
 const safe=x=>esc(String(x??''));
 function messagePage(){
  const rows=drafts().filter(r=>(kind==='all'||r.type===kind)&&[r.clientName,r.phone,r.contract].join(' ').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  const cards=[['Mensajes enviados','0'],['Entregados','0'],['Leídos','0'],['Borradores',String(drafts().length)],['Automatizaciones activas','0']];
  return `<div class="cp-heading"><div><h1>Mensajes y Notificaciones</h1><p>Cobros, recordatorios y seguimiento de clientes</p></div><span class="cp-status">WhatsApp Business · Pendiente de conexión</span></div><div class="cp-metrics">${cards.map(([l,v])=>`<section class="cp-card"><small>${l}</small><strong>${v}</strong></section>`).join('')}</div><div class="cp-message-layout"><section class="cp-card"><div class="cp-tabs">${[['history','Mensajes'],['templates','Plantillas'],['rules','Automatizaciones']].map(([id,l])=>`<button type="button" data-cp-tab="${id}" aria-pressed="${tab===id}">${l}</button>`).join('')}</div>${tab==='templates'?`<div class="cp-template-grid">${Object.entries(labels).map(([id,l])=>`<article class="cp-card"><h3>${l}</h3><p>${safe(templates[id])}</p><button type="button" data-cp-template="${id}">Preparar mensaje</button></article>`).join('')}</div>`:tab==='rules'?`<h2>Automatizaciones de mensajes</h2>${Object.entries(labels).map(([id,l])=>`<div class="cp-rule"><strong>${l}</strong><span>${id==='reminder'?'3 días antes del vencimiento':id==='late'?'Después del vencimiento':id==='payment'?'Al registrar un abono':'Al liquidar el contrato'}</span><small>Pendiente de conexión</small></div>`).join('')}<p>Las reglas se activarán cuando exista una conexión con WhatsApp Business.</p>`:`<div class="cp-filters"><input id="cp-search" aria-label="Buscar mensajes" placeholder="Buscar cliente, teléfono o contrato…" value="${safe(query)}"><select id="cp-kind" aria-label="Tipo de mensaje"><option value="all">Todos los tipos</option>${Object.entries(labels).map(([id,l])=>`<option value="${id}" ${kind===id?'selected':''}>${l}</option>`).join('')}</select><button type="button" data-cp-template="reminder">Nuevo mensaje</button></div><div class="cp-table"><table><thead><tr><th>Cliente</th><th>Contrato</th><th>Tipo</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${safe(r.clientName)}<small>${safe(r.phone)}</small></td><td>${safe(r.contract)}</td><td>${safe(labels[r.type])}</td><td>${safe(r.date)}</td><td>Borrador · Sin enviar</td><td><button type="button" data-cp-preview="${safe(r.id)}">Ver mensaje</button></td></tr>`).join(''):'<tr><td colspan="6">No hay mensajes enviados. Prepara un borrador para un cliente.</td></tr>'}</tbody></table></div><p>${rows.length} borradores · Ningún envío realizado</p>`}</section><aside class="cp-card"><h2>Vista previa del mensaje</h2><div class="cp-preview">${preview?safe(preview):'Selecciona un borrador o prepara un mensaje para ver su contenido.'}</div><p>Los estados de entrega y lectura aparecerán cuando WhatsApp confirme cada envío.</p><button type="button" disabled>Enviar · Conecta WhatsApp</button></aside></div>`;
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
 }
 function init(){
  pages.messages=['Mensajes y Notificaciones','bell'];
  const content=pageContent;pageContent=function(){return page==='messages'?messagePage():content();};
  const oldRender=render;render=function(){oldRender();decorate();};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-cp-tab],[data-cp-template],[data-cp-preview]');if(!b)return;
   if(b.dataset.cpTab){tab=b.dataset.cpTab;render();}
   if(b.dataset.cpTemplate)composer(b.dataset.cpTemplate);
   if(b.dataset.cpPreview){preview=drafts().find(r=>r.id===b.dataset.cpPreview)?.body||'';render();}
  });
  document.addEventListener('change',e=>{if(e.target.id==='cp-kind'){kind=e.target.value;render();}});
  document.addEventListener('input',e=>{if(e.target.id==='cp-search'){query=e.target.value;const pos=e.target.selectionStart;render();const input=document.getElementById('cp-search');input?.focus();input?.setSelectionRange(pos,pos);}});
  document.addEventListener('submit',e=>{if(e.target.id!=='cp-compose')return;e.preventDefault();const values=new FormData(e.target),client=getClient(values.get('clientId'));if(!client)return;
   const contract=String(values.get('contract')).trim(),body=String(values.get('body')).trim().replaceAll('{cliente}',client.name).replaceAll('{contrato}',contract);if(!contract||!body)return;
   const row={id:crypto.randomUUID(),clientId:client.id,clientName:client.name,phone:client.phone||'',contract,type:values.get('type'),body,date:new Date().toISOString(),status:'draft'};
   db.messageDrafts=[...drafts(),row];save();preview=body;closeModal();render();
  });
  new MutationObserver(decorate).observe(document.getElementById('modal-root'),{childList:true,subtree:true});
  render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
