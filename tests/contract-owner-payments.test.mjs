import test from 'node:test';
import assert from 'node:assert/strict';
import {contractOwnerPaymentRows,contractPaymentReadView} from '../contract-owner-payments.mjs';
import {contractCollectionsScope} from '../contract-collections-scope.mjs';
import {monthlyPaymentInfo,splitClientPayment} from '../monthly-payment-rules.mjs';
import {validate} from '../functions/api/app/state.js';
import {mixedOwnerFixture} from './mixed-owner-fixture.mjs';

test('mixed receipts reflect paid prima and installments without rewriting, duplicating or persisting virtual payments',()=>{
 const s=mixedOwnerFixture(),before=JSON.stringify(s);assert.doesNotThrow(()=>validate(s));
 const rows=contractOwnerPaymentRows(s);assert.equal(rows.length,10);
 assert.equal(rows.reduce((n,p)=>n+Math.round(p.amount*100),0),11689136);
 assert.equal(rows.filter(p=>p.paymentApplication==='prima').reduce((n,p)=>n+Math.round(p.amount*100),0),10522736);
 const view=contractPaymentReadView(s);assert.equal(view.ownerPayments.length,0);assert.deepEqual(contractPaymentReadView(view),view);
 assert.throws(()=>validate(view),/vista de recibos/);
 const scope=contractCollectionsScope(s,'R');assert.equal(scope.payments.length,10);
 for(const sale of s.sales){const info=monthlyPaymentInfo(s,[sale.lotId]);assert.equal(info.primaRemainingCents,0);assert.equal(info.remainingCents,46969082);assert.equal(monthlyPaymentInfo(view,[sale.lotId]).remainingCents,info.remainingCents);}
 const abono=rows.filter(p=>p.receiptReference==='7155');assert.equal(abono.length,2);
 for(const p of abono){assert.deepEqual(p.receiptInfo.allocations.map(a=>[a.number,Math.round(a.amount*100)]),[[1,566099],[2,17101]]);}
 assert.equal(splitClientPayment(s,s.sales.map(s=>s.id),10000,'2026-09-06','monthly').reduce((n,p)=>n+p.cents,0),10000);
 assert.equal(JSON.stringify(s),before);
});
test('incomplete, voided, other-client and foreign-residence links are not guessed',()=>{
 for(const alter of [s=>s.contractTexts[1].status='voided',s=>s.sales[1].clientId='OTHER',s=>s.lots[1].residenceId='OTHER',s=>s.ownerPayments.forEach(p=>delete p.allocations[0].references[1].lotId)]){
  const s=mixedOwnerFixture();alter(s);assert.deepEqual(contractOwnerPaymentRows(s),[]);
 }
 const s=mixedOwnerFixture();s.ownerPayments[4].status='voided';assert.equal(contractOwnerPaymentRows(s).length,8);
});
test('new payments include owner receipts in server saldo protection; future same-day receipt does not displace earlier allocations',()=>{
 const s=mixedOwnerFixture();s.payments.push({id:'P-NEW',saleId:s.sales[0].id,date:'2026-08-06',recordedAt:'2026-11-27T04:00:00Z',amount:100,receiptReference:'9991'});
 assert.doesNotThrow(()=>validate(s));assert.equal(monthlyPaymentInfo(s,[s.sales[0].lotId]).remainingCents,46959082);
 assert.deepEqual(contractOwnerPaymentRows(s).find(p=>p.saleId===s.sales[0].id&&p.receiptReference==='7155').receiptInfo.allocations.map(a=>a.number),[1,2]);
 s.payments[0].amount=469690.83;assert.throws(()=>validate(s),/superan el precio/);s.payments[0].date='2026-07-01';s.payments[0].amount=475000;assert.throws(()=>validate(s),/superan el precio/);
});

test('backdated monthly receipt does not consume or hide later explicitly classified prima receipts',()=>{const s=mixedOwnerFixture();s.payments.push({id:'BACKDATED',saleId:s.sales[0].id,date:'2025-12-15',amount:100,paymentApplication:'monthly',concept:'Abono',recordedAt:'2026-11-27T05:00:00Z'});const rows=contractOwnerPaymentRows(s);assert.equal(rows.length,10);assert.equal(rows.reduce((n,p)=>n+Math.round(p.amount*100),0),11689136);assert.equal(monthlyPaymentInfo(s,[s.sales[0].lotId]).primaRemainingCents,0);});
