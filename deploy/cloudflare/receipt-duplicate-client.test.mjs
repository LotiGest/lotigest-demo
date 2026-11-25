import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptCorrelativoMessage,findReceiptCorrelativo} from '../../owner-payments.mjs';
const state={"clients":[{"id":"C","name":"CLIENTE PRUEBA"}],"sales":[{"id":"S1","clientId":"C","lotId":"L1"},{"id":"S2","clientId":"C","lotId":"L2"}],"payments":[{"id":"P1","groupId":"G","saleId":"S1","receiptReference":"004422","date":"2026-04-23","amount":3000},{"id":"P2","groupId":"G","saleId":"S2","receiptReference":"4422","date":"2026-04-23","amount":3500}],"ownerPayments":[{"id":"O","clientId":"C","receiptReference":"4423","date":"2026-04-24","amountCents":650000,"allocations":[{"references":[{"lotId":"L1"}]}]}],"historicalPayments":[{"id":"H","clientName":"CLIENTE HISTORICO","sourceRaw":{"folio":"4424"},"amountCents":500000,"date":"2025-01-02","block":"B","lot":"3"}]};
test('identifica cliente, fecha, total y solares de un correlativo compartido',()=>{
 const before=JSON.stringify(state),message=receiptCorrelativoMessage(state,'4422');
 assert.match(message,/CLIENTE PRUEBA/);assert.match(message,/23\/04\/2026/);assert.match(message,/6,500\.00/);assert.match(message,/L1, L2/);
 assert.equal(findReceiptCorrelativo(state,'0004422').id,'P1');
 assert.equal(JSON.stringify(state),before);
});
test('identifica abono de propietario e histórico, sin inventar datos',()=>{
 assert.match(receiptCorrelativoMessage(state,'4423'),/CLIENTE PRUEBA/);
 assert.match(receiptCorrelativoMessage(state,'4424'),/CLIENTE HISTORICO/);
 assert.equal(receiptCorrelativoMessage(state,'4425'),'');
 assert.match(receiptCorrelativoMessage({...state,clients:[]},'4422'),/Sin identificar/);
});
