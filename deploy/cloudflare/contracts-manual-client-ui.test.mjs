import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login,saved} from './test-ui.mjs';

test('Nuevo contrato permite escoger OCR o registro manual de cliente nuevo y existente',async()=>{
 const server=await setup();
 const app=boot(server);
 try{
  await login(app,server);
  const before=await server.read();
  const originalWrites=server.writes;
  app.click('[data-page="contracts"]');
  app.click('[data-contract-intake-open]');
  assert.match(app.d.querySelector('#modal-root').textContent,/Llenar datos manualmente/);
  assert.match(app.d.querySelector('#modal-root').textContent,/Subir foto y usar OCR/);
  app.click('[data-contract-intake-method="manual"]');
  const form=app.d.querySelector('#contract-intake-form');
  assert.ok(form,'Debe abrir la ficha manual, sin fotografía obligatoria');
  assert.ok(!form.querySelector('#contract-intake-file'));
  const selector=form.querySelector('#contract-intake-client-mode');
  assert.equal(selector.value,'new');
  assert.equal(form.querySelector('[name="clientId"]').disabled,true);
  assert.ok(form.querySelector('[name="name"]'));
  assert.ok(form.querySelector('[name="identity"]'));
  assert.ok(form.querySelector('[name="phone"]'));
  assert.ok(form.querySelector('[name="address"]'));
  assert.ok(form.querySelector('[name="stage"]'));
  assert.ok(form.querySelector('[name="lotId"]'));
  app.change('#contract-intake-client-mode','existing');
  assert.equal(app.d.querySelector('#contract-intake-client-mode').value,'existing');
  assert.equal(app.d.querySelector('[name="clientId"]').disabled,false);
  app.change('#contract-intake-client-mode','new');
  assert.equal(app.d.querySelector('[name="clientId"]').disabled,true);
  assert.equal((await server.read()).state.contractTexts.length,before.state.contractTexts.length);
  assert.equal((await server.read()).state.clients.length,before.state.clients.length);
  assert.equal(server.writes,originalWrites,'Abrir formulario no registra pagos ni crea clientes');
  app.click('[data-action="close-modal"]');
  app.click('[data-contract-intake-open]');
  app.click('[data-contract-intake-method="ocr"]');
  assert.ok(app.d.querySelector('#contract-intake-file'),'La captura OCR sigue disponible');
 }finally{app.close();}
});

test('Alta manual crea cliente con teléfono internacional sin duplicarlo por DNI',async()=>{
 const server=await setup();
 const app=boot(server);
 try{
  await login(app,server);
  const find=app.w.eval('contractIntakeFindClient');
  const state={clients:[]};
  const data={name:'MARIA ELENA RIVERA',identity:'0801199900001',phone:'+1 (305) 555-0173',
   address:'Ocotepeque, Honduras',rtn:'',maritalStatus:'',occupation:''};
  const created=find(state,data);
  assert.equal(created.phone,'+1 (305) 555-0173');
  assert.equal(state.clients.length,1);
  const repeated=find(state,{...data,phone:'+1 305 555 0173'});
  assert.equal(repeated.id,created.id);
  assert.equal(state.clients.length,1,'Mismo DNI no crea dos clientes');
  assert.throws(()=>find(state,{...data,name:'PERSONA DIFERENTE'}),/nombre del contrato no coincide/);
  assert.equal((await server.read()).state.contractTexts.length>=0,true);
 }finally{app.close();}
});
