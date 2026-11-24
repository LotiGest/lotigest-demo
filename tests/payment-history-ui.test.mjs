import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const historySource=readFileSync(new URL('../deploy/cloudflare/payment-history-ui.js',import.meta.url),'utf8');
const modalSource=readFileSync(new URL('../deploy/cloudflare/payment-modal-ui.js',import.meta.url),'utf8');
const buildSource=readFileSync(new URL('../deploy/cloudflare/build.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../deploy/cloudflare/payment-modal.css',import.meta.url),'utf8');
function model(extra={}){
 const payments=[
  {id:'P-1',groupId:'RC-7',receiptReference:'00006159',saleId:'S-1',date:'2026-04-20',amount:1000,method:'Efectivo',concept:'Abono',receiptInfo:{allocations:[{number:3,month:'2026-05',amount:1000}]}},
  {id:'P-2',groupId:'RC-7',receiptReference:'00006159',saleId:'S-2',date:'2026-04-20',amount:2000,method:'Efectivo',concept:'Abono',receiptInfo:{allocations:[{number:3,month:'2026-05',amount:2000}]}},
  {id:'PR-1',saleId:'S-1',date:'2026-01-20',amount:30000,concept:'Prima',receiptInfo:{allocations:[{label:'Prima inicial',amount:30000}]}}
 ];
 const ctx={pmActive:'sale',pmSales:()=>[{id:'S-1',lotId:'L-1'},{id:'S-2',lotId:'L-2'}],
   getLot:id=>({id,stage:1,block:'A',sourceNumber:id==='L-1'?'1':'2'}),
   db:{payments,ownerPayments:[],historicalPayments:[]},money:n=>'L '+Number(n).toFixed(2),
   ownerPaymentDraft:{clientId:'C-1',residenceId:'arrayan'},...extra};
 vm.createContext(ctx);vm.runInContext(historySource,ctx);return ctx;
}
test('recibo compartido entre dos solares se agrupa una sola vez y ordena por fecha',()=>{
 const ctx=model();
 const rows=vm.runInContext('pmHistoryRows()',ctx);
 assert.equal(rows.length,2);
 assert.equal(rows[0].date,'2026-04-20');
 assert.equal(rows[0].amountCents,300000);
 assert.equal(rows[0].lots.size,2);
 assert.equal(rows[0].receiptId,'P-1');
 assert.equal(rows[0].reference,'00006159');
 assert.equal(rows[1].reference,'');
 assert.equal(vm.runInContext("pmHistoryMatches(pmHistoryRows()[0],'6159')",ctx),true);
 assert.equal(vm.runInContext("pmHistoryMatches(pmHistoryRows()[0],'00006159')",ctx),true);
 assert.equal(vm.runInContext("pmHistoryMatches(pmHistoryRows()[1],'6159')",ctx),false);
 assert.ok(rows[0].parts.join(' ').includes('adelantada'));
 assert.equal(rows[1].amountCents,3000000);
 assert.equal(rows[1].date,'2026-01-20');
});
test('historial de propietario no duplica movimientos importados contabilizados',()=>{
 const ctx=model({pmActive:'owner',db:{payments:[],ownerPayments:[
  {id:'O-1',clientId:'C-1',residenceId:'arrayan',date:'2025-04-26',amountCents:70000,concept:'Abono',allocations:[{references:[{stage:1,block:'A',solar:'3'}]}]}
 ],historicalPayments:[
  {id:'H-1',clientId:'C-1',residenceId:'arrayan',date:'2025-03-26',amountCents:70000,postedPaymentId:'P-ANT'},
  {id:'H-2',clientId:'C-1',residenceId:'arrayan',date:'2025-02-26',amountCents:70000}
 ]}});
 const rows=vm.runInContext('pmHistoryRows()',ctx);
 assert.equal(rows.length,2);
 assert.equal(rows[0].action,'owner-payment-receipt');
 assert.equal(rows[1].kind,'Historial importado por revisar');
 assert.equal(rows.filter(x=>x.id==='H-1').length,0);
});
test('ventana de historial accesible por fecha y con botón de recibo en abonos y fichas',()=>{
 assert.match(modalSource,/pmOpenPaymentHistory\(\)/);
 assert.equal((modalSource.match(/dataset\.pmHistoryOpen='true'/g)||[]).length,2);
 assert.match(historySource,/aria-modal/);
 assert.match(historySource,/from\.addEventListener\('change',render\)/);
 assert.match(historySource,/to\.addEventListener\('change',render\)/);
 assert.match(historySource,/receipt-preview/);
 assert.match(historySource,/owner-payment-receipt/);
 assert.match(css,/pm-history-window/);
 assert.match(buildSource,/payment-history-ui\.js/);
});

