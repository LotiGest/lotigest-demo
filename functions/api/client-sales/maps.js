import {json,actor,failure} from '../app/shared.js';
import {tables,randomId,stamp,clean,validMapLot,jsonBody,findMap} from './_shared.js';

export async function onRequest({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base D1 no disponible'},503);
 try{
  await tables(db);
  if(request.method==='GET'){
   const token=new URL(request.url).searchParams.get('token');
   const map=await findMap(db,token);
   if(!map)return json({error:'Enlace de croquis no disponible o caducado.'},404);
   return json({map:{token:map.token,residenceId:map.residenceId,title:map.title,viewBox:map.viewBox,roads:map.roads,lots:map.lots,updatedAt:map.updatedAt}});
  }
  if(request.method!=='POST')return json({error:'Método no permitido'},405);
  const who=await actor(request,db);
  if(!who)return json({error:'Inicia sesión en LOTIGEST para compartir el croquis.'},401);
  if(!['admin','sales'].includes(who.role))return json({error:'Acceso no autorizado.'},403);
  const data=await jsonBody(request,1400000),title=clean(data.title,120),residenceId=clean(data.residenceId,80);
  if(!title||!residenceId||!Array.isArray(data.lots)||data.lots.length===0||data.lots.length>1500)
   return json({error:'Croquis sin solares válidos.'},400);
  const lots=data.lots.map(validMapLot);
  if(lots.some(x=>!x)||new Set(lots.map(x=>x.id)).size!==lots.length)
   return json({error:'El croquis tiene solares repetidos o geometría inválida.'},400);
  const bounds=Array.isArray(data.viewBox)&&data.viewBox.length===4&&data.viewBox.every(n=>Number.isFinite(Number(n)))?
   data.viewBox.map(Number):[0,0,700,500];
  const roads=Array.isArray(data.roads)?data.roads.slice(0,300).filter(r=>r&&Array.isArray(r.points)&&r.points.length<=100)
   .map(r=>({points:r.points.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)).map(p=>p.map(Number))})).filter(r=>r.points.length>=2):[];
  const old=await db.prepare('SELECT token FROM public_solar_maps WHERE residence_id=?').bind(residenceId).first();
  const token=old?.token||randomId(),now=stamp();
  // No publicar precios, identidad, nombres de compradores ni detalles de cobranza.
  await db.prepare('INSERT INTO public_solar_maps(token,residence_id,title,content,updated_at,expires_at) VALUES(?,?,?,?,?,?) ON CONFLICT(residence_id) DO UPDATE SET title=excluded.title,content=excluded.content,updated_at=excluded.updated_at,expires_at=excluded.expires_at')
   .bind(token,residenceId,title,JSON.stringify({viewBox:bounds,roads,lots}),now,Date.now()+90*86400000).run();
  return json({path:'/elegir-solar.html?map='+token,token,updatedAt:now});
 }catch(e){return failure(e);}
}
