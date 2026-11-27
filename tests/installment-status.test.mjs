import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileInstallments,installmentSalesFromContracts} from '../installment-status.mjs';

const sale=(overrides={})=>({id:'V-1',date:'2025-01-01',firstDueDate:'2025-01-26',type:'credit',months:60,price:90000,downPayment:30000,openingPaid:0,...overrides});
const installment=()=>100000;
const addMonth=(start,offset)=>{
 const d=new Date(start+'T12:00:00Z');const day=d.getUTCDate();
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+offset);
 const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 d.setUTCDate(Math.min(day,max));return d.toISOString().slice(0,10);
};
const ledger=(sales,payments,asOf='2026-11-20')=>reconcileInstallments(sales,payments,asOf,installment,addMonth);
test('saldo de apertura y prima no inventan mensualidades de 2026',()=>{
 const s=sale({openingPaid:47000});
 const {rows}=ledger([s],[{id:'PRIMA',saleId:s.id,amount:30000,date:'2025-01-01',receiptInfo:{allocations:[{label:'Prima',amount:30000}]}}]);
 const year=rows.filter(r=>r.dueDate.startsWith('2026-'));
 assert.equal(year.length,12);
 assert.ok(year.every(r=>!['paid','paid-late'].includes(r.status)));
 assert.equal(year.reduce((n,r)=>n+r.confirmedCents,0),0);
});
test('tres cuotas vencidas saldadas en noviembre quedan verde oscuro con el recibo correcto',()=>{
 const s=sale({firstDueDate:'2025-08-26',months:5,price:35000,downPayment:30000});
 const p={id:'RC-123-1',groupId:'RC-123',saleId:s.id,date:'2025-11-26',amount:3000,
  receiptInfo:{allocations:[1,2,3].map(number=>({number,amount:1000}))}};
 const {rows}=ledger([s],[p]);
 assert.deepEqual(rows.slice(0,3).map(r=>r.status),['paid-late','paid-late','paid-late']);
 assert.ok(rows.slice(0,3).every(r=>r.receipts[0].groupId==='RC-123'));
 assert.equal(rows[3].status,'late');
});
test('cuota actual pagada hasta vencimiento se muestra verde claro',()=>{
 const s=sale({firstDueDate:'2026-11-26',months:2,price:32000,downPayment:30000});
 const p={id:'R-2',saleId:s.id,date:'2026-11-20',amount:1000,
  receiptInfo:{allocations:[{number:1,amount:1000}]}};
 assert.equal(ledger([s],[p]).rows[0].status,'paid');
});
test('adelanto para 2026 pagado en 2025 no aparece como mensualidad pagada',()=>{
 const s=sale({firstDueDate:'2026-01-26',months:2,price:32000,downPayment:30000});
 const p={id:'R-3',saleId:s.id,date:'2025-11-26',amount:2000,
  receiptInfo:{allocations:[{number:1,amount:1000},{number:2,amount:1000}]}};
 const {rows}=ledger([s],[p]);
 assert.deepEqual(rows.map(r=>r.status),['advance-covered','advance-covered']);
 assert.ok(rows.every(r=>r.confirmedCents===0&&r.advanceCents===100000));
});
test('no se asigna a otro solar y los recibos futuros no se pintan',()=>{
 const a=sale({id:'A'}),b=sale({id:'B'});
 const {rows,unmatched}=ledger([a,b],[{id:'R-FUT',saleId:'A',date:'2027-01-03',amount:1000,receiptInfo:{allocations:[{number:1,amount:1000}]}}]);
 assert.ok(rows.every(r=>r.confirmedCents===0));
 assert.equal(unmatched.length,1);
});

