import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./multi-date-abonos-ui.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf(' function mdReceiptProof('),source.indexOf(' async function mdSave('));
test('remote confirmation requires exact saved receipt distributions, not only a cleared queue',async()=>{
 const state={payments:[{id:'G-1',groupId:'G',saleId:'s1',amount:600,date:'2026-11-25',receiptReference:'001'},{id:'G-2',groupId:'G',saleId:'s2',amount:300,date:'2026-11-25',receiptReference:'001'}]};
 let remote={revision:2,state:structuredClone(state)};
 const api=new Function('cloudApi','cloudQueue',helpers+';return {mdReceiptProof,mdReceiptsConfirmed};')(async()=>remote,{revision:2});
 const item={id:'G-1',groupId:'G',kind:'sale',amount:900,date:'2026-11-25',ref:'001'};item.proof=api.mdReceiptProof(state,item);
 assert.equal(await api.mdReceiptsConfirmed([item]),true);
 remote.revision=1;assert.equal(await api.mdReceiptsConfirmed([item]),false);
 remote.revision=2;remote.state.payments[1].saleId='wrong';assert.equal(await api.mdReceiptsConfirmed([item]),false);
 remote.state=structuredClone(state);remote.state.payments[1].receiptReference='002';assert.equal(await api.mdReceiptsConfirmed([item]),false);
 remote.state=structuredClone(state);remote.state.payments[1].voidedAt='2026-11-26';assert.equal(await api.mdReceiptsConfirmed([item]),false);
 remote.state.payments=[];assert.equal(await api.mdReceiptsConfirmed([item]),false);
});

test('remote receipt must retain the approved shortfall and owner distribution',async()=>{
 const confirmation={version:1,confirmed:true,lotIds:['L'],contractualCents:1000000,amountCents:900000,differenceCents:100000,date:'2026-11-25',actor:'admin',note:'Parcial',confirmedAt:'2026-11-25T12:00:00.000Z'};
 const state={ownerPayments:[{id:'OP',date:'2026-11-25',receiptReference:'001',amountCents:900000,allocations:[{statementId:'D',referenceIndex:null,amountCents:900000,references:[{lotId:'L'}],partialPaymentConfirmation:confirmation}]}]};
 let remote={revision:2,state:structuredClone(state)};
 const api=new Function('cloudApi','cloudQueue',helpers+';return {mdReceiptProof,mdReceiptsConfirmed};')(async()=>remote,{revision:2});
 const item={id:'OP',kind:'owner',amount:9000,date:'2026-11-25',ref:'001'};item.proof=api.mdReceiptProof(state,item);
 assert.equal(await api.mdReceiptsConfirmed([item]),true);
 remote.state.ownerPayments[0].allocations[0].references[0].lotId='wrong';assert.equal(await api.mdReceiptsConfirmed([item]),false);
 remote.state=structuredClone(state);delete remote.state.ownerPayments[0].allocations[0].partialPaymentConfirmation;assert.equal(await api.mdReceiptsConfirmed([item]),false);
});
