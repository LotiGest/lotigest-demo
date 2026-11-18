import {json,actor,sameOrigin,body,failure,hash} from '../app/shared.js';

export async function tables(db){
 await db.prepare('CREATE TABLE IF NOT EXISTS public_solar_maps (token TEXT PRIMARY KEY,residence_id TEXT UNIQUE NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,updated_at TEXT NOT NULL,expires_at INTEGER NOT NULL)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS public_solar_requests (id TEXT PRIMARY KEY,map_token TEXT NOT NULL,residence_id TEXT NOT NULL,lot_id TEXT NOT NULL,client_json TEXT NOT NULL,lot_json TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL,quote_json TEXT,quoted_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,requester_hash TEXT NOT NULL)').run();
}
export const stamp=()=>new Date().toISOString();
export const randomId=()=>Array.from(crypto.getRandomValues(new Uint8Array(20)),b=>b.toString(16).padStart(2,'0')).join('');
export const error=(message,status)=>json({error:message},status);
export const clean=(value,max=100)=>String(value??'').trim().slice(0,max);
export function validMapLot(raw){
 const id=clean(raw?.id,120),number=clean(raw?.number,32),block=clean(raw?.block,50);
 if(!id||!number||!block||!['solar','commercial'].includes(raw?.kind))return null;
 if(!Array.isArray(raw.points)||raw.points.length<3||raw.points.length>30)return null;
 const points=raw.points.map(point=>[Number(point?.[0]),Number(point?.[1])]);
 if(points.some(p=>p.some(v=>!Number.isFinite(v)||Math.abs(v)>50000)))return null;
 const label=Array.isArray(raw.label)&&raw.label.length===2&&raw.label.every(v=>Number.isFinite(Number(v)))?raw.label.map(Number):null;
 const area=Number(raw.area);
 return {id,number,block,kind:raw.kind,stage:clean(raw.stage,12)||null,area:Number.isFinite(area)&&area>0?Math.round(area*100)/100:null,
 points,label,available:raw.available===true};
}
export async function user(request,db){return await actor(request,db);}
export async function jsonBody(request,max=1000000){if(!sameOrigin(request))throw Object.assign(Error('Origen no permitido.'),{status:403});return body(request,max);}
export async function findMap(db,token){
 if(!/^[a-f0-9]{40}$/.test(token||''))return null;
 const map=await db.prepare('SELECT token,residence_id,title,content,updated_at FROM public_solar_maps WHERE token=? AND expires_at>?').bind(token,Date.now()).first();
 if(!map)return null;const content=JSON.parse(map.content);
 return {token:map.token,residenceId:map.residence_id,title:map.title,updatedAt:map.updated_at,...content};
}
export function withoutSecrets(requestRow){
 const client=JSON.parse(requestRow.client_json),lot=JSON.parse(requestRow.lot_json);
 return {id:requestRow.id,residenceId:requestRow.residence_id,lotId:requestRow.lot_id,
   title:requestRow.title,lot,client,status:requestRow.status,
   quote:requestRow.quote_json?JSON.parse(requestRow.quote_json):null,
   quotedBy:requestRow.quoted_by||null,createdAt:requestRow.created_at,updatedAt:requestRow.updated_at};
}
export const moneyCents=x=>Number.isFinite(Number(x))?Math.round(Number(x)*100):NaN;
