import {contractOwnerPaymentRows} from '../../../contract-owner-payments.mjs';
import {ensureContractNumbers} from '../../../contract-numbers.mjs';
import {validateNewMonthlyPayments} from '../../../monthly-payment-rules.mjs';
import {validateOwnerPayments,validateNewReceiptCorrelativos} from '../../../owner-payments.mjs';
import {correctConfirmedBlocks} from './block-corrections.js';
import {sellerCatalog} from './catalog.js';
import {json,hash,sameOrigin,actor,body,failure} from './shared.js';
const limit=4*1024*1024;
const invalid=message=>{throw Object.assign(Error(message),{status:400});};
function cents(value,label,min=0){
 if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(value)))invalid(label+' inválido.');
 const n=Number(value),c=Math.round(n*100);if(!Number.isFinite(n)||!Number.isSafeInteger(c)||c<min||Math.abs(n*100-c)>.00001)invalid(label+' debe tener un importe válido y hasta dos decimales.');return c;
}
function date(value,label){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid(label+' inválida.');
 const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value)invalid(label+' inválida.');return value;
}
export function validate(state){
 if(!state||Array.isArray(state)||state.version!==3||!state.company||typeof state.company!=='object'||Array.isArray(state.company))invalid('Formato incompatible.');
 for(const key of Object.keys(state))if(!/^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(key)||['__proto__','constructor','prototype'].includes(key))invalid('Campo incompatible.');
 for(const key of ['lots','clients','sales','payments',...(state.reservations!==undefined?['reservations']:[])]){
  if(!Array.isArray(state[key])||state[key].length>100000)invalid('Colección incompatible: '+key);
  const ids=new Set();for(const row of state[key]){if(!row||typeof row.id!=='string'||!row.id||row.id.length>150||ids.has(row.id))invalid('Código duplicado o inválido en '+key);ids.add(row.id);}
 }
 for(const key of ['cashEntries','contractTexts','residences','historicalPayments','historicalContracts','ledgerImportBatches','ownershipStatements'])if(state[key]!==undefined&&!Array.isArray(state[key]))invalid('Colección incompatible: '+key);
 const lots=new Map(state.lots.map(r=>[r.id,r])),clients=new Set(state.clients.map(r=>r.id)),sales=new Map(state.sales.map(r=>[r.id,r])),saleByLot=new Map(state.sales.map(r=>[r.lotId,r])),sold=new Set(),identities=new Set(),totals=new Map(),prices=new Map();
 for(const c of state.clients){
  if(typeof c.name!=='string'||!c.name.trim()||c.name.length>200)invalid('Nombre de cliente inválido.');
  if(c.identity!=null&&typeof c.identity!=='string')invalid('Identidad inválida.');const identity=(c.identity||'').replace(/[\s-]/g,'').toUpperCase();
  if(identity&&identities.has(identity))invalid('La identidad está registrada en más de un cliente.');if(identity)identities.add(identity);
 }
 for(const s of state.sales){
  if(!lots.has(s.lotId)||!clients.has(s.clientId)||sold.has(s.lotId))invalid('Venta duplicada o sin terreno/cliente válido.');sold.add(s.lotId);
  const price=cents(s.price,'Precio de venta',1),down=cents(s.downPayment??0,'Prima'),opening=cents(s.openingPaid??0,'Saldo inicial abonado');prices.set(s.id,price);totals.set(s.id,opening);
  if(!['cash','credit'].includes(s.type)||down>price||opening>price)invalid('Modalidad o prima de venta inválida.');
  if(s.type==='credit'&&(!Number.isInteger(Number(s.months))||Number(s.months)<1||Number(s.months)>360||down>=price))invalid('Revisa la prima y el plazo del crédito (1 a 360 meses).');
  date(s.date,'Fecha de venta');if(s.firstDueDate&&date(s.firstDueDate,'Primer vencimiento')<s.date)invalid('El primer vencimiento no puede ser anterior a la venta.');
 }
 for(const p of state.payments){
  if(p.contractOwnerView||p.id.startsWith('owner-view:'))invalid('La vista de recibos vinculados no se puede guardar como un pago nuevo.');
  const sale=sales.get(p.saleId);if(!sale)invalid('Abono sin venta válida.');
  if(date(p.date,'Fecha de pago')<sale.date)invalid('El pago no puede ser anterior a la venta.');
  const total=totals.get(p.saleId)+cents(p.amount,'Abono',1);if(!Number.isSafeInteger(total)||total>prices.get(p.saleId))invalid('Los pagos superan el precio de la venta.');totals.set(p.saleId,total);
 }
 // Existing owner receipts already reduce a verified contract balance.
 for(const p of contractOwnerPaymentRows(state)){const total=totals.get(p.saleId)+Math.round(p.amount*100);if(!Number.isSafeInteger(total)||total>prices.get(p.saleId))invalid('Los pagos, incluidas las fichas vinculadas, superan el precio de la venta.');totals.set(p.saleId,total);}
 const qrTokens=new Map();
 const addQr=(payment,group)=>{
  if(payment.verifyToken==null)return;
  const token=payment.verifyToken;
  if(typeof token!=='string'||!/^[a-f0-9]{32}$/.test(token))invalid('Código QR de recibo inválido.');
  const existing=qrTokens.get(token);
  if(existing&&existing!==group)invalid('Un código QR no puede identificar dos recibos distintos.');
  qrTokens.set(token,group);
 };
 const groupedQr=new Map();
 for(const p of state.payments){
  addQr(p,'payment:'+(p.groupId||p.id));
  if(p.groupId){
   const prior=groupedQr.get(p.groupId),token=p.verifyToken||null;
   if(prior!==undefined&&prior!==token)invalid('Los solares de un mismo recibo deben compartir el mismo código QR.');
   groupedQr.set(p.groupId,token);
  }
 }
 for(const p of state.ownerPayments||[])addQr(p,'owner:'+p.id);
 for(const s of state.sales)if(s.type==='cash'&&(cents(s.downPayment??0,'Prima')!==prices.get(s.id)||totals.get(s.id)!==prices.get(s.id)))invalid('Una venta de contado debe quedar pagada completamente.');
 const active=new Set();for(const r of state.reservations||[]){
  if(!lots.has(r.lotId)||!clients.has(r.clientId)||!['active','cancelled','converted','expired'].includes(r.status))invalid('Apartado sin terreno, cliente o estado válido.');
  if(r.status==='active'){if(active.has(r.lotId)||sold.has(r.lotId))invalid('Apartado activo duplicado o sobre un terreno vendido.');active.add(r.lotId);date(r.reservedUntil,'Vencimiento del apartado');}
  if(r.status==='converted'){const sale=sales.get(r.saleId);if(!sale||sale.lotId!==r.lotId||sale.clientId!==r.clientId)invalid('Apartado convertido sin venta compatible.');}
 }
 const historyIds=new Set(),historyContracts=new Map((state.historicalContracts||[]).map(c=>[c.id,c])),paymentIndex=new Map(state.payments.map(p=>[p.id,p]));
 for(const c of state.historicalContracts||[]){if(!c||typeof c.id!=='string'||!c.id||!Array.isArray(c.paymentIds)||c.clientId!=null&&!clients.has(c.clientId))invalid('Contrato histórico incompatible.');if(c.saleId&&!sales.has(c.saleId))invalid('Contrato histórico sin venta válida.');}
 for(const p of state.historicalPayments||[]){
  if(!p||typeof p.id!=='string'||historyIds.has(p.id)||!Array.isArray(p.issues)||!historyContracts.has(p.contractId)||p.clientId!=null&&!clients.has(p.clientId))invalid('Movimiento histórico incompatible.');historyIds.add(p.id);
  if(p.amountCents!=null&&(!Number.isSafeInteger(p.amountCents)||p.amountCents<=0))invalid('Monto histórico inválido.');if(p.date!=null)date(p.date,'Fecha histórica');
  if(p.postedPaymentId){const core=paymentIndex.get(p.postedPaymentId),contract=historyContracts.get(p.contractId);if(!core||core.historicalImportId!==p.id||core.saleId!==contract.saleId||Math.round(Number(core.amount)*100)!==p.amountCents||core.date!==p.date)invalid('El historial no coincide con el abono contabilizado.');}
 }
 for(const c of historyContracts.values())if(c.paymentIds.some(id=>!historyIds.has(id)))invalid('Contrato histórico con movimientos inexistentes.');
 const ownershipIds=new Set();for(const s of state.ownershipStatements||[]){if(!s||typeof s.id!=='string'||ownershipIds.has(s.id)||s.clientId!=null&&!clients.has(s.clientId)||!Array.isArray(s.references)||!Array.isArray(s.paymentIds))invalid('Ficha de propietario incompatible.');ownershipIds.add(s.id);for(const ref of s.references)if(ref.lotId&&!lots.has(ref.lotId))invalid('Propietario sin solar válido.');for(const id of s.paymentIds)if(!historyIds.has(id))invalid('Ficha con abono inexistente.');}
 for(const l of state.lots){if(l.ownerClientId&&!clients.has(l.ownerClientId))invalid('Solar con propietario inexistente.');if(l.ownerClientId){const sale=saleByLot.get(l.id);if(sale&&sale.clientId!==l.ownerClientId)invalid('El propietario no coincide con la venta existente.');}}
 const receiptRefs=new Map();let receiptIndex=0;
 const addReceipt=(rid,raw,group)=>{
  const reference=String(raw||'').trim().toUpperCase();
  if(!reference)return;
  const key=rid+':'+reference;
  if(receiptRefs.has(key)&&(!group||receiptRefs.get(key)!==group))invalid('Folio del recibo duplicado en la residencial. No se guardaron cambios.');
  receiptRefs.set(key,group||'single:'+ ++receiptIndex);
 };
 for(const p of state.ownerPayments||[])addReceipt(p.residenceId,p.receiptReference,null);
 for(const p of state.payments){
  const sale=sales.get(p.saleId),lot=lots.get(sale?.lotId);
  if(lot)addReceipt(lot.residenceId,p.receiptReference,p.groupId?'sale-group:'+p.groupId:null);
 }
 // Algunos recibos originales repartidos por solar ocupan varias filas del Excel.
 // No bloquear los datos históricos por coincidencias internas, pero impedir
 // que se contabilicen de nuevo desde abonos nuevos.
 const historicalRefs=new Set();
 for(const p of state.historicalPayments||[]){
  const raw=p.receiptReference||p.sourceRaw?.receiptRef||p.sourceRaw?.folio;
  if(!raw)continue;
  historicalRefs.add(p.residenceId+':'+String(raw).trim().toUpperCase());
 }
 for(const key of historicalRefs)if(receiptRefs.has(key))invalid('El folio del recibo ya existe en el historial de pagos importado.');
 try{validateOwnerPayments(state);}catch(e){invalid(e.message);}
 for(const e of state.cashEntries||[]){if(!['income','expense'].includes(e.kind))invalid('Tipo de movimiento financiero inválido.');cents(e.amount,'Movimiento financiero',1);date(e.date,'Fecha del movimiento');}
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
function packs(rows){const out=[];let part=[],size=0;for(const row of rows){const n=JSON.stringify(row).length;if(size+n>200000&&part.length){out.push(JSON.stringify(part));part=[];size=0;}part.push(row);size+=n;}if(part.length)out.push(JSON.stringify(part));return out;}
export async function onRequest({request,env}){
 const db=env.LOTIGEST_DB;if(!db)return json({error:'Base de datos no disponible.'},503);
 const correct=env.NEXORA_QA_LICENSE==='enabled'?value=>value:correctConfirmedBlocks;
 if(!sameOrigin(request))return json({error:'Origen no permitido.'},403);
 try{
  const user=await actor(request,db);if(!user)return json({error:'La sesión terminó. Vuelve a iniciar sesión; tus cambios se conservan.'},401);
  if(user.role!=='admin'&&(user.role!=='sales'||request.method!=='GET'))return json({error:'Se requiere una cuenta administradora para modificar datos.'},403);
  if(request.method==='GET'&&new URL(request.url).searchParams.get('revision')==='1'){const meta=await db.prepare('SELECT revision FROM app_meta WHERE id=1').first();return json({revision:meta.revision,user});}
  if(request.method==='GET'){const s=await snapshot(db);return json({revision:s.revision,state:user.role==='sales'?sellerCatalog(ensureContractNumbers(correct(decode(s.rows)))):ensureContractNumbers(correct(decode(s.rows))),user});}
  if(request.method!=='PUT')return json({error:'Método no permitido.'},405);
  const {state,revision,mutation}=await body(request,limit);
  if(!Number.isSafeInteger(revision)||revision<0||typeof mutation!=='string'||!(/^[a-f0-9-]{36}$/).test(mutation))invalid('Revisión o solicitud inválida.');
  correct(state);validate(state);const digest=await hash(JSON.stringify(state));
  const prior=await db.prepare('SELECT revision,digest FROM app_mutations WHERE id=?').bind(mutation).first();
  if(prior)return prior.digest===digest?json({revision:prior.revision,mutation}):json({error:'La solicitud ya existe con otros datos.'},409);
  const old=await snapshot(db);if(old.revision!==revision)return json({error:'Otra sesión guardó cambios. Descarga tu respaldo pendiente y vuelve a cargar los datos del servidor antes de continuar.'},409);
  try{const previous=decode(old.rows);validateNewMonthlyPayments(previous,state,{partialActor:user.name});validateNewReceiptCorrelativos(previous,state);ensureContractNumbers(state,previous);}catch(e){invalid(e.message);}
  const priorShape=JSON.parse(old.rows.find(r=>r.key==='$shape')?.payload||'{}');
  for(const collection of ['historicalPayments','historicalContracts','ownershipStatements','ownerPayments'])if(priorShape[collection]>0&&!Array.isArray(state[collection]))return json({error:'Esta copia no contiene el historial guardado. Carga los datos del servidor antes de guardar.'},409);
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
