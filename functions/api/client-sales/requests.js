import {json,actor,failure,hash} from '../app/shared.js';
import {tables,stamp,clean,randomId,jsonBody,findMap,withoutSecrets} from './_shared.js';

export async function onRequest({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base D1 no disponible.'},503);
 try{
  await tables(db);
  if(request.method==='GET'){
   const who=await actor(request,db);if(!who)return json({error:'Acceso administrativo requerido.'},401);
   const rows=await db.prepare('SELECT * FROM public_solar_requests ORDER BY created_at DESC LIMIT 250').all();
   return json({requests:(rows.results||[]).map(withoutSecrets)});
  }
  if(request.method!=='POST')return json({error:'Método no permitido.'},405);
  const input=await jsonBody(request,4000);
  const map=await findMap(db,clean(input.mapToken,40));
  if(!map)return json({error:'El croquis ya no está disponible. Solicita un nuevo enlace.'},404);
  const lot=map.lots.find(l=>l.id===input.lotId);
  if(!lot||!lot.available)return json({error:'Este solar ya no aparece disponible. Consulta otro solar.'},409);
  const name=clean(input.name,120),phone=clean(input.phone,30).replace(/[^\d+ ]/g,'');
  const years=Number(input.years),paymentDate=clean(input.paymentDate,10),mode='credit';
  const note=clean(input.note,300);
  if(name.length<4||!/^[+()\d -]{8,20}$/.test(phone)||!Number.isInteger(years)||years<1||years>30)
   return json({error:'Escribe nombre, teléfono y años solicitados (1 a 30).'},400);
  const day=new Date().toISOString().slice(0,10);
  const requesterHash=await hash(map.token+':'+day+':'+(request.headers.get('CF-Connecting-IP')||'local'));
  const count=await db.prepare('SELECT COUNT(*) n FROM public_solar_requests WHERE requester_hash=? AND created_at>?')
   .bind(requesterHash,day+'T00:00:00.000Z').first();
  if(Number(count?.n||0)>=5)return json({error:'Ya se recibieron varias solicitudes. Contacta a la oficina para continuar.'},429);
  const now=stamp(),id='CS-'+randomId(),client={name,phone,mode,years,proposedDownPayment:50000,
   paymentDate:/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)?paymentDate:day,note};
  const summary={id:lot.id,block:lot.block,number:lot.number,stage:lot.stage,area:lot.area,kind:lot.kind};
  await db.prepare('INSERT INTO public_solar_requests(id,map_token,residence_id,lot_id,client_json,lot_json,title,status,quote_json,quoted_by,created_at,updated_at,requester_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(id,map.token,map.residenceId,lot.id,JSON.stringify(client),JSON.stringify(summary),map.title,'pending',null,null,now,now,requesterHash).run();
  return json({ok:true,requestId:id,message:'Tu solicitud fue enviada. El administrador revisará el terreno y te enviará una cotización.'},201);
 }catch(e){return failure(e);}
}
