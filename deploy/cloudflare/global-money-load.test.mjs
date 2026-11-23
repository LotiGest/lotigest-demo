import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,until} from './test-ui.mjs';
test('aplicación completa resalta y formatea montos en Finanzas y Nuevo contrato sin alterar el guardado',async()=>{
 const server=await setup(),app=boot(server,undefined,{},html=>html.replace('function contractIntakeAdmin(){','function contractIntakeAdmin(){return true; // Fixture: sesión sincronizada para probar la presentación.\n'));
 try{
  await until(()=>app.d.querySelector('#login-form'));app.submit('#login-form',{user:'admin',password:server.pass});
  await until(()=>app.d.querySelector('[data-page="finance"]'));app.click('[data-page="finance"]');app.click('[data-action="finance-expense"]');
  await until(()=>app.d.querySelector('#finance-entry-form [data-lg-money-display]'),'monto de gasto formateado');
  const raw=app.d.querySelector('#finance-entry-form [name="amount"]'),view=raw.closest('.lg-money-control').querySelector('[data-lg-money-display]');
  view.value='1000000.50';view.dispatchEvent(new app.w.Event('input',{bubbles:true}));assert.equal(view.value,'1,000,000.50');assert.equal(raw.value,'1000000.50');
  assert.equal(new app.w.FormData(app.d.querySelector('#finance-entry-form')).get('amount'),'1000000.50');
  app.click('[data-action="close-modal"]');app.click('[data-page="contracts"]');
  app.click('[data-contract-intake-open]');
  await until(()=>app.d.querySelector('#contract-intake-form [name="solarPrice_0"][data-lg-money-raw]'),'precio de contrato formateado');
  const price=app.d.querySelector('#contract-intake-form [name="solarPrice_0"]'),entry=price.closest('.lg-money-control').querySelector('[data-lg-money-display]');
  entry.value='1250000';entry.dispatchEvent(new app.w.Event('input',{bubbles:true}));assert.equal(entry.value,'1,250,000');assert.equal(price.value,'1250000');
  const ref=app.d.querySelector('[name="primaRef"]');assert.ok(ref.classList.contains('lg-correlative-input'));ref.value='00006159';ref.dispatchEvent(new app.w.Event('input',{bubbles:true}));assert.equal(ref.value,'00006159');
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
