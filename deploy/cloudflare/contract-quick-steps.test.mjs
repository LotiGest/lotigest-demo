import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('let contractQuickDefaults='),source.indexOf('setTimeout(()=>{',source.indexOf('let contractQuickDefaults=')));
const markup='<form id="contract-intake-form" class="lg-contract-form"><section class="lg-contract-step"><h3>Cliente</h3><input name="name" required><input name="identity" required value="0801199012345"></section><section class="lg-contract-step"><h3>Solares</h3><select name="lotId" required><option value="">Solar</option><option value="l1">A-12</option></select></section><section class="lg-contract-step"><h3>Condiciones</h3><label class="field-group"><input name="solarPrice_0" type="number" required value="200000"></label><input name="down" value="30000"><input name="months" required value="50"></section><section class="lg-contract-step"><h3>Fechas</h3><input name="date" type="date" required value="2026-11-25"><input name="firstDueDate" type="date" value="2026-12-25"></section></form>';
function setup(){const dom=new JSDOM('<div class="modal"><div class="modal-content">'+markup+'</div><div class="modal-footer"><button id="contract-intake-save">Guardar</button></div></div>',{runScripts:'outside-only'}),w=dom.window;
 w.eval(`var contractIntakeWorking={mode:'manual',quickStep:1,extraLots:[],values:{contractTotalPrice:'200000',contractTotalPrima:'30000'}};function contractIntakeData(form){return Object.fromEntries(new FormData(form))}function contractIntakeRememberExtras(){}function contractIntakeManualRecalculate(form){contractTotalsApply(form)}function contractIntakeManualCash(n){return n.toFixed(2)}function getClient(){return null}function getLot(id){return id==='l1'?{id:'l1',stage:1,block:'A',sourceNumber:12}:null}function esc(x){return String(x??'').replaceAll('<','&lt;')}function residence(){return {id:'r1',name:'Altos del Arrayán'}}function money(n){return 'L '+n}function toast(x){window.lastToast=x}`);
 w.eval(source.slice(source.indexOf('function contractSplitCents('),source.indexOf('function contractIntakeManualRecalculate(')));w.eval(helper);w.contractQuickMount();return dom;}
test('three steps retain original financial and date inputs and require reviewed confirmation before saving',()=>{
 const dom=setup(),w=dom.window,d=w.document,form=d.querySelector('form');assert.equal(form.querySelectorAll('[data-cq-panel]').length,3);assert.equal(form.querySelectorAll('[data-cq-step]').length,3);assert.equal(form.querySelector('[name=solarPrice_0]').closest('[data-cq-panel]').dataset.cqPanel,'2');assert.equal(form.querySelector('[name=date]').closest('[data-cq-panel]').dataset.cqPanel,'3');
 assert.equal(w.contractQuickReadyToSave(form),false);assert.equal(w.contractIntakeWorking.quickStep,1);
 form.elements.name.value='Ana';assert.equal(w.contractQuickReadyToSave(form),false);assert.equal(w.contractIntakeWorking.quickStep,2);
 assert.equal(w.contractQuickReadyToSave(form),false);assert.equal(w.contractIntakeWorking.quickStep,2);
 form.elements.lotId.value='l1';assert.equal(w.contractQuickReadyToSave(form),false);assert.equal(w.contractIntakeWorking.quickStep,3);
 assert.equal(w.contractQuickReadyToSave(form),false);form.querySelector('#cq-reviewed').checked=true;assert.equal(w.contractQuickReadyToSave(form),true);
 assert.equal(Number(form.elements.solarPrice_0.value),200000);assert.equal(Number(form.elements.down.value),30000);assert.equal(form.elements.months.value,'50');assert.equal(form.elements.firstDueDate.value,'2026-12-25');
 form.elements.name.value='';assert.equal(w.contractQuickReadyToSave(form),false);assert.equal(w.contractIntakeWorking.quickStep,1);dom.window.close();
});
test('form rerender preserves the current step and does not duplicate action controls',()=>{
 const dom=setup(),w=dom.window,d=w.document;w.contractIntakeWorking.quickStep=2;d.querySelector('form').outerHTML=markup;w.contractQuickMount();w.contractQuickMount();assert.equal(d.querySelector('form').dataset.quickStep,'2');assert.equal(d.querySelectorAll('[data-cq-next]').length,1);assert.equal(d.querySelectorAll('[data-cq-back]').length,1);assert.equal(d.querySelectorAll('[data-cq-again]').length,1);dom.window.close();
});
