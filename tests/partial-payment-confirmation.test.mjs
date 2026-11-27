import test from 'node:test';
import assert from 'node:assert/strict';
import {partialPaymentDetails,makePartialPaymentConfirmation,assertPartialPaymentConfirmation,monthlyOwnerLotIds} from '../monthly-payment-rules.mjs';
const state={sales:[{id:'S1',lotId:'L1',clientId:'C',type:'credit',price:110000,downPayment:10000,months:10,date:'2026-01-01'},{id:'S2',lotId:'L2',clientId:'C',type:'credit',price:60000,downPayment:10000,months:10,date:'2026-01-01'}],lots:[{id:'L1'},{id:'L2'}],payments:[{id:'P1',saleId:'S1',amount:10000,concept:'Prima'},{id:'P2',saleId:'S2',amount:10000,concept:'Prima'}],ownershipStatements:[{id:'D',references:[{lotId:'L1'},{lotId:'L2'}]}]};
test('partial approval describes exact cent amounts without changing balance or contract',()=>{
 const before=JSON.stringify(state),details=partialPaymentDetails(state,['L1'],900000);
 assert.deepEqual(details,{lotIds:['L1'],contractualCents:1000000,amountCents:900000,differenceCents:100000});
 const confirmation=makePartialPaymentConfirmation(details,{date:'2026-11-27',actor:'admin',note:'Registro parcial'});
 assert.doesNotThrow(()=>assertPartialPaymentConfirmation(details,confirmation,'2026-11-27','admin'));
 assert.throws(()=>assertPartialPaymentConfirmation(details,null,'2026-11-27','admin'),/Confirma/);
 for(const change of [{amountCents:800000},{differenceCents:1},{actor:'other'},{date:'2026-11-26'},{lotIds:['L2']}])
  assert.throws(()=>assertPartialPaymentConfirmation(details,{...confirmation,...change},'2026-11-27','admin'),/Confirma/);
 assert.equal(JSON.stringify(state),before);
});
test('joint installment, normal/excess payments and pending prima are distinct',()=>{
 const d=partialPaymentDetails(state,monthlyOwnerLotIds(state,'D',null),1200000);
 assert.deepEqual(d,{lotIds:['L1','L2'],contractualCents:1500000,amountCents:1200000,differenceCents:300000});
 assert.equal(partialPaymentDetails(state,['L1'],1000000),null);
 assert.equal(partialPaymentDetails(state,['L1'],2000000),null);
 assert.equal(partialPaymentDetails(state,['L1'],900000,{prima:true}),null);
 assert.equal(partialPaymentDetails({...state,payments:[]},['L1'],900000),null);
 assert.equal(partialPaymentDetails(state,['unknown'],100),null);
});
