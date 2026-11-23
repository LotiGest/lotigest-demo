import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,until} from './test-ui.mjs';
test('compilación completa abre finanzas y genera XLSX real y PDF descargables',async()=>{
 const server=await setup(),app=boot(server);let blob;
 try{
  await until(()=>app.d.querySelector('#login-form'),'inicio');app.submit('#login-form',{user:'admin',password:server.pass});
  await until(()=>app.d.querySelector('[data-page="finance"]'),'sesión');
  app.click('[data-page="finance"]');assert.ok(app.d.querySelector('.fn-dashboard'));assert.equal(app.d.querySelectorAll('[data-finance-series]').length,2);
  assert.ok(app.d.querySelector('[data-fn-scope] option[value="all"]'),'Consolidado disponible');
  app.w.URL.createObjectURL=b=>{blob=b;return 'blob:finance-test';};app.d.addEventListener('click',e=>{if(e.target.closest('a[download]'))e.preventDefault();});
  app.click('[data-fn-excel]');assert.ok(blob);assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const sheets=await app.w.eval('readExcelRows')({arrayBuffer:()=>blob.arrayBuffer()});assert.equal(sheets[0].sheet,'Libro diario');
  assert.deepEqual(Array.from(sheets[0].rows[0]),['Fecha','Concepto','Cliente / beneficiario','Residencial','Correlativo','Ingreso (L)','Egreso (L)','Saldo (L)']);
  blob=null;app.click('[data-fn-pdf]');assert.ok(blob);assert.equal(blob.type,'application/pdf');
  assert.ok(Buffer.from(await blob.arrayBuffer()).toString('latin1').includes('LIBRO DIARIO DIGITAL'));assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
