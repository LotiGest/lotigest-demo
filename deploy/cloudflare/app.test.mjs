import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest,encode,decode} from '../../functions/api/app/state.js';
import {onRequest as session} from '../../functions/api/app/session.js';
import {onRequest as password} from '../../functions/api/app/password.js';
import {hash} from '../../functions/api/app/shared.js';
export class D1 {
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('CREATE TABLE users(name TEXT PRIMARY KEY,role TEXT,token_hash TEXT UNIQUE); CREATE TABLE d1_user_passwords(name TEXT PRIMARY KEY,salt TEXT);');this.db.exec(readFileSync(new URL('./migrations/0003_app_persistence.sql',import.meta.url),'utf8'));}
 prepare(sql){const self=this;return {sql,args:[],bind(...args){this.args=args;return this;},async first(){return self.db.prepare(sql).get(...this.args)||null;},async all(){return {results:self.db.prepare(sql).all(...this.args)};},async run(){if(self.fail&&sql.startsWith('INSERT INTO app_records'))throw Error('simulated SQL failure');const stmt=self.db.prepare(sql);if(stmt.columns().length)return {results:stmt.all(...this.args),meta:{changes:0}};const result=stmt.run(...this.args);return {results:[],meta:{changes:Number(result.changes)}};}};}
 async batch(queries){this.db.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.run());this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
export async function fixture(){const db=new D1(),credential='a'.repeat(64);db.db.prepare('INSERT INTO users VALUES(?,?,?)').run('admin','admin',await hash(credential));db.db.prepare('INSERT INTO d1_user_passwords VALUES(?,?)').run('admin','b'.repeat(64));const env={LOTIGEST_DB:db};const r=await session({env,request:new Request('https://test/api/app/session',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({credential})})});assert.equal(r.status,200);const cookie=r.headers.get('Set-Cookie').split(';')[0];return {db,env,cookie,credential};}
export function empty(){return {version:3,company:{name:'GRUPO H'},lots:[],clients:[],sales:[],payments:[]};}
function request(f,method='GET',payload){return onRequest({env:f.env,request:new Request('https://test/api/app/state',{method,headers:{Cookie:f.cookie,Origin:'https://test',...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined})});}
const put=(f,state,revision=0,mutation=crypto.randomUUID())=>request(f,'PUT',{state,revision,mutation});
test('2000 clientes y todos los módulos se recuperan de D1; guardado incremental, historial, reintento y conflicto',async()=>{
 const f=await fixture(),s=empty();s.clients=Array.from({length:2000},(_,i)=>({id:'C'+i,name:'CLIENTE FICTICIO '+i,address:'DIRECCIÓN DE PRUEBA',identity:'TEST'+i}));
 s.lots=[{id:'L1',area:250,price:100000,status:'sold',dimensions:{front:10,depth:25}}];s.sales=[{id:'V1',lotId:'L1',clientId:'C1',price:100000,downPayment:10000,months:36,type:'credit',date:'2026-11-17'}];s.payments=[{id:'P1',saleId:'V1',amount:500,date:'2026-11-17'}];s.reservations=[{id:'A1',status:'cancelled'}];s.cashEntries=[{id:'G1',amount:80}];s.contracts=[{id:'D1',text:'Documento de prueba'}];s.residences=[{id:'R1',image:'x'.repeat(150000)}];s.settings={enabled:true};
 assert.deepEqual(decode(encode(s)),s);
 const mutation=crypto.randomUUID();assert.equal((await put(f,s,0,mutation)).status,200);assert.deepEqual((await (await request(f)).json()).state,s);
 assert.equal((await put(f,s,0,mutation)).status,200);assert.equal(f.db.db.prepare('SELECT revision FROM app_meta').get().revision,1);
 const next=structuredClone(s);next.clients[0].name='ACTUALIZADO';next.payments.push({id:'P2',saleId:'V1',amount:1000,date:'2026-11-18'});
 assert.equal((await put(f,next,1)).status,200);assert.deepEqual((await (await request(f)).json()).state,next);assert.ok(f.db.db.prepare('SELECT count(*) n FROM app_history').get().n>0);
 assert.equal((await put(f,s,1)).status,409);assert.deepEqual((await (await request(f)).json()).state,next);
});
test('rechaza sesiones, roles, origen, JSON inválido, referencias corruptas y cargas excesivas sin modificar datos',async()=>{
 const f=await fixture();assert.equal((await onRequest({env:f.env,request:new Request('https://test/api/app/state')})).status,401);
 assert.equal((await onRequest({env:f.env,request:new Request('https://test/api/app/state',{headers:{Cookie:f.cookie,Origin:'https://evil'}})})).status,403);
 f.db.db.prepare("UPDATE users SET role='sales'").run();assert.equal((await request(f)).status,403);f.db.db.prepare("UPDATE users SET role='admin'").run();
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
