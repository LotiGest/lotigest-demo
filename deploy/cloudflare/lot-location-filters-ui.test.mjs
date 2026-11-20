import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const code=readFileSync(new URL('./lot-location-filters-ui.js',import.meta.url),'utf8');

function boot(){
 const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{runScripts:'outside-only'});
 const w=dom.window;
 const lots=[
  {id:'E1-I-03',residenceId:'r',stage:1,block:'I',sourceNumber:'03'},
  {id:'E1-I-4',residenceId:'r',stage:1,block:'I',sourceNumber:'4'},
  {id:'E1-J-5',residenceId:'r',stage:1,block:'J',sourceNumber:'5'},
  {id:'E2-I-3',residenceId:'r',stage:2,block:'I',sourceNumber:'3'},
  {id:'E2-B-2',residenceId:'r',stage:2,block:'B',sourceNumber:'2'}
 ];
 w.db={lots};
 w.page='lots';
 w.inventoryBlockFilter='all';
 w.selectedLot=null;
 w.residence=()=>({id:'r'});
 w.residenceLots=()=>w.db.lots;
 w.getLot=id=>w.db.lots.find(l=>l.id===id);
 w.esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
 w.lotsPage=()=>{
   const visible=w.db.lots.filter(l=>w.inventoryBlockFilter==='all'||w.inventoryBlockFilter===l.block);
   const active=visible.find(l=>l.id===w.selectedLot)||visible[0];
   return '<div class="card"><label>Bloque<select id="inventory-block"><option value="all">Todos</option>'+
     [...new Set(w.db.lots.map(l=>l.block))].map(b=>'<option value="'+b+'">'+b+'</option>').join('')+
     '</select></label></div><div class="page-cols"><div class="card"><div class="panel-table-head"><h2>Terrenos del inventario ('+visible.length+')</h2></div>'+
     '<div class="table-scroll"><table><thead><tr><th>Código / número</th><th>Bloque</th></tr></thead><tbody>'+
     visible.map(l=>'<tr><td>'+l.id+'</td><td><button data-action="view-lot" data-id="'+l.id+'">Ver</button></td></tr>').join('')+
     '</tbody></table></div></div><aside class="detail-panel">'+(active?'Ficha '+active.id:'Sin terreno')+'</aside></div>';
 };
 w.render=()=>{w.document.querySelector('#app').innerHTML=w.lotsPage();};
 w.document.addEventListener('change',event=>{
   if(event.target.id==='inventory-block'){
     w.inventoryBlockFilter=event.target.value;
     w.render();
   }
 });
 w.eval(code);
 w.render();
 return {w,close:()=>w.close()};
}

function select(w,id,value){
 const el=w.document.querySelector('#'+id);
 assert.ok(el,'Debe existir '+id);
 el.value=value;
 assert.equal(el.value,value,'Debe estar disponible el valor '+value);
 el.dispatchEvent(new w.Event('change',{bubbles:true}));
}
const visible=w=>[...w.document.querySelectorAll('tbody tr')].filter(r=>!r.hidden&&r.style.display!=='none').map(r=>r.cells[0].textContent);

test('Etapa, bloque y solar identifican un terreno único sin confundir etapas repetidas',()=>{
 const {w,close}=boot();
 try{
  const before=JSON.stringify(w.db);
  select(w,'inventory-stage','1');
  assert.deepEqual(visible(w),['E1-I-03','E1-I-4','E1-J-5']);
  assert.equal(w.document.querySelector('#inventory-block option[value="B"]'),null,'No muestra bloque de otra etapa');
  select(w,'inventory-block','I');
  assert.deepEqual(visible(w),['E1-I-03','E1-I-4']);
  select(w,'inventory-solar','03');
  assert.deepEqual(visible(w),['E1-I-03']);
  assert.match(w.document.querySelector('.detail-panel').textContent,/E1-I-03/);
  select(w,'inventory-stage','2');
  assert.deepEqual(visible(w),['E2-I-3','E2-B-2']);
  select(w,'inventory-block','I');
  select(w,'inventory-solar','3');
  assert.deepEqual(visible(w),['E2-I-3']);
  assert.match(w.document.querySelector('.detail-panel').textContent,/E2-I-3/);
  assert.equal(JSON.stringify(w.db),before,'No modifica inventario ni datos');
 }finally{close();}
});

test('Limpiar ubicación restaura todos los terrenos sin perder el filtro existente',()=>{
 const {w,close}=boot();
 try{
  select(w,'inventory-stage','1');
  select(w,'inventory-block','I');
  select(w,'inventory-solar','4');
  assert.deepEqual(visible(w),['E1-I-4']);
  w.document.querySelector('#inventory-location-clear').click();
  assert.equal(w.document.querySelector('#inventory-stage').value,'all');
  assert.equal(w.document.querySelector('#inventory-block').value,'all');
  assert.equal(w.document.querySelector('#inventory-solar').value,'all');
  assert.equal(visible(w).length,5);
 }finally{close();}
});
