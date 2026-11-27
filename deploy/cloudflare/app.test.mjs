import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest,encode,decode} from '../../functions/api/app/state.js';
import {onRequest as session} from '../../functions/api/app/session.js';
import {onRequest as password} from '../../functions/api/app/password.js';
export {D1,fixture,empty} from './test-d1.mjs';
import {fixture,empty} from './test-d1.mjs';
import {partialPaymentDetails,makePartialPaymentConfirmation} from '../../monthly-payment-rules.mjs';
function request(f,method='GET',payload){return onRequest({env:f.env,request:new Request('https://test/api/app/state',{method,headers:{Cookie:f.cookie,Origin:'https://test',...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined})});}
const put=(f,state,revision=0,mutation=crypto.randomUUID())=>request(f,'PUT',{state,revision,mutation});
test('2000 clientes y todos los módulos se recuperan de D1; guardado incremental, historial, reintento y conflicto',async()=>{
 const f=await fixture(),s=empty();s.clients=Array.from({length:2000},(_,i)=>({id:'C'+i,name:'CLIENTE FICTICIO '+i,address:'DIRECCIÓN DE PRUEBA',identity:'TEST'+i}));
 s.lots=[{id:'L1',area:250,price:100000,status:'sold',dimensions:{front:10,depth:25}}];s.sales=[{id:'V1',lotId:'L1',clientId:'C1',price:100000,downPayment:10000,months:36,type:'credit',date:'2026-11-17'}];s.payments=[{id:'P1',saleId:'V1',amount:10000,date:'2026-11-17',concept:'Prima'}];s.reservations=[{id:'A1',lotId:'L1',clientId:'C1',status:'cancelled'}];s.cashEntries=[{id:'G1',kind:'expense',date:'2026-11-17',amount:80}];s.contracts=[{id:'D1',text:'Documento de prueba'}];s.residences=[{id:'R1',image:'x'.repeat(150000)}];s.settings={enabled:true};
 assert.deepEqual(decode(encode(s)),s);
 const mutation=crypto.randomUUID();assert.equal((await put(f,s,0,mutation)).status,200);assert.deepEqual((await (await request(f)).json()).state,s);
 assert.equal((await put(f,s,0,mutation)).status,200);assert.equal(f.db.db.prepare('SELECT revision FROM app_meta').get().revision,1);
 const next=structuredClone(s);next.clients[0].name='ACTUALIZADO';next.payments.push({id:'P2',saleId:'V1',amount:1000,date:'2026-11-18'});
 const unconfirmed=await put(f,next,1);assert.equal(unconfirmed.status,400);assert.match((await unconfirmed.json()).error,/Confirma expresamente/);assert.equal(f.db.db.prepare('SELECT revision FROM app_meta').get().revision,1);assert.deepEqual((await (await request(f)).json()).state,s);
 const details=partialPaymentDetails(s,['L1'],100000);assert.deepEqual(details,{lotIds:['L1'],contractualCents:250000,amountCents:100000,differenceCents:150000});next.payments.at(-1).partialPaymentConfirmation=makePartialPaymentConfirmation(details,{date:'2026-11-18',actor:'admin',note:'Abono parcial de prueba'});
 assert.equal((await put(f,next,1)).status,200);assert.deepEqual((await (await request(f)).json()).state,next);assert.ok(f.db.db.prepare('SELECT count(*) n FROM app_history').get().n>0);
 assert.equal((await put(f,s,1)).status,409);assert.deepEqual((await (await request(f)).json()).state,next);
});
test('rechaza sesiones, roles, origen, JSON inválido, referencias corruptas y cargas excesivas sin modificar datos',async()=>{
 const f=await fixture();assert.equal((await onRequest({env:f.env,request:new Request('https://test/api/app/state')})).status,401);
 assert.equal((await onRequest({env:f.env,request:new Request('https://test/api/app/state',{headers:{Cookie:f.cookie,Origin:'https://evil'}})})).status,403);
 f.db.db.prepare("UPDATE users SET role='sales'").run();assert.equal((await request(f)).status,200);assert.equal((await put(f,empty())).status,403);f.db.db.prepare("UPDATE users SET role='admin'").run();
 const invalid=empty();invalid.payments=[{id:'bad',saleId:'missing',amount:100}];assert.equal((await put(f,invalid)).status,400);
 const big=empty();big.large='x'.repeat(4*1024*1024);assert.equal((await put(f,big)).status,413);assert.equal((await (await request(f)).json()).state,null);
});
test('fallo SQL revierte revisión y registros, contraseña exige credencial actual, salida revoca sesión',async()=>{
 const f=await fixture();const s=empty();assert.equal((await put(f,s)).status,200);f.db.fail=true;s.company.name='CAMBIO QUE DEBE FALLAR';assert.equal((await put(f,s,1)).status,503);f.db.fail=false;assert.equal((await (await request(f)).json()).state.company.name,'GRUPO H');assert.equal(f.db.db.prepare('SELECT revision FROM app_meta').get().revision,1);
 const change=async current=>password({env:f.env,request:new Request('https://test/api/app/password',{method:'PUT',headers:{Cookie:f.cookie,Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({current,salt:'c'.repeat(64),token_hash:'d'.repeat(64)})})});
 assert.equal((await change('e'.repeat(64))).status,401);assert.equal((await change(f.credential)).status,200);
 assert.equal((await session({env:f.env,request:new Request('https://test/api/app/session',{method:'DELETE',headers:{Cookie:f.cookie,Origin:'https://test'}})})).status,200);assert.equal((await request(f)).status,401);
});
test('PDF se recupera íntegro, no se sobrescribe y se conserva al archivar',async()=>{
 const {onRequest:file}=await import('../../functions/api/app/file.js');const f=await fixture(),data='%PDF-1.4\n'+('DOCUMENTO FICTICIO '.repeat(7000));
 const call=(method,text,key='plano-test')=>file({env:f.env,request:new Request('https://test/api/app/file?key='+key,{method,headers:{Cookie:f.cookie,Origin:'https://test','Content-Type':'application/pdf'},body:text})});
 assert.equal((await call('PUT',data)).status,201);assert.equal(await (await call('GET')).text(),data);assert.equal((await call('PUT',data)).status,200);assert.equal((await call('PUT','%PDF-OTHER')).status,409);assert.equal((await call('PUT','not pdf','bad')).status,400);assert.equal((await call('DELETE')).status,200);assert.equal(await (await call('GET')).text(),data);
});
test('rechaza duplicados, sobrepagos, importes fraccionarios, fechas imposibles y apartados incompatibles sin cambiar la revisión',async()=>{
 const f=await fixture(),s=empty();s.clients=[{id:'C1',name:'CLIENTE FICTICIO',identity:'0801-1999-00001'}];s.lots=[{id:'L1',status:'sold'}];s.sales=[{id:'V1',lotId:'L1',clientId:'C1',type:'credit',price:1000,downPayment:100,months:12,date:'2026-01-01'}];s.payments=[{id:'P1',saleId:'V1',amount:100,date:'2026-01-01'}];assert.equal((await put(f,s)).status,200);
 const changes=[x=>x.sales.push({...x.sales[0],id:'V2'}),x=>x.payments.push({id:'P2',saleId:'V1',amount:901,date:'2026-01-02'}),x=>x.payments[0].amount=.001,x=>x.payments[0].date='2026-02-30',x=>x.payments[0].date='2025-12-31',x=>x.sales[0].firstDueDate='2025-12-31',x=>x.clients.push({id:'C2',name:'OTRO',identity:'0801199900001'}),x=>x.reservations=[{id:'R1',lotId:'L1',clientId:'C1',status:'active',reservedUntil:'2026-12-31'}]];
 for(const change of changes){const next=structuredClone(s);change(next);assert.equal((await put(f,next,1)).status,400);assert.equal((await (await request(f)).json()).revision,1);}
});
test('los intentos de acceso se limitan por origen de red y se puede reintentar después de la ventana',async()=>{
 const f=await fixture();let response;
 for(let i=0;i<31;i++)response=await session({env:f.env,request:new Request('https://test/api/app/session',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.123'},body:JSON.stringify({credential:'f'.repeat(64)})})});
 assert.equal(response.status,429);assert.ok(Number(response.headers.get('Retry-After'))>0);
 f.db.db.prepare('UPDATE app_login_limits SET window_start=0').run();response=await session({env:f.env,request:new Request('https://test/api/app/session',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.123'},body:JSON.stringify({credential:f.credential})})});assert.equal(response.status,200);
});
test('administrador crea vendedor y el servidor filtra datos personales y financieros y rechaza sus escrituras',async()=>{
 const {onRequest:accounts}=await import('../../functions/api/app/users.js'),f=await fixture(),{hash}=await import('../../functions/api/app/shared.js');const credential='b'.repeat(64),payload={name:'ventas_test',role:'sales',salt:'c'.repeat(64),token_hash:await hash(credential)};
 let result=await accounts({env:f.env,request:new Request('https://test/api/app/users',{method:'POST',headers:{Cookie:f.cookie,Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify(payload)})});assert.equal(result.status,201);
 const s=empty();s.clients=[{id:'C1',name:'CLIENTE PRIVADO',identity:'0801199900001'}];s.lots=[{id:'L1',price:1000,status:'sold',area:154}];s.sales=[{id:'V1',lotId:'L1',clientId:'C1',type:'cash',price:1000,downPayment:1000,months:0,date:'2026-01-01'}];s.payments=[{id:'P1',saleId:'V1',amount:1000,date:'2026-01-01'}];s.residences=[{id:'R1',name:'RESIDENCIAL',records:{x:{lotId:'L1',owner:'CLIENTE PRIVADO'}},features:[{key:'x',number:1,points:[[0,0],[1,0],[1,1]],owner:'CLIENTE PRIVADO'}]}];assert.equal((await put(f,s)).status,200);
 result=await session({env:f.env,request:new Request('https://test/api/app/session',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({credential})})});assert.equal(result.status,200);const cookie=result.headers.get('Set-Cookie').split(';')[0];const seller={...f,cookie};const catalog=await (await request(seller)).json();assert.equal(catalog.user.role,'sales');assert.equal(catalog.state.lots[0].price,1000);assert.deepEqual(catalog.state.clients,[]);assert.deepEqual(catalog.state.payments,[]);assert.ok(!JSON.stringify(catalog).includes('CLIENTE PRIVADO'));assert.equal((await put(seller,s,1)).status,403);
 result=await accounts({env:f.env,request:new Request('https://test/api/app/users',{headers:{Cookie:cookie}})});assert.equal(result.status,403);
});

test('contratos CM: asignación por registro, reintento, conflicto y no reutilización al eliminar',async()=>{
 const f=await fixture(),s=empty();
 s.contractTexts=[{id:'b',createdAt:'2026-11-25T10:00:00Z'},{id:'a',createdAt:'2026-11-20T10:00:00Z'}];
 const mutation=crypto.randomUUID();assert.equal((await put(f,s,0,mutation)).status,200);assert.equal((await put(f,s,0,mutation)).status,200);
 let data=await (await request(f)).json();assert.equal(data.state.contractTexts.find(d=>d.id==='a').number,'CM-0001');assert.equal(data.state.contractTexts.find(d=>d.id==='b').number,'CM-0002');
 data.state.contractTexts=data.state.contractTexts.filter(d=>d.id!=='b');data.state.contractTexts[0].number='CM-9999';data.state.contractTexts.unshift({id:'c',createdAt:'2026-01-01',number:'CM-0002'});
 assert.equal((await put(f,data.state,data.revision)).status,200);
 const stored=await (await request(f)).json();assert.equal(stored.state.contractTexts.find(d=>d.id==='a').number,'CM-0001');assert.equal(stored.state.contractTexts.find(d=>d.id==='c').number,'CM-0003');
 assert.equal((await put(f,data.state,data.revision)).status,409);
});
