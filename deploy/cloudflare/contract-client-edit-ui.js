// LOTIGEST PRO · Edición de cliente registrado sin salir de Nuevo contrato.
// Solo actualiza la ficha del cliente; no registra contratos ni modifica solares.
(function installContractInlineClientEditing(){
 const fields=[
  ['name','Nombre completo',200],['identity','Identidad / DNI',40],
  ['phone','Teléfono (+504 / +1)',40],['email','Correo electrónico',180],
  ['address','Dirección',300],['rtn','RTN',40],
  ['maritalStatus','Estado civil',90],['occupation','Ocupación',140]
 ];
 const val=value=>esc(String(value??''));
 function patchedCustomer(current,edits,clients){
  if(!current||!edits)throw Error('Selecciona primero un cliente registrado.');
  const clean=key=>String(edits[key]??current[key]??'').trim();
  const name=clean('name').toUpperCase(),identity=contractIdentityFormat(clean('identity'));
  if(!name||name.length>200)throw Error('El nombre es obligatorio y no debe superar 200 caracteres.');
  if(identity.length>40)throw Error('Revisa el número de identidad.');
  const key=identity.replace(/[\s-]/g,'').toUpperCase();
  if(key&&(clients||[]).some(c=>c.id!==current.id&&String(c.identity||'').replace(/[\s-]/g,'').toUpperCase()===key))
   throw Error('Esa identidad ya está registrada en otro cliente.');
  const obj={...current,name,identity};
  for(const [field,label,max] of fields.slice(2)){
   const value=clean(field);
   if(value.length>max)throw Error('Revisa '+label+': excede el límite de caracteres.');
   obj[field]=field==='phone'&&window.lotigestPhone?.format?window.lotigestPhone.format(value):value;
  }
  if(obj.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj.email))
   throw Error('Introduce un correo electrónico válido.');
  return obj;
 }
 function editorHtml(values){
  const inputs=fields.map(([key,label,max])=>
   '<label class="lg-contract-client-edit-field"><span>'+val(label)+'</span>'+
   '<input type="'+(key==='email'?'email':key==='phone'?'tel':'text')+'" '+
   'data-contract-client-edit-value="'+val(key)+'" value="'+val(values?.[key])+'" maxlength="'+max+'" '+
   (key==='phone'?'inputmode="tel" autocomplete="tel" ':'')+
   '></label>').join('');
  return '<div class="lg-contract-client-editor" id="contract-intake-client-editor" role="group" aria-label="Editar datos del cliente">'+
   '<p class="sm">Modifica los datos necesarios y guarda la ficha sin salir del contrato.</p>'+
   '<div class="lg-contract-client-edit-grid">'+inputs+'</div>'+
   '<p id="contract-intake-client-edit-alert" role="alert" class="lg-contract-client-edit-error"></p>'+
   '<div class="lg-contract-client-edit-actions">'+
   '<button type="button" class="btn btn-primary" data-contract-client-edit-save>Guardar cliente</button>'+
   '<button type="button" class="btn btn-outline" data-contract-client-edit-cancel>Cancelar</button></div></div>';
 }
 const baseManualFields=contractIntakeManualFields;
 contractIntakeManualFields=function(){
  let html=baseManualFields();
  const draft=contractIntakeWorking,customer=draft?.preferredClientId?getClient(draft.preferredClientId):null;
  if(!customer||draft.mode!=='manual')return html;
  const heading='<strong class="lg-contract-client-title">Cliente ya registrado</strong>';
  const button='<button type="button" class="lg-contract-client-pencil" data-contract-client-edit title="Editar datos del cliente" aria-label="Editar datos de '+val(customer.name)+'">'+
   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 4 4 4M4 20l4.8-1 10.9-10.9a2.7 2.7 0 0 0-3.8-3.8L5 15.2 4 20Z"/></svg></button>';
  // El contrato real muestra la tarjeta azul comenzando directamente con el nombre.
  // No existe un <strong>Cliente ya registrado</strong> dentro de esa tarjeta;
  // insertar el lápiz en su cabecera evita que quede invisible.
  const cardStart='<section class="full notice-card lg-contract-customer-loaded">';
  html=html.replace(cardStart,cardStart+'<div class="lg-contract-client-heading">'+heading+button+'</div>');
  const oldNote='<small>Datos copiados directamente de Clientes. No debes adjuntar documentos ni volver a ingresar esta información; si faltan datos puedes completarlos posteriormente en Clientes.</small>';
  html=html.replace(oldNote,'<small>Datos copiados de Clientes. Puedes completar información con el lápiz sin salir del contrato.</small>'+
    (draft.clientEditing?editorHtml(draft.clientEditValues||customer):''));
  return html;
 };
 function redraw(){
  const review=document.getElementById('contract-intake-review');
  if(review)review.innerHTML=contractIntakeFields();
 }
 function closeEditor(){
  const draft=contractIntakeWorking,form=document.getElementById('contract-intake-form');
  if(form)contractIntakeRememberExtras(form);
  draft.clientEditing=false;draft.clientEditValues=null;
  redraw();
 }
 async function saveClientInline(){
  const draft=contractIntakeWorking;
  if(!draft||draft.mode!=='manual'||!draft.clientEditing||draft.busy||!contractIntakeAdmin())
   throw Error('La sesión debe estar sincronizada y autorizada para guardar el cliente.');
  const current=getClient(draft.preferredClientId);
  const patch=patchedCustomer(current,draft.clientEditValues,db.clients);
  const before=JSON.stringify(db),next=JSON.parse(before);
  const target=next.clients.find(c=>c.id===current.id);
  if(!target)throw Error('No se encontró al cliente para actualizar su ficha.');
  Object.assign(target,patch);
  const form=document.getElementById('contract-intake-form');
  if(form)contractIntakeRememberExtras(form);
  const button=document.querySelector('[data-contract-client-edit-save]');
  if(button)button.disabled=true;
  draft.busy=true;
  try{
   if(draft!==contractIntakeWorking||before!==JSON.stringify(db))
    throw Error('Los datos cambiaron. Revisa la ficha antes de guardar.');
   cloudWrite(JSON.stringify(next));db=next;
   await cloudFlush();
   if(!cloudReady||cloudBlocked||cloudQueue?.pending||cloudQueue?.latest!==cloudQueue?.confirmed)
    throw Error('Los cambios están pendientes de sincronizar en Cloudflare. Comprueba la nube antes de guardar el contrato.');
   for(const [key] of fields)draft.values[key]=target[key]??'';
   draft.clientEditing=false;draft.clientEditValues=null;
   redraw();
   toast('Ficha del cliente guardada y actualizada en Nuevo contrato.');
  }finally{
   draft.busy=false;
   if(button?.isConnected)button.disabled=false;
  }
 }
 document.addEventListener('input',event=>{
  const input=event.target;
  if(!input?.matches?.('[data-contract-client-edit-value]'))return;
  const draft=contractIntakeWorking;
  if(draft?.clientEditing&&!draft.busy){
   draft.clientEditValues??={};
   draft.clientEditValues[input.dataset.contractClientEditValue]=input.value;
  }
 },true);
 // No permitir registrar el contrato con cambios de cliente todavía sin guardar.
 window.addEventListener('submit',event=>{
  if(event.target?.id==='contract-intake-form'&&contractIntakeWorking?.clientEditing){
   event.preventDefault();event.stopImmediatePropagation();
   toast('Primero guarda o cancela los cambios de la ficha del cliente.','error');
  }
 },true);
 document.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||!event.target.matches?.('[data-contract-client-edit-value]'))return;
  event.preventDefault();event.stopImmediatePropagation();
  const inputs=[...document.querySelectorAll('[data-contract-client-edit-value]')];
  inputs[inputs.indexOf(event.target)+1]?.focus();
 },true);
 document.addEventListener('click',event=>{
  const toggle=event.target.closest?.('[data-contract-client-edit]'),
   cancel=event.target.closest?.('[data-contract-client-edit-cancel]'),
   save=event.target.closest?.('[data-contract-client-edit-save]');
  if(!toggle&&!cancel&&!save)return;
  const draft=contractIntakeWorking;
  if(!draft||draft.mode!=='manual'||draft.busy)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(toggle){
   if(!contractIntakeAdmin())return toast('Necesitas una sesión de administrador y datos sincronizados.','error');
   const client=getClient(draft.preferredClientId);
   if(!client)return toast('Selecciona primero un cliente registrado.','error');
   const form=document.getElementById('contract-intake-form');
   if(form)contractIntakeRememberExtras(form);
   draft.clientEditing=!draft.clientEditing;
   draft.clientEditValues=draft.clientEditing?Object.fromEntries(fields.map(([key])=>[key,client[key]??''])):null;
   redraw();
   if(draft.clientEditing)document.querySelector('[data-contract-client-edit-value="name"]')?.focus();
  }else if(cancel)closeEditor();
  else saveClientInline().catch(e=>{
   const alert=document.getElementById('contract-intake-client-edit-alert');
   if(alert)alert.textContent=e.message;
   toast(e.message,'error');
  });
 },true);
 // Al elegir otro cliente, el editor se reinicia para no mezclar personas.
 document.addEventListener('click',event=>{
  if(!event.target.closest?.('[data-contract-client-pick],[data-contract-client-clear]'))return;
  if(contractIntakeWorking?.clientEditing){
   contractIntakeWorking.clientEditing=false;
   contractIntakeWorking.clientEditValues=null;
   redraw();
  }
 },true);
 window.lotigestContractClientEdit={patch:patchedCustomer};
})();
