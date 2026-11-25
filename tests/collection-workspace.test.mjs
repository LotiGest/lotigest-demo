import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../deploy/cloudflare/contract-collections-only-ui.js',import.meta.url),'utf8');
test('resumen usa el mismo modelo de amortización y no la mora antigua',()=>{
 const code=src.slice(src.indexOf('function ccMetrics('),src.indexOf(' function ccAttr('));
 const metrics=new Function(code+';return ccMetrics')();
 const m={consolidated:{calendar:[{month:'2026-11',pending:4166667}],monthsOverdue:4},overdueAmount:16666668,price:279000000,paid:93000000,balance:186000000};
 const t=metrics(m,'2026-11');assert.deepEqual([t.month,t.overdue,t.balance,t.months],[4166667,16666668,186000000,4]);
 assert.match(src,/pmAmortizationModel\(state,id,rid/);assert.match(src,/cc-workspace/);assert.match(src,/data-cc-whatsapp/);assert.match(src,/cc-mobile-detail/);
});
