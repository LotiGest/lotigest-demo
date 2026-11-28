import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {intakeReservationFor,intakeConvertReservation} from '../../contract-intake-core.mjs';
const source=readFileSync(new URL('./contract-intake-ui.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function contractIntakeConfirmActivation(form){'),source.indexOf('const contractIntakeOldContractsPage='));
test('tres créditos de una misma ficha conservan el precio total y no inventan primas cobradas ni abonos',async()=>{
 let db={residences:[{id:'R'}],lots:[1,2,3].map(n=>({id:'L'+n,residenceId:'R',stage:2,block:'G',sourceNumber:String(n),pendingContractId:'D'+n})),
  clients:[{id:'C'}],sales:[],payments:[],reservations:[{id:'RES1',lotId:'L1',clientId:'C',status:'active'}],contractTexts:[1,2,3].map(n=>({id:'D'+n,lotId:'L'+n,clientId:'C',residenceId:'R',contractGroupId:'CG1',status:'pending-sale',structured:{price:n*100000,down:n*10000,months:84}}))};
 const queue={latest:JSON.stringify(db),confirmed:JSON.stringify(db)};let id=0;
 const env={db,contractIntakeAdmin:()=>true,FormData:class {constructor(f){return Object.entries(f.fields);}},getLot:key=>db.lots.find(l=>l.id===key),intakeReservationFor,intakeConvertReservation,
  buyerDate:v=>v,businessToday:()=> '2026-11-18',crypto:{randomUUID:()=>String(++id)},cloudWrite:raw=>{db=JSON.parse(raw);queue.latest=raw;},cloudFlush:async()=>{queue.confirmed=queue.latest;},
  cloudBlocked:false,cloudOffline:false,cloudQueue:queue,page:'contracts',toast(){},closeModal(){},render(){}};
 const run=new Function(...Object.keys(env),code+';return contractIntakeConfirmActivation;')(...Object.values(env));
 for(const n of [1,2,3])await run({fields:{documentId:'D'+n,date:'2024-01-01',firstDueDate:'2024-02-01'}});
 assert.equal(db.sales.length,3);assert.equal(db.sales.reduce((s,v)=>s+v.price,0),600000);assert.equal(db.sales.reduce((s,v)=>s+v.downPayment,0),60000);
 assert.equal(db.reservations[0].status,'converted');assert.equal(db.reservations[0].saleId,db.sales.find(s=>s.lotId==='L1').id);assert.equal(db.lots.find(l=>l.id==='L1').reservationId,null);
 assert.ok(db.sales.every(v=>v.openingPaid===0));assert.equal(db.payments.length,0);assert.ok(db.contractTexts.every(d=>d.status==='active'));
 await assert.rejects(run({fields:{documentId:'D1',date:'2024-01-01',firstDueDate:'2024-02-01'}}),/no está pendiente/);assert.equal(db.sales.length,3);
});

test('un apartado de otra persona no puede convertirse ni cambiarse de titular',()=>{
 const state={reservations:[{id:'R1',lotId:'L1',clientId:'C1',status:'active'}]},lot={id:'L1',reservationId:'R1'},before=JSON.stringify({state,lot});
 assert.throws(()=>intakeReservationFor(state,'L1','C2'),/otro cliente/);
 assert.throws(()=>intakeConvertReservation(state,lot,{id:'S2',lotId:'L1',clientId:'C2'},'2026-11-27'),/otro cliente/);
 assert.equal(JSON.stringify({state,lot}),before);
});
