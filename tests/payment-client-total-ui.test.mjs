import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {splitClientPayment} from '../monthly-payment-rules.mjs';
const source=readFileSync(new URL('../deploy/cloudflare/payment-modal-ui.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function pmAssignedSales('),source.indexOf('function pmSalesDecorate('));
test('abono normal incluye los 2 solares, un total y ningún botón Agregar',()=>{
 const dom=new JSDOM('<div class="lg-payment-modern"><form id="multi-payment-form"><div id="pm-lot-tags"></div><div id="pm-amount-slot"></div><div id="multi-payment-selected"></div><div id="multi-payment-error"></div></form></div>');
 const document=dom.window.document,paymentDraft={clientId:'C',residenceId:'R',amounts:{S2:''}};
 const db={lots:[{id:'L1',residenceId:'R',stage:1,block:'Comerciales',sourceNumber:'1'},{id:'L2',residenceId:'R',stage:1,block:'Comerciales',sourceNumber:'2'}],sales:[{id:'S1',clientId:'C',lotId:'L1',type:'credit',price:100000,downPayment:10000,months:12,openingPaid:10000},{id:'S2',clientId:'C',lotId:'L2',type:'credit',price:200000,downPayment:20000,months:12,openingPaid:20000}],payments:[]};
 const node=(tag,cls='',text='')=>{const el=document.createElement(tag);el.className=cls;el.textContent=text;return el;};
 const env={pmHeaderClient:()=>{},db,document,paymentDraft,pmActive:'sale',pmSales:()=>db.sales.filter(s=>Object.hasOwn(paymentDraft.amounts,s.id)),paymentCandidates:()=>db.sales,getLot:id=>db.lots.find(l=>l.id===id),getClient:()=>({id:'C',name:'DELMI'}),pmBadge:text=>node('span','pm-tag',text),pmNode:node,splitClientPayment,pmUpdateLastPayment:()=>{},residence:()=>({id:'R'}),updateMultiPaymentTotal:()=>{}};
 const api=new Function(...Object.keys(env),helpers+';return {pmIncludeClientSales,pmRepaintSales};')(...Object.values(env));
 try{
  const before=JSON.stringify(db);api.pmIncludeClientSales();
  assert.deepEqual(Object.keys(paymentDraft.amounts).sort(),['S1','S2']);
  document.getElementById('multi-payment-selected').innerHTML='<label>Monto<input data-payment-amount="S1"></label><label>Monto<input data-payment-amount="S2"></label>';
  api.pmRepaintSales();assert.equal(document.querySelectorAll('.pm-tag').length,2);assert.equal(document.querySelectorAll('.pm-tag button').length,0);
  const total=document.getElementById('pm-client-total');assert.ok(total);total.value='30000';total.dispatchEvent(new dom.window.Event('input'));
  assert.equal(paymentDraft.amounts.S1,'10000');assert.equal(paymentDraft.amounts.S2,'20000');assert.equal(JSON.stringify(db),before);
  db.lots.push({id:'L3',residenceId:'R',stage:1,block:'Comerciales',sourceNumber:'3'});
  db.sales.push({id:'S3',clientId:'C',lotId:'L3',type:'credit',price:100000,downPayment:10000,months:12,openingPaid:10000});
  api.pmIncludeClientSales();api.pmRepaintSales();
  assert.deepEqual(Object.keys(paymentDraft.amounts).sort(),['S1','S2','S3']);
  assert.deepEqual([...document.querySelectorAll('[data-pm-assigned-lot]')].map(t=>t.dataset.pmAssignedLot),['L1','L2','L3']);
  const total3=document.getElementById('pm-client-total');total3.value='40000';total3.dispatchEvent(new dom.window.Event('input'));
  assert.equal(paymentDraft.amounts.S1,'10000');assert.equal(paymentDraft.amounts.S2,'20000');assert.equal(paymentDraft.amounts.S3,'10000');
  total3.value='9999999';total3.dispatchEvent(new dom.window.Event('input'));
  total.value='9999999';total.dispatchEvent(new dom.window.Event('input'));assert.match(document.getElementById('multi-payment-error').textContent,/supera/);assert.equal(paymentDraft.amounts.S1,'');
 }finally{dom.window.close();}
});

test('encabezado muestra el cliente y protege un abono sin guardar al cambiar de cliente',()=>{
 const dom=new JSDOM('<section class="modal"><div class="modal-header"><div><h2>Registrar abono</h2></div></div><form id="multi-payment-form"><input name="receiptRef" value=""></form></section>');
 const document=dom.window.document,modal=document.querySelector('.modal');
 const node=(tag,cls='',text='')=>{const el=document.createElement(tag);el.className=cls;el.textContent=text;return el;};
 let opened=0,allowed=false;
 const helper=source.slice(source.indexOf('function pmHeaderClient('),source.indexOf('function pmIcon('));
 const api=new Function('document','window','pmNode','newPayment',helper+';return pmHeaderClient;')(document,{confirm:()=>allowed},node,(id,ocr)=>{assert.equal(id,null);assert.equal(ocr,false);opened++;});
 api(modal,{name:'CLIENTE A'});
 assert.equal(modal.querySelector('.pm-header-client-name').textContent,'CLIENTE A');
 const button=modal.querySelector('.pm-change-client'),receipt=document.querySelector('[name=receiptRef]');
 receipt.value='123';button.click();assert.equal(opened,0);
 allowed=true;button.click();assert.equal(opened,1);
 api(modal,{name:'CLIENTE B'});assert.equal(modal.querySelector('.pm-header-client-name').textContent,'CLIENTE B');
 assert.equal(modal.querySelectorAll('.pm-header-client').length,1);dom.window.close();
});
