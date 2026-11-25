import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test-d1.mjs';
import {hash} from '../../functions/api/app/shared.js';
import {onRequest as session} from '../../functions/api/app/session.js';
import {onRequest as pin} from '../../functions/api/app/admin-pin.js';
async function account(f,name,role,credential){
 f.db.db.prepare('INSERT INTO users VALUES(?,?,?)').run(name,role,await hash(credential));
 f.db.db.prepare('INSERT INTO d1_user_passwords VALUES(?,?)').run(name,'b'.repeat(64));
 const r=await session({env:f.env,request:new Request('https://test/api/app/session',{method:'POST',headers:{Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({credential})})});
 assert.equal(r.status,200);
 return r.headers.get('Set-Cookie').split(';')[0];
}
function call(f,cookie,method='GET',code){
 return pin({env:f.env,request:new Request('https://test/api/app/admin-pin',{method,headers:{Origin:'https://test',Cookie:cookie,'Content-Type':'application/json'},body:method==='POST'?JSON.stringify({pin:code}):undefined})});
}
test('dos cuentas administradoras comparten PIN y vencimiento; un solo uso global',async()=>{
 const f=await fixture(),b=await account(f,'admin2','admin','c'.repeat(64)),c=await account(f,'admin3','admin','d'.repeat(64));
 const replies=await Promise.all([f.cookie,b,c].map(cookie=>call(f,cookie)));
 assert.ok(replies.every(r=>r.status===200));
 const [a,other,third]=await Promise.all(replies.map(r=>r.json()));
 assert.match(a.pin,/^\d{4}$/);assert.deepEqual(other,a);assert.deepEqual(third,a);
 const uses=await Promise.all([f.cookie,b].map(cookie=>call(f,cookie,'POST',a.pin)));
 assert.deepEqual(uses.map(r=>r.status).sort(),[200,403]);
 const fresh=await (await call(f,b)).json();
 assert.notEqual(fresh.pin,a.pin);assert.deepEqual(await (await call(f,c)).json(),fresh);
});
test('no administradores no pueden leer ni confirmar; límite global y renovación',async()=>{
 const f=await fixture(),normal=await account(f,'normal','sales','e'.repeat(64));
 assert.equal((await call(f,normal)).status,403);
 const a=await (await call(f,f.cookie)).json();
 assert.equal((await call(f,normal,'POST',a.pin)).status,403);
 const wrong=a.pin==='0000'?'0001':'0000';
 for(let i=0;i<5;i++)assert.equal((await call(f,f.cookie,'POST',wrong)).status,403);
 assert.equal((await call(f,f.cookie)).status,429);
 assert.equal((await call(f,f.cookie,'POST',a.pin)).status,403);
 f.db.db.prepare('UPDATE app_admin_shared_pin SET expires=0').run();
 const fresh=await (await call(f,f.cookie)).json();assert.notEqual(fresh.pin,a.pin);
 assert.equal((await call(f,f.cookie,'POST',fresh.pin)).status,200);
 assert.equal(f.db.db.prepare('SELECT revision FROM app_meta').get().revision,0);
});