test('anular un recibo repartido archiva ambas partes y recalcula los recibos posteriores',()=>{
 const ctx=model();
 const state={sales:[{id:'S1',lotId:'L1',clientId:'C',type:'credit',openingPaid:0},
  {id:'S2',lotId:'L2',clientId:'C',type:'credit',openingPaid:0}],
  lots:[{id:'L1',residenceId:'R'},{id:'L2',residenceId:'R'}],
  payments:[{id:'N',saleId:'S1',amount:50,receiptInfo:{allocations:[]}},
   {id:'A1',saleId:'S1',groupId:'G',amount:100,receiptReference:'00035'},
   {id:'A2',saleId:'S2',groupId:'G',amount:200,receiptReference:'00035'},
   {id:'P',saleId:'S1',amount:500}]};
 const before=JSON.stringify(state);
 ctx.state=state;
 const result=vm.runInContext("pmHistoryVoidPlan(state,'A1','ADMIN','Pago duplicado',(p,prior)=>({allocations:[{amount:p.amount}],prior}))",ctx);
 assert.equal(result.count,2);assert.equal(result.total,30000);
 assert.equal(result.state.payments.length,2);
 assert.equal(result.state.payments[0].receiptInfo.prior,500);
 assert.equal(result.state.paymentVoidHistory[0].payments.length,2);
 assert.equal(result.state.paymentVoidHistory[0].reference,'00035');
 assert.equal(result.state.paymentVoidHistory[0].corrected.length,1);
 assert.equal(JSON.stringify(state),before);
 state.sales[0].type='cash';
 assert.throws(()=>vm.runInContext("pmHistoryVoidPlan(state,'A1','ADMIN','Pago duplicado',()=>null)",ctx),/crédito/);
 state.sales[0].type='credit';state.historicalPayments=[{postedPaymentId:'A1'}];
 assert.throws(()=>vm.runInContext("pmHistoryVoidPlan(state,'A1','ADMIN','Pago duplicado',()=>null)",ctx),/histórico/);
});

test('editar recibo de varios solares conserva IDs, distribuciones y registro de auditoría',()=>{
 const ctx=model();
 ctx.state={sales:[{id:'S1',lotId:'L1',clientId:'C',type:'credit',price:1000,date:'2024-01-01'},
 {id:'S2',lotId:'L2',clientId:'C',type:'credit',price:1000,date:'2024-01-01'}],
 lots:[{id:'L1',residenceId:'R'},{id:'L2',residenceId:'R'}],
 payments:[{id:'N',saleId:'S1',amount:50,receiptInfo:{allocations:[]}},
 {id:'A',groupId:'G',saleId:'S1',amount:100,receiptReference:'001',receiptInfo:{allocations:[]}},
 {id:'B',groupId:'G',saleId:'S2',amount:200,receiptReference:'001',receiptInfo:{allocations:[]}}]};
 ctx.changes={date:'2024-02-02',method:'Efectivo',reference:'0002',amounts:{A:'150.00',B:'200'}};
 ctx.rules={requireReceiptCorrelativo:x=>x.replace(/^0+/,''),findReceiptCorrelativo:(s,r)=>s.payments.find(p=>p.receiptReference===r)};
 const original=JSON.stringify(ctx.state);
 const run=()=>vm.runInContext("pmHistoryEditPlan(state,'A',changes,'Admin','Corregir monto',(p,prior)=>({allocations:[],prior}),rules,'2026-11-24')",ctx);
 const plan=run();
 assert.equal(plan.total,35000);assert.equal(plan.state.payments.length,3);
 assert.equal(plan.state.payments[0].receiptInfo.prior,150);
 assert.equal(plan.state.payments[2].receiptReference,'0002');
 assert.equal(plan.state.paymentEditHistory.length,1);assert.equal(JSON.stringify(ctx.state),original);
 ctx.changes.date='2027-01-01';assert.throws(run,/fecha/);
 ctx.changes.date='2024-02-02';ctx.changes.amounts.A='1001';assert.throws(run,/saldo/);
});

