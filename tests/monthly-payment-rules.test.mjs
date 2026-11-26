import test from 'node:test';import assert from 'node:assert/strict';
import {monthlyPaymentInfo,assertMonthlyPayment,validateNewMonthlyPayments,splitClientPayment,assertPrimaPayment,planMonthlyClientPayment} from '../monthly-payment-rules.mjs';
const base=()=>({sales:[{id:'V',lotId:'G16',type:'credit',price:580564.16,downPayment:58056.42,months:84,openingPaid:58056.42}],payments:[],ownerPayments:[]});
test('mensualidad de contrato existente, acepta monto parcial, exacto y mayor',()=>{const s=base();assert.equal(monthlyPaymentInfo(s,['G16']).monthlyCents,622033);assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],622032));assert.throws(()=>assertMonthlyPayment(s,['G16'],0),/positivo/);assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],622033));assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],800000));});
test('pago final inferior a cuota, prima pendiente y contrato sin activar',()=>{
 const s=base();s.sales[0].openingPaid=580000;assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],56416));assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],56415));assert.throws(()=>assertMonthlyPayment(s,['G16'],56417),/supera el saldo/);
 s.sales[0].openingPaid=0;assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],10000,{prima:true}));
 const doc={contractTexts:[{id:'D',lotId:'G16',format:'photo+ocr',status:'pending-sale',structured:{price:580564.16,down:58056.42,months:84}}],ownerPayments:[{allocations:[{amountCents:5805642,references:[{lotId:'G16'}]}]}]};
 assert.equal(monthlyPaymentInfo(doc,['G16']).primaRemainingCents,0);assert.doesNotThrow(()=>assertMonthlyPayment(doc,['G16'],10000));
});
test('varios solares: cuota conjunta, sin duplicar pagos conjuntos ni inventar cuota de una prima',()=>{
 const s=base();s.sales.push({...s.sales[0],id:'V2',lotId:'G17'});assert.equal(monthlyPaymentInfo(s,['G16','G17','G16']).monthlyCents,1244066);
 assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16','G17'],622033));
 assert.equal(monthlyPaymentInfo({ownerPayments:[{amountCents:5000000}]},['G16']).known,false);
});
test('no invalida recibos anteriores: valida solo importes nuevos o modificados',()=>{
 const before=base();before.payments=[{id:'OLD',saleId:'V',amount:100}];const after=structuredClone(before);after.clientNote='Actualizado';assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
 after.payments.push({id:'NEW',saleId:'V',amount:100});assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
 after.payments[1].amount=6220.33;assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
});

test('historial previo verificado conserva importes originales al conciliar; no permite una etiqueta inventada',()=>{
 const before=base();before.sales[0].openingPaid=0;before.historicalPayments=[{id:'H',amountCents:10000,date:'2024-01-01',contractId:'HC'}];
 const after=structuredClone(before);after.historicalPayments[0].postedPaymentId='POST';after.historicalContracts=[{id:'HC',saleId:'V'}];after.payments.push({id:'POST',saleId:'V',amount:100,date:'2024-01-01',historicalImportId:'H'});
 assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
 delete after.historicalPayments[0].postedPaymentId;assert.throws(()=>validateNewMonthlyPayments(before,after),/prima pendiente/);
});

test('prima no registrada en una ficha no se supone igual a cero para inventar la cuota',()=>{
 const state={contractTexts:[{lotId:'G16',format:'photo+ocr',status:'pending-sale',structured:{price:100000,down:null,months:12}}]};
 assert.equal(monthlyPaymentInfo(state,['G16']).known,false);
});

