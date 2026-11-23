import {test} from 'node:test';import assert from 'node:assert/strict';import {createOwnerPayment,validateOwnerPayments,ownerStatementBalance,normalizeReceiptCorrelativo,requireReceiptCorrelativo,findReceiptCorrelativo,validateNewReceiptCorrelativos} from '../owner-payments.mjs';
const base=()=>({version:3,company:{},residences:[{id:'R',name:'RESIDENCIAL'}],clients:[{id:'C',name:'PERSONA CON DOS SOLARES'},{id:'OTHER',name:'OTRA PERSONA'}],lots:[{id:'L1',block:'A',sourceNumber:'1',residenceId:'R',ownerClientId:'C'},{id:'L2',block:'A',sourceNumber:'2',residenceId:'R',ownerClientId:'C'}],sales:[],payments:[],historicalContracts:[],ownershipStatements:[{id:'DOC',clientId:'C',residenceId:'R',sourceName:'EXCEL.xlsx',references:[{block:'A',lot:1,lotId:'L1'},{block:'A',lot:2,lotId:'L2'}],documentedBalances:[{row:9,amountCents:100000}]}]});
const draft=()=>({id:'OP-12345678-1234-4234-8234-123456789012',clientId:'C',residenceId:'R',date:'2026-01-15',method:'Efectivo',concept:'Abono',receiptRef:'00006159',reviewed:true,allocations:[{statementId:'DOC',referenceIndex:0,amount:100},{statementId:'DOC',referenceIndex:1,amount:200}]});
test('registra un abono distribuido entre solares de la misma persona y no toca el historial ni duplica ingresos',()=>{const original=base(),d=draft(),r=createOwnerPayment(original,d);assert.equal(r.receipt.amountCents,30000);assert.equal(r.receipt.allocations.length,2);assert.equal(r.state.payments.length,0);assert.equal(r.state.ownerPayments.length,1);assert.equal(original.ownerPayments,undefined);validateOwnerPayments(r.state);assert.equal(ownerStatementBalance(r.state,r.state.ownershipStatements[0]),70000);const repeat=createOwnerPayment(r.state,d);assert.deepEqual(repeat,r);assert.throws(()=>createOwnerPayment(r.state,{...d,concept:'Cambió'}));});
test('permite abono conjunto pero rechaza mezcla, otro dueño, fechas futuras y sobrepagos',()=>{let d=draft();d.allocations=[{statementId:'DOC',referenceIndex:null,amount:250}];const r=createOwnerPayment(base(),d);assert.equal(r.receipt.allocations[0].references.length,2);assert.throws(()=>createOwnerPayment(base(),{...d,clientId:'OTHER'}));assert.throws(()=>createOwnerPayment(base(),{...d,date:'2999-01-01'}));assert.throws(()=>createOwnerPayment(base(),{...d,reviewed:false}));assert.throws(()=>createOwnerPayment(base(),{...d,allocations:[...d.allocations,{statementId:'DOC',referenceIndex:0,amount:5}]}));assert.throws(()=>createOwnerPayment(base(),{...d,allocations:[{statementId:'DOC',amount:1001}]}));const bad=structuredClone(r.state);bad.ownerPayments[0].amountCents++;assert.throws(()=>validateOwnerPayments(bad));});
test('no aplica el mismo solar desde dos fichas ni permite otra persona en el inventario',()=>{const b=base();b.ownershipStatements.push({...b.ownershipStatements[0],id:'COPY'});const d=draft();d.allocations=[{statementId:'DOC',referenceIndex:0,amount:10},{statementId:'COPY',referenceIndex:0,amount:20}];assert.throws(()=>createOwnerPayment(b,d));b.lots[0].ownerClientId='OTHER';assert.throws(()=>createOwnerPayment(b,draft()));});

test('los ceros iniciales no cambian el correlativo y se conserva la escritura física',()=>{
 assert.equal(normalizeReceiptCorrelativo('00006159'),'6159');
 assert.equal(normalizeReceiptCorrelativo('6159'),'6159');
 assert.equal(normalizeReceiptCorrelativo('0000001'),'1');
 assert.equal(normalizeReceiptCorrelativo('000000'),'0');
 assert.equal(normalizeReceiptCorrelativo('6A159'),null);
 assert.throws(()=>requireReceiptCorrelativo(''),/correlativo/);
 assert.throws(()=>requireReceiptCorrelativo('6159A'),/solamente números/);
 const r=createOwnerPayment(base(),draft());
 assert.equal(r.receipt.receiptReference,'00006159');
 assert.equal(r.receipt.receiptReferenceNormalized,'6159');
 assert.deepEqual(findReceiptCorrelativo(r.state,'6159').normalized,'6159');
 const other={...draft(),id:'OP-12345678-1234-4234-8234-123456789013',receiptRef:'6159'};
 assert.throws(()=>createOwnerPayment(r.state,other),/correlativo 6159/);
 const saleState=base();saleState.payments.push({id:'LEGACY',receiptReference:'6159'});
 assert.throws(()=>createOwnerPayment(saleState,draft()),/correlativo 6159/);
});
test('la comparación de los pagos nuevos rechaza duplicados de otras sesiones sin afectar legados',()=>{
 const old=base(),next=structuredClone(old);
 next.payments.push({id:'RC-1-1',saleId:'S',groupId:'RC-1',receiptReference:'00006159',receiptReferenceNormalized:'6159'});
 assert.doesNotThrow(()=>validateNewReceiptCorrelativos(old,next));
 next.payments.push({id:'RC-1-2',saleId:'S2',groupId:'RC-1',receiptReference:'6159',receiptReferenceNormalized:'6159'});
 assert.doesNotThrow(()=>validateNewReceiptCorrelativos(old,next));
 next.payments.push({id:'RC-2-1',saleId:'S',groupId:'RC-2',receiptReference:'0006159',receiptReferenceNormalized:'6159'});
 assert.throws(()=>validateNewReceiptCorrelativos(old,next),/correlativo 6159/);
 next.payments.pop();
 next.payments[0].receiptReferenceNormalized='123';
 assert.throws(()=>validateNewReceiptCorrelativos(old,next),/normalizado/);
 const oldFromAnotherResidence=base();oldFromAnotherResidence.ownerPayments=[{id:'OP-OLD',receiptReference:'6159',residenceId:'OTRA'}];
 assert.throws(()=>validateNewReceiptCorrelativos(oldFromAnotherResidence,next),/correlativo/);
});
