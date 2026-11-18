import {json} from './app/shared.js';

const invalid=()=>json({estado:'no_encontrado',mensaje:'Este código no corresponde a un recibo registrado y sincronizado.'},404,{'X-Content-Type-Options':'nosniff'});
const moneyCents=value=>Number.isFinite(Number(value))?Math.round(Number(value)*100):NaN;
const safeText=(value,max=100)=>String(value??'').slice(0,max);

/**
 * Verificación pública de recibos mediante clave aleatoria de 128 bits.
 * Nunca confía en los datos del QR: se consultan los registros actuales de D1.
 * No devuelve nombre, identidad, contacto, saldos, ni expedientes de clientes.
 */
export async function onRequest({request,env}){
 if(request.method!=='GET')return json({error:'Método no permitido.'},405);
 const token=new URL(request.url).searchParams.get('token')||'';
 if(!/^[a-f0-9]{32}$/.test(token))return invalid();
 const db=env.LOTIGEST_DB;
 if(!db)return json({estado:'no_disponible',mensaje:'La verificación en línea no está disponible.'},503);
 try{
  const hits=await db.prepare(`SELECT key FROM app_records
     WHERE (CASE WHEN json_valid(key) THEN json_extract(key,'$[0]') ELSE '' END) IN ('payments','ownerPayments')
       AND instr(payload,?)>0 LIMIT 30`).bind(token).all();
  const candidates=new Map();
  for(const hit of hits.results||[]){
   let kind,index;try{[kind,index]=JSON.parse(hit.key);}catch{continue;}
   if(!['payments','ownerPayments'].includes(kind)||!Number.isSafeInteger(index)||index<0)continue;
   candidates.set(kind+':'+index,{kind,index});
  }
  const found=[];
  for(const {kind,index} of candidates.values()){
   const parts=await db.prepare(`SELECT payload FROM app_records
     WHERE (CASE WHEN json_valid(key) THEN json_extract(key,'$[0]') ELSE '' END)=? AND (CASE WHEN json_valid(key) THEN json_extract(key,'$[1]') ELSE -1 END)=?
     ORDER BY CAST(json_extract(key,'$[2]') AS INTEGER)`).bind(kind,index).all();
   let row;
   try{row=JSON.parse((parts.results||[]).map(r=>r.payload).join(''));}catch{continue;}
   if(row?.verifyToken===token)found.push({kind,row});
  }
  if(!found.length)return invalid();
  const kind=found[0].kind;
  if(found.some(p=>p.kind!==kind))return json({estado:'inconsistente',mensaje:'Este comprobante necesita revisión administrativa.'},409);
  const rows=found.map(x=>x.row),first=rows[0];
  if(kind==='payments'&&rows.some(p=>(p.groupId||p.id)!==(first.groupId||first.id)))
   return json({estado:'inconsistente',mensaje:'El comprobante agrupado necesita revisión.'},409);
  if(kind==='ownerPayments'&&rows.length!==1)
   return json({estado:'inconsistente',mensaje:'El comprobante necesita revisión.'},409);
  const cents=rows.reduce((sum,p)=>sum+(kind==='payments'?moneyCents(p.amount):Number(p.amountCents)),0);
  if(!Number.isSafeInteger(cents)||cents<=0)
   return json({estado:'inconsistente',mensaje:'El importe del comprobante necesita revisión.'},409);
  const annulled=rows.some(p=>p.voidedAt||p.cancelledAt||p.deletedAt||p.anulado===true||p.status==='voided'||p.status==='cancelled');
  return json({
   estado:annulled?'anulado':'vigente',
   folio:safeText(kind==='payments'?(first.groupId||first.id):first.id,100),
   fecha:safeText(first.date,10),
   montoCentavos:cents,moneda:'HNL',
   tipo:kind==='payments'?'Abono de venta':'Abono de propietario',
   cantidadRegistros:rows.length,
   mensaje:annulled?'Este recibo está anulado.':'Recibo registrado en LOTIGEST. Verifica que fecha y monto coincidan con tu comprobante.'
  },200,{'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 }catch(e){
  console.error('receipt_verify_error',e?.name||'Error');
  return json({estado:'no_disponible',mensaje:'No fue posible consultar D1. Inténtalo nuevamente.'},503);
 }
}
