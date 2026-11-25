import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('./payment-modal-ui.js',import.meta.url),'utf8');
const api=new Function(s.slice(s.indexOf('function pmCalendarDeposits('),s.indexOf('function pmCalendar(root'))+';return {pmCalendarDeposits,pmCalendarYears};')();
 test('calendario incluye prima de 2024 aunque las cuotas empiecen en 2025',()=>{
 const sales=[{"id":"S","date":"2024-05-14"}],rows=[{"dueDate":"2025-01-27"},{"dueDate":"2029-12-27"}],payments=[{"id":"P","saleId":"S","date":"2024-05-14","amount":30000,"receiptReference":"4401","concept":"Prima"},{"id":"Q","saleId":"S","date":"2025-01-27","amount":52213,"receiptReference":"4402"},{"id":"X","saleId":"X","date":"2023-01-01","amount":200},{"id":"V","saleId":"S","date":"2023-01-01","amount":200,"voidedAt":"2024-01-01"}];
 const snapshot=JSON.stringify({sales,rows,payments}),d=api.pmCalendarDeposits(sales,payments,'2026-11-25');
 assert.equal(d.length,2);assert.equal(d[0].reference,'4401');assert.equal(d[0].primaCents,3000000);assert.equal(d[1].primaCents,0);
 assert.deepEqual(api.pmCalendarYears(sales,rows,d),[2024,2025,2026,2027,2028,2029]);assert.equal(JSON.stringify({sales,rows,payments}),snapshot);
 });
 test('recibo conjunto se cuenta una vez y prima mixta se separa',()=>{
 const d=api.pmCalendarDeposits([{id:'A'},{id:'B'}],[{id:'1',saleId:'A',groupId:'G',date:'2024-05-14',amount:1000,receiptReference:'123',receiptInfo:{allocations:[{label:'Prima inicial',amount:500},{number:1,amount:500}]}},{id:'2',saleId:'B',groupId:'G',date:'2024-05-14',amount:2000,receiptReference:'123'}],'2026-11-25');
 assert.equal(d.length,1);assert.equal(d[0].amountCents,300000);assert.equal(d[0].primaCents,50000);
 });
