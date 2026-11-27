import {contractOwnerPaymentRows} from './contract-owner-payments.mjs';
const monthlyActive=p=>!p.voidedAt&&!p.deletedAt&&!p.cancelledAt&&!['voided','cancelled'].includes(p.status);
const monthlyCents=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Math.round(Number(v)*100):null;
export function monthlyLotTerms(state,lotId){
 const sale=(state.sales||[]).find(s=>s.lotId===lotId&&s.type==='credit');
 const doc=(state.contractTexts||[]).find(d=>d.lotId===lotId&&['photo+ocr','manual'].includes(d.format)&&d.status!=='voided');
 const p=sale?{price:sale.price,down:sale.downPayment??0,months:sale.months}:doc?.structured;
 if(!p)return null;
 const price=monthlyCents(p.price),down=monthlyCents(p.down),months=Number(p.months);
 const stated=monthlyCents(p.monthly||p.monthlyCalculated);
 const monthly=Number.isSafeInteger(price)&&Number.isSafeInteger(down)&&price>down&&down>=0&&Number.isInteger(months)&&months>0?Math.round((price-down)/months):stated;
 if(!(monthly>0))return null;
 return {lotId,saleId:sale?.id||null,priceCents:price,downCents:down,monthlyCents:monthly,openingCents:monthlyCents(sale?.openingPaid||0)};
}
export function monthlyPaymentInfo(state,lotIds){
 const ids=[...new Set(lotIds)],terms=ids.map(id=>monthlyLotTerms(state,id));
 if(!ids.length||terms.some(t=>!t))return {known:false,monthlyCents:null,remainingCents:null,primaRemainingCents:null};
 const wanted=new Set(ids),saleIds=new Set(terms.map(t=>t.saleId).filter(Boolean));
 const existingIds=new Set((state.payments||[]).map(p=>p.id)),allProjected=contractOwnerPaymentRows(state),projected=allProjected.filter(p=>!existingIds.has(p.id)),projectedOwners=new Set(allProjected.map(p=>p.sourceOwnerPaymentId));
 let paid=terms.reduce((n,t)=>n+t.openingCents,0),ambiguous=false;
 for(const p of state.payments||[])if(monthlyActive(p)&&saleIds.has(p.saleId))paid+=monthlyCents(p.amount)||0;
 for(const p of projected)if(saleIds.has(p.saleId))paid+=monthlyCents(p.amount)||0;
 for(const p of (state.ownerPayments||[]).filter(p=>monthlyActive(p)&&!projectedOwners.has(p.id)))for(const a of p.allocations||[]){
  const refs=(a.references||[]).map(r=>r.lotId).filter(Boolean);
  if(!refs.some(id=>wanted.has(id)))continue;
  if(refs.length!==(a.references||[]).length||!refs.every(id=>wanted.has(id)))ambiguous=true;
  else paid+=Number(a.amountCents)||0;
 }
 const price=terms.reduce((n,t)=>n+(t.priceCents||0),0),down=terms.reduce((n,t)=>n+(t.downCents||0),0);
 const complete=terms.every(t=>Number.isSafeInteger(t.priceCents)&&t.priceCents>0&&Number.isSafeInteger(t.downCents)&&t.downCents>=0)&&!ambiguous;
 return {known:true,monthlyCents:terms.reduce((n,t)=>n+t.monthlyCents,0),remainingCents:complete?Math.max(0,price-paid):null,primaRemainingCents:complete?Math.max(0,down-paid):null};
}
export function assertMonthlyPayment(state,lotIds,amountCents,{prima=false}={}){
 if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('Ingresa un monto positivo con máximo dos decimales.');
 const info=monthlyPaymentInfo(state,lotIds);
 if(prima||!info.known)return info;
 // La prima se registra aparte; no aceptar abonos mensuales antes de completarla.
 if(info.primaRemainingCents==null)throw Error('Verifica la distribución de la prima por solar antes de registrar abonos.');
 const pending=info.primaRemainingCents;
 if(pending>0)throw Error('Primero completa la prima pendiente. Registra este pago como Prima, no como abono.');
 if(info.remainingCents!==null&&amountCents>info.remainingCents)throw Error('El abono supera el saldo pendiente del solar.');
 // Un pago parcial conserva el faltante de la cuota en su calendario.
 return info;
}
export function assertPrimaPayment(state,lotId,amountCents){
 const info=monthlyPaymentInfo(state,[lotId]);
 if(!info.known||info.primaRemainingCents==null)throw Error('No se pudo verificar la prima pendiente del solar.');
 if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>info.primaRemainingCents)
  throw Error('El importe supera la prima pendiente del solar. Revisa la distribución.');
 return info;
}
export function validateNewMonthlyPayments(before,after){
 if(!before)return; // Carga inicial/restauración: no invalidar recibos anteriores.
 const oldSales=new Map((before.payments||[]).map(p=>[p.id,p]));
 const working={...after,payments:[...(before.payments||[])],ownerPayments:[...(before.ownerPayments||[])]};
 for(const p of after.payments||[]){
  const prior=oldSales.get(p.id);
  if(prior&&prior.amount===p.amount&&prior.saleId===p.saleId)continue;
  const recorded=(before.historicalPayments||[]).find(h=>h.id===p.historicalImportId&&h.amountCents===monthlyCents(p.amount)&&h.date===p.date);
  const posted=(after.historicalPayments||[]).find(h=>h.id===recorded?.id&&h.postedPaymentId===p.id);
  const importedContract=posted&&(after.historicalContracts||[]).find(c=>c.id===posted.contractId&&c.saleId===p.saleId);
  if(recorded&&posted&&importedContract){working.payments=working.payments.filter(x=>x.id!==p.id).concat(p);continue;}
  const sale=(after.sales||[]).find(s=>s.id===p.saleId);
  if(sale){const test={...working,payments:working.payments.filter(x=>x.id!==p.id)};if(!prior&&p.paymentApplication==='prima')assertPrimaPayment(test,sale.lotId,monthlyCents(p.amount));else assertMonthlyPayment(test,[sale.lotId],monthlyCents(p.amount),{prima:/^PRIMA\b/i.test(p.concept||'')});}
  working.payments=working.payments.filter(x=>x.id!==p.id).concat(p);
 }
 const oldOwners=new Map((before.ownerPayments||[]).map(p=>[p.id,p]));
 for(const p of after.ownerPayments||[]){
  const prior=oldOwners.get(p.id);if(prior&&JSON.stringify(prior.allocations)===JSON.stringify(p.allocations)&&prior.concept===p.concept)continue;
  const test={...working,ownerPayments:working.ownerPayments.filter(x=>x.id!==p.id)};
  for(const a of p.allocations||[]){const ids=(a.references||[]).map(r=>r.lotId).filter(Boolean);if(ids.length===(a.references||[]).length)assertMonthlyPayment(test,ids,a.amountCents,{prima:/^PRIMA\b/i.test(p.concept||'')});}
  working.ownerPayments=working.ownerPayments.filter(x=>x.id!==p.id).concat(p);
 }
}

