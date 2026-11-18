import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,until,saved,login} from './test-ui.mjs';

test('buscar manual en Terrenos y Abonos encuentra el propietario por identidad y solar',async()=>{
 const server=await setup();let app=boot(server);
 try{
  await login(app,server);
  const before=await server.read(),rid=before.state.currentResidence||before.state.residences[0].id;
  before.state.clients.push({id:'OWNER-LOOKUP-CLIENT',name:'MARTA DEL CARMEN PRUEBA',identity:'0801199512345',phone:'97775544'});
  before.state.lots.push({id:'OWNER-LOOKUP-LOT',residenceId:rid,stage:2,block:'M',sourceNumber:'31',type:'solar',status:'sold',ownerClientId:'OWNER-LOOKUP-CLIENT',area:120,price:100000});
  const write=await server.write({state:before.state,revision:before.revision,mutation:crypto.randomUUID()});
  assert.equal(write.status,200);
  app.close();app=boot(server);
  await until(()=>app.d.querySelector('[data-page=lots]'),'lista de módulos');
  app.click('[data-page=lots]');
  assert.ok(app.d.querySelector('#land-owner-search'),'Buscador manual de Terrenos');
  app.input('#land-owner-search','0801199512345');
  assert.match(app.d.querySelector('#land-owner-results').textContent,/MARTA DEL CARMEN PRUEBA/);
  assert.match(app.d.querySelector('#land-owner-results').textContent,/Solar 31/);
  app.click('[data-page=receipts]');
  app.click('[data-action=new-payment]');
  assert.ok(app.d.querySelector('#owner-payment-search'),'Buscador manual de Abonos');
  app.input('#owner-payment-search','0801199512345');
  assert.match(app.d.querySelector('#owner-payment-customers').textContent,/MARTA DEL CARMEN PRUEBA/);
  app.input('#owner-payment-search','Bloque M Solar 31');
  assert.match(app.d.querySelector('#owner-payment-customers').textContent,/MARTA DEL CARMEN PRUEBA/);
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});

test('desde la ficha del solar se puede vincular un cliente existente sin generar ventas ni abonos',async()=>{
 const server=await setup();let app=boot(server);
 try{
  await login(app,server);
  const before=await server.read(),rid=before.state.currentResidence||before.state.residences[0].id;
  before.state.clients.push({id:'OWNER-LINK-CLIENT',name:'ROSA MARIA PRUEBA',identity:'0801198712345',phone:'98887766'});
  before.state.lots.push({id:'OWNER-LINK-LOT',residenceId:rid,stage:1,block:'H',sourceNumber:'6',type:'solar',status:'sold',area:135,price:110000});
  const sales=before.state.sales.length,payments=before.state.payments.length;
  const write=await server.write({state:before.state,revision:before.revision,mutation:crypto.randomUUID()});
  assert.equal(write.status,200);
  app.close();app=boot(server);
  await until(()=>app.d.querySelector('[data-page=lots]'),'lista de módulos');
  app.click('[data-page=lots]');
  app.click('[data-action="view-lot"][data-id="OWNER-LINK-LOT"]');
  app.click('[data-action="map-owner-start"][data-id="OWNER-LINK-LOT"]');
  app.input('#map-owner-search','ROSA MARIA PRUEBA');
  app.click('[data-action="map-owner-pick"][data-id="OWNER-LINK-CLIENT"]');
  app.d.querySelector('#map-owner-form [name=confirmed]').checked=true;
  app.submit('#map-owner-form');
  await saved(app);
  const actual=await server.read(),lot=actual.state.lots.find(l=>l.id==='OWNER-LINK-LOT');
  assert.equal(lot.ownerClientId,'OWNER-LINK-CLIENT');
  assert.equal(lot.status,'sold');
  assert.equal(actual.state.sales.length,sales);
  assert.equal(actual.state.payments.length,payments);
  assert.match(app.d.querySelector('[data-map-owner-info]').textContent,/ROSA MARIA PRUEBA/);
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
