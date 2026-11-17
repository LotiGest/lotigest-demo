import {json,hash,sameOrigin,actor,body,failure} from './shared.js';
const limit=4*1024*1024;
const invalid=message=>{throw Object.assign(Error(message),{status:400});};
export function validate(state){
 if(!state||Array.isArray(state)||state.version!==3||!state.company||typeof state.company!=='object'||Array.isArray(state.company))invalid('Formato incompatible.');
 for(const key of Object.keys(state))if(!/^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(key)||['__proto__','constructor','prototype'].includes(key))invalid('Campo incompatible.');
 for(const key of ['lots','clients','sales','payments']){
  if(!Array.isArray(state[key])||state[key].length>100000)invalid('Colección incompatible: '+key);
  const ids=new Set();for(const row of state[key]){if(!row||typeof row.id!=='string'||!row.id||row.id.length>150||ids.has(row.id))invalid('Código duplicado o inválido en '+key);ids.add(row.id);}
 }
 const lots=new Set(state.lots.map(r=>r.id)),clients=new Set(state.clients.map(r=>r.id)),sales=new Set(state.sales.map(r=>r.id));
 for(const s of state.sales){if(!lots.has(s.lotId)||!clients.has(s.clientId)||!Number.isFinite(s.price)||s.price<0)invalid('Venta sin terreno, cliente o precio válido.');}
 for(const p of state.payments){if(!sales.has(p.saleId)||!Number.isFinite(p.amount)||p.amount<0)invalid('Abono sin venta o monto válido.');}
}
export function encode(state){
 const entries=[],shape={};
 const add=(key,index,value)=>{const raw=JSON.stringify(value);for(let n=0;n<raw.length;n+=32768)entries.push({key:JSON.stringify([key,index,n/32768]),payload:raw.slice(n,n+32768)});};
 for(const [key,value] of Object.entries(state)){shape[key]=Array.isArray(value)?value.length:-1;if(Array.isArray(value))value.forEach((row,i)=>add(key,i,row));else add(key,-1,value);}
 entries.push({key:'$shape',payload:JSON.stringify(shape)});return entries;
}
export function decode(rows){
 if(!rows.length)return null;const shape=JSON.parse(rows.find(r=>r.key==='$shape').payload),parts=new Map(),result={};
 for(const r of rows){if(r.key==='$shape')continue;const [key,index,n]=JSON.parse(r.key),id=JSON.stringify([key,index]);if(!parts.has(id))parts.set(id,[]);parts.get(id)[n]=r.payload;}
 for(const [key,length] of Object.entries(shape)){const read=i=>JSON.parse(parts.get(JSON.stringify([key,i])).join(''));result[key]=length<0?read(-1):Array.from({length},(_,i)=>read(i));}return result;
}
async function snapshot(db){const [meta,records]=await db.batch([db.prepare('SELECT revision FROM app_meta WHERE id=1'),db.prepare('SELECT key,payload FROM app_records ORDER BY key')]);return {revision:meta.results[0].revision,rows:records.results};}
function packs(rows){const out=[];let part=[],size=0;for(const row of rows){const n=JSON.stringify(row).length;if(size+n>100000&&part.length){out.push(JSON.stringify(part));part=[];size=0;}part.push(row);size+=n;}if(part.length)out.push(JSON.stringify(part));return out;}
export async function onRequest({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base de datos no disponible.'},503);
 if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
 try{
  const user=await actor(request,db);if(!user)return json({error:'La sesión terminó. Vuelve a iniciar sesión; tus cambios se conservan.'},401);
  if(user.role!=='admin')return json({error:'Se requiere una cuenta administradora.'},403);
  if(request.method==='GET'){const s=await snapshot(db);return json({revision:s.revision,state:decode(s.rows),user});}
  if(request.method!=='PUT')return json({error:'Método no permitido.'},405);
  const {state,revision,mutation}=await body(request,limit);
  if(!Number.isSafeInteger(revision)||revision<0||typeof mutation!=='string'||!(/^[a-f0-9-]{36}$/).test(mutation))invalid('Revisión o solicitud inválida.');
  validate(state);const digest=await hash(JSON.stringify(state));
  const prior=await db.prepare('SELECT revision,digest FROM app_mutations WHERE id=?').bind(mutation).first();
  if(prior)return prior.digest===digest?json({revision:prior.revision,mutation}):json({error:'La solicitud ya existe con otros datos.'},409);
  const old=await snapshot(db);if(old.revision!==revision)return json({error:'Otra sesión guardó cambios. Descarga tu respaldo pendiente y vuelve a cargar los datos del servidor antes de continuar.'},409);
  const next=encode(state),previous=new Map(old.rows.map(r=>[r.key,r.payload])),keys=new Set(next.map(r=>r.key));
  const changes=next.filter(r=>previous.get(r.key)!==r.payload),removed=old.rows.filter(r=>!keys.has(r.key)).map(r=>({key:r.key}));
  const affected=[...changes,...removed].filter(r=>previous.has(r.key)).map(r=>({key:r.key,payload:previous.get(r.key)}));
  const up=packs(changes),del=packs(removed),history=packs(affected);
  if(up.length+del.length+history.length>38)return json({error:'La modificación es demasiado grande. Conserva tu respaldo y divide la importación.'},413);
  const updated=new Date().toISOString(),guard='EXISTS(SELECT 1 FROM app_meta WHERE id=1 AND revision=? AND mutation=?)';
  const queries=[db.prepare('UPDATE app_meta SET revision=revision+1,mutation=?,updated_at=? WHERE id=1 AND revision=?').bind(mutation,updated,revision)];
  for(const pack of history)queries.push(db.prepare(`INSERT INTO app_history(revision,key,payload,actor,saved_at) SELECT ?,json_extract(value,'$.key'),json_extract(value,'$.payload'),?,? FROM json_each(?) WHERE ${guard}`).bind(revision+1,user.name,updated,pack,revision+1,mutation));
  for(const pack of del)queries.push(db.prepare(`DELETE FROM app_records WHERE key IN (SELECT json_extract(value,'$.key') FROM json_each(?)) AND ${guard}`).bind(pack,revision+1,mutation));
  for(const pack of up)queries.push(db.prepare(`INSERT INTO app_records(key,payload) SELECT json_extract(value,'$.key'),json_extract(value,'$.payload') FROM json_each(?) WHERE ${guard} ON CONFLICT(key) DO UPDATE SET payload=excluded.payload`).bind(pack,revision+1,mutation));
  queries.push(db.prepare(`INSERT INTO app_mutations(id,revision,digest,actor,created_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(mutation,revision+1,digest,user.name,updated,revision+1,mutation));
  const result=await db.batch(queries);
  if(!result[0].meta.changes)return json({error:'Otra sesión guardó cambios. Conserva tu respaldo y recarga.'},409);
  return json({revision:revision+1,mutation});
 }catch(e){return failure(e);}
}
