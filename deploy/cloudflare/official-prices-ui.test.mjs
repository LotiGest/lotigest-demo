import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login,saved,until} from './test-ui.mjs';

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

test('prima del mapa persiste al reabrir y el contrato conserva la oferta sin permitir ventas directas',async()=>{
 const server=await setup();let app=boot(server);
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
  assert.ok(!Array.from(app.d.querySelector('#solar-operation').options).some(o=>['credit','cash'].includes(o.value)),'Las ventas se registran exclusivamente desde Contratos');
  app.input('#official-map-prima','150000');
  assert.equal(app.d.querySelector('#official-map-save').disabled,false);
  assert.equal((await server.read()).state.lots.find(l=>l.id==='MAP-QUOTE-02').quotePrima,100000,'La simulación no modifica D1');
  app.click('[data-action=official-map-save]');await saved(app);
  let snapshot=await server.read();const lot=snapshot.state.lots.find(l=>l.id==='MAP-QUOTE-02');
  assert.equal(lot.quotePrima,150000);assert.equal(lot.quoteMonths,84);assert.equal(lot.quoteMonthly,2976.19);
  assert.equal(snapshot.state.sales.length,0);assert.equal(snapshot.state.payments.length,0);
  Object.assign(lot,{stage:1,sourceNumber:'92'});assert.equal((await server.write({state:snapshot.state,revision:snapshot.revision,mutation:crypto.randomUUID()})).status,200);
  app.close();app=boot(server);await login(app,server);
  app.click('[data-page=lots]');app.click('[data-action=solar-open][data-id="MAP-QUOTE-02"]');assert.equal(app.d.querySelector('#official-map-prima').value,'150000');assert.match(app.d.querySelector('#official-map-monthly').textContent,/2,976\.19/);
  app.click('[data-action=close-modal]');app.click('[data-page=contracts]');app.click('[data-contract-intake-open]');await until(()=>app.d.querySelector('.cq-form'),'contrato manual');
  app.input('#contract-intake-client-search','CLIENTE SIMULADOR MAPA');await until(()=>app.d.querySelector('[data-contract-client-pick]'),'cliente existente');app.click('[data-contract-client-pick]');await until(()=>app.d.querySelector('.cq-form'),'cliente seleccionado');app.click('[data-cq-next]');
  app.change('[name=stage]','1');await until(()=>app.d.querySelector('.cq-form'));app.change('[name=block]','CAL');await until(()=>app.d.querySelector('.cq-form'));app.change('[name=lotId]','MAP-QUOTE-02');await until(()=>app.d.querySelector('.cq-form'));
  assert.equal(Number(app.d.querySelector('[name=solarPrice_0]').value),400000);
  assert.equal(Number(app.d.querySelector('[name=solarDown_0]')?.value||app.d.querySelector('[name=down]')?.value),150000);
  assert.equal((await server.read()).state.sales.length,0);assert.equal((await server.read()).state.payments.length,0);
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});