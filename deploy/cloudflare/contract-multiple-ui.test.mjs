import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login,until} from './test-ui.mjs';
test('foto con tres solares abre tres selectores, permite agregar/quitar y conserva nombre al elegir etapa',async()=>{
 const server=await setup(),app=boot(server);
 try{
  await login(app,server);app.click('[data-page=contracts]');app.click('[data-contract-intake-open]');
  app.w.createImageBitmap=async()=>({width:1200,height:1800,close(){}});
  app.w.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:'NOMBRE DE CLIENTE: CLIENTE FICTICIO\nDNI: 0801 1990 00021\nLOTE (S): 16, 17 Y 18\nBLOQUE (S): G',confidence:95}}),terminate:async()=>{}})};
  const input=app.d.getElementById('contract-intake-file');Object.defineProperty(input,'files',{value:[new app.w.File(['foto'],'prueba.jpg',{type:'image/jpeg'})]});input.dispatchEvent(new app.w.Event('change',{bubbles:true}));
  await until(()=>app.d.querySelector('[name=extraLotId_1]'),'tres solares leídos');
  assert.equal(app.d.querySelectorAll('[name^=extraLotId_]').length,2);
  assert.ok(app.d.querySelector('[name=solarPrice_0]'));
  app.input('[name=name]','CLIENTE REVISADO');
  app.change('#contract-intake-stage','2');
  assert.equal(app.d.querySelector('[name=name]').value,'CLIENTE REVISADO');
  assert.equal(app.d.querySelector('[name=extraStage_0]').value,'2');
  app.click('[data-contract-intake-add]');assert.equal(app.d.querySelectorAll('[name^=extraLotId_]').length,3);
  app.click('[data-contract-intake-remove="2"]');assert.equal(app.d.querySelectorAll('[name^=extraLotId_]').length,2);
  assert.equal(app.d.querySelector('[name=name]').value,'CLIENTE REVISADO');
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
