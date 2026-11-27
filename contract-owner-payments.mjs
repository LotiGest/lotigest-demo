// Read model only. Original owner receipts remain the accounting source of truth.
// Never persist this projection or count its rows as new cash movements.
const copActive=p=>!p.voidedAt&&!p.deletedAt&&!p.cancelledAt&&!['voided','cancelled','annulled'].includes(p.status);
const copCents=v=>Math.round(Number(v||0)*100);
function copMonth(start,offset){
 const [y,m,d]=start.split('-').map(Number),date=new Date(Date.UTC(y,m-1+offset,1,12));
 date.setUTCDate(Math.min(d,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));
 return date.toISOString().slice(0,7);
}
function copApplications(sale,prior,amount,prima){
 if(prima)return [{label:'Prima inicial',number:null,month:null,amount:amount/100,complete:prior+amount>=copCents(sale.downPayment)}];
 const principal=copCents(sale.price)-copCents(sale.downPayment),regular=Math.round(principal/sale.months),end=prior+amount,out=[];
 let offset=copCents(sale.downPayment);
 for(let number=1;number<=sale.months;number++){
  const due=number===sale.months?Math.max(0,principal-Math.min(principal,regular*(sale.months-1))):Math.max(0,Math.min(regular,principal-regular*(number-1)));
  const applied=Math.max(0,Math.min(end,offset+due)-Math.max(prior,offset));
  if(applied){const month=copMonth(sale.firstDueDate||sale.date,sale.firstDueDate?number-1:number);out.push({label:'Cuota '+number,number,month,amount:applied/100,complete:end>=offset+due});}
  offset+=due;
 }
 return out;
}
function copSplit(total,rows){
 if(total>rows.reduce((n,r)=>n+r.capacity,0)||rows.some(r=>!Number.isSafeInteger(r.weight)||r.weight<0||!Number.isSafeInteger(r.capacity)||r.capacity<0))return null;
 const values=rows.map(()=>0);let left=total;
 while(left){
  const active=rows.map((r,i)=>({...r,i})).filter(r=>r.capacity>values[r.i]&&r.weight>0),weight=active.reduce((n,r)=>n+BigInt(r.weight),0n),budget=left;
  if(!weight)return null;
  for(const r of active){const take=Math.min(r.capacity-values[r.i],Number(BigInt(budget)*BigInt(r.weight)/weight));values[r.i]+=take;left-=take;}
  active.sort((a,b)=>{const x=BigInt(budget)*BigInt(a.weight)%weight,y=BigInt(budget)*BigInt(b.weight)%weight;return x===y?a.i-b.i:x>y?-1:1;});
  for(const r of active){if(!left)break;if(values[r.i]<r.capacity){values[r.i]++;left--;}}
 }
 return values;
}
export function contractOwnerPaymentRows(state){
 if(!(state.ownerPayments||[]).length)return [];
 const lots=new Map((state.lots||[]).map(l=>[l.id,l])),sales=new Map();
 for(const s of state.sales||[]){
  const doc=(state.contractTexts||[]).find(d=>d.status==='active'&&d.clientId===s.clientId&&d.lotId===s.lotId&&(!d.residenceId||d.residenceId===lots.get(s.lotId)?.residenceId)&&(d.saleId===s.id||s.documentId===d.id));
  if(doc&&s.type==='credit'&&copActive(s)&&copCents(s.price)>copCents(s.downPayment)&&Number.isInteger(Number(s.months))&&s.months>0&&/^\d{4}-\d{2}-\d{2}$/.test(s.firstDueDate||s.date))sales.set(s.lotId,s);
 }
 const core=(state.payments||[]).filter(p=>!p.contractOwnerView&&copActive(p)),out=[];
 const owners=(state.ownerPayments||[]).filter(copActive).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.recordedAt||a.id).localeCompare(String(b.recordedAt||b.id)));
 for(const p of owners){
  if(!Number.isSafeInteger(p.amountCents)||p.amountCents<=0||!p.allocations?.length||p.allocations.reduce((n,a)=>n+a.amountCents,0)!==p.amountCents)continue;
  const prima=/^prima\b/i.test(String(p.concept||'')),draft=[];let valid=true;
  for(const [index,a] of p.allocations.entries()){
   const refs=a.references||[],ids=refs.map(r=>r.lotId),entries=ids.map(id=>sales.get(id));
   if(!refs.length||new Set(ids).size!==ids.length||!Number.isSafeInteger(a.amountCents)||a.amountCents<=0||entries.some(s=>!s||s.clientId!==p.clientId||lots.get(s.lotId)?.residenceId!==p.residenceId||p.date<s.date)){valid=false;break;}
   const rows=entries.map(s=>{
    const earlier=[...core.filter(x=>(!x.recordedAt||!p.recordedAt||String(x.recordedAt)<=String(p.recordedAt))&&(x.date<p.date||x.date===p.date&&String(x.recordedAt||x.id)<=String(p.recordedAt||p.id))),...out,...draft].filter(x=>x.saleId===s.id),down=copCents(s.downPayment);
    const prior=prima?Math.min(down,copCents(s.openingPaid))+earlier.reduce((n,x)=>n+(x.paymentApplication==='prima'||/^prima\b/i.test(String(x.concept||''))?copCents(x.amount):(x.receiptInfo?.allocations||[]).filter(a=>!a.number&&/prima/i.test(String(a.label||''))).reduce((t,a)=>t+copCents(a.amount),0)),0):copCents(s.openingPaid)+earlier.reduce((n,x)=>n+copCents(x.amount),0);
    const remaining=Math.max(0,copCents(s.price)-prior);
    return {sale:s,prior,capacity:prima?Math.max(0,down-prior):remaining,weight:prima?Math.max(0,down-prior):Math.max(1,Math.round((copCents(s.price)-down)/s.months))};
   });
   if(!prima&&rows.some(r=>r.prior<copCents(r.sale.downPayment))){valid=false;break;}
   // Preserve the receipt even when a later backdated core payment causes an overpayment; the server must reject that state, not hide the older receipt.
   const split=copSplit(a.amountCents,rows)||(!prima?copSplit(a.amountCents,rows.map(r=>({...r,capacity:a.amountCents}))):null);if(!split){valid=false;break;}
   rows.forEach((r,i)=>{if(split[i])draft.push({id:'owner-view:'+p.id+':'+index+':'+r.sale.id,groupId:'owner-view:'+p.id,saleId:r.sale.id,amount:split[i]/100,date:p.date,concept:p.concept,method:p.method,recordedAt:p.recordedAt,receiptReference:p.receiptReference,receiptReferenceNormalized:p.receiptReferenceNormalized,sourceOwnerPaymentId:p.id,sourceOwnerAllocationIndex:index,contractOwnerView:true,paymentApplication:prima?'prima':'monthly',receiptInfo:{allocations:copApplications(r.sale,r.prior,split[i],prima)}});});
  }
  if(valid&&draft.reduce((n,r)=>n+copCents(r.amount),0)===p.amountCents)out.push(...draft);
 }
 return out;
}
export function contractPaymentReadView(state){
 const rows=contractOwnerPaymentRows(state);if(!rows.length)return state;
 const ownerIds=new Set(rows.map(p=>p.sourceOwnerPaymentId));
 return {...state,payments:[...(state.payments||[]).filter(p=>!p.contractOwnerView),...rows],ownerPayments:(state.ownerPayments||[]).filter(p=>!ownerIds.has(p.id))};
}
