import test from 'node:test';import assert from 'node:assert/strict';
import {monthlyPaymentInfo,assertMonthlyPayment,validateNewMonthlyPayments} from '../monthly-payment-rules.mjs';
const base=()=>({sales:[{id:'V',lotId:'G16',type:'credit',price:580564.16,downPayment:58056.42,months:84,openingPaid:58056.42}],payments:[],ownerPayments:[]});
test('mensualidad de contrato existente, monto exacto y mayor; rechaza menor',()=>{const s=base();assert.equal(monthlyPaymentInfo(s,['G16']).monthlyCents,622033);assert.throws(()=>assertMonthlyPayment(s,['G16'],622032),/6,220.33/);assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],622033));assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],800000));});
test('pago final inferior a cuota, prima pendiente y contrato sin activar',()=>{
 const s=base();s.sales[0].openingPaid=580000;assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],56416));assert.throws(()=>assertMonthlyPayment(s,['G16'],56415),/mínimo/);
 s.sales[0].openingPaid=0;assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],10000,{prima:true}));
 const doc={contractTexts:[{id:'D',lotId:'G16',format:'photo+ocr',status:'pending-sale',structured:{price:580564.16,down:58056.42,months:84}}],ownerPayments:[{allocations:[{amountCents:5805642,references:[{lotId:'G16'}]}]}]};
 assert.equal(monthlyPaymentInfo(doc,['G16']).primaRemainingCents,0);assert.throws(()=>assertMonthlyPayment(doc,['G16'],10000),/mínimo/);
});
test('varios solares: cuota conjunta, sin duplicar pagos conjuntos ni inventar cuota de una prima',()=>{
 const s=base();s.sales.push({...s.sales[0],id:'V2',lotId:'G17'});assert.equal(monthlyPaymentInfo(s,['G16','G17','G16']).monthlyCents,1244066);
 assert.throws(()=>assertMonthlyPayment(s,['G16','G17'],622033),/mínimo/);
 assert.equal(monthlyPaymentInfo({ownerPayments:[{amountCents:5000000}]},['G16']).known,false);
});
test('no invalida recibos anteriores: valida solo importes nuevos o modificados',()=>{
 const before=base();before.payments=[{id:'OLD',saleId:'V',amount:100}];const after=structuredClone(before);after.clientNote='Actualizado';assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
 after.payments.push({id:'NEW',saleId:'V',amount:100});assert.throws(()=>validateNewMonthlyPayments(before,after),/mínimo/);
 after.payments[1].amount=6220.33;assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
});

test('historial previo verificado conserva importes originales al conciliar; no permite una etiqueta inventada',()=>{
 const before=base();before.historicalPayments=[{id:'H',amountCents:10000,date:'2024-01-01',contractId:'HC'}];
 const after=structuredClone(before);after.historicalPayments[0].postedPaymentId='POST';after.historicalContracts=[{id:'HC',saleId:'V'}];after.payments.push({id:'POST',saleId:'V',amount:100,date:'2024-01-01',historicalImportId:'H'});
 assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
 delete after.historicalPayments[0].postedPaymentId;assert.throws(()=>validateNewMonthlyPayments(before,after),/mínimo/);
});
