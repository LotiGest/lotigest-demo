import {json,actor,failure} from '../../app/shared.js';
import {tables,jsonBody,stamp,moneyCents} from '../_shared.js';
export async function onRequest({request,env,params}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base D1 no disponible.'},503);
 try{
  if(request.method!=='PATCH')return json({error:'Método no permitido.'},405);
  const user=await actor(request,db);if(!user)return json({error:'Inicia sesión para atender la solicitud.'},401);
  const id=String(params.id||'');
  if(!/^CS-[a-f0-9]{40}$/.test(id))return json({error:'Solicitud inválida'},400);
  await tables(db);
  const previous=await db.prepare('SELECT id,status FROM public_solar_requests WHERE id=?').bind(id).first();
  if(!previous)return json({error:'Solicitud no encontrada.'},404);
  const data=await jsonBody(request,5000),status=data.status;
  if(!['quoted','approved','rejected'].includes(status))return json({error:'Estado no válido.'},400);
  let quote=null;
  if(status==='quoted'){
   const q=data.quote||{},price=Number(q.price),down=Number(q.down),
    years=Number(q.years),minimumYears=Number(q.minimumYears||1),rate=Number(q.rate);
   const months=years*12;
   if(!Number.isSafeInteger(moneyCents(price))||price<=50000||
      !Number.isSafeInteger(moneyCents(down))||down<50000||down>=price||
      !Number.isInteger(years)||years<1||years>30||
      !Number.isInteger(minimumYears)||minimumYears<1||minimumYears>years||rate!==0)
    return json({error:'Revisa precio, prima mínima L 50,000, años autorizados (1–30) e interés obligatorio del 0 %.'},400);
   const monthly=Math.round((moneyCents(price)-moneyCents(down))/months)/100;
   quote={price,down,years,months,minimumYears,rate:0,principal:price-down,monthly,
    total:price,quotedBy:user.name,quotedAt:stamp()};
  }
  await db.prepare('UPDATE public_solar_requests SET status=?,quote_json=COALESCE(?,quote_json),quoted_by=COALESCE(?,quoted_by),updated_at=? WHERE id=?')
   .bind(status,quote?JSON.stringify(quote):null,quote?user.name:null,stamp(),id).run();
  return json({ok:true,status,quote,quotedBy:quote?user.name:null});
 }catch(e){return failure(e);}
}
