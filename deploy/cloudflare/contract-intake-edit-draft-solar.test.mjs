import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const fields=source.slice(source.indexOf('function contractIntakeManualCash('),source.indexOf('function contractIntakeFields(){'));
const editing=source.slice(source.indexOf('// Editar dirige al selector real'),source.indexOf('// Quitar un solar SOLO'));
function boot(){
 const dom=new JSDOM('<div id="modal-root"></div>',{runScripts:'outside-only'}),w=dom.window;
 w.db={residences:[{id:'R'}],clients:[{id:'C',name:'CLIENTE'}],sales:[],payments:[],contractTexts:[],lots:[1,2,3].map(n=>({id:'L'+n,residenceId:'R',stage:1,block:'A',sourceNumber:String(n),price:n*100000,area:100,status:'available'}))};
 w.contractIntakeWorking={mode:'manual',preferredClientId:'C',values:{lotId:'L2',stage:'1',block:'A',solarPrice_0:'190000',down:'10000',months:'60'},extraLots:[{lotId:'L1',stage:'1',price:'95000',down:'5000'}]};
 w.residence=()=>w.db.residences[0];w.residenceLots=()=>w.db.lots;w.getLot=id=>w.db.lots.find(l=>l.id===id);w.getClient=id=>w.db.clients.find(c=>c.id===id);w.activeReservation=()=>null;w.esc=x=>String(x??'');
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.eval(fields+editing+';window.renderFields=contractIntakeManualFields;');
 const render=()=>w.document.getElementById('modal-root').innerHTML='<div class="lg-contract-modern">'+w.renderFields()+'</div>';
 render();return {w,render,close:()=>w.close()};
}
test('ambos solares muestran su número real, Editar junto a Quitar y no números por posición',()=>{
 const {w,render,close}=boot();try{
  const before=JSON.stringify(w.db),draft=JSON.stringify(w.contractIntakeWorking);
  assert.match(w.document.querySelector('.lg-contract-solar-metrics strong').textContent,/Solar 2/);
  assert.equal(w.document.querySelector('fieldset legend').textContent,'Etapa 1 · Bloque A · Solar 1');
  assert.ok(w.document.querySelector('.lg-contract-price-heading [data-contract-intake-edit-solar="primary"]'));
  assert.ok(w.document.querySelector('.lg-contract-price-heading [data-contract-intake-remove-primary]'));
  assert.ok(w.document.querySelector('fieldset [data-contract-intake-edit-solar="0"]'));
  assert.ok(w.document.querySelector('fieldset [data-contract-intake-remove="0"]'));
  w.document.querySelector('[data-contract-intake-edit-solar="primary"]').click();
  assert.equal(w.document.activeElement.name,'lotId');assert.equal(w.document.activeElement.value,'L2');
  w.document.querySelector('[data-contract-intake-edit-solar="0"]').click();
  assert.equal(w.document.activeElement.name,'extraLotId_0');assert.equal(w.document.activeElement.value,'L1');
  assert.equal(w.document.querySelector('[name="solarPrice_0"]').value,'190000');
  assert.equal(JSON.stringify(w.contractIntakeWorking),draft);assert.equal(JSON.stringify(w.db),before);
  w.contractIntakeWorking.extraLots.push({stage:'1',lotId:'',price:'',down:''});render();
  assert.equal(w.document.querySelectorAll('fieldset legend')[1].textContent,'Solar adicional · Sin seleccionar');
 }finally{close();}
});
test('los selectores no ofrecen un solar ya elegido en otra ficha del borrador',()=>{
 const {w,close}=boot();try{
  assert.equal(w.document.querySelector('[name="lotId"] option[value="L1"]'),null);
  assert.equal(w.document.querySelector('[name="extraLotId_0"] option[value="L2"]'),null);
  assert.ok(w.document.querySelector('[name="extraLotId_0"] option[value="L3"]'));
 }finally{close();}
});
