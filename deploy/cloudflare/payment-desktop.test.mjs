import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./payment-desktop-ui.js',import.meta.url),'utf8');
function fixture(desktop){
 const dom=new JSDOM(`<div id="modal-root"><div class="pm-reference-payment"><div class="modal-header"></div><form id="multi-payment-form"><div class="pm-reference-client"><div class="pm-card-body"></div></div><div class="pm-reference-entry"><div class="pm-fields"><div id="pm-amount-slot"><input data-payment-amount value="3400"></div><details class="pm-payment-options"><summary>Opciones</summary><div class="field-group"><label for="concept">Observación</label><input id="concept" name="concept" value="Abono a crédito"></div></details><input name="receiptRef" value="4421"></div><div class="pm-reference-actions"></div></div><div id="pm-calendar-body"><div class="pm-progress">Conciliación</div><div class="pm-current-date">Hoy</div><button data-pm-month="2026-11"></button></div></form></div></div>`,{runScripts:'outside-only'});
 const w=dom.window;
 w.eval(`var desktopMedia={matches:${desktop},addEventListener(type,fn){this.change=fn}};window.matchMedia=()=>desktopMedia;
 function pmNode(t,c='',text){const el=document.createElement(t);el.className=c;if(text)el.textContent=text;return el;}
 function pmSummaryRow(label,value){const el=pmNode('div','pm-summary-row');el.append(pmNode('span','',label),pmNode('strong','',value));return el;}
 function pmFold(label){const el=pmNode('details');el.append(pmNode('summary','',label));return el;}
 var db={contractTexts:[{id:'CT-1',saleId:'S',status:'active'}],payments:[{id:'P',saleId:'S',date:'2026-11-25',amount:3400}]};
 function pmReferenceRefresh(){} function pmSales(){return [{id:'S',clientId:'C',lotId:'L'}]}
 function getClient(){return {name:'Cliente ficticio',identity:'DEMO'}} function getLot(){return {stage:1,block:'A',sourceNumber:'12'}} function residence(){return {name:'Residencial de prueba'}}
 function pmActualSchedule(){return [{dueDate:'2026-11-01',dueCents:340000}]} function money(v){return 'L '+v.toFixed(2)}
 var action='';function pmOpenPaymentHistory(){action='history'} function pmOpenStatement(){action='statement'} function paymentReceiptPreview(id){action=id} function toast(){}`);
 w.eval(source);return {dom,w,d:w.document};
}
test('PC usa controles reales, muestra importe de cuota y conserva el borrador al volver a celular',()=>{
 const {dom,w,d}=fixture(true);
 const amount=d.querySelector('[data-payment-amount]'),concept=d.querySelector('[name=concept]'),parent=concept.parentElement.parentElement;
 w.pmReferenceRefresh();
 assert.equal(d.querySelectorAll('.pd-toolbar button').length,4);
 assert.equal(d.querySelector('.pd-month-amount').textContent,'L 3400.00');
 assert.equal(concept.closest('.pm-payment-options'),null);
 assert.equal(d.querySelector('[data-payment-amount]'),amount);
 d.querySelector('[data-pd-action=receipt]').click();assert.equal(w.action,'P');
 d.querySelector('[data-pd-action=history]').click();assert.equal(w.action,'history');
 d.querySelector('[data-pd-action=share]').click();assert.equal(w.action,'statement');
 w.desktopMedia.matches=false;w.desktopMedia.change();
 assert.equal(concept.parentElement.parentElement,parent);
 assert.equal(amount.value,'3400');assert.equal(d.querySelector('[name=receiptRef]').value,'4421');
 assert.equal(d.querySelector('#pm-calendar-body>.pm-progress').textContent,'Conciliación');
 w.desktopMedia.matches=true;w.desktopMedia.change();
 d.querySelector('[data-pd-clear]').click();assert.equal(amount.value,'');assert.equal(d.querySelector('[name=receiptRef]').value,'');assert.equal(concept.value,'Abono a crédito');
 assert.equal(w.db.payments.length,1);assert.equal(d.querySelectorAll('.pd-toolbar').length,1);
 dom.window.close();
});
test('en celular el adaptador de PC no modifica el formulario ni agrega controles',()=>{
 const {dom,w,d}=fixture(false),before=d.body.innerHTML;
 w.pmReferenceRefresh();assert.equal(d.body.innerHTML,before);dom.window.close();
});
