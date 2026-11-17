import {json,hash,sameOrigin,actor,body,failure} from './shared.js';
export async function onRequest({request,env}){
 if(request.method!=='PUT')return json({error:'Método no permitido.'},405);
 if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base no disponible.'},503);
 try{
  const user=await actor(request,db);if(!user)return json({error:'Inicia sesión.'},401);
  const {current,salt,token_hash}=await body(request,1024);
  if(![current,salt,token_hash].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))return json({error:'Datos de contraseña inválidos.'},400);
  const oldHash=await hash(current),session=/(?:^|;\s*)lotigest_session=([a-f0-9]{64})/.exec(request.headers.get('Cookie')||'')?.[1];
  const [updated]=await db.batch([
   db.prepare('UPDATE users SET token_hash=? WHERE name=? AND token_hash=?').bind(token_hash,user.name,oldHash),
   db.prepare('UPDATE d1_user_passwords SET salt=? WHERE name=? AND changes()=1').bind(salt,user.name),
   db.prepare('DELETE FROM app_sessions WHERE username=? AND hash<>? AND EXISTS(SELECT 1 FROM users WHERE name=? AND token_hash=?)').bind(user.name,await hash(session),user.name,token_hash)
  ]);
  return updated.meta.changes?json({ok:true}):json({error:'La contraseña actual no coincide.'},401);
 }catch(e){return failure(e);}
}