test('prima de L 30,000 registrada sin cuotas no cuenta entre las 60 mensualidades',()=>{
 const s=sale({openingPaid:47000});
 const payments=[{id:'PR-1',saleId:s.id,date:'2025-01-01',amount:30000,
  receiptInfo:{allocations:[{label:'Prima inicial',amount:30000}]}}];
 const result=ledger([s],payments);
 assert.equal(result.rows.filter(r=>r.status==='paid'||r.status==='paid-late').length,0);
 assert.equal(result.rows.reduce((total,r)=>total+r.confirmedCents,0),0);
});
test('prima antigua sin detalle no se distribuye sobre cuotas por saldo de apertura',()=>{
 const s=sale({openingPaid:47000});
 const p={id:'P-ANT',saleId:s.id,date:'2025-01-01',amount:30000,concept:'Prima inicial'};
 const result=ledger([s],[p]);
 assert.equal(result.rows.filter(r=>r.appliedCents>0).length,0);
});
test('recibo mal etiquetado como cuota no convierte un pago tipo prima',()=>{
 const s=sale(),p={id:'P-LEG',saleId:s.id,date:'2025-02-26',amount:30000,type:'PRIMA',
  receiptInfo:{allocations:[{label:'Prima inicial',number:1,amount:30000}]}};
 assert.equal(ledger([s],[p]).rows.filter(r=>r.status==='paid').length,0);
});
test('abono sin número ni mes se conserva para conciliación sin afirmar cuotas pagadas',()=>{
 const s=sale({openingPaid:47000}),p={id:'P-SIN',saleId:s.id,date:'2025-03-26',amount:1000,concept:'Abono a crédito'};
 const result=ledger([s],[p]);
 assert.equal(result.unmatched.length,1);
 assert.equal(result.rows.filter(r=>r.appliedCents>0).length,0);
});
test('abono con mes explícito confirma esa cuota pero no la prima',()=>{
 const s=sale(),payments=[{id:'PRIMA',saleId:s.id,date:'2025-01-01',amount:30000,type:'PRIMA',period:'2025-01'},
  {id:'CUOTA-3',saleId:s.id,date:'2025-03-26',amount:1000,period:'2025-03'}];
 const result=ledger([s],payments);
 assert.deepEqual(result.rows.filter(r=>r.status==='paid').map(r=>r.number),[3]);
});

test('dos cuotas futuras totalmente adelantadas no generan mora al vencer',()=>{
 const s=sale({firstDueDate:'2026-01-26',months:3,price:33000,downPayment:30000});
 const p={id:'A-1',saleId:s.id,date:'2025-11-20',amount:2000,receiptInfo:{allocations:[
  {number:1,month:'2026-01',amount:1000},{number:2,month:'2026-02',amount:1000}]}};
 const {rows}=ledger([s],[p],'2026-03-20');
 assert.deepEqual(rows.map(r=>r.status),['advance-covered','advance-covered','pending']);
 assert.equal(rows[0].remainingCents,0);
 assert.equal(rows[1].remainingCents,0);
 assert.ok(rows.slice(0,2).every(r=>r.receipts[0].paymentId==='A-1'));
 assert.equal(rows.filter(r=>r.status==='late').length,0);
});
test('adelanto parcial conserva mora solo por la diferencia cuando vence',()=>{
 const s=sale({firstDueDate:'2026-01-26',months:2,price:32000,downPayment:30000});
 const p={id:'A-2',saleId:s.id,date:'2025-11-20',amount:500,receiptInfo:{allocations:[{number:1,amount:500}]}};
 const {rows}=ledger([s],[p],'2026-02-20');
 assert.equal(rows[0].status,'late');
 assert.equal(rows[0].remainingCents,50000);
 assert.equal(rows[0].advanceCents,50000);
 assert.equal(rows[1].status,'pending');
});
test('adelanto completo no se cobra dos veces cuando vence y pasa el año',()=>{
 const s=sale({firstDueDate:'2026-01-26',months:2,price:32000,downPayment:30000});
 const p={id:'A-3',saleId:s.id,date:'2025-11-20',amount:2000,receiptInfo:{allocations:[{number:1,amount:1000},{number:2,amount:1000}]}};
 const {rows}=ledger([s],[p],'2026-11-20');
 assert.equal(rows.reduce((n,r)=>n+r.remainingCents,0),0);
 assert.equal(rows.filter(r=>r.status==='advance-covered').length,2);
 assert.equal(rows.filter(r=>r.status==='late').length,0);
});
test('cuota pagada tarde después de su vencimiento en el mismo mes se destaca como vencida pagada',()=>{
 const s=sale({firstDueDate:'2026-01-10',months:2,price:32000,downPayment:30000});
 const p={id:'AB-1',saleId:s.id,date:'2026-01-20',amount:1000,receiptInfo:{allocations:[{number:1,amount:1000}]}};
 const {rows}=ledger([s],[p],'2026-02-20');
 assert.equal(rows[0].status,'paid-late');
});

