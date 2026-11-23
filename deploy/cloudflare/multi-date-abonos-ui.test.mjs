
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
  assert.match(app.d.querySelector('[data-md-field="date"]').value,/^\d{2}\/\d{2}\/20\d{2}$/,'La fecha actual aparece como valor, no como ejemplo gris');
  assert.equal(app.d.querySelectorAll('[data-md-row]').length,2);
  assert.equal(app.d.querySelectorAll('[data-md-photo]').length,2,'Escáner icono independiente por fila');
  assert.equal(app.d.querySelectorAll('[data-md-edit]').length,2,'Cada abono debe ofrecer ingreso manual');
  assert.ok(app.d.querySelectorAll('.md-date-control input[data-md-field="date"][type="text"]').length===2,'Fecha editable por texto');
  assert.ok(app.d.querySelectorAll('.md-money-control input[data-md-field="amount"][type="text"]').length===2,'Monto editable por teclado');
  assert.ok(app.d.querySelectorAll('.md-ref-line input[data-md-field="receiptRef"][type="text"]').length===2,'Correlativo editable por teclado');
  for(const input of app.d.querySelectorAll('#md-abonos-form [data-md-field]')){
   assert.equal(input.readOnly,false,'Los campos no deben ser de solo lectura');
   assert.equal(input.disabled,false,'No se deshabilita el ingreso manual');
  }
  for(const photo of app.d.querySelectorAll('[data-md-photo]'))assert.equal(photo.required,false,'El OCR es opcional');
  app.click('[data-md-edit]');
  assert.equal(app.d.activeElement,app.d.querySelector('[data-md-field="date"]'),'Escribir debe enfocar la fecha manualmente');
  const fields=field=>[...app.d.querySelectorAll('[data-md-field="'+field+'"]')];
  for(const [i,values] of [{date:'21/10/2026',amount:'12,000',receiptRef:'00006159'},{date:'20 Noviembre 2026',amount:'9,000.00',receiptRef:'00006160'}].entries()){
   for(const [name,value] of Object.entries(values)){
    const control=fields(name)[i];control.value=value;
    control.dispatchEvent(new app.w.Event('input',{bubbles:true}));
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
  enter(fields('date')[0]);assert.equal(app.d.activeElement,fields('amount')[0],'Enter en fecha avanza al monto');
  enter(fields('amount')[0]);assert.equal(app.d.activeElement,fields('receiptRef')[0],'Enter en monto avanza al correlativo');
  enter(fields('receiptRef')[0]);assert.equal(app.d.activeElement,fields('date')[1],'Enter en correlativo avanza a Abono 2');
  enter(fields('receiptRef')[1]);
  assert.equal(app.d.querySelectorAll('[data-md-row]').length,3,'Enter en el último correlativo crea Abono 3');
  assert.match(fields('date')[2].value,/^\d{2}\/\d{2}\/20\d{2}$/,'El nuevo abono tiene fecha automática');
  assert.equal(app.d.activeElement,fields('date')[2],'Entra al nuevo abono con fecha seleccionada');
  app.click('[data-md-save]');
  await until(()=>app.d.querySelector('[data-md-share-all]'),'resultados de abonos guardados');
  const after=(await server.read()).state;
  const payments=after.payments.filter(p=>p.saleId===sale.id&&!/^Prima/.test(p.concept||''));
  assert.equal(payments.length,2);
  assert.deepEqual(new Set(payments.map(p=>p.receiptReferenceNormalized)),new Set(['6159','6160']));
  assert.deepEqual(new Set(payments.map(p=>p.date)),new Set(['2026-10-21','2026-11-20']));
  assert.equal(new Set(payments.map(p=>p.groupId)).size,2,'Cada fecha posee recibo independiente');
  assert.equal(app.d.querySelectorAll('[data-md-pdf]').length,2);
  app.click('[data-action="close-modal"]');
  const shortcut=new app.w.KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true,cancelable:true});
  app.d.dispatchEvent(shortcut);
  assert.equal(shortcut.defaultPrevented,true,'Ctrl+B tiene el atajo de abono');
  assert.ok(app.d.querySelector('#multi-payment-form'),'Ctrl+B abre abono individual para el solar seleccionado');
  assert.equal(server.errors.length,0,server.errors.join('; '));
 }finally{app.close();}
});
