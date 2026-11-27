
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,until,saved,login} from './test-ui.mjs';

test('dos fechas desde + guardan dos movimientos, dos folios y dos recibos separados',async()=>{
 const server=await setup(),app=boot(server);
 try{
  await login(app,server);
  app.click('[data-page=clients]');app.click('[data-action=new-client]');
  app.submit('#modal-form',{name:'CLIENTE ABONOS MULTIPLES',identity:'0801199900888',phone:'99999999'});await saved(app);
  const client=(await server.read()).state.clients[0];
  app.click('[data-page=lots]');app.click('[data-action=new-lot]');
  app.submit('#modal-form',{id:'MULTI-001',block:'M',areaMode:'manual',area:'220',price:'100000',status:'available'});await saved(app);
  app.click('[data-page=sales]');app.click('[data-action=new-sale]');
  app.submit('#modal-form',{clientId:client.id,lotId:'MULTI-001',type:'credit',downPayment:'10000',months:'12',date:'2026-01-15'});await saved(app);
  const before=(await server.read()).state;
  const sale=before.sales.find(x=>x.lotId==='MULTI-001');
  assert.ok(sale);
  app.click('[data-page=collections]');
  assert.ok(typeof app.w.lotigestMultiDate?.openSale==='function','Abonos múltiples disponible en Solares');
  app.w.lotigestMultiDate.openSale(sale.id);
  assert.ok(app.d.querySelector('.lg-multi-date-modal'),'Debe abrir la ventana de fechas múltiples');
  assert.equal(app.d.querySelector('[data-md-field="date"]').value,'','El abono nuevo debe tener fecha vacía');
  assert.equal(app.d.querySelector('[data-md-field="date"]').placeholder,'DD/MM/AA · sin /','La fecha vacía muestra cómo ingresar números sin plecas');
  assert.equal(app.d.querySelector('[data-md-field="date"]').inputMode,'numeric','Se abre el teclado numérico en celular');
  assert.equal(app.d.querySelectorAll('[data-md-row]').length,1,'El asistente comienza con un recibo');
  assert.equal(app.d.querySelectorAll('[data-md-photo]').length,1,'Escáner icono independiente por fila');
  assert.equal(app.d.querySelectorAll('[data-md-edit]').length,1,'Cada abono debe ofrecer ingreso manual');
  assert.ok(app.d.querySelectorAll('.md-date-control input[data-md-field="date"][type="text"]').length===1,'Fecha editable por texto');
  assert.ok(app.d.querySelectorAll('.md-money-control input[data-md-field="amount"][type="text"]').length===1,'Monto editable por teclado');
  assert.ok(app.d.querySelectorAll('.md-ref-line input[data-md-field="receiptRef"][type="text"]').length===1,'Correlativo editable por teclado');
  for(const input of app.d.querySelectorAll('#md-abonos-form [data-md-field]')){
   assert.equal(input.readOnly,false,'Los campos no deben ser de solo lectura');
   assert.equal(input.disabled,false,'No se deshabilita el ingreso manual');
  }
  for(const photo of app.d.querySelectorAll('[data-md-photo]'))assert.equal(photo.required,false,'El OCR es opcional');
  app.click('[data-md-edit]');
  assert.equal(app.d.activeElement,app.d.querySelector('[data-md-field="date"]'),'Escribir debe enfocar la fecha manualmente');
  for(const field of ['date','amount','receiptRef']){
   const control=app.d.querySelector('[data-md-field="'+field+'"]');control.value='';control.focus();
   const key=new app.w.KeyboardEvent('keydown',{key:'2',bubbles:true,cancelable:true});control.dispatchEvent(key);
   assert.equal(key.defaultPrevented,false,field+' admite números desde teclado físico');
   control.value='2';control.dispatchEvent(new app.w.Event('input',{bubbles:true}));
   assert.equal(control.value,'2',field+' conserva el número');assert.equal(app.d.activeElement,control,field+' conserva el foco');
   control.value='';control.dispatchEvent(new app.w.Event('input',{bubbles:true}));
  }
  const fields=field=>[...app.d.querySelectorAll('[data-md-field="'+field+'"]')];
  for(const [i,values] of [{date:'211026',amount:'12,000',receiptRef:'00006159'},{date:'20 Noviembre 2026',amount:'9,000.00',receiptRef:'00006161'}].entries()){
   if(i===1){
    const previous=fields('receiptRef')[0];previous.dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    assert.equal(app.d.querySelectorAll('[data-md-row]').length,2,'Enter crea el siguiente recibo');
    assert.equal(app.d.querySelectorAll('[data-md-photo]').length,2,'Cada recibo conserva su escáner');
    assert.equal(fields('receiptRef')[1].value,'6160','Enter sugiere el siguiente sin ceros iniciales');
    assert.equal(fields('receiptRef')[1].readOnly,false);
    assert.equal(fields('amount')[1].value,'12,000.00');
    assert.match(app.d.querySelector('[data-md-total]').textContent,/12,000/);
   }
   for(const [name,value] of Object.entries(values)){
    const control=fields(name)[i];control.value=value;
    control.dispatchEvent(new app.w.Event('input',{bubbles:true}));
    if(name==='date'&&i===0)assert.equal(control.value,'21/10/26','Los seis dígitos agregan las plecas automáticamente');
    control.dispatchEvent(new app.w.Event('blur'));
   }
  }
  assert.equal(fields('date')[0].value,'21 Octubre 2026');
  assert.equal(fields('date')[1].value,'20 Noviembre 2026');
  assert.equal(fields('amount')[0].value,'12,000.00');
  assert.equal(fields('amount')[1].value,'9,000.00');
  assert.equal(app.d.querySelectorAll('.md-money-control').length,2,'El monto debe estar dentro de un recuadro verde');
  assert.equal(app.d.querySelectorAll('.md-date-control').length,2,'La fecha incluye escritura manual y calendario');
  assert.match(app.d.querySelector('[data-md-total]').textContent,/21,000/);
  function enter(input){const event=new app.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input.dispatchEvent(event);assert.equal(event.defaultPrevented,true,'Enter no debe registrar el pago');}
  app.click('[data-md-goto="'+fields('date')[0].dataset.mdId+'"]');
  enter(fields('date')[0]);assert.equal(app.d.activeElement,fields('amount')[0],'Enter en fecha avanza al monto');
  enter(fields('amount')[0]);assert.equal(app.d.activeElement,fields('receiptRef')[0],'Enter en monto avanza al correlativo');
  enter(fields('receiptRef')[0]);assert.equal(app.d.activeElement,fields('date')[1],'Enter en correlativo avanza a Abono 2');
  app.click('[data-md-review]');
  assert.equal(app.d.querySelectorAll('[data-md-row]').length,2,'Revisar no crea otra fila');
  assert.ok(app.d.querySelector('#md-review:not([hidden])'),'Revisión obligatoria antes de guardar');
  assert.equal(app.d.querySelectorAll('#md-review tbody tr').length,2);
  app.click('[data-md-save]');
  assert.ok(app.d.querySelector('#md-review'),'Sin confirmar el listado no guarda');
  app.d.querySelector('#md-review-confirm').checked=true;app.click('[data-md-save]');
  await until(()=>app.d.querySelector('.md-result-banner'),'regreso a Abonos con total guardado');
  app.click('[data-md-show-saved]');
  await until(()=>app.d.querySelector('[data-md-share-all]'),'recibos de abonos guardados');
  const after=(await server.read()).state;
  const payments=after.payments.filter(p=>p.saleId===sale.id&&!/^Prima/.test(p.concept||''));
  assert.equal(payments.length,2);
  assert.deepEqual(new Set(payments.map(p=>p.receiptReferenceNormalized)),new Set(['6159','6161']));
  assert.deepEqual(new Set(payments.map(p=>p.date)),new Set(['2026-10-21','2026-11-20']));
  assert.equal(new Set(payments.map(p=>p.groupId)).size,2,'Cada fecha posee recibo independiente');
  assert.equal(app.d.querySelectorAll('[data-md-pdf]').length,2);
  app.click('[data-action="close-modal"]');
  const shortcut=new app.w.KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true});
  app.d.dispatchEvent(shortcut);
  assert.equal(shortcut.defaultPrevented,true,'Ctrl+A abre el abono individual');
  assert.ok(app.d.querySelector('#multi-payment-form'),'Ctrl+A abre el pago de un solar seleccionado');
  app.click('[data-action="close-modal"]');
  const several=new app.w.KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true,cancelable:true});
  app.d.dispatchEvent(several);
  assert.equal(several.defaultPrevented,true,'Ctrl+B abre abonos varios');
  assert.ok(app.d.querySelector('#md-abonos-form'),'Ctrl+B abre la ventana de varios abonos');
  assert.equal(server.errors.length,0,server.errors.join('; '));
 }finally{app.close();}
});
