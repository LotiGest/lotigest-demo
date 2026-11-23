import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('./multi-date-abonos-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('./multi-date-abonos.css',import.meta.url),'utf8');
const start=src.indexOf(' function mdLastPaymentFor(');
const stop=src.indexOf(' function mdCreateEntry(',start);
assert.ok(start>=0&&stop>start,'El historial se calcula desde los pagos del sistema');
const {last,body,markup}=new Function('mdToday','mdSafe','mdFmt','mdHumanDate',
 src.slice(start,stop)+
 ';return {last:mdLastPaymentFor,body:mdLastPaymentBody,markup:mdLastPaymentMarkup};')(
 ()=> '2026-11-23',
 value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
 amount=>'L '+Number(amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),
 date=>{const [y,m,d]=date.split('-');return Number(d)+' '+['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][Number(m)-1]+' '+y;}
);
const data={
 payments:[
  {id:'P-B',saleId:'S-B',date:'2026-11-20',amount:500000,receiptReference:'99999999'},
  {id:'P-A-OLD',saleId:'S-A',date:'2026-10-12',amount:12000,receiptReference:'00006159'},
  {id:'P-A-LATEST',saleId:'S-A',date:'2026-11-05',amount:6470.22,receiptReference:'00006170'},
  {id:'P-A-FUTURE',saleId:'S-A',date:'2026-12-02',amount:7000,receiptReference:'00006199'}
 ],
 ownerPayments:[
  {clientId:'C1',residenceId:'R1',date:'2026-11-10',receiptReference:'00007111',
   allocations:[{statementId:'F1',amountCents:350000},{statementId:'F2',amountCents:450000}]},
  {clientId:'C1',residenceId:'R1',date:'2026-11-17',receiptReference:'00007119',
   allocations:[{statementId:'F2',amountCents:250000}]},
  {clientId:'C2',residenceId:'R1',date:'2026-11-23',receiptReference:'99999999',
   allocations:[{statementId:'F1',amountCents:9000000}]}
 ]
};
test('al abrir Abonos varios se muestra último pago SOLO del solar elegido',()=>{
 const state={kind:'sale',saleId:'S-A',docs:[]};
 const p=last(state,data);
 assert.equal(p.date,'2026-11-05');
 assert.equal(p.reference,'00006170','Se conservan los ceros a la izquierda del correlativo');
 assert.equal(p.amount,6470.22);
 const html=markup(state,data);
 assert.match(html,/Último pago registrado/);
 assert.match(html,/5 Noviembre 2026/);
 assert.match(html,/00006170/);
 assert.match(html,/L 6,470\.22/);
 assert.doesNotMatch(html,/99999999/,'No se mezcla otro terreno');
 assert.match(src,/mdLastPaymentMarkup\(mdState,db,mdState\.docs\?\.\[0\]\?\.id\)/,'Se muestra arriba de las filas');
});
test('en propietarios con varias fichas, usa la fecha, folio y monto APLICADO a cada ficha',()=>{
 const state={kind:'owner',clientId:'C1',residenceId:'R1',docs:[{id:'F1'},{id:'F2'}]};
 const p1=last(state,data,'F1'),p2=last(state,data,'F2');
 assert.equal(p1.date,'2026-11-10');
 assert.equal(p1.reference,'00007111');
 assert.equal(p1.amount,3500);
 assert.equal(p2.date,'2026-11-17');
 assert.equal(p2.reference,'00007119');
 assert.equal(p2.amount,2500);
 assert.match(markup(state,data,'F2','row2'),/data-md-last-payment-row="row2"/);
 assert.match(markup(state,data,'F2','row2'),/17 Noviembre 2026/);
 assert.doesNotMatch(markup(state,data,'F1','row1'),/99999999/);
 assert.match(src,/summary\.innerHTML=mdLastPaymentBody\(mdState,db,row\.statementId\)/,'Cambia el aviso al elegir otra ficha');
});
test('si no tiene pagos, informa claramente sin inventar folios ni montos',()=>{
 const summary=markup({kind:'sale',saleId:'sin-pagos'},data);
 assert.match(summary,/No hay pagos registrados con fecha y monto para este solar/);
 assert.doesNotMatch(summary,/L 0\.00/);
 const owner=markup({kind:'owner',clientId:'C1',residenceId:'R1'},{ownerPayments:[]},'F1','r');
 assert.match(owner,/para esta ficha/);
});
test('muestra la prima como prima, no como cuota; no elimina ni modifica datos',()=>{
 const state={kind:'sale',saleId:'PRIMA'},snapshot=JSON.stringify(data);
 const v={payments:[{saleId:'PRIMA',date:'2026-09-01',amount:30000,concept:'Prima inicial',receiptReference:''}]};
 const html=markup(state,v);
 assert.match(html,/Prima inicial; no cuenta como cuota mensual/);
 assert.match(html,/Sin correlativo/);
 assert.equal(JSON.stringify(data),snapshot);
});
test('el diseño del mensaje queda accesible y adaptado a computadora y celular',()=>{
 assert.match(css,/\.md-last-payment/);
 assert.match(css,/\.md-last-grid/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(src,/role="status"/);
});
