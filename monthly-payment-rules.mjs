import {lotPrimaStatus, assertPrimaCovered, assertPrimaAmount} from './prima-gate.mjs';
const monthlyCents=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Math.round(Number(v)*100):null;
export function monthlyLotTerms(state,lotId){
 const sale=(state.sales||[]).find(s=>s.lotId===lotId&&s.type==='credit');
 const doc=(state.contractTexts||[]).find(d=>d.lotId===lotId&&d.format==='photo+ocr'&&d.status!=='voided');
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
 if(!ids.length||terms.some(t=>!t))return {known:false,monthlyCents:null,remainingCents:null,primaRemainingCents:null,primaVerified:false};
 const wanted=new Set(ids),saleIds=new Set(terms.map(t=>t.saleId).filter(Boolean));
 let paid=terms.reduce((n,t)=>n+t.openingCents,0),ambiguous=false;
 for(const p of state.payments||[])if(saleIds.has(p.saleId))paid+=monthlyCents(p.amount)||0;
 for(const p of state.ownerPayments||[])for(const a of p.allocations||[]){
  const refs=(a.references||[]).map(r=>r.lotId).filter(Boolean);
  if(!refs.some(id=>wanted.has(id)))continue;
  if(refs.length!==(a.references||[]).length||!refs.every(id=>wanted.has(id)))ambiguous=true;
  else paid+=Number(a.amountCents)||0;
 }
 const price=terms.reduce((n,t)=>n+(t.priceCents||0),0),down=terms.reduce((n,t)=>n+(t.downCents||0),0);
 const complete=terms.every(t=>Number.isSafeInteger(t.priceCents)&&t.priceCents>0&&Number.isSafeInteger(t.downCents)&&t.downCents>=0)&&!ambiguous;
 const prima=ids.map(id=>lotPrimaStatus(state,id));
 const primaKnown=prima.every(s=>s.known&&!s.ambiguous);
 return {known:true,monthlyCents:terms.reduce((n,t)=>n+t.monthlyCents,0),remainingCents:complete?Math.max(0,price-paid):null,primaRemainingCents:primaKnown?prima.reduce((n,s)=>n+s.remainingCents,0):null,primaVerified:prima.every(s=>s.covered)};
}
export function assertMonthlyPayment(state,lotIds,amountCents,{prima=false}={}){
 const info=monthlyPaymentInfo(state,lotIds);
 if(prima){assertPrimaAmount(state,lotIds,amountCents);return info;} // Nunca mezclar la prima y la mensualidad en el mismo recibo.
 assertPrimaCovered(state,lotIds);
 if(!info.known)throw Error('Abono bloqueado: falta registrar el precio, plazo y mensualidad del contrato.');
 const remaining=info.remainingCents;
 const minimum=remaining==null?info.monthlyCents:Math.min(info.monthlyCents,remaining);
 if(amountCents<minimum)throw Error('El abono mensual mínimo es L '+(minimum/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'. Puedes abonar ese monto o uno mayor.');
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
  if(sale){const test={...working,payments:working.payments.filter(x=>x.id!==p.id)};assertMonthlyPayment(test,[sale.lotId],monthlyCents(p.amount),{prima:/^PRIMA\b/i.test(p.concept||'')});}
  working.payments=working.payments.filter(x=>x.id!==p.id).concat(p);
 }
 const oldOwners=new Map((before.ownerPayments||[]).map(p=>[p.id,p]));
 for(const p of after.ownerPayments||[]){
  const prior=oldOwners.get(p.id);if(prior&&JSON.stringify(prior.allocations)===JSON.stringify(p.allocations)&&prior.concept===p.concept)continue;
  const test={...working,ownerPayments:working.ownerPayments.filter(x=>x.id!==p.id)};
  for(const a of p.allocations||[]){const ids=(a.references||[]).map(r=>r.lotId).filter(Boolean);const isPrima=/^PRIMA\b/i.test(p.concept||'');if(!isPrima&&ids.length!==(a.references||[]).length)throw Error('Abono bloqueado: confirma el bloque y solar exacto de cada ficha antes de pagar mensualidades.');if(ids.length===(a.references||[]).length)assertMonthlyPayment(test,ids,a.amountCents,{prima:isPrima});}
  working.ownerPayments=working.ownerPayments.filter(x=>x.id!==p.id).concat(p);
 }
}
