import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './test-d1.mjs';import {onRequest} from '../../functions/api/app/state.js';
test('D1 guarda abono parcial después de prima y permite completar el faltante',async()=>{
 const f=await fixture();const s={version:3,company:{name:'GRUPO H'},clients:[{id:'C',name:'CLIENTE FICTICIO'}],lots:[{id:'L',status:'sold'}],sales:[{id:'V',clientId:'C',lotId:'L',type:'credit',price:100000,downPayment:10000,months:10,date:'2024-01-01'}],payments:[{id:'PRIMA',saleId:'V',amount:10000,date:'2024-01-01'}],reservations:[]};
 const put=(state,revision)=>onRequest({env:f.env,request:new Request('https://test/api/app/state',{method:'PUT',headers:{Cookie:f.cookie,Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({state,revision,mutation:crypto.randomUUID()})})});
 assert.equal((await put(s,0)).status,200);const next=structuredClone(s);next.payments.push({id:'P',saleId:'V',amount:8999.99,date:'2024-02-01'});
 const partial=await put(next,1);assert.equal(partial.status,200);assert.equal(f.db.db.prepare('SELECT revision FROM app_meta').get().revision,2);
 next.payments.push({id:'COMPLETE',saleId:'V',amount:0.01,date:'2024-02-02'});assert.equal((await put(next,2)).status,200);
});
test('D1 accepts the first empty state without reading payments from a null predecessor',async()=>{
 const f=await fixture();const state={version:3,company:{name:'PRUEBA'},clients:[],lots:[],sales:[],payments:[],reservations:[]};
 const response=await onRequest({env:f.env,request:new Request('https://test/api/app/state',{method:'PUT',headers:{Cookie:f.cookie,Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({state,revision:0,mutation:crypto.randomUUID()})})});
 assert.equal(response.status,200);assert.equal((await response.json()).revision,1);const restored=await onRequest({env:f.env,request:new Request('https://test/api/app/state',{headers:{Cookie:f.cookie}})});assert.deepEqual((await restored.json()).state,state);
});