test('vista oficial exige correlativo, excluye prima, anulados y aplicaciones superiores al recibo',()=>{
 const s=sale({firstDueDate:'2026-01-26',months:6});
 const payments=[
  {id:'A',saleId:s.id,date:'2026-01-26',amount:1000,receiptReference:'0001',receiptInfo:{allocations:[{number:1,amount:1000}]}},
  {id:'B',saleId:s.id,date:'2026-02-26',amount:1000,receiptInfo:{allocations:[{number:2,amount:1000}]}},
  {id:'C',saleId:s.id,date:'2026-03-26',amount:100,receiptReference:'0003',receiptInfo:{allocations:[{number:3,amount:1000}]}},
  {id:'D',saleId:s.id,date:'2026-04-26',amount:1000,receiptReference:'0004',paymentApplication:'prima',receiptInfo:{allocations:[{number:4,amount:1000}]}},
  {id:'E',saleId:s.id,date:'2026-05-26',amount:1000,receiptReference:'0005',status:'cancelled',receiptInfo:{allocations:[{number:5,amount:1000}]}}
 ];
 const result=reconcileInstallments([s],payments,'2026-11-20',installment,addMonth,{requireReference:true});
 assert.equal(result.rows[0].remainingCents,0);assert.equal(result.rows[0].receipts[0].reference,'0001');
 assert.ok(result.rows.slice(1).every(x=>x.appliedCents===0));
 assert.equal(result.unmatched.length,3);
});

test('cada calendario usa la fecha pactada de su ficha, sin mes fijo de abril',()=>{
 const sales=[sale({id:'A',date:'2024-04-01',firstDueDate:'2024-04-26'}),sale({id:'B',date:'2025-04-01',firstDueDate:'2025-04-26'})];
 const docs=[{saleId:'A',status:'active',structured:{date:'2024-01-01',firstDueDate:'2024-02-26'}},{saleId:'B',status:'active',structured:{date:'2025-07-01',firstDueDate:'2025-08-26'}}];
 const terms=installmentSalesFromContracts(sales,docs);
 assert.equal(terms[0].firstDueDate,'2024-02-26');assert.equal(terms[1].firstDueDate,'2025-08-26');
 assert.equal(sales[0].firstDueDate,'2024-04-26');
});
test('abonos mal distribuidos como prima se recuperan con prima comprobada y folios reales',()=>{
 const s=sale({date:'2026-03-01',firstDueDate:'2026-04-26',months:12,price:42000,downPayment:30000});
 const p=[{id:'P',saleId:s.id,date:'2026-03-01',amount:30000,concept:'Prima inicial',receiptReference:'6251'},...Array.from({length:7},(_,i)=>({id:'A'+i,saleId:s.id,date:addMonth(s.firstDueDate,i),amount:1000,concept:'Abono a crédito',receiptReference:String(6252+i),receiptInfo:{allocations:[{label:'Prima inicial',amount:1000}]}}))];
 const {rows,unmatched}=reconcileInstallments([s],p,'2026-11-27',installment,addMonth,{requireReference:true,repairExplicitAbonos:true});
 assert.equal(rows.filter(r=>r.remainingCents===0).length,7);
 assert.equal(rows.filter(r=>r.status==='late').length,1);
 assert.equal(rows[0].receipts[0].reference,'6252');assert.equal(unmatched.length,0);
});
