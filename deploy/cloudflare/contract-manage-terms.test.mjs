import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function contractManageTerms('),source.indexOf('function contractManageEditOpen('));
const terms=new Function('buyerDate',helper+';return contractManageTerms;')(v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('Fecha inválida');return v;});
const doc={id:'D',saleId:'S',lotId:'L',clientId:'C'};
const state={sales:[{id:'S',lotId:'L',clientId:'C',type:'credit',price:570000,downPayment:57000,months:72,date:'2023-11-23',firstDueDate:'2023-11-23'}],payments:[{saleId:'S',amount:10000,date:'2023-11-23',concept:'Prima',receiptReference:'1050'}]};
const input={price:'570000',down:'57000',months:'72',date:'2023-07-03',firstDueDate:'2023-11-23'};
test('corrige fecha de venta a la fecha contractual sin mover primera cuota ni recibos',()=>{
 const before=JSON.stringify(state),r=terms(state,doc,input,'2026-11-25');
 assert.equal(r.terms.date,'2023-07-03');assert.equal(r.terms.firstDueDate,'2023-11-23');
 assert.equal(r.terms.monthly,7125);assert.equal(JSON.stringify(state),before);
});
test('recalcula nuevo precio, prima y plazo en centavos',()=>{
 const r=terms(state,doc,{...input,price:'600000',down:'60000',months:'60'},'2026-11-25');
 assert.equal(r.terms.financed,540000);assert.equal(r.terms.monthly,9000);
});
test('protege recibos, prima pagada y coherencia de fechas',()=>{
 for(const inputOverride of [{price:'9000',down:'1000'},{date:'2024-01-01',firstDueDate:'2024-02-01'},{down:'9999'},{firstDueDate:'2023-01-01'}])assert.throws(()=>terms(state,doc,{...input,...inputOverride},'2026-11-25'));
 assert.throws(()=>terms({...state,ownerPayments:[{allocations:[{references:[{lotId:'L'}]}]}]},doc,input,'2026-11-25'));
});
