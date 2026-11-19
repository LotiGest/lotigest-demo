import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login,saved} from './test-ui.mjs';

async function createLot(app,id,price){
 app.click('[data-page=lots]');
 app.click('[data-action=new-lot]');
 app.submit('#modal-form',{id,block:'CAL',areaMode:'manual',area:'154',price:String(price),status:'available'});
 await saved(app);
 app.click('[data-action=solar-open][data-id="'+id+'"]');
}

test('al tocar solar disponible, prima editable inmediatamente recalcula 84 cuotas y no crea abonos',async()=>{
 const server=await setup(),app=boot(server);
 try{
  await login(app,server);
  await createLot(app,'MAP-QUOTE-01',507993.64);
  assert.ok(app.d.querySelector('#official-map-quote'),'La calculadora aparece sin seleccionar comprador');
  assert.equal(app.d.querySelector('#official-map-years').value,'7');
  assert.match(app.d.querySelector('#official-map-months').textContent,/84 cuotas/);
  app.input('#official-map-prima','100000');
  assert.match(app.d.querySelector('#official-map-monthly').textContent,/4,857\.07/);
  assert.equal(app.d.querySelector('#solar-form [name=downPayment]').value,'100000');
  assert.equal(app.d.querySelector('#solar-form [name=months]').value,'84');
  app.input('#official-map-prima','200000');
  assert.match(app.d.querySelector('#official-map-monthly').textContent,/3,666\.59/);
  app.input('#official-map-prima','600000');
  assert.match(app.d.querySelector('#official-map-error').textContent,/menor que el precio/);
  assert.equal(app.d.querySelector('#official-map-save').disabled,true);
  app.input('#official-map-prima','100000');
  app.click('[data-action=official-map-save]');
  await saved(app);
  const after=(await server.read()).state;
  const solar=after.lots.find(l=>l.id==='MAP-QUOTE-01');
  assert.equal(solar.quotePrima,100000);
  assert.equal(solar.quoteMonths,84);
  assert.equal(solar.quoteMonthly,4857.07);
  assert.equal(after.sales.length,0,'Guardar simulación no registra ventas');
  assert.equal(after.payments.length,0,'Guardar simulación no registra primas cobradas');
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});

test('prima del mapa pasa a la venta sin duplicar controles; propuesta sin guardar bloquea venta',async()=>{
 const server=await setup(),app=boot(server);
 try{
  await login(app,server);
  app.click('[data-page=clients]');
  app.click('[data-action=new-client]');
  app.submit('#modal-form',{name:'CLIENTE SIMULADOR MAPA',identity:'0801199900814',phone:'99990000'});
  await saved(app);
  await createLot(app,'MAP-QUOTE-02',400000);
  app.input('#official-map-prima','100000');
  app.click('[data-action=official-map-save]');
  await saved(app);
  app.input('#solar-client-search','CLIENTE SIMULADOR MAPA');
  app.click('[data-action=solar-choose-client]');
  app.change('#solar-operation','credit');
  assert.equal(app.d.querySelector('#solar-form [name=downPayment]').value,'100000');
  assert.equal(app.d.querySelector('#solar-form [name=months]').value,'84');
  assert.match(app.d.querySelector('#official-map-monthly').textContent,/3,571\.43/);
  assert.equal(app.d.querySelector('#solar-credit-fields').style.display,'none','No duplicar campos de prima en móvil');
  app.input('#official-map-prima','150000');
  assert.equal(app.d.querySelector('#solar-submit').disabled,true,'Bloquear venta con prima sin guardar');
  app.click('[data-action=official-map-save]');
  await saved(app);
  assert.equal(app.d.querySelector('#solar-submit').disabled,false);
  app.submit('#solar-form');
  await saved(app);
  const after=(await server.read()).state;
  const sale=after.sales.find(s=>s.lotId==='MAP-QUOTE-02');
  assert.ok(sale);
  assert.equal(sale.downPayment,150000);
  assert.equal(sale.months,84);
  assert.equal(sale.price,400000);
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});