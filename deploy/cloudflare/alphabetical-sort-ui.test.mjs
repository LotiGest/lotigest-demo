import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source=readFileSync(new URL('./alphabetical-sort-ui.js',import.meta.url),'utf8');
const tag=(name,content)=>'<'+name+'>'+content+'</'+name+'>';
function rowsOf(values,renderRow){
  return values.map(renderRow).join('');
}
function table(headers,rows){
  return '<div class="table-scroll"><table><thead><tr>'+headers.map(h=>tag('th',h)).join('')+
    '</tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function boot(page){
  const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{runScripts:'outside-only'});
  const w=dom.window;
  const people=[{id:'c1',name:'Zoé'},{id:'c2',name:'Ángela'},{id:'c3',name:'Benito'}];
  const lots=[
    {id:'l1',block:'B',stage:1,sourceNumber:'12',ownerClientId:'c1'},
    {id:'l2',block:'A',stage:2,sourceNumber:'3',ownerClientId:'c2'},
    {id:'l3',block:'A',stage:1,sourceNumber:'2',ownerClientId:'c3'}
  ];
  w.db={sales:[],ownershipStatements:[]};
  w.getLot=id=>lots.find(x=>x.id===id);
  w.getClient=id=>people.find(x=>x.id===id);
  w.clientsPage=()=>'<div class="toolbar"><input data-filter="search"></div>'+
    table(['Nombre completo'],rowsOf(people,c=>'<tr><td>'+c.name+'</td></tr>'));
  w.lotsPage=()=>'<div class="toolbar"><input data-filter="search"></div>'+
    table(['Código / número','Bloque','Tipo','Área','Precio','Estado','Comprador / compra','Acciones'],
      rowsOf(lots,l=>'<tr><td>'+l.id+'</td><td>'+l.block+'</td><td></td><td></td><td></td><td></td><td>'+w.getClient(l.ownerClientId).name+'</td><td><button data-action="view-lot" data-id="'+l.id+'">Ver</button></td></tr>'));
  w.paymentsPage=()=>'<div class="toolbar"><input data-filter="search"></div>'+
    table(['Cliente','Lote'],rowsOf(people,c=>'<tr><td>'+c.name+'</td><td>A</td></tr>'));
  w.receiptsPage=()=>table(['Recibo','Fecha','Cliente'],rowsOf(people,c=>'<tr><td>R</td><td>2026-11-20</td><td>'+c.name+'</td></tr>'))+
    table(['Recibo / fecha','Persona'],rowsOf(people,c=>'<tr><td>R</td><td>'+c.name+'</td></tr>'));
  w.collectionPage=()=>'<label>Mes de consulta<input type="month"></label><div>'+
    rowsOf(people,c=>'<article class="card"><p class="sm"><strong>'+c.name+'</strong></p></article>')+'</div>';
  w.render=()=>{w.document.querySelector('#app').innerHTML=w[(w.page==='collections'?'collection':w.page)+'Page']();};
  w.page=page;
  w.eval(source);
  w.render();
  return w;
}
function changeOrder(w,value){
  const select=w.document.querySelector('[data-alphabetical-order]');
  assert.ok(select,'Debe existir el selector de orden alfabético');
  select.value=value;
  select.dispatchEvent(new w.Event('change',{bubbles:true}));
}
function list(w,selector){return [...w.document.querySelectorAll(selector)].map(el=>el.textContent.trim());}

test('Clientes: A–Z con tildes, Z–A y restaurar orden original',()=>{
  const w=boot('clients');
  assert.deepEqual(list(w,'tbody tr td:first-child'),['Ángela','Benito','Zoé']);
  changeOrder(w,'za');
  assert.deepEqual(list(w,'tbody tr td:first-child'),['Zoé','Benito','Ángela']);
  changeOrder(w,'default');
  assert.deepEqual(list(w,'tbody tr td:first-child'),['Zoé','Ángela','Benito']);
  assert.ok(w.document.querySelector('[data-filter="search"]'),'Conserva la búsqueda');
  w.close();
});

test('Terrenos: ordenar por comprador o por bloque sin cambiar registros',()=>{
  const w=boot('lots');
  changeOrder(w,'az');
  assert.deepEqual(list(w,'tbody tr td:first-child'),['l2','l3','l1']);
  changeOrder(w,'block-az');
  assert.deepEqual(list(w,'tbody tr td:first-child'),['l3','l2','l1']);
  assert.equal(w.db.sales.length,0);
  w.close();
});

test('Cuotas y pagos: ordenar alfabéticamente por cliente',()=>{
  const w=boot('payments');
  changeOrder(w,'az');
  assert.deepEqual(list(w,'tbody tr td:first-child'),['Ángela','Benito','Zoé']);
  w.close();
});

test('Recibos: mismo selector ordena ambos historiales de clientes',()=>{
  const w=boot('receipts');
  changeOrder(w,'az');
  const tables=w.document.querySelectorAll('tbody');
  assert.deepEqual([...tables[0].rows].map(r=>r.cells[2].textContent),['Ángela','Benito','Zoé']);
  assert.deepEqual([...tables[1].rows].map(r=>r.cells[1].textContent),['Ángela','Benito','Zoé']);
  w.close();
});

test('Residenciales y cobros: organiza fichas sin quitar el filtro por mes',()=>{
  const w=boot('collections');
  changeOrder(w,'az');
  assert.deepEqual(list(w,'article.card strong'),['Ángela','Benito','Zoé']);
  assert.ok(w.document.querySelector('input[type="month"]'));
  w.close();
});