test('abono a prima de varios solares respeta la prima faltante individual y no exige cuota mínima',()=>{
 const s={sales:[{id:'A',lotId:'LA',clientId:'C',type:'credit',price:200000,downPayment:100000,months:12,openingPaid:99000,date:'2024-01-01'},
 {id:'B',lotId:'LB',clientId:'C',type:'credit',price:200000,downPayment:100000,months:12,openingPaid:80000,date:'2024-01-01'}],
 lots:[{id:'LA',residenceId:'R'},{id:'LB',residenceId:'R'}],payments:[],ownerPayments:[]};
 for(const mode of ['auto','prima']){
  const rows=splitClientPayment(s,['A','B'],1500000,null,mode);
  assert.equal(rows.reduce((n,r)=>n+r.cents,0),1500000);
  assert.ok(rows.find(r=>r.saleId==='A').cents<=100000);
  assert.ok(rows.find(r=>r.saleId==='B').cents<=2000000);
  for(const r of rows)assert.doesNotThrow(()=>assertPrimaPayment(s,r.saleId==='A'?'LA':'LB',r.cents));
  assert.doesNotThrow(()=>validateNewMonthlyPayments(s,{...s,payments:rows.map((r,i)=>({...r,id:'P'+i,paymentApplication:'prima'}))}));
 }
 assert.throws(()=>splitClientPayment(s,['A','B'],2100001,null,'prima'),/supera la prima/);
 assert.throws(()=>assertPrimaPayment(s,'LA',100001),/supera la prima/);
 const filled=structuredClone(s);filled.sales[0].openingPaid=100000;
 assert.equal(splitClientPayment(filled,['A','B'],10000,null,'prima')[0].saleId,'B');
});

const twoSolarExample=()=>({sales:[{id:'A',lotId:'LA',clientId:'C',type:'credit',price:430000,downPayment:10000,months:60,openingPaid:10000,date:'2025-01-01'},{id:'B',lotId:'LB',clientId:'C',type:'credit',price:460000,downPayment:10000,months:60,openingPaid:10000,date:'2025-01-01'}],lots:[{id:'LA',residenceId:'R'},{id:'LB',residenceId:'R'}],payments:[],ownerPayments:[]});
test('dos solares: 14,500 exactos y 19,500 con excedente de 5,000 sin duplicar el recibo',()=>{
 const s=twoSolarExample(),exact=planMonthlyClientPayment(s,['A','B'],1450000),extra=planMonthlyClientPayment(s,['A','B'],1950000);
 assert.equal(exact.minimumCents,1450000);assert.equal(exact.excessCents,0);assert.deepEqual(exact.allocations.map(a=>a.cents),[700000,750000]);
 assert.equal(extra.excessCents,500000);assert.equal(extra.allocations.reduce((n,a)=>n+a.cents,0),1950000);
 assert.doesNotThrow(()=>validateNewMonthlyPayments(s,{...s,payments:extra.allocations.map((r,i)=>({...r,id:'P'+i,concept:'Abono mensual'}))}));
 const partial=planMonthlyClientPayment(s,['A','B'],1400000);assert.equal(partial.shortfallCents,50000);assert.equal(partial.excessCents,0);assert.equal(partial.allocations.reduce((n,a)=>n+a.cents,0),1400000);assert.doesNotThrow(()=>validateNewMonthlyPayments(s,{...s,payments:partial.allocations.map((r,i)=>({...r,id:'PART'+i,concept:'Abono mensual'}))}));
});
test('abonos sucesivos: excluir solar liquidado y reducir cuota mínima al saldo final',()=>{
 const s=twoSolarExample();s.sales[0].openingPaid=429500;
 const first=planMonthlyClientPayment(s,['A','B'],800000);assert.equal(first.minimumCents,800000);
 s.payments.push(...first.allocations.map((a,i)=>({...a,id:'P'+i})));
 const second=planMonthlyClientPayment(s,['A','B'],750000);assert.equal(second.minimumCents,750000);assert.equal(second.allocations.length,1);assert.equal(second.allocations[0].saleId,'B');
});
test('abono conjunto conserva la regla de prima y el límite del saldo',()=>{
 const s=twoSolarExample();s.sales[0].openingPaid=0;assert.throws(()=>planMonthlyClientPayment(s,['A','B'],1950000),/Completa primero la prima/);
 s.sales[0].openingPaid=10000;assert.throws(()=>planMonthlyClientPayment(s,['A','B'],87000001),/supera el saldo/);
});

test('acepta un centavo repartido sin obligar a abonar en todos los solares',()=>{
 const s=twoSolarExample(),plan=planMonthlyClientPayment(s,['A','B'],1);
 assert.equal(plan.allocations.length,1);assert.equal(plan.allocations[0].cents,1);assert.equal(plan.shortfallCents,1449999);
});
