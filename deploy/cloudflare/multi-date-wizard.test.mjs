import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('./multi-date-abonos-ui.js',import.meta.url),'utf8');
function boot(){
 const dom=new JSDOM('<div id="modal-root"></div><div class="workspace-inner"></div>',{runScripts:'outside-only',url:'https://example.test'}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.eval(`var db={sales:[{id:'s1',clientId:'c1',lotId:'l1',type:'credit',price:10000,downPayment:0}],lots:[{id:'l1',residenceId:'r1'}],clients:[{id:'c1',name:'Ana'}],payments:[]},cloudReady=true,cloudUser={role:'admin'},cloudBlocked=false,cloudBusy=false,cloudOffline=false,cloudQueue={pending:false,latest:1,confirmed:1},writes=0,page='collections',errors=[],seq=0;
 function businessToday(){return '2026-11-25'}function money(n){return 'L '+Number(n).toFixed(2)}function esc(x){return String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}function toast(x){errors.push(x)}function paymentReceiptPreview(){}function ownerPaymentPreview(){}function getSale(id){return db.sales.find(s=>s.id===id)}function getLot(id){return db.lots.find(s=>s.id===id)}function getClient(id){return db.clients.find(s=>s.id===id)}function balance(s){return s.price-db.payments.reduce((n,p)=>n+p.amount,0)}function uid(){return 'G'+(++seq)}function planMonthlyClientPayment(state,ids,cents){return {minimumCents:100000,excessCents:cents-100000,allocations:[{saleId:'s1',cents,amount:cents/100}]}}function buildReceiptInfo(){return {}}function cloudWrite(){writes++}async function cloudFlush(){}async function cloudApi(){return {revision:0,state:db}}function closeModal(){document.getElementById('modal-root').innerHTML=''}function render(){}function newPayment(){}function showModal(title,body,footer){document.getElementById('modal-root').innerHTML='<div class="modal-cover"><section class="modal"><div class="modal-header"><h2>'+title+'</h2></div><div class="modal-content">'+body+'</div><div class="modal-footer">'+footer+'</div></section></div>'}`);
 w.lotigestOwnerPayments={requireReceiptCorrelativo:x=>{if(!/^\d+$/.test(x))throw Error('Correlativo inválido');return String(BigInt(x));},normalizeReceiptCorrelativo:x=>/^\d+$/.test(x)?String(BigInt(x)):'',findReceiptCorrelativo:()=>null};
 w.eval(source.replace(/\}\)\(\);\s*$/,`window.wizardTest={start(state){mdState=state;mdShow();},save:mdSave,review:mdReview};})();`));
 const rows=[{id:'a',date:'2026-10-25',dateText:'25 Octubre 2026',amount:'2500',receiptRef:'4421',expanded:true},{id:'b',date:'2026-11-25',dateText:'25 Noviembre 2026',amount:'2500',receiptRef:'4422',expanded:false}];
 w.wizardTest.start({kind:'sale',saleId:'s1',saleIds:['s1'],clientId:'c1',residenceId:'r1',clientName:'Ana',lotLabel:'Etapa 1 • A-12',docs:[],snapshot:JSON.stringify(w.db),rows});return dom;
}
test('wizard shows one receipt, review writes nothing, confirmed save returns to Abonos with total and separate receipts',async()=>{
 const dom=boot(),w=dom.window,d=w.document;
 assert.equal([...d.querySelectorAll('[data-md-row]')].filter(x=>!x.hidden).length,1);
 d.querySelector('[data-md-next]').click();assert.equal(d.querySelector('[data-md-row="b"]').hidden,false);
 d.querySelector('[data-md-next]').click();assert.equal(d.querySelector('#md-review').hidden,false);assert.equal(d.querySelectorAll('#md-review tbody tr').length,2);assert.equal(w.writes,0);
 await w.wizardTest.save();assert.equal(w.writes,0);assert.match(w.errors.at(-1),/Confirma/);
 d.getElementById('md-review-confirm').checked=true;await w.wizardTest.save();
 assert.equal(w.writes,1);assert.equal(w.db.payments.length,2);assert.deepEqual(new Set(w.db.payments.map(p=>p.receiptReference)),new Set(['4421','4422']));assert.equal(w.page,'payments');assert.match(d.querySelector('.md-result-banner').textContent,/5000\.00/);dom.window.close();
});
test('editing after review invalidates approval and changed values require a fresh review',async()=>{
 const dom=boot(),w=dom.window,d=w.document;w.wizardTest.review();d.getElementById('md-review-confirm').checked=true;
 d.querySelector('[data-md-goto="a"]').click();assert.equal(d.querySelector('#md-review').hidden,true);
 const amount=d.querySelector('[data-md-id="a"][data-md-field="amount"]');amount.value='3000';amount.dispatchEvent(new w.Event('input',{bubbles:true}));
 await w.wizardTest.save();assert.equal(w.writes,0);assert.equal(d.querySelector('#md-review').hidden,false);assert.equal(d.getElementById('md-review-confirm').checked,false);assert.match(d.querySelector('.md-review-total').textContent,/5500\.00/);dom.window.close();
});
test('duplicates block review without registering payments',()=>{
 const dom=boot(),w=dom.window,d=w.document;const ref=d.querySelector('[data-md-id="b"][data-md-field="receiptRef"]');ref.value='00004421';ref.dispatchEvent(new w.Event('input',{bubbles:true}));w.wizardTest.review();assert.equal(w.writes,0);assert.equal(d.querySelector('#md-review').hidden,true);assert.match(w.errors.at(-1),/repetido/);dom.window.close();
});
test('unconfirmed cloud save keeps receipts pending and does not show successful return',async()=>{
 const dom=boot(),w=dom.window,d=w.document;w.cloudFlush=async()=>{w.cloudQueue.pending=true;};w.wizardTest.review();d.getElementById('md-review-confirm').checked=true;await w.wizardTest.save();assert.equal(w.writes,1);assert.equal(d.querySelector('.md-result-banner'),null);assert.match(d.querySelector('.md-success').textContent,/pendientes de sincronización/);assert.equal(d.querySelector('[data-md-share-all]'),null);dom.window.close();
});

test('reference skin puts the stepper before client and keeps last payment compact',()=>{
 const dom=boot(),d=dom.window.document,modal=d.querySelector('.md-reference-wizard');assert.ok(modal);assert.equal(modal.classList.contains('lg-payment-modern'),false);assert.equal(modal.querySelector('.modal-content').firstElementChild.className,'md-wizard-steps');assert.equal(modal.querySelectorAll('.md-wizard-steps [data-md-step-label]').length,3);assert.ok(modal.querySelector('.md-client-reference'));assert.ok(modal.querySelector('.md-last-inline'));assert.equal(modal.querySelector('.modal-footer [data-action="close-modal"]'),null);assert.match(modal.querySelector('.md-row-toggle strong').textContent,/Abono 1 de 2/);dom.window.close();
});

test('queue confirmation without the actual receipts stays pending',async()=>{
 const dom=boot(),w=dom.window,d=w.document;w.cloudApi=async()=>({revision:0,state:{...w.db,payments:[]}});w.wizardTest.review();d.getElementById('md-review-confirm').checked=true;await w.wizardTest.save();
 assert.equal(w.writes,1);assert.equal(d.querySelector('.md-result-banner'),null);assert.match(d.querySelector('.md-success').textContent,/pendientes de sincronización/);dom.window.close();
});
