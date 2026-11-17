import {json,hash,sameOrigin,actor,failure} from './shared.js';
export async function onRequest({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base no disponible.'},503);
 if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
 try{
  const user=await actor(request,db);if(!user)return json({error:'Inicia sesión.'},401);if(user.role!=='admin')return json({error:'Acceso restringido.'},403);
  const key=new URL(request.url).searchParams.get('key');if(!key||!/^[A-Za-z0-9_-]{1,180}$/.test(key))return json({error:'Documento inválido.'},400);
  if(request.method==='GET'){
   const meta=await db.prepare('SELECT size FROM app_files WHERE key=?').bind(key).first();if(!meta)return json({error:'Documento no encontrado en D1. La copia antigua puede estar en el equipo donde se cargó.'},404);
   const {results}=await db.prepare('SELECT data FROM app_file_chunks WHERE key=? ORDER BY n').bind(key).all();
   const bytes=new Uint8Array(meta.size);let offset=0;for(const row of results){const s=atob(row.data);for(let i=0;i<s.length;i++)bytes[offset++]=s.charCodeAt(i);}if(offset!==meta.size)throw Error('incomplete file');
   return new Response(bytes,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':'attachment; filename="plano.pdf"','X-Content-Type-Options':'nosniff'}});
  }
  if(request.method==='DELETE'){await db.prepare('UPDATE app_files SET archived_at=? WHERE key=?').bind(new Date().toISOString(),key).run();return json({ok:true});}
  if(request.method!=='PUT')return json({error:'Método no permitido.'},405);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/pdf')return json({error:'Selecciona un PDF.'},415);
  const reader=request.body?.getReader();if(!reader)return json({error:'Documento vacío.'},400);
  const parts=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();return json({error:'El PDF supera 8 MB. Reduce su tamaño antes de adjuntarlo.'},413);}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))return json({error:'PDF inválido.'},400);
  // Hash the base64 stream for immutable, idempotent document keys.
  const chunks=[];for(let start=0;start<bytes.length;start+=32768){let text='';for(const b of bytes.slice(start,start+32768))text+=String.fromCharCode(b);chunks.push({n:chunks.length,data:btoa(text)});}
  const digest=await hash(chunks.map(c=>c.data).join('')),existing=await db.prepare('SELECT digest FROM app_files WHERE key=?').bind(key).first();
  if(existing)return existing.digest===digest?json({key,size}):json({error:'Ya existe otro documento con ese código.'},409);
  const queries=[db.prepare('INSERT OR IGNORE INTO app_files(key,digest,size,created_at) VALUES(?,?,?,?)').bind(key,digest,size,new Date().toISOString())];
  for(let i=0;i<chunks.length;i+=10)queries.push(db.prepare(`INSERT OR IGNORE INTO app_file_chunks(key,n,data) SELECT ?,json_extract(value,'$.n'),json_extract(value,'$.data') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM app_files WHERE key=? AND digest=?)`).bind(key,JSON.stringify(chunks.slice(i,i+10)),key,digest));
  const result=await db.batch(queries);if(!result[0].meta.changes)return json({error:'Documento registrado simultáneamente. Reintenta.'},409);
  return json({key,size},201);
 }catch(e){return failure(e);}
}
