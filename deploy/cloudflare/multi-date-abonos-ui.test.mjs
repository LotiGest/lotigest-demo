
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
  assert.ok(app.d.querySelector('[data-md-start-sale]'),'Solares tiene el botón +');
  app.w.lotigestMultiDate.openSale(sale.id);
  assert.ok(app.d.querySelector('.lg-multi-date-modal'),'Debe abrir la ventana de fechas múltiples');
  assert.equal(app.d.querySelectorAll('[data-md-row]').length,2);
  assert.equal(app.d.querySelectorAll('[data-md-photo]').length,2,'Escáner icono independiente por fila');
  const fields=field=>[...app.d.querySelectorAll('[data-md-field="'+field+'"]')];
  for(const [i,values] of [{date:'2026-10-21',amount:'8000',receiptRef:'00006159'},{date:'2026-11-20',amount:'9000',receiptRef:'00006160'}].entries()){
   for(const [name,value] of Object.entries(values)){
    const control=fields(name)[i];control.value=value;
    control.dispatchEvent(new app.w.Event('input',{bubbles:true}));
   }
  }
  assert.match(app.d.querySelector('[data-md-total]').textContent,/17,000/);
  app.click('[data-md-save]');
  await until(()=>app.d.querySelector('[data-md-share-all]'),'resultados de abonos guardados');
  const after=(await server.read()).state;
  const payments=after.payments.filter(p=>p.saleId===sale.id&&!/^Prima/.test(p.concept||''));
  assert.equal(payments.length,2);
  assert.deepEqual(new Set(payments.map(p=>p.receiptReferenceNormalized)),new Set(['6159','6160']));
  assert.deepEqual(new Set(payments.map(p=>p.date)),new Set(['2026-10-21','2026-11-20']));
  assert.equal(new Set(payments.map(p=>p.groupId)).size,2,'Cada fecha posee recibo independiente');
  assert.equal(app.d.querySelectorAll('[data-md-pdf]').length,2);
  assert.equal(server.errors.length,0,server.errors.join('; '));
 }finally{app.close();}
});
