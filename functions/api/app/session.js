import {json,hash,sameOrigin,actor,body,failure} from './shared.js';
const cookie=value=>'lotigest_session='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+(value?43200:0);
export async function onRequest({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base de datos no disponible.'},503);
 if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
 try{
  if(request.method==='GET'){const user=await actor(request,db);return user?json({user}):json({error:'Inicia sesión.'},401);}
  if(request.method==='DELETE'){
   const token=/(?:^|;\s*)lotigest_session=([a-f0-9]{64})/.exec(request.headers.get('Cookie')||'')?.[1];
   if(token)await db.prepare('DELETE FROM app_sessions WHERE hash=?').bind(await hash(token)).run();
   return json({ok:true},200,{'Set-Cookie':cookie('')});
  }
  if(request.method!=='POST')return json({error:'Método no permitido.'},405);
  const {credential}=await body(request,1024);
  if(typeof credential!=='string'||!/^[a-f0-9]{64}$/.test(credential))return json({error:'Credenciales incorrectas.'},401);
  const user=await db.prepare('SELECT name,role FROM users WHERE token_hash=?').bind(await hash(credential)).first();
  if(!user)return json({error:'Credenciales incorrectas.'},401);
  if(user.role!=='admin')return json({error:'El panel integrado requiere una cuenta administradora.'},403);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  await db.batch([db.prepare('DELETE FROM app_sessions WHERE expires<?').bind(Date.now()),db.prepare('INSERT INTO app_sessions(hash,username,expires) VALUES(?,?,?)').bind(await hash(token),user.name,Date.now()+43200000)]);
  return json({user},200,{'Set-Cookie':cookie(token)});
 }catch(e){return failure(e);}
}
