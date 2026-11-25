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

test('Abonos varios visible arriba en ficha normal con crédito pendiente',()=>{
 const code=src.slice(src.indexOf(' function ccDetail('),src.indexOf(' function ccGroups('));
 const render=new Function('esc','ccAttr','ccStatus','ic','cloudUser','balance','money','installment',code+';return ccDetail;')(String,()=> ' data-cc-client="C1" data-cc-rid="R1"',()=>[],()=>'',{role:'admin'},s=>s.remaining,String,()=>100);
 const group={client:{name:'CLIENTE PRUEBA'},residenceName:'R',lots:[{id:'L1',stage:1,block:'A'}],sales:[{id:'S1',lotId:'L1',type:'credit',remaining:200}],model:{error:'prueba'}};
 const html=render(group);
 assert.match(html,/data-cc-many[^>]*>\+ Abonos varios/);
 assert.ok(html.indexOf('data-cc-many')<html.indexOf('cc-table-wrap'));
 assert.equal((html.match(/data-cc-many/g)||[]).length,1);
 assert.doesNotMatch(render({...group,sales:[]}),/data-cc-many/);
 assert.doesNotMatch(render({...group,sales:[{...group.sales[0],remaining:0}]}),/data-cc-many/);
 assert.match(src,/openMulti\(true\)/);
 assert.match(src,/openSale\(s.id\)/);
});
