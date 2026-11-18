// Clasificación conservadora de recibos OCR, titulares y mensualidades.
export const normOcr=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const digits=v=>String(v??'').replace(/^0+(?=\d)/,'');
export function ocrReference(text){
 const s=String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
 const m=s.match(/(?:\bBLOQUE\s*[:.#-]?\s*([A-Z]{1,3})\b)[\s\S]{0,80}?(?:\b(?:SOLAR|LOTE)\s*[:.#-]?\s*(\d{1,4})\b)/i)||
 s.match(/(?:\b(?:SOLAR|LOTE)\s*[:.#-]?\s*(\d{1,4})\b)[\s\S]{0,80}?(?:\bBLOQUE\s*[:.#-]?\s*([A-Z]{1,3})\b)/i);
 const block=m?(m[0].toUpperCase().trim().startsWith('BLOQUE')?m[1]:m[2]):null;
 const solar=m?(m[0].toUpperCase().trim().startsWith('BLOQUE')?m[2]:m[1]):null;
 const stage=s.match(/\b(?:ETAPA|ET\.?|FASE)\s*[:.#-]?\s*(\d{1,2})\b/i);
 return {stage:stage?Number(stage[1]):null,block:block?.toUpperCase()||null,solar:solar?digits(solar):null};
}
export function ownerLotsForOcr(state,clientId,residenceId){
 return state.lots.filter(l=>l.residenceId===residenceId && l.type!=='private' && l.status!=='private' &&
 ((l.status==='sold'&&l.ownerClientId===clientId) || state.sales.some(s=>s.clientId===clientId&&s.lotId===l.id)));
}
export function matchOcrReceipt(state,receipt,rawText,residenceId){
 const warnings=[],identified=normOcr(receipt.name),owners=state.clients.filter(c=>ownerLotsForOcr(state,c.id,residenceId).length>0);
 const exact=identified?owners.filter(c=>normOcr(c.name)===identified):[];
 const person=exact.length===1?exact[0]:null;
 if(!identified)warnings.push('No se identificó el nombre en el recibo.');
 else if(exact.length===0)warnings.push('Nombre sin coincidencia exacta. Selecciona y confirma el cliente.');
 else if(exact.length>1)warnings.push('Hay clientes con nombre repetido. Confirma la identidad.');
 const ref=ocrReference(rawText);
 const lots=person?ownerLotsForOcr(state,person.id,residenceId):[];
 let selected=[];
 if(person&&ref.block&&ref.solar){
   const found=lots.filter(l=>normOcr(l.block)===normOcr(ref.block)&&digits(l.sourceNumber||l.number||'')===ref.solar&&(ref.stage==null||Number(l.stage)===ref.stage));
   if(found.length===1)selected=[found[0].id];
   else warnings.push(found.length>1?'Referencia de bloque/solar repetida entre etapas: confirma el solar exacto.':'El bloque/solar leído no pertenece al cliente identificado.');
 }else if(person&&lots.length===1)selected=[lots[0].id];
 else if(person)warnings.push('El recibo no distingue entre los solares de este propietario. Selecciona el correcto o marca un pago conjunto.');
 if(ref.block&&!ref.solar)warnings.push('El recibo menciona bloque pero no solar.');
 return {clientId:person?.id||null,selectedLotIds:selected,lotIds:lots.map(l=>l.id),reference:ref,warnings};
}
export function receiptDuplicate(state,receipt,residenceId,clientId=null,lotIds=[]){
 const folio=normOcr(receipt.reference).replace(/ /g,'');
 const matchingFolio=x=>folio&&normOcr(x||'').replace(/ /g,'')===folio;
 if(folio){
   for(const p of state.ownerPayments||[])if(p.residenceId===residenceId&&matchingFolio(p.receiptReference||p.originalReceiptRef))return {duplicate:true,reason:'El número de recibo ya está registrado como abono de propietario.'};
   for(const p of state.payments||[]){
     const sale=state.sales.find(s=>s.id===p.saleId),lot=state.lots.find(l=>l.id===sale?.lotId);
     if(lot?.residenceId===residenceId&&matchingFolio(p.receiptReference))return {duplicate:true,reason:'El folio ya existe entre los pagos de ventas.'};
   }
   for(const p of state.historicalPayments||[])if(p.residenceId===residenceId&&matchingFolio(p.receiptReference||p.sourceRaw?.receiptRef||p.sourceRaw?.folio))return {duplicate:true,reason:'El folio ya consta en el historial importado.'};
 }
 if(receipt.amount!=null&&receipt.date&&clientId){
  const cents=Math.round(Number(receipt.amount)*100);
  const matches=(state.ownerPayments||[]).filter(p=>p.clientId===clientId&&p.residenceId===residenceId&&p.date===receipt.date&&p.amountCents===cents);
  const operations=(state.payments||[]).filter(p=>{
   const sale=state.sales.find(s=>s.id===p.saleId),lot=state.lots.find(l=>l.id===sale?.lotId);
   return sale?.clientId===clientId&&lot?.residenceId===residenceId&&p.date===receipt.date&&Math.round(Number(p.amount)*100)===cents;
  });
  const historical=(state.historicalPayments||[]).filter(p=>p.clientId===clientId&&p.residenceId===residenceId&&p.date===receipt.date&&p.amountCents===cents);
  if(matches.length||operations.length||historical.length)return {duplicate:false,warning:'Existe un pago con igual cliente, fecha e importe. Comprueba el recibo original para no duplicarlo.'};
 }
 return {duplicate:false};
}
export function verifiedInstallments(state,clientId,residenceId,today){
 const result=[];
 for(const sale of state.sales.filter(s=>s.clientId===clientId&&s.type==='credit'&&state.lots.some(l=>l.id===s.lotId&&l.residenceId===residenceId))){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(sale.firstDueDate||'')||!Number.isFinite(Number(sale.price))||Number(sale.price)<=0||!Number.isFinite(Number(sale.downPayment))||Number(sale.downPayment)<0||!Number.isInteger(Number(sale.months))||Number(sale.months)<1||Number(sale.months)>360)continue;
  const lot=state.lots.find(l=>l.id===sale.lotId),months=Number(sale.months),total=Math.round((sale.price-sale.downPayment)*100);
  if(total<=0)continue;
  const totalPaid=Math.round(((Number(sale.openingPaid)||0)+(state.payments||[]).filter(p=>p.saleId===sale.id).reduce((n,p)=>n+Number(p.amount||0),0))*100);
  let paid=Math.max(0,totalPaid-Math.round(Number(sale.downPayment)*100));
  const start=new Date(sale.firstDueDate+'T12:00:00Z');
  for(let i=0;i<months;i++){
   const dt=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+i,1,12));
   const originalDay=start.getUTCDate();dt.setUTCDate(Math.min(originalDay,new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0,12)).getUTCDate()));
   const date=dt.toISOString().slice(0,10), regular=Math.round(total/months),due=i===months-1?total-regular*(months-1):regular;
   const applied=Math.min(due,paid);paid=Math.max(0,paid-applied);
   const remaining=Math.max(0,due-applied);
   const status=remaining===0?'paid':date<today?'late':applied>0?'partial':'pending';
   result.push({saleId:sale.id,lotId:lot.id,stage:lot.stage,block:lot.block,solar:lot.sourceNumber||lot.number||lot.id,date,month:date.slice(0,7),number:i+1,dueCents:due,paidCents:applied,remainingCents:remaining,status});
  }
 }
 return result;
}
