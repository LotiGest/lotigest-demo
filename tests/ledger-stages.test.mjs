import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareLedgerImport,applyLedgerImport,regularizeHistoricalContract} from '../ledger-import.mjs';
const headers=['CLIENTE','ETAPA','BLOQUE','SOLARES','FECHA DE PAGO','MONTO (L)','TIPO DE PAGO','ESTADO','ID CONTRATO'];
const state=()=>({version:3,company:{},residences:[{id:'R',name:'RESIDENCIAL'}],clients:[],lots:[{id:'A1',residenceId:'R',stage:1,block:'A',sourceNumber:'3',status:'available'},{id:'A2',residenceId:'R',stage:2,block:'A',sourceNumber:'3',status:'available'},{id:'B2',residenceId:'R',stage:2,block:'B',sourceNumber:'5',status:'available'},{id:'A5',residenceId:'R',stage:1,block:'A',sourceNumber:'5',status:'available'},{id:'A7',residenceId:'R',stage:1,block:'A',sourceNumber:'7',status:'available'}],sales:[],payments:[]});
const sheets=rows=>[{sheet:'PAGOS',rows:[headers,...rows]}];
const row=(stage,block,solar,amount=100)=>['MISMO CLIENTE',stage,block,solar,'2026-01-01',amount,'ABONO','ASIGNADO','CONTRATO'];
test('mismo cliente en varias etapas y bloques, con lista explícita de solares y monto conjunto una sola vez',async()=>{
 const s=state(),book=sheets([row(1,'A','3',1000),row(2,'B','5',500),row(1,'A','5, 7',200)]),plan=await prepareLedgerImport(book,s,'R');
 assert.equal(plan.newClients.length,1);assert.equal(plan.contracts.length,3);assert.equal(plan.rows.length,3);assert.equal(plan.totalCents,170000);assert.equal(plan.reviewCount,0);
 assert.equal(plan.rows[0].lotId,'A1');assert.equal(plan.rows[1].lotId,'B2');assert.deepEqual(plan.rows[2].references.map(r=>r.lotId),['A5','A7']);assert.equal(plan.rows[2].amountCents,20000);
 const next=applyLedgerImport(s,plan);assert.equal(next.clients.length,1);assert.equal(next.historicalPayments.length,3);assert.equal(next.lots.find(l=>l.id==='A2').historyRequiresReview,undefined);assert.equal(next.lots.find(l=>l.id==='A5').historyRequiresReview,true);assert.equal(next.lots.find(l=>l.id==='A7').historyRequiresReview,true);
 const repeat=await prepareLedgerImport(book,next,'R');assert.equal(repeat.rows.length,0);assert.equal(repeat.skipped,3);
 assert.throws(()=>regularizeHistoricalContract(next,plan.contracts[2].id,{reviewed:true}),/varios solares/);
});
test('etapa forma parte de la identidad del contrato y no asigna el bloque repetido a otra etapa',async()=>{
 const s=state(),plan=await prepareLedgerImport(sheets([row(1,'A','3'),row(2,'A','3')]),s,'R');assert.equal(plan.contracts.length,2);assert.notEqual(plan.rows[0].id,plan.rows[1].id);assert.deepEqual(plan.rows.map(p=>p.lotId),['A1','A2']);
 const noStage=await prepareLedgerImport(sheets([row('','A','3')]),s,'R');assert.equal(noStage.rows[0].lotId,null);assert.ok(noStage.rows[0].issues.includes('ambiguous_lot'));
 const bad=await prepareLedgerImport(sheets([row('X','A','3'),row(1,'A','3-7')]),s,'R');assert.ok(bad.rows[0].issues.includes('invalid_stage'));assert.equal(bad.rows[0].lotId,null);assert.ok(bad.rows[1].issues.includes('invalid_solar_list'));
});