test('editar tipo de pago distingue prima atrasada de cuota y no cambia el total recibido',()=>{
 const ctx=model();
 ctx.state={sales:[{id:'S',lotId:'L',clientId:'C',type:'credit',price:1000,downPayment:300,date:'2024-01-01'}],
 lots:[{id:'L',residenceId:'R'}],payments:[{id:'A',saleId:'S',amount:200,concept:'Abono',date:'2024-02-01',receiptReference:'001',receiptInfo:{allocations:[{label:'Prima inicial',amount:200}]}}]};
 ctx.rules={requireReceiptCorrelativo:x=>x,findReceiptCorrelativo:()=>null};
 ctx.changes={date:'2024-02-01',method:'Efectivo',reference:'001',amounts:{A:'200'},paymentType:'prima'};
 ctx.rebuild=(p,prior)=>{const down=Math.min(p.amount,Math.max(0,300-prior));return {allocations:[...(down?[{label:'Prima inicial',amount:down}]:[]),...(p.amount>down?[{number:1,label:'Cuota',amount:p.amount-down}]:[])]}};
 const run=()=>vm.runInContext("pmHistoryEditPlan(state,'A',changes,'Admin','Corregir tipo',rebuild,rules,'2026-11-24')",ctx);
 let plan=run();assert.equal(plan.total,20000);assert.equal(plan.state.payments[0].concept,'Prima atrasada');
 assert.equal(plan.state.payments[0].receiptInfo.allocations.some(a=>a.number),false);
 assert.equal(ctx.state.payments[0].concept,'Abono');
 ctx.changes.amounts.A='400';assert.throws(run,/supera la prima/);
 ctx.changes.amounts.A='200';ctx.changes.paymentType='abono';assert.throws(run,/prima pendiente/);
 ctx.state.payments.push({id:'P',saleId:'S',amount:300,concept:'Prima',date:'2024-01-01'});
 plan=run();assert.equal(plan.state.payments[0].concept,'Abono mensual');assert.equal(plan.state.payments[0].receiptInfo.allocations[0].number,1);
});