// Reparte un único recibo por el peso de las cuotas; todos los cálculos son en centavos.
export function splitClientPayment(state,saleIds,totalCents,date=null,application='auto'){
 const ids=[...new Set(saleIds)];
 if(!ids.length||!Number.isSafeInteger(totalCents)||totalCents<=0)throw Error('Ingresa un total de abono válido.');
 const rows=ids.map(id=>{
  const sale=state.sales.find(s=>s.id===id),lot=state.lots.find(l=>l.id===sale?.lotId);
  if(!sale||!lot||sale.type!=='credit')throw Error('Contrato de crédito no válido.');
  const terms=monthlyLotTerms(state,lot.id);
  if(!terms?.monthlyCents)throw Error('Revisa la cuota mensual de cada solar.');
  const info=monthlyPaymentInfo(state,[lot.id]);
  if(info.remainingCents===null||info.primaRemainingCents===null)throw Error('Verifica la distribución de los recibos por solar.');
  const paid=Math.round(Number(sale.price)*100)-info.remainingCents;
  return {saleId:id,clientId:sale.clientId,residenceId:lot.residenceId,date:sale.date,weight:terms.monthlyCents,primaRemaining:Math.max(0,terms.downCents-paid),remaining:Math.max(0,Math.round(Number(sale.price)*100)-paid),cents:0};
 });
 if(new Set(rows.map(r=>r.clientId)).size!==1||new Set(rows.map(r=>r.residenceId)).size!==1)throw Error('El abono debe pertenecer a un cliente y una residencial.');
 const primaTotal=rows.reduce((n,r)=>n+r.primaRemaining,0);
 // No distribuir una prima por el peso de las mensualidades: cada solar
 // recibe solamente lo que aún le falta de prima, en centavos.
 if(application==='prima'||(application==='auto'&&totalCents<=primaTotal)){
  if(totalCents>primaTotal)throw Error('El monto supera la prima pendiente. Prima pendiente total: L '+(primaTotal/100).toFixed(2));
  for(const row of rows){row.remaining=row.primaRemaining;row.weight=row.primaRemaining;}
 }
 if(totalCents>rows.reduce((n,r)=>n+r.remaining,0))throw Error('El total supera el saldo pendiente de los solares.');
 let rest=totalCents;
 while(rest>0){
  const active=rows.filter(r=>r.remaining>r.cents),weight=active.reduce((n,r)=>n+r.weight,0),budget=rest;
  for(const r of active){const part=Math.min(r.remaining-r.cents,Number(BigInt(budget)*BigInt(r.weight)/BigInt(weight)));r.cents+=part;rest-=part;}
  const ranked=active.filter(r=>r.remaining>r.cents).sort((a,b)=>{const ar=BigInt(budget)*BigInt(a.weight)%BigInt(weight),br=BigInt(budget)*BigInt(b.weight)%BigInt(weight);return ar===br?a.saleId.localeCompare(b.saleId):ar>br?-1:1;});
  for(const r of ranked){if(!rest)break;r.cents++;rest--;}
 }
 const allocated=rows.filter(r=>r.cents>0);
 if(date&&allocated.some(r=>date<r.date))throw Error('La fecha del abono es anterior a uno de los contratos.');
 return allocated.map(r=>({saleId:r.saleId,amount:r.cents/100,cents:r.cents}));
}

