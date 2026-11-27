import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../deploy/cloudflare/payment-modal-ui.js',import.meta.url),'utf8');
const guards=source.slice(source.indexOf('function pmCanLeave('),source.indexOf('// Nombre visible aun'));
const search=source.slice(source.indexOf('const pmPreviousPaymentResults='),source.indexOf('const pmOriginalSelected='));
function fixture(){
 const dom=new JSDOM('<div id="modal-root"><div class="lg-payment-modern"><form id="multi-payment-form"><div id="pm-searchbox" class="has-selection pm-search-open"><input id="multi-payment-search"><div id="multi-payment-results"></div></div><input data-payment-amount><input name="receiptRef"></form></div></div>',{runScripts:'outside-only'});
 const w=dom.window;
 w.eval(`var paymentDraft={clientId:'A',amounts:{S1:''}},saved=[{id:'OLD'}],chosen=null,asked=0,allowed=true;
 const sales=[{id:'S1',clientId:'A'},{id:'S2',clientId:'A'},{id:'S3',clientId:'B'}];
 const clients={A:{name:'Ana',identity:'1234'},B:{name:'Benito',identity:'5678'}};
 function getSale(id){return sales.find(s=>s.id===id)} function getClient(id){return clients[id]}
 function paymentCandidates(q){return sales.filter(s=>!q||[getClient(s.clientId).name.toLowerCase(),getClient(s.clientId).identity].some(x=>x.includes(q.toLowerCase())))}
 function baseNewPayment(id){chosen=id;paymentDraft={clientId:getSale(id)?.clientId||null,amounts:{}};document.querySelector('[data-payment-amount]').value='';document.querySelector('[name=receiptRef]').value='';}
 function pmNode(t,c,v){let e=document.createElement(t);e.className=c;e.textContent=v;return e;}
 function renderPaymentResults(){} function addPaymentSale(id){paymentDraft.clientId=getSale(id).clientId;}
 window.confirm=()=>{asked++;return allowed};`);
 w.eval(guards+search);
 return {w,d:w.document,dom};
}
test('buscador muestra clientes únicos, permite buscar identidad y cambiar sin guardar',()=>{
 const {w,d,dom}=fixture();try{
 w.renderPaymentResults();assert.equal(d.querySelectorAll('[data-action=multi-payment-add]').length,2);
 d.querySelector('#multi-payment-search').value='5678';w.renderPaymentResults();
 assert.equal(d.querySelector('[data-action=multi-payment-add]').dataset.id,'S3');
 w.addPaymentSale('S3');assert.equal(w.chosen,'S3');assert.equal(w.paymentDraft.clientId,'B');assert.equal(w.asked,0);assert.equal(w.saved.length,1);
 }finally{dom.window.close();}
});
test('cambio protege monto y correlativo sin guardar y permite descartar únicamente borrador',()=>{
 const {w,d,dom}=fixture();try{
 d.querySelector('[data-payment-amount]').value='300';d.querySelector('[name=receiptRef]').value='7156';
 w.allowed=false;w.addPaymentSale('S3');assert.equal(w.paymentDraft.clientId,'A');assert.equal(d.querySelector('[name=receiptRef]').value,'7156');
 w.allowed=true;w.addPaymentSale('S3');assert.equal(w.paymentDraft.clientId,'B');assert.equal(d.querySelector('[name=receiptRef]').value,'');assert.equal(w.saved.length,1);assert.equal(w.asked,2);
 }finally{dom.window.close();}
});
