import {json,sameOrigin,actor,body,failure} from './shared.js';
export async function onRequest({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base no disponible.'},503);if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
 try{const user=await actor(request,db);if(!user)return json({error:'Inicia sesión.'},401);if(user.role!=='admin')return json({error:'Solo un administrador puede gestionar cuentas.'},403);
 if(request.method==='GET'){const {results}=await db.prepare('SELECT name,role FROM users ORDER BY name LIMIT 100').all();return json({users:results});}
 if(request.method!=='POST')return json({error:'Método no permitido.'},405);
 const {name,role,salt,token_hash}=await body(request,2048);if(typeof name!=='string'||!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(name)||!['admin','sales'].includes(role)||![salt,token_hash].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))return json({error:'Revisa el usuario, la contraseña y el perfil.'},400);
 const [created]=await db.batch([db.prepare('INSERT INTO users(name,role,token_hash) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(name,role,token_hash),db.prepare('INSERT INTO d1_user_passwords(name,salt) SELECT ?,? WHERE changes()=1').bind(name,salt)]);return created.meta.changes?json({name,role},201):json({error:'El usuario ya existe.'},409);
 }catch(e){return failure(e);}
}
