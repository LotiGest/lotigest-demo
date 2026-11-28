import test from 'node:test';import assert from 'node:assert/strict';
import {monthlyPaymentInfo,assertMonthlyPayment,validateNewMonthlyPayments,splitClientPayment,assertPrimaPayment,planMonthlyClientPayment,classifyAutomaticPayment,planAutomaticClientPayment} from '../monthly-payment-rules.mjs';
const base=()=>({sales:[{id:'V',lotId:'G16',type:'credit',price:580564.16,downPayment:58056.42,months:84,openingPaid:58056.42}],payments:[],ownerPayments:[]});
test('mensualidad de contrato existente acepta parcial, exacto y mayor',()=>{const s=base();assert.equal(monthlyPaymentInfo(s,['G16']).monthlyCents,622033);assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],622032));assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],622033));assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],800000));});
test('pago final inferior a cuota, prima pendiente y contrato sin activar',()=>{
 const s=base();s.sales[0].openingPaid=580000;assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],56416));assert.doesNotThrow(()=>assertMonthlyPayment(s,['G16'],56415));
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

test('historial previo verificado conserva importes originales y permite abonos parciales posteriores',()=>{
 const before=base();before.historicalPayments=[{id:'H',amountCents:10000,date:'2024-01-01',contractId:'HC'}];
 const after=structuredClone(before);after.historicalPayments[0].postedPaymentId='POST';after.historicalContracts=[{id:'HC',saleId:'V'}];after.payments.push({id:'POST',saleId:'V',amount:100,date:'2024-01-01',historicalImportId:'H'});
 assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
 delete after.historicalPayments[0].postedPaymentId;assert.doesNotThrow(()=>validateNewMonthlyPayments(before,after));
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
 assert.equal(planMonthlyClientPayment(s,['A','B'],1400000).shortfallCents,50000);
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

test('pagos anulados no completan prima ni reducen saldo, tampoco por propietario',()=>{
 const s=base();s.sales[0].openingPaid=0;
 s.payments=[{id:'VOID',saleId:'V',amount:58056.42,status:'voided'}];
 s.ownerPayments=[{id:'CANCELLED',status:'cancelled',allocations:[{amountCents:5805642,references:[{lotId:'G16'}]}]}];
 const before=JSON.stringify(s),info=monthlyPaymentInfo(s,['G16']);
 assert.equal(info.primaRemainingCents,5805642);assert.equal(info.remainingCents,58056416);
 assert.throws(()=>assertMonthlyPayment(s,['G16'],10000),/prima pendiente/);
 assert.equal(JSON.stringify(s),before);
});
test('abonos parciales conservan faltante y excluyen el solar liquidado sin perder centavos',()=>{
 const s={clients:[{id:'C'}],lots:[{id:'L1',residenceId:'R'},{id:'L2',residenceId:'R'}],sales:[{id:'A',clientId:'C',lotId:'L1',type:'credit',price:10000,downPayment:1000,months:9,date:'2024-01-01',openingPaid:1000},{id:'B',clientId:'C',lotId:'L2',type:'credit',price:10000,downPayment:1000,months:9,date:'2024-01-01',openingPaid:1000}],payments:[]};
 for(const cents of [1,99,10000,199999,200000,200001]){
  const p=planMonthlyClientPayment(s,['A','B'],cents,'2024-02-01');
  assert.equal(p.allocations.reduce((n,a)=>n+a.cents,0),cents);
  assert.equal(p.shortfallCents,Math.max(0,200000-cents));
  assert.equal(p.excessCents,Math.max(0,cents-200000));
 }
 for(const amount of [0,-1,NaN,1.5])assert.throws(()=>assertMonthlyPayment(s,['L1'],amount),/monto positivo/);
 assert.throws(()=>assertMonthlyPayment(s,['L1'],900001),/saldo pendiente/);
});

test('primer pago de L 1,000,000 se clasifica automáticamente como prima y el siguiente como abono',()=>{
 const s={sales:[{id:'V',lotId:'L',clientId:'C',type:'credit',price:4500000,downPayment:1000000,months:84,date:'2026-04-01'}],lots:[{id:'L',residenceId:'R'}],payments:[],ownerPayments:[]};
 assert.deepEqual(classifyAutomaticPayment(s,'L',100000000),{paymentApplication:'prima',concept:'Prima'});
 const partial=planAutomaticClientPayment(s,['V'],40000000,'2026-04-01');
 assert.equal(partial.paymentApplication,'prima');assert.equal(partial.shortfallCents,60000000);
 const p1={...partial.allocations[0],id:'P1',date:'2026-04-01'};
 const w={...s,payments:[p1]};
 const final=planAutomaticClientPayment(w,['V'],60000000,'2026-05-01');
 const p2={...final.allocations[0],id:'P2',date:'2026-05-01'};
 const paid={...w,payments:[p2,p1]};
 assert.equal(monthlyPaymentInfo(paid,['L']).primaRemainingCents,0);
 assert.equal(monthlyPaymentInfo(paid,['L']).remainingCents,350000000);
 assert.deepEqual(classifyAutomaticPayment(paid,'L',4166667),{});
 const monthly=planAutomaticClientPayment(paid,['V'],4166667,'2026-06-01');
 assert.doesNotThrow(()=>validateNewMonthlyPayments(s,{...s,payments:[{...monthly.allocations[0],id:'P3',date:'2026-06-01',concept:'Abono mensual'},p2,p1]}));
 assert.throws(()=>planAutomaticClientPayment(s,['V'],100000001,'2026-04-01'),/supera la prima/);
});
test('la prima automática no se repite en un solar ya cubierto',()=>{
 const s=twoSolarExample();s.sales[1].openingPaid=0;
 const p=planAutomaticClientPayment(s,['A','B'],1000000,'2026-01-01');
 assert.deepEqual(p.allocations.map(a=>[a.saleId,a.paymentApplication,a.cents]),[['B','prima',1000000]]);
});

 test('recibos anulados no completan la prima ni reducen saldo contractual',()=>{
 const s={lots:[{id:'L1',residenceId:'R'}],sales:[{id:'S1',lotId:'L1',clientId:'C1',type:'credit',price:120000,downPayment:20000,months:10,date:'2026-01-01'}],payments:[{id:'P1',saleId:'S1',amount:20000,concept:'Prima',date:'2026-01-01'},{id:'P2',saleId:'S1',amount:30000,date:'2026-02-01'},{id:'P3',saleId:'S1',amount:30000,status:'annulled',date:'2026-02-02'}],ownerPayments:[]};
 const before=JSON.stringify(s);assert.equal(monthlyPaymentInfo(s,['L1']).remainingCents,7000000);assert.equal(monthlyPaymentInfo(s,['L1']).monthlyCents,1000000);assert.equal(monthlyPaymentInfo(s,['L1']).primaRemainingCents,0);assert.equal(JSON.stringify(s),before);
 assert.doesNotThrow(()=>assertMonthlyPayment(s,['L1'],7000000));assert.throws(()=>assertMonthlyPayment(s,['L1'],7000001),/supera el saldo/);
 s.payments[0].status='annulled';s.payments[1].status='annulled';assert.equal(monthlyPaymentInfo(s,['L1']).primaRemainingCents,2000000);assert.throws(()=>assertMonthlyPayment(s,['L1'],1000000),/completa la prima/);
 });