/* Abonos por fechas: validar la cuota conjunta antes de dividir el recibo. */
export function planMonthlyClientPayment(state,saleIds,totalCents,date=null){
 const ids=[...new Set(saleIds)],rows=[];
 if(!ids.length||!Number.isSafeInteger(totalCents)||totalCents<=0)throw Error('Ingresa un monto válido.');
 for(const id of ids){
  const sale=(state.sales||[]).find(s=>s.id===id),lot=(state.lots||[]).find(l=>l.id===sale?.lotId);
  if(!sale||!lot||sale.type!=='credit')throw Error('Contrato de crédito no válido.');
  const info=monthlyPaymentInfo(state,[lot.id]);
  if(!info.known||info.remainingCents==null||info.primaRemainingCents==null)throw Error('Verifica la cuota, saldo y distribución de la prima del solar '+(lot.sourceNumber||lot.id)+'.');
  if(info.remainingCents===0)continue;
  if(info.primaRemainingCents>0)throw Error('Completa primero la prima del solar '+(lot.sourceNumber||lot.id)+'. Registra ese pago como Prima.');
  rows.push({saleId:id,lotId:lot.id,clientId:sale.clientId,residenceId:lot.residenceId,minimumCents:Math.min(info.monthlyCents,info.remainingCents),remainingCents:info.remainingCents});
 }
 if(!rows.length)throw Error('Los solares seleccionados ya están pagados.');
 if(new Set(rows.map(r=>r.clientId)).size!==1||new Set(rows.map(r=>r.residenceId)).size!==1)throw Error('Selecciona solares de un mismo cliente y residencial.');
 const minimumCents=rows.reduce((n,r)=>n+r.minimumCents,0),remainingCents=rows.reduce((n,r)=>n+r.remainingCents,0);
 const format=n=>'L '+(n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 if(totalCents>remainingCents)throw Error('El abono supera el saldo pendiente total de '+format(remainingCents)+'.');
 // Preserve the existing proportional allocation and enforce the individual limits.
 const allocations=splitClientPayment(state,rows.map(r=>r.saleId),totalCents,date,'monthly');
 for(const row of rows){
  const allocation=allocations.find(a=>a.saleId===row.saleId);
  if(allocation)assertMonthlyPayment(state,[row.lotId],allocation.cents);
 }
 return {minimumCents,remainingCents,excessCents:Math.max(0,totalCents-minimumCents),shortfallCents:Math.max(0,minimumCents-totalCents),allocations};
}
