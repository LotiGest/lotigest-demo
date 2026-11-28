import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,until,saved,login} from './test-ui.mjs';

test('Configuración cambia de residencial y separa clientes, ventas, pagos, finanzas y exportación sin perder datos al guardar',async()=>{
 const server=await setup();let app=boot(server);
 try{
  await login(app,server);const snap=await server.read(),s=snap.state,rid=s.currentResidence||s.residences[0].id;
  s.residences.push({id:'RES-B',name:'RESIDENCIAL B',records:{}});
  s.clients.push({id:'PERSON-A',name:'PERSONA EXCLUSIVA A',residenceId:rid},{id:'PERSON-B',name:'PERSONA EXCLUSIVA B',residenceId:'RES-B'});
  s.lots.push({id:'LOT-A',residenceId:rid,block:'Z',sourceNumber:'91',stage:1,area:100,price:10000,status:'sold'},{id:'LOT-B',residenceId:'RES-B',block:'Z',sourceNumber:'91',stage:1,area:100,price:10000,status:'sold'});
  s.sales.push({id:'SALE-A',clientId:'PERSON-A',lotId:'LOT-A',price:10000,downPayment:1000,months:12,type:'credit',date:'2026-01-01'},{id:'SALE-B',clientId:'PERSON-B',lotId:'LOT-B',price:10000,downPayment:2000,months:12,type:'credit',date:'2026-01-01'});
  s.payments.push({id:'PAY-A',saleId:'SALE-A',amount:1000,date:'2026-01-01',concept:'Prima inicial'},{id:'PAY-B',saleId:'SALE-B',amount:2000,date:'2026-01-01',concept:'Prima inicial'});
  s.contractTexts??=[];for(const [suffix,residenceId] of [['A',rid],['B','RES-B']])s.contractTexts.push({id:'DOC-'+suffix,lotId:'LOT-'+suffix,saleId:'SALE-'+suffix,clientId:'PERSON-'+suffix,residenceId,status:'active',format:'manual',title:'CONTRATO FICTICIO '+suffix,pages:[],structured:{price:10000,down:suffix==='A'?1000:2000,months:12}});
  s.ownerPayments=[];s.currentResidence=rid;
  assert.equal((await server.write({state:s,revision:snap.revision,mutation:crypto.randomUUID()})).status,200);
  app.close();app=boot(server);await until(()=>app.d.querySelector('[data-page=settings]'));
  app.click('[data-page=settings]');assert.ok(app.d.querySelector('[data-residential-settings]'));
  app.click('[data-action=workspace-enter][data-id="RES-B"]');await saved(app);
  for(const page of ['clients','sales','payments','receipts','collections','finance']){
   app.click(`[data-page=${page}]`);const text=app.d.querySelector('#app').textContent;
   assert.ok(!text.includes('PERSONA EXCLUSIVA A'),page);assert.ok(!text.includes('LOT-A'),page);
  }
  app.click('[data-page=collections]');let exportBlob;app.w.URL.createObjectURL=b=>{exportBlob=b;return 'blob:export';};app.click('[data-action=payments-excel]');assert.ok(exportBlob);const raw=Buffer.from(await exportBlob.arrayBuffer()).toString();assert.ok(raw.includes('PERSONA EXCLUSIVA B'));assert.ok(!raw.includes('PERSONA EXCLUSIVA A'));
  app.click('[data-page=clients]');app.click('[data-action=new-client]');app.submit('#modal-form',{name:'CLIENTE NUEVO B',identity:'0801199909999'});await saved(app);
  const after=(await server.read()).state;assert.equal(after.clients.find(c=>c.name==='CLIENTE NUEVO B').residenceId,'RES-B');assert.ok(after.clients.some(c=>c.id==='PERSON-A'));assert.equal(after.sales.length,2);assert.equal(after.payments.length,2);
  app.click('[data-page=settings]');app.click(`[data-action=workspace-enter][data-id="${rid}"]`);await saved(app);app.click('[data-page=clients]');assert.ok(app.d.body.textContent.includes('PERSONA EXCLUSIVA A'));assert.ok(!app.d.body.textContent.includes('CLIENTE NUEVO B'));
  app.click('[data-page=settings]');app.click('[data-residential-settings] [data-action=residence-new]');app.submit('#residence-form',{name:'RESIDENCIAL VACÍA',location:'Honduras'});await until(()=>!app.d.querySelector('#residence-form'),'residencial creada');await saved(app);app.click('[data-page=clients]');assert.ok(!app.d.body.textContent.includes('PERSONA EXCLUSIVA A'));assert.ok(!app.d.body.textContent.includes('PERSONA EXCLUSIVA B'));assert.ok(!app.d.body.textContent.includes('CLIENTE NUEVO B'));
  const current=(await server.read()).state.currentResidence;app.close();app=boot(server);await until(()=>app.d.querySelector('[data-page=clients]'));app.click('[data-page=clients]');assert.ok(app.d.querySelector('[data-active-residential]').textContent.includes('RESIDENCIAL VACÍA'));assert.equal((await server.read()).state.currentResidence,current);assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
