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
 assert.match(raw,/^%PDF-1.4/);assert.match(raw,/\(72\)/);assert.match(raw,/\(Pagada\)/);assert.doesNotMatch(raw,/Pagada atrasada|Pagada adelantada/);assert.match(raw,/\(0001\)/);
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

test('consolidación mensual de tres solares distingue depósitos, mora y adelantos sin duplicar meses',async()=>{
 const ctx=model();ctx.Blob=Blob;
 vm.runInContext(readFileSync(new URL('../contract-collections-scope.mjs',import.meta.url),'utf8').replace(/export /g,''),ctx);
 vm.runInContext(readFileSync(new URL('../installment-status.mjs',import.meta.url),'utf8').replace(/export /g,''),ctx);
 ctx.state={company:{name:'GRUPO H'},residences:[{id:'R',name:'PRUEBA'}],clients:[{id:'C',name:'CLIENTE PRUEBA'}],
 lots:[1,2,3].map(i=>({id:'L'+i,residenceId:'R',stage:1,block:'A',sourceNumber:String(i)})),
 sales:[1,2,3].map(i=>({id:'S'+i,lotId:'L'+i,clientId:'C',type:'credit',price:60000,downPayment:0,date:'2024-01-01',firstDueDate:'2024-02-05',months:6})),
 contractTexts:[1,2,3].map(i=>({id:'D'+i,saleId:'S'+i,lotId:'L'+i,clientId:'C',residenceId:'R',status:'active'})),
 payments:[1,2,3].map(i=>({id:'P'+i,saleId:'S'+i,groupId:'G',date:'2024-03-10',amount:25000,receiptReference:'003555',receiptInfo:{allocations:[{number:1,amount:10000},{number:2,amount:10000},{number:3,amount:5000}]}}))};
 const snapshot=JSON.stringify(ctx.state);
 const report=vm.runInContext("pmAmortizationModel(state,'C','R','2024-04-30',reconcileInstallments,()=>1000000,(d,i)=>{const x=new Date(d+'T12:00:00Z');x.setUTCMonth(x.getUTCMonth()+i);return x.toISOString().slice(0,10)})",ctx);
 const g=report.consolidated;
 assert.equal(report.count,18);assert.equal(g.monthCount,6);assert.equal(g.monthsCovered,2);
 assert.equal(g.monthsOverdue,1);assert.equal(g.monthsNoDeposit,1);
 assert.equal(g.calendar[0].status,'Pagada atrasada');assert.equal(g.calendar[0].received,0);
 assert.equal(g.receipts.length,1);assert.equal(g.receipts[0].received,7500000);
 assert.equal(g.receipts[0].future,1500000);assert.equal(g.receipts[0].excess,4500000);
 assert.equal(g.calendar[2].pending,1500000);assert.equal(g.calendar[3].noDeposit,false);
 ctx.report=report;const pdf=vm.runInContext('pmAmortizationPdf(report)',ctx);
 const raw=Buffer.from(await pdf.arrayBuffer()).toString('latin1');
 assert.match(raw,/Amortización mensual consolidada/);assert.match(raw,/003555/);assert.match(raw,/Sin depósito/);
 assert.equal(JSON.stringify(ctx.state),snapshot);
});

