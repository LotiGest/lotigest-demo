import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findReceiptCorrelativo,requireReceiptCorrelativo,normalizeReceiptCorrelativo,receiptCorrelativoMessage} from '../../owner-payments.mjs';
const s=readFileSync(new URL('./multi-date-abonos-ui.js',import.meta.url),'utf8');
const helpers=s.slice(s.indexOf(' function mdDuplicateMessage('),s.indexOf(' function mdRefresh('))+s.slice(s.indexOf(' function mdRowHasPayment('),s.indexOf(' function mdNextRow('))+s.slice(s.indexOf(' function mdValidate('),s.indexOf(' async function mdSave('));
function fixture(api){
 const db={clients:[{id:'C',name:'CLIENTE PRUEBA'}],sales:[{id:'S',clientId:'C',lotId:'L'}],payments:[{id:'P',saleId:'S',receiptReference:'999',date:'2025-01-01',amount:8612}]};
 const mdState={kind:'sale',snapshot:JSON.stringify(db),rows:Array.from({length:24},(_,i)=>({date:'2025-01-'+String(i+1).padStart(2,'0'),dateText:'fecha',amount:'8612',receiptRef:String(351+i)}))};
 const f=new Function('window','db','mdState','cloudReady','cloudUser','cloudBlocked','cloudBusy','cloudQueue','mdToday',helpers+';return {mdDuplicateMessage,mdValidate};')({lotigestOwnerPayments:api},db,mdState,true,{role:'admin'},false,false,{latest:'same',confirmed:'same'},()=> '2026-11-25');
 return {db,mdState,...f};
}
const old={findReceiptCorrelativo,requireReceiptCorrelativo,normalizeReceiptCorrelativo};
test('24 abonos válidos por L 206,688 con módulo viejo sin función de mensaje',()=>{
 const f=fixture(old),before=JSON.stringify(f.db),rows=f.mdValidate();
 assert.equal(rows.length,24);assert.equal(rows.reduce((n,p)=>n+p.cents,0),20668800);
 assert.equal(JSON.stringify(f.db),before);
 assert.match(f.mdDuplicateMessage(f.db,'000999'),/CLIENTE PRUEBA/);
 f.mdState.rows[23].receiptRef='999';assert.throws(()=>f.mdValidate(),/CLIENTE PRUEBA/);
 f.mdState.rows[23].receiptRef='351';assert.throws(()=>f.mdValidate(),/repetido/);
});
test('módulo moderno conserva detalle, y módulo sin validador no permite registrar',()=>{
 const f=fixture({...old,receiptCorrelativoMessage});assert.match(f.mdDuplicateMessage(f.db,'999'),/8,612\.00/);
 const missing=fixture({requireReceiptCorrelativo});assert.throws(()=>missing.mdValidate(),/No se cargó la validación/);
});
test('el módulo de recibos viaja integrado en el HTML',()=>{
 const build=readFileSync(new URL('./build.mjs',import.meta.url),'utf8');
 assert.match(build,/id="lotigest-owner-payments"/);
 assert.match(build,/replace\(ownerScript,/);
});
