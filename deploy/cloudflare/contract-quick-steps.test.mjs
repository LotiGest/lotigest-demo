import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('let contractQuickDefaults='),source.indexOf('setTimeout(()=>{',source.indexOf('let contractQuickDefaults=')));
const dates=source.slice(source.indexOf('function contractSuggestedFirstDue('),source.indexOf('function contractSuggestDueInput('));
const markup='<form id="contract-intake-form" class="lg-contract-form"><section class="lg-contract-step"><h3>Cliente</h3><input name="name" required></section><section class="lg-contract-step"><h3>Solares</h3><select name="lotId" required><option value="">Solar</option><option value="l1">A-12</option></select></section><section class="lg-contract-step"><h3>Condiciones</h3><label class="field-group"><input name="solarPrice_0" type="number" required value="200000"></label><input name="down" value="30000"><input name="months" required value="50"></section><section class="lg-contract-step"><h3>Fechas</h3><div class="lg-contract-date-fields"><label><input name="date" type="date" required value="2026-11-25"></label></div><details><label><input name="firstDueDate" type="date"></label></details></section></form>';
function setup(){const dom=new JSDOM('<div class="modal"><div class="modal-content">'+markup+'</div><div class="modal-footer"><button id="contract-intake-save">Guardar</button></div></div>',{runScripts:'outside-only'}),w=dom.window;
 w.eval(`var contractIntakeWorking={mode:'manual',extraLots:[],values:{contractTotalPrice:'200000',contractTotalPrima:'30000'}};function contractIntakeData(form){return Object.fromEntries(new FormData(form))}function contractIntakeRememberExtras(){}function contractIntakeManualRecalculate(form){contractTotalsApply(form)}function contractIntakeManualCash(n){return n.toFixed(2)}function getClient(){return null}function getLot(id){return id==='l1'?{id:'l1',stage:1,block:'A',sourceNumber:12}:null}function esc(x){return String(x??'').replaceAll('<','&lt;')}function residence(){return {id:'r1',name:'Altos del Arrayán'}}function money(n){return 'L '+n}function toast(x){window.lastToast=x}`);
 w.eval(source.slice(source.indexOf('function contractSplitCents('),source.indexOf('function contractIntakeManualRecalculate(')));w.eval(dates+helper);w.contractQuickMount();return dom;}
test('una pantalla mantiene los cuatro bloques visibles, sugiere fechas y conserva confirmación',()=>{
 const dom=setup(),w=dom.window,d=w.document,f=d.querySelector('form');
 assert.equal(f.querySelectorAll('.lg-contract-step[hidden]').length,0);assert.equal(f.querySelectorAll('[data-cq-area]').length,6);
 assert.equal(f.elements.firstDueDate.value,'2026-12-25');assert.equal(f.querySelector('[data-cq-end-date]').value,'25/01/2031');
 assert.equal(w.contractQuickReadyToSave(f),false);f.elements.name.value='Ana';f.elements.lotId.value='l1';
 assert.equal(w.contractQuickReadyToSave(f),false);f.querySelector('#cq-reviewed').checked=true;
 assert.equal(w.contractQuickReadyToSave(f),true);assert.equal(Number(f.elements.solarPrice_0.value),200000);assert.equal(Number(f.elements.down.value),30000);
 dom.window.close();
});
test('fecha sugerida cambia con el contrato y una fecha especial se conserva',()=>{
 const dom=setup(),w=dom.window,d=w.document,f=d.querySelector('form');f.elements.date.value='2026-01-31';f.elements.date.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(f.elements.firstDueDate.value,'2026-02-28');
 f.elements.firstDueDate.value='2026-03-15';f.elements.firstDueDate.dispatchEvent(new w.Event('change',{bubbles:true}));f.elements.date.value='2026-02-01';f.elements.date.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(f.elements.firstDueDate.value,'2026-03-15');dom.window.close();
});
test('reconstrucción no duplica los controles',()=>{const dom=setup(),w=dom.window,d=w.document;d.querySelector('form').outerHTML=markup;w.contractQuickMount();w.contractQuickMount();assert.equal(d.querySelectorAll('[data-cq-again]').length,1);assert.equal(d.querySelectorAll('[data-cq-calendar]').length,1);dom.window.close();});
