import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './test-d1.mjs';import {onRequest} from '../../functions/api/app/state.js';
test('D1 rechaza abono menor a cuota después de prima y conserva revisión/datos',async()=>{
 const f=await fixture();const s={version:3,company:{name:'GRUPO H'},clients:[{id:'C',name:'CLIENTE FICTICIO'}],lots:[{id:'L',status:'sold'}],sales:[{id:'V',clientId:'C',lotId:'L',type:'credit',price:100000,downPayment:10000,months:10,date:'2024-01-01'}],payments:[{id:'PRIMA',saleId:'V',amount:10000,date:'2024-01-01'}],reservations:[]};
 const put=(state,revision)=>onRequest({env:f.env,request:new Request('https://test/api/app/state',{method:'PUT',headers:{Cookie:f.cookie,Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({state,revision,mutation:crypto.randomUUID()})})});
 assert.equal((await put(s,0)).status,200);const next=structuredClone(s);next.payments.push({id:'P',saleId:'V',amount:8999.99,date:'2024-02-01'});
 const bad=await put(next,1);assert.equal(bad.status,400);assert.match((await bad.json()).error,/9,000.00/);assert.equal(f.db.db.prepare('SELECT revision FROM app_meta').get().revision,1);
 next.payments[1].amount=9000;assert.equal((await put(next,1)).status,200);
});
