import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const normalizeSource=readFileSync(new URL('./text-normalization-ui.js',import.meta.url),'utf8');
const clientSource=readFileSync(new URL('./contract-client-edit-ui.js',import.meta.url),'utf8');
function setup(){
 const listeners={},window={};
 const document={addEventListener:(name,handler)=>(listeners[name]??=[]).push(handler)};
 const make=(type,name,value,extra={})=>({
  tagName:'INPUT',type,name,id:extra.id||'',value,dataset:extra.dataset||{},
  disabled:false,readOnly:false,hasAttribute:()=>false,closest:()=>false,
  getAttribute:()=>null,selectionStart:String(value).length,selectionEnd:String(value).length,
  setSelectionRange(){},dispatchEvent(event){
   for(const fn of listeners[event.type]||[])fn({target:this});
  }
 });
 const MockEvent=class{constructor(type){this.type=type;}};
 new Function('document','window','Event',normalizeSource)(document,window,MockEvent);
 const send=(kind,field)=>{for(const fn of listeners[kind]||[])fn({target:field,isComposing:false});};
 return {window,listeners,send,make};
}
test('Honduras: 8 dígitos sin líneas → +504 9803-5773',()=>{
 const env=setup(),phone=env.window.lotigestPhone.format;
 for(const raw of ['98035773','9803-5773','+504 9803 5773','50498035773'])
  assert.equal(phone(raw),'+504 9803-5773');
 const input=env.make('text','phone','98035773');
 env.send('focusout',input);
 assert.equal(input.value,'+504 9803-5773');
});
test('Estados Unidos: 10 dígitos sin líneas → +1 (305) 555-0199',()=>{
 const phone=setup().window.lotigestPhone.format;
 for(const raw of ['3055550199','13055550199','+1 305 555 0199','(305) 555-0199'])
  assert.equal(phone(raw),'+1 (305) 555-0199');
 assert.equal(phone('+34 612 345 678'),'+34 612 345 678','Otro país se conserva');
 assert.equal(phone('30555'),'30555','Número incompleto se conserva');
});
test('mayúsculas mientras se escribe y sin alterar correos, contraseñas, enlaces ni importes',()=>{
 const env=setup();
 const name=env.make('text','name','José Ángel Peña');
 env.send('input',name);assert.equal(name.value,'JOSÉ ÁNGEL PEÑA');
 const observation=env.make('text','observation','abono de noviembre');
 env.send('input',observation);assert.equal(observation.value,'ABONO DE NOVIEMBRE');
 for(const [type,name,value] of [
  ['email','email','persona@ejemplo.com'],
  ['password','password','Abc123!'],
  ['text','url','https://ejemplo.com/Ruta'],
  ['text','identity','aBc123'],
  ['text','date','21 Noviembre 2026'],
  ['text','phone','98035773'],
 ]){
  const field=env.make(type,name,value);env.send('input',field);assert.equal(field.value,value,name);
 }
});
test('al enviar un formulario se preparan teléfono y textos antes de su lectura',()=>{
 const env=setup(),name=env.make('text','name','rosa maría'),
  phone=env.make('tel','phone','3055550199'),
  email=env.make('email','email','cliente@example.com');
 const form={querySelectorAll:()=>[name,phone,email]};
 env.send('submit',form);
 assert.equal(name.value,'ROSA MARÍA');
 assert.equal(phone.value,'+1 (305) 555-0199');
 assert.equal(email.value,'cliente@example.com');
});
test('el lápiz existe en la cabecera real de la tarjeta azul',()=>{
 assert.match(clientSource,/const cardStart='<section class="full notice-card lg-contract-customer-loaded">';/);
 assert.match(clientSource,/html=html\.replace\(cardStart,cardStart\+'/);
 assert.match(clientSource,/data-contract-client-edit/);
 assert.doesNotMatch(clientSource,/html=html\.replace\('<strong>Cliente ya registrado<\/strong>'/);
});
