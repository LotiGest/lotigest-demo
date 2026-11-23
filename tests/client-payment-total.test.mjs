import test from 'node:test';
import assert from 'node:assert/strict';
import {splitClientPayment,validateNewMonthlyPayments} from '../monthly-payment-rules.mjs';
import {validateNewReceiptCorrelativos} from '../owner-payments.mjs';
export const fixture=()=>({clients:[{id:'C',name:'DELMI'}],residences:[{id:'R',name:'Arrayán'}],lots:[{id:'L1',residenceId:'R',stage:1,block:'Comerciales',sourceNumber:'1'},{id:'L2',residenceId:'R',stage:1,block:'Comerciales',sourceNumber:'2'}],sales:[{id:'S1',clientId:'C',lotId:'L1',type:'credit',price:100000,downPayment:10000,openingPaid:10000,months:12,date:'2024-01-01'},{id:'S2',clientId:'C',lotId:'L2',type:'credit',price:200000,downPayment:20000,openingPaid:20000,months:12,date:'2024-01-01'}],payments:[]});
test('total de cliente respeta cuotas 7500/15000, centavos y límites de saldo',()=>{
 const db=fixture();
 assert.deepEqual(splitClientPayment(db,['S1','S2'],3000000),[{saleId:'S1',amount:10000,cents:1000000},{saleId:'S2',amount:20000,cents:2000000}]);
 const cents=splitClientPayment(db,['S1','S2'],3000001);assert.equal(cents.reduce((n,r)=>n+r.cents,0),3000001);
 db.sales[0].openingPaid=99900;
 const capped=splitClientPayment(db,['S1','S2'],3000000);assert.equal(capped[0].amount,100);assert.equal(capped[1].amount,29900);
 assert.throws(()=>splitClientPayment(db,['S1','S2'],999999999),/supera/);
 db.sales[1].clientId='OTHER';assert.throws(()=>splitClientPayment(db,['S1','S2'],3000000),/cliente/);
 db.sales[1].clientId='C';db.lots[1].residenceId='OTHER';assert.throws(()=>splitClientPayment(db,['S1','S2'],3000000),/residencial/);
});
test('cada fecha crea un grupo de recibo con 2 pagos aceptados por validadores del servidor',()=>{
 const before=fixture(),after=structuredClone(before);
 for(const [i,date] of ['2024-02-01','2024-03-01'].entries())for(const row of splitClientPayment(after,['S1','S2'],3000000,date))after.payments.push({id:`P${i}-${row.saleId}`,groupId:`G${i}`,saleId:row.saleId,amount:row.amount,date,receiptReference:`001${i}`,receiptReferenceNormalized:`1${i}`});
 assert.equal(after.payments.length,4);assert.equal(after.payments.reduce((n,p)=>n+p.amount,0),60000);
 assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
 assert.doesNotThrow(()=>validateNewReceiptCorrelativos(before,after));
 assert.throws(()=>splitClientPayment(before,['S1','S2'],3000000,'2023-12-01'),/anterior/);
});
