import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./clients-search-fast-ui.js',import.meta.url),'utf8');
test('directory search preserves input and returns all matches after narrowing',()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.eval(`var page='clients',filter='',db={clients:Array.from({length:5000},(_,i)=>({id:'C'+i,name:'Cliente '+i,identity:'ID'+i,phone:''})),sales:[{id:'S',clientId:'C1',price:100,openingPaid:5}],payments:[{saleId:'S',amount:10}]};function clientsPage(){}function esc(x){return String(x)}function money(x){return String(x)}function rowActions(a,id){return '<button data-action="'+a+'" data-id="'+id+'">Ver</button>'}function ic(){return ''}function header(){return ''}function button(){return ''}function toolbar(){return '<input data-filter="search"><select data-alphabetical-order="clients"><option value="az">AZ</option><option value="za">ZA</option></select>'}`);
 w.db.clients[4998]={id:'C4998',name:'JOSÉ ÁNGEL',identity:'0001-2345-67890',phone:'+504 9999-1234'};w.db.payments.push({saleId:'S',amount:20,deletedAt:'2026-11-27'},{saleId:'S',amount:30,status:'annulled'});
 w.eval(source);d.querySelector('main').innerHTML=w.clientsPage();const input=d.querySelector('input');input.focus();const search=q=>{input.value=q;input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.activeElement,input)};
 search('jose angel');assert.equal(d.querySelector('tbody tr').dataset.clientId,'C4998');
 search('0001234567890');assert.equal(d.querySelectorAll('tbody tr').length,1);assert.equal(d.querySelector('tbody tr').dataset.clientId,'C4998');
 search('50499991234');assert.equal(d.querySelectorAll('tbody tr').length,1);assert.equal(d.querySelector('tbody tr').dataset.clientId,'C4998');
 search('ID4999');assert.equal(d.querySelectorAll('tbody tr').length,1);assert.equal(d.querySelector('tbody tr').dataset.clientId,'C4999');
 search('ID1');assert.ok(d.querySelectorAll('tbody tr').length>1);const row=d.querySelector('[data-client-id="C1"]');assert.equal(row.cells[4].textContent,'85');assert.equal(row.querySelector('[data-action="edit-client"]').dataset.id,'C1');
 search('none');assert.equal(d.querySelectorAll('tbody tr').length,0);assert.equal(d.querySelector('.empty').hidden,false);
 search('');assert.equal(d.querySelectorAll('tbody tr').length,5000);assert.equal(d.querySelector('[data-client-id="C1"]'),row);
 d.querySelector('select').value='za';search('Cliente 49');assert.equal(d.querySelector('tbody tr').dataset.clientId,'C4999');dom.window.close();
});