test('amortización individual y consolidada separan las partes de un recibo compartido',()=>{
 const ctx=model();ctx.Blob=Blob;
 vm.runInContext(readFileSync(new URL('../contract-collections-scope.mjs',import.meta.url),'utf8').replace(/export /g,''),ctx);
 vm.runInContext(readFileSync(new URL('../installment-status.mjs',import.meta.url),'utf8').replace(/export /g,''),ctx);
 ctx.state={residences:[{id:'R',name:'Prueba'}],clients:[{id:'C',name:'Cliente prueba'},{id:'X',name:'Otro'}],
 lots:[1,2,3].map(i=>({id:'L'+i,residenceId:'R',stage:1,block:'A',sourceNumber:String(i)})),
 sales:[1,2,3].map(i=>({id:'S'+i,lotId:'L'+i,clientId:i===3?'X':'C',type:'credit',price:60000,downPayment:0,date:'2024-01-01',firstDueDate:'2024-02-05',months:6})),
 contractTexts:[1,2,3].map(i=>({id:'D'+i,saleId:'S'+i,lotId:'L'+i,clientId:i===3?'X':'C',residenceId:'R',status:'active'})),
 payments:[{id:'P1',saleId:'S1',groupId:'G',date:'2024-03-10',amount:15000,receiptReference:'0001',receiptInfo:{allocations:[{number:1,amount:10000},{number:2,amount:5000}]}},
 {id:'P2',saleId:'S2',groupId:'G',date:'2024-03-10',amount:25000,receiptReference:'0001',receiptInfo:{allocations:[{number:1,amount:10000},{number:2,amount:10000},{number:3,amount:5000}]}}]};
 const snapshot=JSON.stringify(ctx.state);
 const run=lot=>{ctx.lot=lot;return vm.runInContext("pmAmortizationModel(state,'C','R','2024-04-30',reconcileInstallments,()=>1000000,(d,i)=>{const x=new Date(d+'T12:00:00Z');x.setUTCMonth(x.getUTCMonth()+i);return x.toISOString().slice(0,10)},lot)",ctx);};
 const one=run('L1'),two=run('L2'),both=run(null);
 assert.equal(one.details.length,1);assert.equal(one.paid,1500000);assert.equal(two.paid,2500000);assert.equal(both.paid,4000000);
 assert.equal(one.consolidated.receipts[0].received,1500000);assert.equal(both.consolidated.receipts[0].received,4000000);
 assert.equal(both.consolidated.monthCount,6);assert.equal(one.balance+two.balance,both.balance);
 assert.equal(vm.runInContext("pmAmortizationChoices(state,'C','R').length",ctx),2);
 assert.throws(()=>run('L3'),/no pertenece/);assert.equal(JSON.stringify(ctx.state),snapshot);
});

