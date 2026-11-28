import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login} from './test-ui.mjs';

test('Contratos ofrece cámara y galería por separado sin cambiar el flujo OCR',async()=>{
 const server=await setup(),app=boot(server);
 try{
  await login(app,server);
  app.click('[data-page=contracts]');
  app.click('[data-import-hub-open]');app.click('[data-import-hub-mode=contracts]');app.click('[data-import-hub-contract]');
  const camera=app.d.getElementById('contract-intake-camera');
  const gallery=app.d.getElementById('contract-intake-file');
  assert.ok(camera,'Debe existir un selector nativo de cámara');
  assert.ok(gallery,'Debe existir un selector de fotos guardadas');
  assert.equal(camera.type,'file');
  assert.equal(gallery.type,'file');
  assert.equal(camera.accept,'image/*');
  assert.equal(gallery.accept,'image/*');
  assert.equal(camera.getAttribute('capture'),'environment');
  assert.equal(gallery.hasAttribute('capture'),false,'Galería no debe obligar a capturar una foto nueva');
  assert.match(camera.closest('label').textContent,/Tomar foto/);
  assert.match(gallery.closest('label').textContent,/Elegir de galería/);
  assert.ok(app.d.getElementById('contract-intake-status'),'Se conserva el estado del OCR');
  assert.ok(app.d.getElementById('contract-intake-retry'),'Se conserva el reintento de OCR');
  assert.equal(app.d.getElementById('contract-intake-save').disabled,true,'No guardar sin imagen leída o revisada');
  assert.deepEqual(server.errors,[]);
 }finally{app.close();}
});
