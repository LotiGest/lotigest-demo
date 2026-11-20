import {test} from 'node:test';import assert from 'node:assert/strict';import {createOwnerPayment,validateOwnerPayments,ownerStatementBalance,ownerPrimaRecordedLots} from '../owner-payments.mjs';
const base=()=>({version:3,company:{},residences:[{id:'R',name:'RESIDENCIAL'}],clients:[{id:'C',name:'PERSONA CON DOS SOLARES'},{id:'OTHER',name:'OTRA PERSONA'}],lots:[{id:'L1',block:'A',sourceNumber:'1',residenceId:'R',ownerClientId:'C'},{id:'L2',block:'A',sourceNumber:'2',residenceId:'R',ownerClientId:'C'}],sales:[],payments:[],historicalContracts:[],ownershipStatements:[{id:'DOC',clientId:'C',residenceId:'R',sourceName:'EXCEL.xlsx',references:[{block:'A',lot:1,lotId:'L1'},{block:'A',lot:2,lotId:'L2'}],documentedBalances:[{row:9,amountCents:100000}]}]});
const draft=()=>({id:'OP-12345678-1234-4234-8234-123456789012',clientId:'C',residenceId:'R',date:'2026-01-15',method:'Efectivo',concept:'Abono',reviewed:true,allocations:[{statementId:'DOC',referenceIndex:0,amount:100},{statementId:'DOC',referenceIndex:1,amount:200}]});
test('registra un abono distribuido entre solares de la misma persona y no toca el historial ni duplica ingresos',()=>{const original=base(),d=draft(),r=createOwnerPayment(original,d);assert.equal(r.receipt.amountCents,30000);assert.equal(r.receipt.allocations.length,2);assert.equal(r.state.payments.length,0);assert.equal(r.state.ownerPayments.length,1);assert.equal(original.ownerPayments,undefined);validateOwnerPayments(r.state);assert.equal(ownerStatementBalance(r.state,r.state.ownershipStatements[0]),70000);const repeat=createOwnerPayment(r.state,d);assert.deepEqual(repeat,r);assert.throws(()=>createOwnerPayment(r.state,{...d,concept:'Cambió'}));});
test('permite abono conjunto pero rechaza mezcla, otro dueño, fechas futuras y sobrepagos',()=>{let d=draft();d.allocations=[{statementId:'DOC',referenceIndex:null,amount:250}];const r=createOwnerPayment(base(),d);assert.equal(r.receipt.allocations[0].references.length,2);assert.throws(()=>createOwnerPayment(base(),{...d,clientId:'OTHER'}));assert.throws(()=>createOwnerPayment(base(),{...d,date:'2999-01-01'}));assert.throws(()=>createOwnerPayment(base(),{...d,reviewed:false}));assert.throws(()=>createOwnerPayment(base(),{...d,allocations:[...d.allocations,{statementId:'DOC',referenceIndex:0,amount:5}]}));assert.throws(()=>createOwnerPayment(base(),{...d,allocations:[{statementId:'DOC',amount:1001}]}));const bad=structuredClone(r.state);bad.ownerPayments[0].amountCents++;assert.throws(()=>validateOwnerPayments(bad));});
test('no aplica el mismo solar desde dos fichas ni permite otra persona en el inventario',()=>{const b=base();b.ownershipStatements.push({...b.ownershipStatements[0],id:'COPY'});const d=draft();d.allocations=[{statementId:'DOC',referenceIndex:0,amount:10},{statementId:'COPY',referenceIndex:0,amount:20}];assert.throws(()=>createOwnerPayment(b,d));b.lots[0].ownerClientId='OTHER';assert.throws(()=>createOwnerPayment(b,draft()));});

test('solo permite una prima por solar, conserva abonos y admite prima de otro solar',()=>{
 const first={...draft(),concept:'Prima histórica',allocations:[{statementId:'DOC',referenceIndex:0,amount:100}]};
 const one=createOwnerPayment(base(),first).state;
 assert.deepEqual(ownerPrimaRecordedLots(one,'C','R',['L1','L2']),['L1']);
 const another={...draft(),id:'OP-22345678-1234-4234-8234-123456789012',date:'2026-02-15',concept:'Prima histórica'};
 assert.throws(()=>createOwnerPayment(one,{...another,allocations:first.allocations}),/prima ya fue registrada/i);
 const abono=createOwnerPayment(one,{...another,concept:'Abono de febrero',allocations:first.allocations}).state;
 assert.equal(abono.ownerPayments.length,2);
 const next=createOwnerPayment(one,{...another,allocations:[{statementId:'DOC',referenceIndex:1,amount:150}]}).state;
 assert.deepEqual(ownerPrimaRecordedLots(next,'C','R',['L1','L2']),['L1','L2']);
 validateOwnerPayments(next);
});
test('una prima conjunta no se puede repetir en ninguno de los solares',()=>{
 const first={...draft(),concept:'Prima',allocations:[{statementId:'DOC',referenceIndex:null,amount:200}]};
 const one=createOwnerPayment(base(),first).state;
 assert.deepEqual(ownerPrimaRecordedLots(one,'C','R',['L1','L2']),['L1','L2']);
 const duplicate={...first,id:'OP-32345678-1234-4234-8234-123456789012',date:'2026-03-15',allocations:[{statementId:'DOC',referenceIndex:1,amount:100}]};
 assert.throws(()=>createOwnerPayment(one,duplicate),/prima ya fue registrada/i);
});
test('una prima importada o ya cubierta en la venta impide registrar otra prima',()=>{
 const b=base();
 b.historicalPayments=[{id:'H1',clientId:'C',residenceId:'R',type:'PRIMA',references:[{lotId:'L1'}],amountCents:10000}];
 assert.deepEqual(ownerPrimaRecordedLots(b,'C','R',['L1','L2']),['L1']);
 assert.throws(()=>createOwnerPayment(b,{...draft(),concept:'Prima',allocations:[{statementId:'DOC',referenceIndex:0,amount:100}]}),/prima ya fue registrada/i);
 b.historicalPayments=[];
 b.sales=[{id:'S1',clientId:'C',lotId:'L1',type:'credit',downPayment:100,openingPaid:100}];
 assert.deepEqual(ownerPrimaRecordedLots(b,'C','R',['L1']),['L1']);
});
