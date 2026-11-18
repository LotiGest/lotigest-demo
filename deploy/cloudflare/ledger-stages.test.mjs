import {test} from 'node:test';import assert from 'node:assert/strict';
import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {setup,boot,until,saved,login} from './test-ui.mjs';
test('Excel de pagos identifica etapa, bloque y números de solares, agrupa al cliente y exporta el monto conjunto una vez',async()=>{
 const server=await setup();let app=boot(server);try{
  await login(app,server);let snap=await server.read();const rid=snap.state.currentResidence||snap.state.residences[0].id;
  for(const [id,stage,block,number]of [['E1A3',1,'Z',91],['E2A3',2,'Z',91],['E2B5',2,'Y',95],['E1A5',1,'Z',95],['E1A7',1,'Z',97]])snap.state.lots.push({id,stage,block,sourceNumber:String(number),residenceId:rid,status:'available',area:100,price:10000});
  assert.equal((await server.write({state:snap.state,revision:snap.revision,mutation:crypto.randomUUID()})).status,200);app.close();app=boot(server);await until(()=>app.d.querySelector('[data-page=collections]'));app.click('[data-page=collections]');app.click('[data-action=ledger-import]');
  const rows=[['MISMO CLIENTE ETAPAS',1,'Z','91','2026-01-01',1000,'PRIMA','ASIGNADO','C1'],['MISMO CLIENTE ETAPAS',2,'Y','95','2026-02-01',500,'ABONO','ASIGNADO','C2'],['MISMO CLIENTE ETAPAS',1,'Z','95, 97','2026-03-01',200,'ABONO','ASIGNADO','C3']];
  const source=readFileSync(new URL('./collection-fichas.js',import.meta.url),'utf8');const writer=vm.runInNewContext(source.slice(source.indexOf('function paymentExcelBytes('),source.indexOf('const paymentExportCollectionPage'))+';paymentExcelBytes',{TextEncoder,Uint8Array,DataView});const bytes=writer(rows,['CLIENTE','ETAPA','BLOQUE','SOLARES','FECHA DE PAGO','MONTO (L)','TIPO DE PAGO','ESTADO','ID CONTRATO']);
  const input=app.d.querySelector('#ledger-file');Object.defineProperty(input,'files',{value:[{name:'Etapas.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer}]});input.dispatchEvent(new app.w.Event('change',{bubbles:true}));await until(()=>!app.d.querySelector('#ledger-confirm').disabled);app.click('#ledger-confirm');await saved(app);
  const data=(await server.read()).state;assert.equal(data.clients.filter(c=>c.name==='MISMO CLIENTE ETAPAS').length,1);assert.equal(data.historicalPayments.length,3);
  for(const key of ['1:Z:91','2:Y:95','1:Z:95','1:Z:97'])assert.ok(app.d.querySelector(`[data-owner-card="${key}"]`),key);
  assert.ok(!app.d.querySelector('[data-owner-card="2:Z:91"]'));app.click('[data-action=collection-owner-ficha]');assert.ok(app.d.querySelector('#modal-root').textContent.includes('4 solares según Excel'));assert.ok(app.d.querySelector('#modal-root').textContent.includes('Etapa 2'));assert.equal(app.d.querySelectorAll('[data-owner-ficha-history] tbody tr').length,3);app.click('[data-action=close-modal]');
  let blob;app.w.URL.createObjectURL=b=>{blob=b;return 'blob:excel';};app.d.addEventListener('click',e=>{if(e.target.closest('a[download]'))e.preventDefault();});app.click('[data-action=payments-excel]');const sheets=await app.w.eval('readExcelRows')({arrayBuffer:()=>blob.arrayBuffer()});const exported=sheets[0].rows;assert.equal(exported[0][5],'Bloque');assert.equal(exported[0][6],'Solar(es)');assert.equal(exported.length,4);assert.equal(exported.slice(1).reduce((n,r)=>n+Number(r[8]),0),1700);assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
