import {decode} from '../app/state.js';
import {correctConfirmedBlocks} from '../app/block-corrections.js';
import {json,actor,sameOrigin,body,failure,hash} from '../app/shared.js';

const err=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const clean=(v,max)=>String(v??'').trim().slice(0,max);
const isMoney=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isSafeInteger(Math.round(v*100))&&Math.abs(v*100-Math.round(v*100))<.00001;
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(+new Date(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function publicMapSlug(){return Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>x.toString(16).padStart(2,'0')).join('');}
export async function currentState(db){
 const rows=await db.prepare('SELECT key,payload FROM app_records ORDER BY key').all();
 return rows.results.length?correctConfirmedBlocks(decode(rows.results)):null;
}
export async function adminOnly(request,db){
 if(!sameOrigin(request))err('Origen no permitido.',403);
 const user=await actor(request,db);
 if(!user)err('Inicia sesión en LOTIGEST.',401);
 if(user.role!=='admin')err('Solo los administradores gestionan mapas públicos.',403);
 return user;
}
const validPoints=points=>Array.isArray(points)&&points.length>=3&&points.length<=250&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<100000));
export function publicStatus(state,lot){
 if(!lot||lot.type==='private'||lot.status==='private')return null;
 const sales=state.sales||[],res=state.reservations||[],records=state.ownershipStatements||[];
 if(sales.some(s=>s.lotId===lot.id)||lot.status==='sold'||lot.ownerClientId||records.some(s=>(s.references||[]).some(r=>r.lotId===lot.id)))return 'sold';
 if(lot.status!=='available'||res.some(r=>r.lotId===lot.id&&r.status==='active')||lot.historyRequiresReview)return 'reserved';
 return 'available';
}
export function sanitizedMap(state,map,geometry){
 const residence=(state.residences||[]).find(r=>r.id===map.residence_id&&!r.hidden);
 if(!residence)return null;
 const used=new Set();
 const lots=(geometry.lots||[]).flatMap(publicShape=>{
   const lot=(state.lots||[]).find(l=>l.id===publicShape.id&&l.residenceId===residence.id);
   if(!lot||used.has(lot.id))return [];
   used.add(lot.id);
   const status=publicStatus(state,lot);
   if(!status)return [];
   return [{
    id:lot.id,stage:lot.stage||null,block:String(lot.block||''),number:String(lot.sourceNumber||''),
    kind:lot.type==='commercial'?'commercial':'solar',
    area:typeof lot.area==='number'&&lot.area>0?lot.area:null,
    dimensions:Object.fromEntries(['front','depth','left','right'].filter(k=>Number(lot.dimensions?.[k])>0).map(k=>[k,lot.dimensions[k]])),
    points:publicShape.points,status
   }];
 });
 return {slug:map.slug,title:residence.name,viewBox:geometry.viewBox,roads:geometry.roads,lots,updatedAt:map.published_at};
}
export function validatedGeometry(state,residenceId,input){
 const residence=state?.residences?.find(r=>r.id===residenceId&&!r.hidden);
 if(!residence)err('La residencial seleccionada no existe.');
 if(!input||!Array.isArray(input.lots)||input.lots.length>3000)err('El mapa no tiene una lista válida de solares.');
 const viewBox=input.viewBox;
 if(!Array.isArray(viewBox)||viewBox.length!==4||viewBox.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>100000)||viewBox[2]<=0||viewBox[3]<=0)err('El dibujo del mapa no tiene medidas válidas.');
 const used=new Set(),lots=[];
 for(const item of input.lots){
  if(!item||typeof item.id!=='string'||used.has(item.id)||!validPoints(item.points))continue;
  const lot=state.lots.find(l=>l.id===item.id&&l.residenceId===residenceId);
  if(!lot||!publicStatus(state,lot))continue;
  used.add(lot.id);
  lots.push({id:lot.id,points:item.points});
 }
 if(!lots.length)err('No hay solares del inventario vinculados con el dibujo. Revisa el croquis.');
 const roads=Array.isArray(input.roads)?input.roads.slice(0,100).filter(r=>r&&validPoints(r.points)).map(r=>({points:r.points})):[];
 const geometry={viewBox,roads,lots};
 if(JSON.stringify(geometry).length>600000)err('El plano público supera el tamaño admitido.',413);
 return geometry;
}
export async function publishMap({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Sin base de datos.'},503);
 try{
  if(request.method!=='POST')return json({error:'Método no permitido.'},405);
  const user=await adminOnly(request,db);
  const input=await body(request,850000);
  const residenceId=clean(input.residenceId,150);
  const state=await currentState(db);
  if(!state)err('El inventario de LOTIGEST está vacío.');
  const geometry=validatedGeometry(state,residenceId,input);
  const previous=await db.prepare('SELECT slug FROM public_lot_maps WHERE residence_id=?').bind(residenceId).first();
  const slug=previous?.slug||publicMapSlug(),time=new Date().toISOString(),title=clean(state.residences.find(r=>r.id===residenceId).name,120);
  await db.prepare('INSERT INTO public_lot_maps(residence_id,slug,title,geometry_json,published_by,published_at) VALUES(?,?,?,?,?,?) ON CONFLICT(residence_id) DO UPDATE SET title=excluded.title,geometry_json=excluded.geometry_json,published_by=excluded.published_by,published_at=excluded.published_at').bind(residenceId,slug,title,JSON.stringify(geometry),user.name,time).run();
  return json({path:'/seleccionar-solar.html?map='+slug,slug});
 }catch(e){return failure(e);}
}
export async function getPublicMap({request,env,params}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Sin base de datos.'},503);
 try{
  if(request.method!=='GET')return json({error:'Método no permitido.'},405);
  const slug=String(params.slug||'');
  if(!/^[a-f0-9]{24}$/.test(slug))err('Enlace inválido.',404);
  const map=await db.prepare('SELECT * FROM public_lot_maps WHERE slug=?').bind(slug).first();
  if(!map)return json({error:'El mapa no está publicado.'},404);
  const state=await currentState(db);
  const publicData=sanitizedMap(state||{},map,JSON.parse(map.geometry_json));
  return publicData?json({map:publicData}):json({error:'La residencial no está disponible.'},404);
 }catch(e){return failure(e);}
}
export async function postPublicRequest({request,env,params}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Sin base de datos.'},503);
 try{
  if(request.method!=='POST')return json({error:'Método no permitido.'},405);
  if(!sameOrigin(request))err('Origen no permitido.',403);
  const slug=String(params.slug||'');
  if(!/^[a-f0-9]{24}$/.test(slug))err('Enlace inválido.',404);
  const map=await db.prepare('SELECT * FROM public_lot_maps WHERE slug=?').bind(slug).first();
  if(!map)err('El mapa ya no está publicado.',404);
  const input=await body(request,8000);
  const state=await currentState(db);
  const publicData=sanitizedMap(state||{},map,JSON.parse(map.geometry_json));
  // Una sola consulta puede incluir varios solares; nunca registra ventas o apartados.
  // La validación de disponibilidad se repite en el servidor antes de escribir.
  const ids=Array.isArray(input.lotIds)?input.lotIds:[input.lotId];
  if(!ids.length||ids.length>5||ids.some(id=>typeof id!=='string'||id.length>150)||new Set(ids).size!==ids.length)
    err('Elige entre uno y cinco solares diferentes.');
  const solares=ids.map(id=>publicData?.lots.find(l=>l.id===id));
  if(solares.some(l=>!l||l.status!=='available'))err('Uno de los solares seleccionados ya no está disponible. Actualiza el mapa.',409);
  const name=clean(input.name,100),phone=clean(input.phone,40),note=clean(input.note,500),mode=input.mode||'inquiry';
  const proposed=mode==='inquiry'?0:input.proposedDownPayment===undefined?0:Number(input.proposedDownPayment);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tegucigalpa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const paymentDate=mode==='inquiry'?today:input.paymentDate;
  if(name.length<3||!/^[0-9+()\s-]{8,25}$/.test(phone)||!['cash','credit','inquiry'].includes(mode)||!validDate(paymentDate)||!isMoney(proposed))
    err('Escribe tu nombre y un número de WhatsApp válido.');
  if(mode!=='inquiry'){
   if(paymentDate<today||paymentDate>new Date(Date.now()+366*86400000).toISOString().slice(0,10))err('La fecha propuesta debe estar dentro de los próximos doce meses.');
   if(mode==='credit'&&proposed<50000)err('La prima propuesta mínima para crédito es L 50,000.');
   if(mode==='cash'&&proposed!==0)err('En una solicitud de contado no indiques prima.');
  }
  // Las consultas públicas se limitan por IP, no se aceptan múltiples solicitudes ilimitadas.
  const ip=clean(request.headers.get('CF-Connecting-IP')||'sin-ip',80);
  const ipHash=await hash('solares-publicos-v1:'+ip);
  const windowStart=Math.floor(Date.now()/900000)*900000;
  const gate=await db.prepare('INSERT INTO public_lot_request_limits(ip_hash,window_start,attempts) VALUES(?,?,1) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start RETURNING attempts').bind(ipHash,windowStart).first();
  if(gate.attempts>10)err('Demasiadas solicitudes. Inténtalo más tarde.',429);
  const now=new Date().toISOString(),requestIds=solares.map(()=>'SOL-'+crypto.randomUUID());
  const entries=solares.map((solar,i)=>db.prepare('INSERT INTO public_lot_requests(id,slug,residence_id,lot_id,name,phone,mode,proposed_down_payment,payment_date,note,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(requestIds[i],slug,map.residence_id,solar.id,name,phone,mode,proposed,paymentDate,note,'pending',now,now));
  await db.batch(entries);
  return json({ok:true,requestId:requestIds[0],requestIds,count:requestIds.length,message:requestIds.length===1?'Solicitud enviada. El solar todavía no está apartado.':'Solicitudes enviadas. Los solares todavía no están apartados.'},201);
 }catch(e){return failure(e);}
}
export async function listRequests({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Sin base de datos.'},503);
 try{
  if(request.method!=='GET')return json({error:'Método no permitido.'},405);
  await adminOnly(request,db);
  const rows=await db.prepare('SELECT r.*,m.title FROM public_lot_requests r JOIN public_lot_maps m ON m.slug=r.slug ORDER BY r.created_at DESC LIMIT 500').all();
  const state=await currentState(db);
  return json({requests:rows.results.map(row=>{
    const l=state?.lots?.find(l=>l.id===row.lot_id&&l.residenceId===row.residence_id);
    const quote=row.quote_json?JSON.parse(row.quote_json):null;
    return {id:row.id,lotId:row.lot_id,residenceId:row.residence_id,title:row.title,
      lot:l?{block:l.block,number:l.sourceNumber,stage:l.stage,area:l.area,dimensions:l.dimensions}:null,
      client:{name:row.name,phone:row.phone,mode:row.mode,proposedDownPayment:row.proposed_down_payment,paymentDate:row.payment_date,note:row.note},
      status:((state?.reservations||[]).some(r=>r.requestId===row.id&&r.lotId===row.lot_id&&r.status==='active')||(state?.sales||[]).some(r=>r.sourceRequestId===row.id&&r.lotId===row.lot_id))?'approved':row.status,quote,createdAt:row.created_at};
  })});
 }catch(e){return failure(e);}
}
export async function updateRequest({request,env,params}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Sin base de datos.'},503);
 try{
  if(request.method!=='PATCH')return json({error:'Método no permitido.'},405);
  await adminOnly(request,db);
  const id=String(params.id||'');
  if(!/^SOL-[a-f0-9-]{36}$/.test(id))err('Código de solicitud inválido.');
  const input=await body(request,8000);
  const status=input.status;
  if(!['quoted','approved','rejected'].includes(status))err('Estado no permitido.');
  const prior=await db.prepare('SELECT * FROM public_lot_requests WHERE id=?').bind(id).first();
  if(!prior)err('Solicitud no encontrada.',404);
  if(prior.status==='rejected'&&status!=='rejected')err('Esta solicitud fue descartada.',409);
  if(status==='approved'){
   const state=await currentState(db);
   const isReserved=(state?.reservations||[]).some(r=>r.requestId===id&&r.lotId===prior.lot_id&&r.status==='active');
   const isSold=(state?.sales||[]).some(s=>s.sourceRequestId===id&&s.lotId===prior.lot_id);
   if(!isReserved&&!isSold)err('Primero confirma y guarda el apartado o la venta en LOTIGEST.',409);
  }
  let quote=prior.quote_json;
  if(input.quote!==undefined){
   if(status!=='quoted'||!input.quote||typeof input.quote!=='object'||JSON.stringify(input.quote).length>3000)err('Cotización no válida.');
   const q=input.quote;
   if(!isMoney(q.price)||q.price<=0||!isMoney(q.down)||q.down>q.price||!Number.isInteger(q.months)||q.months<0||q.months>360||!Number.isFinite(q.rate)||q.rate<0||q.rate>100)err('Revisa los importes de la cotización.');
   if(q.validUntil!==undefined&&(!validDate(q.validUntil)))err('Vigencia de cotización no válida.');
   if(q.mode!==undefined&&!['cash','credit'].includes(q.mode))err('Tipo de pago no válido.');
   if(q.message!==undefined&&(typeof q.message!=='string'||q.message.length>600))err('Mensaje de cotización no válido.');
   quote=JSON.stringify({mode:q.mode,validUntil:q.validUntil,message:q.message,price:q.price,down:q.down,months:q.months,years:q.years,rate:q.rate,principal:q.principal,monthly:q.monthly,total:q.total});
  }
  await db.prepare('UPDATE public_lot_requests SET status=?,quote_json=?,updated_at=? WHERE id=?').bind(status,quote,new Date().toISOString(),id).run();
  return json({ok:true,status});
 }catch(e){return failure(e);}
}