test('reporte: cuota del mes primero, excedente a deuda anterior sin cambiar el recibo original',()=>{
 const ctx=model();ctx.Blob=Blob;
 vm.runInContext(readFileSync(new URL('../contract-collections-scope.mjs',import.meta.url),'utf8').replace(/export /g,''),ctx);
 vm.runInContext(readFileSync(new URL('../installment-status.mjs',import.meta.url),'utf8').replace(/export /g,''),ctx);
 ctx.state={company:{name:'GRUPO H'},residences:[{id:'R',name:'Prueba'}],clients:[{id:'C',name:'Cliente prueba'}],
 lots:[1,2].map(i=>({id:'L'+i,residenceId:'R',stage:1,block:'Comercial',sourceNumber:String(i)})),
 sales:[1,2].map(i=>({id:'S'+i,lotId:'L'+i,clientId:'C',type:'credit',price:500000,downPayment:0,date:'2024-02-01',firstDueDate:'2024-03-05',months:24})),
 contractTexts:[1,2].map(i=>({id:'D'+i,saleId:'S'+i,lotId:'L'+i,clientId:'C',residenceId:'R',status:'active'})),
 payments:[1,2].map(i=>({id:'P'+i,saleId:'S'+i,groupId:'G',date:'2024-06-20',amount:25000,receiptReference:'003556',receiptInfo:{allocations:[{number:1,amount:i===1?20833.33:20833.34},{number:2,amount:i===1?4166.67:4166.66}]}}))};
 const snapshot=JSON.stringify(ctx.state);
 const run=lot=>{ctx.lot=lot;return vm.runInContext("pmAmortizationModel(state,'C','R','2024-06-30',reconcileInstallments,s=>s.id==='S1'?2083333:2083334,(d,i)=>{const x=new Date(d+'T12:00:00Z');x.setUTCMonth(x.getUTCMonth()+i);return x.toISOString().slice(0,10)},lot)",ctx);};
 const report=run(null),g=report.consolidated;
 assert.equal(g.monthsCovered,1);assert.equal(g.monthsOverdue,3);assert.equal(g.overdueAmount,11666668);
 assert.equal(g.calendar[0].reportStatus,'Abono con excedente');assert.equal(g.calendar[0].pending,3333334);
 assert.equal(g.calendar[0].received,0);assert.equal(g.calendar[3].reportStatus,'Pagada');
 assert.equal(g.receipts[0].received,5000000);assert.equal(g.receipts[0].prior,833333);
 assert.equal(g.receipts[0].current,4166667);assert.equal(g.receipts[0].future,0);
 assert.equal(run('L1').consolidated.receipts[0].received,2500000);
 assert.equal(run('L1').consolidated.receipts[0].prior,416667);
 assert.match(report.details[0].history[0].application,/C1 2024-03/);
 assert.equal(JSON.stringify(ctx.state),snapshot);
});
test('la proyección usa solo mensualidades verificadas, nunca prima ni pago sin respaldo',()=>{
 const ctx=model();
 ctx.rows=[{saleId:'S',dueDate:'2024-03-05',dueCents:10000,receipts:[{paymentId:'P',amountCents:2000,date:'2024-04-08'}]},
 {saleId:'S',dueDate:'2024-04-05',dueCents:10000,receipts:[]}];
 ctx.payments=[{id:'P',saleId:'S',date:'2024-04-08',amount:500,concept:'Prima y abono'},
 {id:'X',saleId:'S',date:'2024-04-09',amount:1000,concept:'Abono ambiguo'}];
 const rows=vm.runInContext("pmReportCurrentMonthFirst(rows,payments,'2024-04-30')",ctx);
 assert.equal(rows[0].appliedCents,0);assert.equal(rows[1].appliedCents,2000);
 assert.equal(rows[1].remainingCents,8000);
});

test('estado de cuenta muestra únicamente meses exigibles, cuota parcial y total sin duplicar solares',async()=>{
 const ctx=model({Blob,atob});
 const rows=Array.from({length:7},(_,i)=>({dueDate:'2026-'+String(i+5).padStart(2,'0')+'-15',dueCents:662600,appliedCents:i===0?662600:0,remainingCents:i===0?0:662600}));
 const details=[1,2].map(i=>({sale:{type:'credit'},lot:{stage:1,block:'E',sourceNumber:String(i)},rows:structuredClone(rows),paid:662600,agreed:0}));
 ctx.report={unmatched:0,details,consolidated:{calendar:rows.map((r,i)=>({month:r.dueDate.slice(0,7),due:1325200,covered:!r.remainingCents,rows:details.map(d=>d.rows[i])}))},asOf:'2026-10-31',client:'CLIENTE PRUEBA',residence:'Residencial Altos del Arrayán',agreed:0,prima:0};
 const make=()=>vm.runInContext('pmStatementModel(report)',ctx);
 const statement=make();
 assert.equal(statement.total,6626000);assert.equal(statement.pending.length,5);assert.equal(statement.lastCovered,'Mayo de 2026');
 ctx.statement=statement;
 const pdf=vm.runInContext('pmStatementPdf(statement)',ctx);
 const raw=Buffer.from(await pdf.arrayBuffer()).toString('latin1');
 assert.match(raw,/^%PDF-1.4/);assert.match(raw,/66,260.00/);assert.match(raw,/\/Subtype \/Image/);assert.doesNotMatch(raw,/Noviembre de 2026/);
 details[0].paid+=100000;details[0].rows[1].appliedCents+=100000;details[0].rows[1].remainingCents-=100000;
 assert.equal(make().total,6526000);
 ctx.report.unmatched=1;assert.throws(make,/conciliar/);ctx.report.unmatched=0;
 details[0].paid+=1;assert.throws(make,/no coincide/);
});
