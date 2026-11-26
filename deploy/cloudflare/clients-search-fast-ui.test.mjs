import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./clients-search-fast-ui.js',import.meta.url),'utf8');
test('search retains input and alphabetical ordering, actions, and empty message',()=>{
 const dom=new JSDOM('<div class="panel-table-head"><span class="sm"></span></div><input data-filter="search"><select data-alphabetical-order="clients"><option value="az">AZ</option><option value="za">ZA</option></select><div class="table-scroll"><table><tbody><tr><td>Ana</td><td><button data-action="edit-client" data-id="3">Editar</button></td></tr><tr><td>Ángela</td><td><button data-action="edit-client" data-id="1">Editar</button></td></tr><tr><td>Zoé</td><td><button data-action="edit-client" data-id="2">Editar</button></td></tr></tbody></table></div>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.eval(`var page='clients',filter='',db={clients:[{id:'1',name:'Ángela',identity:'0801',phone:''},{id:'2',name:'Zoé',identity:'0802',phone:''},{id:'3',name:'Ana',identity:'0803',phone:''}],sales:[{clientId:'2',id:'sale'}]};function esc(x){return String(x)}function money(x){return String(x)}function sum(xs,fn){return xs.reduce((n,x)=>n+fn(x),0)}function balance(){return 12}function rowActions(_,id){return '<button data-action="view-client" data-id="'+id+'">Ver</button>'}function ic(){return 'Editar'}`);
 w.eval(source);const input=d.querySelector('[data-filter="search"]');input.focus();input.value='0';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.activeElement,input);assert.equal(d.querySelectorAll('tbody tr').length,3);assert.deepEqual([...d.querySelectorAll('tbody tr:not([hidden]) td:first-child')].map(x=>x.textContent),['Ana','Ángela','Zoé']);assert.equal(d.querySelector('tbody tr:last-child [data-action="edit-client"]').dataset.id,'2');
 input.value='ninguno';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('tbody tr:not([hidden])').length,0);assert.match(d.querySelector('.empty').textContent,/No hay clientes/);assert.equal(d.activeElement,input);
 dom.window.close();
});
test('large directory keeps all matching clients available after successive searches',()=>{
 const dom=new JSDOM('<input data-filter="search"><select data-alphabetical-order="clients"><option value="az">AZ</option></select><div class="panel-table-head"><span class="sm"></span></div><div class="table-scroll"><table><tbody></tbody></table></div>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.eval(`var page='clients',filter='',db={clients:Array.from({length:2100},(_,i)=>({id:'C'+i,name:'CLIENTE '+i,identity:'ID'+i,phone:''})),sales:[]};function esc(x){return String(x)}function money(x){return String(x)}function sum(xs,fn){return xs.reduce((n,x)=>n+fn(x),0)}function balance(){return 0}function rowActions(){return ''}function ic(){return ''}`);
 w.eval(source);const input=d.querySelector('[data-filter="search"]');input.focus();
 input.value='CLIENTE 2099';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('tbody tr').length,1);
 input.value='CLIENTE 0';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('tbody tr').length,1);assert.equal(d.querySelector('tbody tr').dataset.clientId,'C0');assert.equal(d.activeElement,input);dom.window.close();
});
