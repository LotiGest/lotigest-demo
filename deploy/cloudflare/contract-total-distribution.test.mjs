import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function contractSplitCents('),source.indexOf('function contractIntakeManualRecalculate('));
function setup(count=2){
 const dom=new JSDOM('<form><select name="contractPriceMode"><option value="equal">Iguales</option><option value="different">Distintos</option></select><input name="contractTotalPrice"><input name="contractTotalPrima">'+Array.from({length:count},(_,i)=>'<input name="'+(i?'extraLotId_'+(i-1):'lotId')+'" value="L'+i+'"><label class="field-group"><input name="solarPrice_'+i+'"></label><label class="field-group"><input name="'+(count>1?'solarDown_'+i:'down')+'"></label>').join('')+'<div data-contract-total-preview></div></form>',{runScripts:'outside-only'});
 dom.window.eval(`var contractIntakeWorking={extraLots:Array(${count-1}).fill({})};function getLot(id){return {id,stage:1,block:'A',sourceNumber:id}}function contractIntakeManualCash(n){return n.toFixed(2)}`+helper);
 return {dom,w:dom.window,form:dom.window.document.querySelector('form')};
}
test('total manual y prima se reparten entre dos solares con centavos exactos',()=>{
 const {dom,w,form:f}=setup();f.elements.contractTotalPrice.value='1000.01';f.elements.contractTotalPrima.value='100.01';w.contractTotalsApply(f);
 assert.equal(f.elements.solarPrice_0.value,'500.01');assert.equal(f.elements.solarPrice_1.value,'500.00');assert.equal(f.elements.solarDown_0.value,'50.01');assert.equal(f.elements.solarDown_1.value,'50.00');assert.equal(f.elements.contractTotalPrima.checkValidity(),true);dom.window.close();
});
test('precios distintos conservan cada precio y prima proporcional; cambios recalculan',()=>{
 const {dom,w,form:f}=setup();f.elements.contractPriceMode.value='different';f.elements.solarPrice_0.value='300000';f.elements.solarPrice_1.value='200000';f.elements.contractTotalPrima.value='50000';w.contractTotalsApply(f);
 assert.equal(f.elements.contractTotalPrice.value,'500000.00');assert.equal(f.elements.solarDown_0.value,'30000.00');assert.equal(f.elements.solarDown_1.value,'20000.00');assert.equal(f.elements.solarPrice_0.readOnly,false);
 f.elements.solarPrice_1.value='300000';w.contractTotalsApply(f);assert.equal(f.elements.contractTotalPrice.value,'600000.00');assert.equal(f.elements.solarDown_0.value,'25000.00');dom.window.close();
});
test('prima inválida bloquea y borra la distribución anterior; un solar recibe el total',()=>{
 const {dom,w,form:f}=setup(1);f.elements.contractTotalPrice.value='100';f.elements.contractTotalPrima.value='0';w.contractTotalsApply(f);assert.equal(f.elements.down.value,'0.00');assert.equal(f.elements.solarPrice_0.value,'100.00');
 f.elements.contractTotalPrima.value='101';w.contractTotalsApply(f);assert.equal(f.elements.contractTotalPrima.checkValidity(),false);assert.equal(f.elements.down.value,'');dom.window.close();
});
test('repartos proporcionales siempre conservan los centavos',()=>{
 const {dom,w}=setup();for(let n=1;n<=20;n++)for(let total=0;total<1000;total+=37){const weights=Array.from({length:n},(_,i)=>i+1),parts=w.contractSplitCents(total,weights);assert.equal(parts.reduce((a,b)=>a+b,0),total);assert.equal(parts.every(Number.isInteger),true);}dom.window.close();
});
