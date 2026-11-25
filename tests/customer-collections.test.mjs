import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../deploy/cloudflare/contract-collections-only-ui.js',import.meta.url),'utf8');
const history=readFileSync(new URL('../deploy/cloudflare/payment-history-ui.js',import.meta.url),'utf8');
test('ficha consolida dos solares sin duplicar meses de mora',()=>{
 const code=ui.slice(ui.indexOf('function customerCollectionTotals('),ui.indexOf(' function customerRows('));
 const totals=new Function('paidAmount','installment','balance',code+';return customerCollectionTotals')(id=>id==='A'?30000:50000,s=>s.quota,s=>s.price-(s.id==='A'?30000:50000));
 const t=totals([{sale:{id:'A',price:150000,downPayment:20000,quota:10000},monthAmount:10000,lateAmount:20000,overdue:[{dueDate:'2026-09-25'}]},{sale:{id:'B',price:200000,downPayment:30000,quota:20000},monthAmount:20000,lateAmount:40000,overdue:[{dueDate:'2026-09-25'}]}]);
 assert.deepEqual([t.paid,t.abonos,t.monthly,t.balance,t.overdue,t.months],[80000,30000,30000,270000,60000,1]);
 assert.match(ui,/pmOpenStatement\(b,\{clientId:id,rid\}\)/);
 assert.match(history,/function pmOpenStatement\(trigger,context=null\)/);
});
