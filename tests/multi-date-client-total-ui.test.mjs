import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {webcrypto} from 'node:crypto';
import {fixture} from './client-payment-total.test.mjs';
import * as owner from '../owner-payments.mjs';
const source=readFileSync(new URL('../deploy/cloudflare/multi-date-abonos-ui.js',import.meta.url),'utf8');
const rules=(readFileSync(new URL('../contract-owner-payments.mjs',import.meta.url),'utf8')+readFileSync(new URL('../monthly-payment-rules.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'')).replace(/export /g,'');
test('Abonos varios agrupa cliente, incluye dos solares y guarda un total por fecha',async()=>{
 const dom=new JSDOM('<div id="modal-root"></div><div class="workspace-inner"></div>',{url:'https://test/',runScripts:'outside-only'}),w=dom.window;
 const errors=[];let saved;
 Object.defineProperty(w,'crypto',{value:webcrypto});w.db=fixture();
 w.cloudReady=true;w.cloudUser={role:'admin',name:'admin'};w.cloudQueue={pending:false,latest:1,confirmed:1,revision:1};w.cloudBlocked=false;w.cloudBusy=false;w.cloudOffline=false;
 w.getSale=id=>w.db.sales.find(s=>s.id===id);w.getLot=id=>w.db.lots.find(l=>l.id===id);w.getClient=id=>w.db.clients.find(c=>c.id===id);
 w.balance=s=>s.price-s.openingPaid-w.db.payments.filter(p=>p.saleId===s.id).reduce((n,p)=>n+p.amount,0);
 w.businessToday=()=> '2026-11-23';w.money=n=>`L ${n}`;w.esc=x=>String(x??'');w.page='collections';w.residence=()=>w.db.residences[0];
 w.toast=m=>errors.push(m);w.showModal=(title,body,footer)=>{w.document.getElementById('modal-root').innerHTML='<div class="modal"><div class="modal-header"><h2>'+title+'</h2></div><div class="modal-content">'+body+'</div><div class="modal-footer">'+(footer||'')+'</div></div>';};
 w.paymentReceiptPreview=()=>{};w.ownerPaymentPreview=()=>{};w.buildReceiptInfo=()=>({});w.uid=()=>webcrypto.randomUUID();
 w.cloudWrite=raw=>{saved=JSON.parse(raw);};w.cloudFlush=async()=>{};w.cloudApi=async()=>({revision:1,state:saved});w.closeModal=()=>{w.document.getElementById('modal-root').innerHTML='';};w.render=()=>{};w.newPayment=()=>{};w.lotigestOwnerPayments=owner;w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.eval(rules);const monthlyUI=readFileSync(new URL('../deploy/cloudflare/monthly-payment-ui.js',import.meta.url),'utf8');w.eval(monthlyUI.slice(monthlyUI.indexOf('function partialAdvanceFor('),monthlyUI.indexOf('function partialFormEntries(')));w.eval(source.replace(/\}\)\(\);\s*$/, 'window.__md={getState:()=>mdState,save:mdSave};})();'));
 try{
  w.lotigestMultiDate.openMulti();assert.equal(w.document.querySelectorAll('[data-md-shortcut-sale]').length,1,'Un cliente con dos solares sale una vez');
  assert.match(w.document.querySelector('[data-md-shortcut-sale]').textContent,/DELMI/);
  w.document.querySelector('[data-md-shortcut-sale]').click();
  const state=w.__md.getState();assert.deepEqual([...state.saleIds],['S1','S2']);
  Object.assign(state.rows[0],{date:'2024-02-01',amount:'30000',receiptRef:'00010'});
  w.document.querySelector('[data-md-next]').click();assert.equal(state.rows.length,2);Object.assign(state.rows[1],{date:'2024-03-01',amount:'30000',receiptRef:'00011'});
  w.document.querySelector('[data-md-review]').click();assert.equal(w.document.querySelectorAll('#md-review tbody tr').length,2);assert.equal(saved,undefined);w.document.getElementById('md-review-confirm').checked=true;await w.__md.save();assert.ok(saved,errors.join(';'));
  assert.equal(saved.payments.length,4);
  const tokens=new Set();
  for(const groupId of new Set(saved.payments.map(p=>p.groupId))){
   const group=saved.payments.filter(p=>p.groupId===groupId);
   assert.equal(new Set(group.map(p=>p.verifyToken)).size,1,'El servidor requiere un QR por recibo, no por solar');
   assert.match(group[0].verifyToken,/^[a-f0-9]{32}$/);
   tokens.add(group[0].verifyToken);
  }
  assert.equal(tokens.size,2,'Cada fecha tiene su QR independiente');
  assert.deepEqual([...new Set(saved.payments.map(p=>p.groupId))].length,2);
  for(const date of ['2024-02-01','2024-03-01'])assert.equal(saved.payments.filter(p=>p.date===date).reduce((n,p)=>n+p.amount,0),30000);
  w.document.querySelector('[data-md-show-saved]').click();assert.equal(w.document.querySelectorAll('[data-md-pdf]').length,2,'Un recibo por fecha');
 }finally{w.close();}
});
