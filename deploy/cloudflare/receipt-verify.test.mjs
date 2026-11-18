import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,empty} from './test-d1.mjs';
import {onRequest as update} from '../../functions/api/app/state.js';
import {onRequest as verify} from '../../functions/api/verificar-recibo.js';

const base='https://lotigest.test/api/verificar-recibo?token=';
const verification=(f,token,method='GET')=>verify({env:f.env,request:new Request(base+token,{method})});
const save=(f,state,revision=0)=>update({env:f.env,request:new Request('https://lotigest.test/api/app/state',{
 method:'PUT',headers:{Cookie:f.cookie,Origin:'https://lotigest.test','Content-Type':'application/json'},
 body:JSON.stringify({state,revision,mutation:crypto.randomUUID()})
})});

test('el QR verifica solo pagos confirmados en D1 sin exponer datos del cliente',async()=>{
 const f=await fixture(),s=empty(),token='a'.repeat(32);
 s.residences=[{id:'r',name:'PRUEBA'}];
 s.clients=[{id:'C1',name:'PERSONA CONFIDENCIAL',identity:'0801199900000',phone:'99999999'}];
 s.lots=[{id:'L1',residenceId:'r',area:150,price:50000,status:'sold'}];
 s.sales=[{id:'V1',lotId:'L1',clientId:'C1',price:50000,downPayment:1000,months:24,type:'credit',date:'2026-01-01'}];
 s.payments=[{id:'P1',saleId:'V1',date:'2026-01-03',amount:1500,verifyToken:token}];
 // Antes de sincronizar no puede validarse.
 assert.equal((await verification(f,token)).status,404);
 const saved=await save(f,s);assert.equal(saved.status,200,await saved.text());
 const response=await verification(f,token);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.estado,'vigente');
 assert.equal(body.folio,'P1');
 assert.equal(body.montoCentavos,150000);
 assert.equal(body.moneda,'HNL');
 assert.equal(body.fecha,'2026-01-03');
 assert.ok(!JSON.stringify(body).includes('CONFIDENCIAL'));
 assert.ok(!JSON.stringify(body).includes('0801199900000'));
 assert.ok(!JSON.stringify(body).includes('99999999'));
 assert.equal((await verification(f,'b'.repeat(32))).status,404);
 assert.equal((await verification(f,token,'POST')).status,405);
 const without=structuredClone(s);without.payments=[];
 assert.equal((await save(f,without,1)).status,200);
 assert.equal((await verification(f,token)).status,404);
});

test('un QR no puede reutilizarse entre pagos diferentes',async()=>{
 const f=await fixture(),s=empty(),token='a'.repeat(32);
 s.clients=[{id:'C1',name:'CLIENTE FICTICIO'}];
 s.lots=[{id:'L1',residenceId:'r',area:150,price:50000,status:'sold'}];
 s.sales=[{id:'V1',lotId:'L1',clientId:'C1',price:50000,downPayment:1000,months:24,type:'credit',date:'2026-01-01'}];
 s.payments=[{id:'P1',saleId:'V1',date:'2026-01-03',amount:1500,verifyToken:token},{id:'P2',saleId:'V1',date:'2026-01-04',amount:1400,verifyToken:token}];
 const res=await save(f,s);assert.equal(res.status,400);
});
