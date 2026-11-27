import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,until,login} from './test-ui.mjs';

test('Terrenos y Abonos buscan por nombre o cédula y mantienen los datos de D1',async()=>{
 const server=await setup();let app=boot(server);
 try{
  await login(app,server);
  const previous=await server.read(),rid=previous.state.currentResidence||previous.state.residences[0].id;
  previous.state.clients.push({id:'SEARCH-C1',name:'JOSÉ ÁNGEL BÚSQUEDA',identity:'0001-2345-67890',phone:'99991111'});
  previous.state.clients.push({id:'SEARCH-C2',name:'MARÍA ELENA PRUEBA',identity:'0801-1999-00001',phone:'99992222'});
  previous.state.lots.push(
   {id:'SEARCH-LOT-A',residenceId:rid,ownerClientId:'SEARCH-C1',stage:'1',block:'A',sourceNumber:'3',status:'sold',type:'solar',area:100,price:50000},
   {id:'SEARCH-LOT-B',residenceId:rid,ownerClientId:'SEARCH-C1',stage:'2',block:'B',sourceNumber:'5',status:'sold',type:'solar',area:110,price:60000}
  );
  previous.state.contractTexts??=[];
  for(const lotId of ['SEARCH-LOT-A','SEARCH-LOT-B'])previous.state.contractTexts.push({id:'DOC-'+lotId,lotId,clientId:'SEARCH-C1',residenceId:rid,status:'pending-sale',format:'manual',title:'FICHA FICTICIA',pages:[],structured:{price:50000,down:10000,months:12}});
  const written=await server.write({state:previous.state,revision:previous.revision,mutation:crypto.randomUUID()});
  assert.equal(written.status,200);
  app.close();app=boot(server);
  await until(()=>app.d.querySelector('[data-page=lots]'),'LOTIGEST iniciado');
  app.click('[data-page=lots]');
  assert.ok(app.d.querySelector('#name-id-lots'));
  app.input('#name-id-lots','0001234567890');
  let results=app.d.querySelector('#name-id-results-lots');
  assert.match(results.textContent,/JOSÉ ÁNGEL BÚSQUEDA/);
  assert.match(results.textContent,/Etapa 1/);
  assert.match(results.textContent,/Etapa 2/);
  assert.ok(results.querySelector('[data-action=view-client][data-id="SEARCH-C1"]'));
  app.input('#name-id-lots','jose angel');
  assert.match(results.textContent,/JOSÉ ÁNGEL BÚSQUEDA/,'búsqueda tolera tildes');
  app.input('#name-id-lots','0001234567000');
  assert.doesNotMatch(results.textContent,/JOSÉ ÁNGEL BÚSQUEDA/,'sin coincidencias falsas');
  for(const panel of ['payments','receipts']){
   app.click('[data-page='+panel+']');
   const input='#name-id-'+panel;
   assert.ok(app.d.querySelector(input),'campo visible en '+panel);
   app.input(input,'0001 2345 67890');
   assert.match(app.d.querySelector('#name-id-results-'+panel).textContent,/JOSÉ ÁNGEL BÚSQUEDA/);
  }
  app.click('[data-page=collections]');assert.ok(app.d.querySelector('#cc-search'));app.input('#cc-search','0001 2345 67890');assert.match(app.d.querySelector('.cc-list').textContent,/JOSÉ ÁNGEL BÚSQUEDA/);assert.doesNotMatch(app.d.querySelector('.cc-list').textContent,/MARÍA ELENA/);app.input('#cc-search','0001234567000');assert.doesNotMatch(app.d.querySelector('.cc-list').textContent,/JOSÉ ÁNGEL BÚSQUEDA/);
  app.click('[data-page=receipts]');
  app.click('[data-action=new-payment]');
  assert.ok(app.d.querySelector('#owner-payment-search'),'selector de abonos');
  app.input('#owner-payment-search','0001-2345-67890');
  assert.match(app.d.querySelector('#owner-payment-customers').textContent,/JOSÉ ÁNGEL BÚSQUEDA/);
  app.input('#owner-payment-search','0801199900001');
  assert.doesNotMatch(app.d.querySelector('#owner-payment-customers').textContent,/JOSÉ ÁNGEL BÚSQUEDA/);
  const current=await server.read();
  assert.equal(current.state.clients.length,previous.state.clients.length);
  assert.equal(current.state.sales.length,previous.state.sales.length);
  assert.equal(current.state.payments.length,previous.state.payments.length);
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
