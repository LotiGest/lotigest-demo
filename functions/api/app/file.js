import {Buffer} from 'node:buffer';
import {decode} from './state.js';
import {json,hash,sameOrigin,actor,failure} from './shared.js';
export async function onRequest({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base no disponible.'},503);
 if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
 try{
  const user=await actor(request,db);if(!user)return json({error:'Inicia sesión.'},401);if(user.role!=='admin'&&(user.role!=='sales'||request.method!=='GET'))return json({error:'Acceso restringido.'},403);
  const key=new URL(request.url).searchParams.get('key');if(!key||!/^[A-Za-z0-9_-]{1,180}$/.test(key))return json({error:'Documento inválido.'},400);
  if(request.method==='GET'){
   if(user.role==='sales'){const rows=await db.prepare('SELECT key,payload FROM app_records ORDER BY key').all();const state=decode(rows.results);if(!state?.residences?.some(r=>r.pdf?.key===key||r.officialPlan?.backgroundKey===key))return json({error:'Documento fuera del catálogo autorizado.'},403);}
   const meta=await db.prepare('SELECT size,mime FROM app_files WHERE key=?').bind(key).first();if(!meta)return json({error:'Documento no encontrado en D1. La copia antigua puede estar en el equipo donde se cargó.'},404);
   const {results}=await db.prepare('SELECT data FROM app_file_chunks WHERE key=? ORDER BY n').bind(key).all();
   const parts=results.map(row=>Buffer.from(row.data,'base64'));const size=parts.reduce((n,b)=>n+b.length,0);if(size!==meta.size)throw Error('incomplete file');const bytes=Buffer.concat(parts,size);
   return new Response(bytes,{headers:{'Content-Type':meta.mime||'application/pdf','Cache-Control':'no-store','Content-Disposition':meta.mime==='application/pdf'?'attachment; filename="plano.pdf"':'inline','X-Content-Type-Options':'nosniff'}});
  }
  if(request.method==='DELETE'){await db.prepare('UPDATE app_files SET archived_at=? WHERE key=?').bind(new Date().toISOString(),key).run();return json({ok:true});}
  if(request.method!=='PUT')return json({error:'Método no permitido.'},405);
  const mime=request.headers.get('Content-Type')?.split(';')[0];if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))return json({error:'Selecciona un PDF o una vista de plano PNG/JPG/WebP.'},415);
  const reader=request.body?.getReader();if(!reader)return json({error:'Documento vacío.'},400);
  const parts=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024){await reader.cancel();return json({error:'El PDF supera 12 MB. Reduce su tamaño antes de adjuntarlo.'},413);}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const valid=mime==='application/pdf'?new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'):mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';if(!valid)return json({error:'El documento no coincide con su formato.'},400);
  // Hash the base64 stream for immutable, idempotent document keys.
  const chunks=[];for(let start=0;start<bytes.length;start+=32768){chunks.push({n:chunks.length,data:Buffer.from(bytes.buffer,bytes.byteOffset+start,Math.min(32768,bytes.length-start)).toString('base64')});}
  const digest=await hash(chunks.map(c=>c.data).join('')),existing=await db.prepare('SELECT digest FROM app_files WHERE key=?').bind(key).first();
  if(existing)return existing.digest===digest?json({key,size}):json({error:'Ya existe otro documento con ese código.'},409);
  const queries=[db.prepare('INSERT OR IGNORE INTO app_files(key,digest,size,created_at,mime) VALUES(?,?,?,?,?)').bind(key,digest,size,new Date().toISOString(),mime)];
  for(let i=0;i<chunks.length;i+=20)queries.push(db.prepare(`INSERT OR IGNORE INTO app_file_chunks(key,n,data) SELECT ?,json_extract(value,'$.n'),json_extract(value,'$.data') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM app_files WHERE key=? AND digest=?)`).bind(key,JSON.stringify(chunks.slice(i,i+20)),key,digest));
  const result=await db.batch(queries);if(!result[0].meta.changes)return json({error:'Documento registrado simultáneamente. Reintenta.'},409);
  return json({key,size},201);
 }catch(e){return failure(e);}
}