test('amortización de 72 cuotas conserva vencidas, futuras, folios y saldo en PDF multipágina',async()=>{
 const ctx=model();
 ctx.Blob=Blob;
 vm.runInContext(readFileSync(new URL('../contract-collections-scope.mjs',import.meta.url),'utf8').replace(/export /g,''),ctx);
 vm.runInContext(readFileSync(new URL('../installment-status.mjs',import.meta.url),'utf8').replace(/export /g,''),ctx);
 ctx.state={company:{name:'GRUPO H'},residences:[{id:'R',name:'Prueba'}],clients:[{id:'C',name:'Cliente prueba'}],
 lots:[{id:'L',residenceId:'R',stage:1,block:'A',sourceNumber:'4'}],
 sales:[{id:'S',lotId:'L',clientId:'C',type:'credit',price:73000,downPayment:1000,date:'2024-01-01',firstDueDate:'2024-02-05',months:72}],
 contractTexts:[{id:'D',lotId:'L',clientId:'C',saleId:'S',status:'active',residenceId:'R'}],
 payments:[{id:'P',saleId:'S',date:'2024-02-10',amount:2000,receiptReference:'0001',receiptInfo:{allocations:[{label:'Prima inicial',amount:1000},{number:1,month:'2024-02',amount:1000}]}}]};
 const snapshot=JSON.stringify(ctx.state);
 const report=vm.runInContext("pmAmortizationModel(state,'C','R','2024-03-10',reconcileInstallments,()=>100000,(d,i)=>{const x=new Date(d+'T12:00:00Z');x.setUTCMonth(x.getUTCMonth()+i);return x.toISOString().slice(0,10)})",ctx);
 assert.equal(report.count,72);assert.equal(report.covered,1);assert.equal(report.latePaid,1);assert.equal(report.overdueCount,1);assert.equal(report.balance,7100000);
 assert.equal(report.details[0].rows.at(-1).number,72);
 ctx.report=report;
 const pdf=vm.runInContext('pmAmortizationPdf(report)',ctx);
 const raw=Buffer.from(await pdf.arrayBuffer()).toString('latin1');
 assert.match(raw,/^%PDF-1.4/);assert.match(raw,/\(72\)/);assert.match(raw,/\(Pagada atrasada\)/);assert.match(raw,/\(0001\)/);
 assert.ok((raw.match(/\/Type \/Page\b/g)||[]).length>1);
 assert.equal(JSON.stringify(ctx.state),snapshot);
});

test('permite corregir prima inicial de dos solares sin receiptInfo solo con respaldo contractual verificable',()=>{
 const ctx=model();
 ctx.state={sales:[1,2].map(i=>({id:'S'+i,lotId:'L'+i,clientId:'C',type:'credit',price:2500000,downPayment:1000000,date:'2024-03-01',source:'contract-manual',documentId:'D'+i,openingPaid:0})),
 lots:[1,2].map(i=>({id:'L'+i,residenceId:'R'})),
 contractTexts:[1,2].map(i=>({id:'D'+i,saleId:'S'+i,lotId:'L'+i,clientId:'C',status:'active',format:'manual',structured:{down:1000000,downPaymentReceived:true}})),
 payments:[1,2].map(i=>({id:'A'+i,saleId:'S'+i,groupId:'G2',amount:75000,concept:'Abono mensual',date:'2024-08-07',receiptReference:'3553',receiptInfo:{allocations:[{number:1,amount:75000}]}})).concat([1,2].map(i=>({id:'P'+i,saleId:'S'+i,groupId:'G1',amount:1000000,concept:'Prima',date:'2024-03-01',receiptReference:'3551'})))};
 ctx.changes={date:'2024-03-01',method:'TRANSFERENCIA',reference:'3551',paymentType:'keep',amounts:{P1:'800,000',P2:'800,000'}};
 ctx.rules={requireReceiptCorrelativo:x=>x,findReceiptCorrelativo:()=>null};
 ctx.rebuild=(p,prior)=>{const down=Math.min(p.amount,Math.max(0,1000000-prior));return {allocations:[...(down?[{label:'Prima inicial',amount:down}]:[]),...(p.amount>down?[{number:1,amount:p.amount-down}]:[])]}};
 const snapshot=JSON.stringify(ctx.state);
 const run=()=>vm.runInContext("pmHistoryEditPlan(state,'P1',changes,'Admin','Corregir prima',rebuild,rules,'2026-11-24')",ctx);
 const plan=run();
 assert.equal(plan.total,160000000);assert.equal(plan.state.payments.length,4);
 assert.equal(plan.state.payments[2].receiptInfo.allocations[0].amount,800000);
 assert.equal(plan.state.payments[0].receiptInfo.allocations[0].amount,75000);
 assert.equal(plan.state.payments[0].receiptInfo.allocations[0].number,undefined);
 assert.equal(plan.state.paymentEditHistory[0].corrected.length,2);
 assert.equal(JSON.stringify(ctx.state),snapshot);
 ctx.state.sales[0].source='import';assert.throws(run,/detalle verificable/);
 ctx.state.sales[0].source='contract-manual';delete ctx.state.payments[0].receiptInfo;assert.throws(run,/detalle verificable/);
});
