import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,empty} from './test-d1.mjs';
import {encode} from '../../functions/api/app/state.js';
import {onRequest as publish} from '../../functions/api/client-sales/maps.js';
import {onRequest as publicMap} from '../../functions/api/client-sales/maps/[slug].js';
import {onRequest as createRequest} from '../../functions/api/client-sales/maps/[slug]/requests.js';
import {onRequest as listRequests} from '../../functions/api/client-sales/requests.js';
import {onRequest as patchRequest} from '../../functions/api/client-sales/requests/[id].js';

async function seed(){
 const f=await fixture();
 const state={...empty(),
  residences:[{id:'altos',name:'Altos del Arrayán',viewBox:[0,0,200,150]}],
  lots:[
   {id:'A1',residenceId:'altos',stage:1,block:'A',sourceNumber:'1',status:'available',type:'solar',area:154,price:507993.64,dimensions:{front:11,depth:14}},
   {id:'A2',residenceId:'altos',stage:1,block:'A',sourceNumber:'2',status:'sold',type:'solar',price:600000,area:165},
   {id:'A3',residenceId:'altos',stage:1,block:'A',sourceNumber:'3',status:'reserved',type:'solar',price:400000,area:143},
   {id:'A4',residenceId:'altos',stage:1,block:'A',sourceNumber:'4',status:'private',type:'private',price:500000}
  ],clients:[],sales:[],payments:[]
 };
 for(const item of encode(state))f.db.db.prepare('INSERT INTO app_records(key,payload) VALUES(?,?)').run(item.key,item.payload);
 const url='https://test/api/client-sales/maps';
 const post=await publish({env:f.env,request:new Request(url,{method:'POST',headers:{Origin:'https://test',Cookie:f.cookie,'Content-Type':'application/json'},body:JSON.stringify({
  residenceId:'altos',title:'Altos del Arrayán',viewBox:[0,0,200,150],
  prices:{A1:507993.64,A2:600000},lots:state.lots.map(l=>({id:l.id,points:[[0,0],[30,0],[30,30]],name:'DATOS PRIVADOS',available:true}))
 })})});
 assert.equal(post.status,200,await post.text().catch(()=>'')); // not consumed on success
 const {slug,path}=await post.clone().json();
 return {...f,state,slug,path};
}
test('WhatsApp: enlace público dentro de LOTIGEST sin precios ni clientes',async()=>{
 const f=await seed();
 assert.match(f.path,/^\/seleccionar-solar\.html\?map=[a-f0-9]{24}$/);
 const response=await publicMap({env:f.env,params:{slug:f.slug},request:new Request('https://test/api/client-sales/maps/'+f.slug)});
 assert.equal(response.status,200);
 const data=(await response.json()).map,raw=JSON.stringify(data);
 assert.deepEqual(data.lots.map(l=>l.status),['available','sold','reserved']);
 for(const forbidden of ['507993.64','600000','DATOS PRIVADOS','clientId','phone','identity','ownerClientId','price','sales'])assert.ok(!raw.includes(forbidden),'No exponer '+forbidden);
 assert.equal(data.lots.some(l=>l.id==='A4'),false,'Propiedad privada oculta');
});
test('cliente elige solar, la solicitud llega a pendientes y no crea una venta',async()=>{
 const f=await seed();
 const tomorrow=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 const payload={lotId:'A1',name:'CLIENTE PRUEBA',phone:'9999-1234',mode:'credit',proposedDownPayment:50000,paymentDate:tomorrow,note:'Me interesa el solar'};
 const submit=async input=>createRequest({env:f.env,params:{slug:f.slug},request:new Request('https://test/api/client-sales/maps/'+f.slug+'/requests',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify(input)})});
 const sold=await submit({...payload,lotId:'A2'});
 assert.equal(sold.status,409,'Nunca solicitar un solar comprado');
 const reserved=await submit({...payload,lotId:'A3'});
 assert.equal(reserved.status,409,'Nunca solicitar un solar apartado');
 const valid=await submit(payload);
 assert.equal(valid.status,201);
 const confirmed=await valid.json();assert.match(confirmed.requestId,/^SOL-/);
 const rows=await listRequests({env:f.env,request:new Request('https://test/api/client-sales/requests',{headers:{Cookie:f.cookie}})});
 assert.equal(rows.status,200);
 const data=await rows.json();
 assert.equal(data.requests.length,1);
 assert.equal(data.requests[0].client.name,'CLIENTE PRUEBA');
 assert.equal(data.requests[0].lotId,'A1');
 assert.equal(data.requests[0].status,'pending');
 assert.equal(f.db.db.prepare("SELECT COUNT(*) AS n FROM app_records").get().n>0,true);
 assert.equal(f.db.db.prepare("SELECT COUNT(*) AS n FROM public_lot_requests").get().n,1);
 const illegal=await patchRequest({env:f.env,params:{id:confirmed.requestId},request:new Request('https://test/api/client-sales/requests/'+confirmed.requestId,{method:'PATCH',headers:{Cookie:f.cookie,Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({status:'approved'})})});
 assert.equal(illegal.status,409,'No aprobar sin que exista un apartado guardado');
});
test('solo admin publica y lee datos privados de solicitudes',async()=>{
 const f=await fixture();
 const unauthorized=await listRequests({env:f.env,request:new Request('https://test/api/client-sales/requests')});
 assert.equal(unauthorized.status,401);
 const invalid=await publish({env:f.env,request:new Request('https://test/api/client-sales/maps',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://externo.example',Cookie:f.cookie},body:'{}'})});
 assert.equal(invalid.status,403);
});
