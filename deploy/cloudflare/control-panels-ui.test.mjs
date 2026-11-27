import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('./control-panels-ui.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM('<body><div id="app"></div><div id="modal-root"></div></body>',{runScripts:'outside-only',url:'https://example.test'});
 dom.window.eval(`var db={clients:[{id:'c1',name:'Ana <Lopez>',phone:'+50412345678'}]},pages={},page='messages',saved=0;function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}function ic(){return '<svg></svg>'}function getSale(id){return (db.sales||[]).find(s=>s.id===id)}function getLot(id){return (db.lots||[]).find(l=>l.id===id)}function getClient(id){return db.clients.find(c=>c.id===id)}function pageContent(){return ''}function render(){document.getElementById('app').innerHTML='<div class="lotigest-shell"><div class="workspace">'+pageContent()+'</div></div>'}function showModal(t,b,f){document.getElementById('modal-root').innerHTML=b+f}function closeModal(){document.getElementById('modal-root').innerHTML=''}function save(){saved++}`);
 dom.window.eval(source);dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));return dom;
}
test('message drafts use real clients, remain unsent, and escape preview',()=>{
 const dom=setup(),w=dom.window,d=w.document;
 assert.match(d.body.textContent,/Pendiente de conexión/);assert.equal(d.querySelectorAll('.cp-dock button').length,4);
 d.querySelector('[data-cp-template]').click();const form=d.getElementById('cp-compose');form.elements.clientId.value='c1';form.elements.contract.value='CT-1';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(w.db.messageDrafts.length,1);assert.equal(w.db.messageDrafts[0].status,'draft');assert.match(w.db.messageDrafts[0].body,/Ana <Lopez>/);assert.equal(w.saved,1);assert.equal(d.querySelector('.cp-preview lopez'),null);assert.match(d.querySelector('.cp-preview').textContent,/CT-1/);
 dom.window.close();
});
test('message filters and rules do not activate sending',()=>{
 const dom=setup(),d=dom.window.document;d.querySelector('[data-cp-tab="rules"]').click();assert.equal(d.querySelectorAll('.cp-rule').length,4);assert.equal(dom.window.saved,0);assert.equal(d.querySelector('aside button').disabled,true);dom.window.close();
});
test('phone payment root stays at the start of body outside the workspace layout',()=>{
 const dom=setup(),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:true});w.newPayment=()=>{d.getElementById('modal-root').innerHTML='<div class="modal-cover"><div class="lg-payment-modern pm-reference-payment"></div></div>';};
 w.page='payments';w.render();
 assert.equal(d.body.firstElementChild.id,'modal-root');assert.equal(d.getElementById('modal-root').closest('.workspace'),null);assert.ok(d.body.classList.contains('cp-inline-payment'));
 w.page='clients';w.render();assert.equal(d.querySelector('#modal-root .modal-cover'),null);assert.equal(d.querySelectorAll('#modal-root').length,1);dom.window.close();
});

test('el buscador de clientes de Abonos queda dentro del workspace y se cierra al salir',()=>{
 const dom=setup(),w=dom.window,d=w.document;
 w.matchMedia=()=>({matches:false});w.newPayment=()=>{d.getElementById('modal-root').innerHTML='<div class="modal-cover"><div class="lg-payment-modern"><input id="owner-payment-search"><div class="pm-picker-results">Cliente de prueba</div></div></div>';};
 w.page='payments';w.render();
 assert.ok(d.querySelector('.workspace>#modal-root #owner-payment-search'));
 assert.equal(d.querySelectorAll('#modal-root').length,1);
 assert.ok(d.body.classList.contains('cp-inline-payment'));
 w.page='contracts';w.render();assert.equal(d.querySelector('#modal-root .lg-payment-modern'),null);
 dom.window.close();
});
