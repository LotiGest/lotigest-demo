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
