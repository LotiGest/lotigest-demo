import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('./multi-date-abonos-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('./multi-date-abonos.css',import.meta.url),'utf8');
const first=js.indexOf(' function mdRowMarkup(');
const last=js.indexOf(' function mdShow(',first);
const renderStart=js.indexOf(' function mdRenderRows(');
const renderEnd=js.indexOf(' function mdRefresh(',renderStart);
assert.ok(first>0&&last>first&&renderStart>0&&renderEnd>renderStart);

function fixture(){
 const state={kind:'sale',docs:[],rows:[
  {id:'A1',date:'2026-11-20',dateText:'20 Noviembre 2026',amount:'6500',receiptRef:'00006159',photo:null,preview:null,status:'',expanded:true},
  {id:'A2',date:'',dateText:'',amount:'',receiptRef:'',photo:null,preview:null,status:'',expanded:false}
 ]};
 const list={innerHTML:''};
 const document={getElementById:id=>id==='md-abonos-list'?list:null};
 const safe=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 let updates=0;
 const instance=new Function('mdState','mdSafe','mdToday','mdHumanDate','mdMoneyText','mdLastPaymentMarkup','db','document','mdRefresh','mdById',
  js.slice(first,last)+'\n'+js.slice(renderStart,renderEnd)+'\nreturn {mdRowMarkup,mdRenderRows,mdExpandRow,mdToggleRow};')(
  state,safe,()=>'2026-11-23',date=>date,value=>Number(value).toLocaleString('en-US',{minimumFractionDigits:2}),
  ()=>'',{},document,()=>updates++,id=>state.rows.find(row=>row.id===id));
 return {state,list,instance,updates:()=>updates};
}
test('primera tarjeta abierta y segunda plegada como en el diseño aprobado',()=>{
 const x=fixture();x.instance.mdRenderRows();
 assert.match(x.list.innerHTML,/id="md-row-body-A1"/);
 assert.match(x.list.innerHTML,/id="md-row-body-A2" hidden/);
 assert.match(x.list.innerHTML,/data-md-toggle-row="A1"/);
 assert.match(x.list.innerHTML,/aria-expanded="false"/);
 assert.match(x.list.innerHTML,/md-summary-ref[^>]*># 00006159/);
 assert.match(x.list.innerHTML,/md-summary-amount[^>]*>L 6,500.00/);
 assert.equal((x.list.innerHTML.match(/data-md-edit=/g)||[]).length,2);
 assert.equal((x.list.innerHTML.match(/data-md-photo=/g)||[]).length,2,'Se conserva un scanner por abono');
 assert.equal((x.list.innerHTML.match(/data-md-field="date"/g)||[]).length,2,'Las fechas siguen editables');
 assert.equal((x.list.innerHTML.match(/data-md-field="amount"/g)||[]).length,2,'Montos siguen editables');
 assert.equal((x.list.innerHTML.match(/data-md-field="receiptRef"/g)||[]).length,2,'Correlativos siguen editables');
});
test('la tarjeta cambia con un clic y no pierde datos ni impide abrir otra',()=>{
 const x=fixture();x.instance.mdRenderRows();
 x.instance.mdToggleRow('A2');
 assert.equal(x.state.rows[0].expanded,false);
 assert.equal(x.state.rows[1].expanded,true);
 assert.match(x.list.innerHTML,/id="md-row-body-A1" hidden/);
 assert.doesNotMatch(x.list.innerHTML,/id="md-row-body-A2" hidden/);
 x.instance.mdExpandRow('A1');
 assert.equal(x.state.rows[0].expanded,true);
 assert.equal(x.state.rows[1].expanded,false);
 assert.equal(x.state.rows[0].receiptRef,'00006159');
 assert.equal(x.state.rows[0].amount,'6500');
});
test('último pago muestra correlativo rojo y monto verde en una tarjeta menta',()=>{
 assert.match(js,/md-last-cell md-last-ref/);
 assert.match(js,/md-last-cell md-last-amount/);
 assert.match(js,/md-last-folio/);
 assert.match(css,/\.md-last-ref \.md-last-folio[\s\S]{0,65}color:#cc1735!important/);
 assert.match(css,/\.md-last-amount \.md-last-money[\s\S]{0,65}color:#006533!important/);
 assert.match(css,/linear-gradient\(110deg,#e3f8e8/);
 assert.match(css,/\.md-last-cell:nth-child\(3\)/,'Responsive de la tercera columna');
 assert.match(css,/\.md-row-body\[hidden\][\s\S]{0,45}display:none!important/);
});
test('el avance Enter despliega la siguiente fila y guardar conserva movimientos separados',()=>{
 assert.match(js,/mdExpandRow\(next\.id\)/);
 assert.match(js,/else if\(action\.hasAttribute\('data-md-toggle-row'\)\)mdToggleRow/);
 assert.match(js,/mdSuggestNextAmount\(mdState\.rows\.at\(-1\),row\);mdState\.rows\.push\(row\);mdExpandRow\(row\.id\)/);
 assert.match(js,/findLastIndex\(mdRowHasPayment\)/,'Una última fila vacía no bloquea guardar');
 assert.match(js,/createOwnerPayment\(next/);
 assert.match(js,/next\.payments\.unshift\(payment\)/);
});
