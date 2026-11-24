import {json,sameOrigin,actor,body,failure} from './shared.js';
// A short-lived confirmation code shared only by sessions of the same administrator.
export async function onRequest({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base no disponible.'},503);
 if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
 try{
  const user=await actor(request,db);
  if(!user||user.role!=='admin')return json({error:'Se requiere administrador.'},403);
  if(!['GET','POST'].includes(request.method))return json({error:'Método no permitido.'},405);
  await db.prepare('CREATE TABLE IF NOT EXISTS app_admin_confirm_pin (username TEXT PRIMARY KEY, pin TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)').run();
  const now=Date.now();
  if(request.method==='GET'){
   let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294960000);
   const code=String(n%10000).padStart(4,'0');
   const row=await db.prepare(`INSERT INTO app_admin_confirm_pin(username,pin,expires,attempts) VALUES(?,?,?,0)
    ON CONFLICT(username) DO UPDATE SET pin=CASE WHEN expires<=? THEN excluded.pin ELSE pin END,
    attempts=CASE WHEN expires<=? THEN 0 ELSE attempts END,
    expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END
    RETURNING pin,expires,attempts`).bind(user.name,code,now+120000,now,now,now).first();
   if(row.attempts>=5)return json({error:'Demasiados intentos. Espera a que venza el PIN.'},429);
   return json({pin:row.pin,expires:row.expires});
  }
  const {pin}=await body(request,256);
  if(typeof pin!=='string'||!/^\d{4}$/.test(pin))return json({error:'Introduce los cuatro dígitos del PIN.'},400);
  // Atomic consume: two concurrent requests cannot reuse the same code.
  const accepted=await db.prepare('DELETE FROM app_admin_confirm_pin WHERE username=? AND pin=? AND expires>? AND attempts<5 RETURNING username').bind(user.name,pin,now).first();
  if(accepted)return json({ok:true});
  await db.prepare('UPDATE app_admin_confirm_pin SET attempts=attempts+1 WHERE username=? AND expires>? AND attempts<5').bind(user.name,now).run();
  return json({error:'PIN incorrecto, usado o vencido. Consulta el PIN actualizado en Contratos desde el celular.'},403);
 }catch(e){return failure(e);}
}
