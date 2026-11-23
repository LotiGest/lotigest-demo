import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,boot,login} from './test-ui.mjs';

test('Configuración muestra y guarda combinaciones editables por usuario',async()=>{
 const server=await setup(),app=boot(server);
 try{
  await login(app,server);
  app.click('[data-page="settings"]');
  assert.ok(app.d.querySelector('#lotigest-shortcut-settings'),'Existe el panel en Configuración');
  assert.match(app.d.querySelector('#lg-shortcut-title').textContent,/Configuración de atajos/);
  for(const [id,combo] of [['contracts','Ctrl + C'],['single','Ctrl + A'],['multi','Ctrl + B'],['collections','Ctrl + R'],['lots','Ctrl + T'],['dashboard','Ctrl + P']]){
   assert.ok(app.d.querySelector('[data-shortcut-row="'+id+'"]'),'Existe el atajo '+id);
   assert.match(app.d.querySelector('[data-shortcut-row="'+id+'"] .lg-shortcut-key').textContent,new RegExp(combo.replace('+','\\+')));
  }
  app.click('[data-shortcut-edit="contracts"]');
  const capture=app.d.querySelector('[data-shortcut-capture="contracts"]');
  assert.ok(capture,'Se puede editar la combinación de Contratos');
  capture.dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,altKey:true,bubbles:true,cancelable:true}));
  assert.match(app.d.querySelector('[data-shortcut-row="contracts"] .lg-shortcut-key').textContent,/Ctrl \+ Alt \+ K/);
  app.click('[data-shortcut-save]');
  assert.equal(app.w.lotigestShortcuts.load().keys.contracts,'ctrl+alt+k');
  const nav=app.d.querySelector('.nav-btn[data-page="dashboard"]');nav.click();
  app.d.dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,altKey:true,bubbles:true,cancelable:true}));
  assert.ok(app.d.querySelector('.nav-btn[data-page="contracts"].active'),'La combinación personalizada navega a Contratos');
  app.click('[data-page="settings"]');
  assert.match(app.d.querySelector('[data-shortcut-row="contracts"] .lg-shortcut-key').textContent,/Ctrl \+ Alt \+ K/,'La configuración persiste después de navegar');
  app.click('[data-shortcut-reset]');
  assert.match(app.d.querySelector('[data-shortcut-row="contracts"] .lg-shortcut-key').textContent,/Ctrl \+ C/);
  app.click('[data-shortcut-save]');
  assert.equal(app.w.lotigestShortcuts.load().keys.contracts,'ctrl+c','Restablecer guarda valores originales');
 }finally{app.close();}
});

test('los atajos globales no interrumpen escritura y rechazan combinaciones duplicadas',async()=>{
 const server=await setup(),app=boot(server);
 try{
  await login(app,server);
  app.click('[data-page="settings"]');
  app.click('[data-shortcut-edit="single"]');
  const input=app.d.querySelector('[data-shortcut-capture="single"]');
  input.dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true,cancelable:true}));
  assert.match(app.d.querySelector('[data-shortcut-row="single"] .lg-shortcut-key').textContent,/Ctrl \+ A/,'No debe aceptar Ctrl+C duplicado');
  assert.match(app.d.querySelector('#toast-root').textContent,/ya se utiliza/i);
  app.click('[data-shortcut-edit="single"]');
  const field=app.d.querySelector('#company-form [name="name"]');
  assert.ok(field);
  field.dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true,cancelable:true}));
  assert.ok(app.d.querySelector('.nav-btn[data-page="settings"].active'),'Ctrl+C en un campo no debe navegar');
  assert.equal(app.w.lotigestShortcuts.normalize('ctrl+alt+x'),'ctrl+alt+x');
 }finally{app.close();}
});
