function monthlyFormLots(form){
 if(form.id==='multi-payment-form')return Object.keys(paymentDraft?.amounts||{}).map(id=>getSale(id)?.lotId).filter(Boolean);
 if(form.id==='manual-history-form')return [...form.querySelectorAll('[data-manual-lot]:checked')].map(el=>el.value);
 if(form.id==='owner-abono-form'){const fields=[...form.querySelectorAll('[data-owner-statement]')],chosen=fields.filter(el=>Number(el.value)>0);return [...new Set((chosen.length?chosen:fields).flatMap(el=>{
  const s=(db.ownershipStatements||[]).find(s=>s.id===el.dataset.ownerStatement);
  const refs=el.dataset.ownerReference==='group'?s?.references:[s?.references?.[Number(el.dataset.ownerReference)]];
  return (refs||[]).map(r=>r?.lotId).filter(Boolean);
 }))];}
 return [];
}
function monthlyRefresh(){
 const form=document.querySelector('#multi-payment-form,#owner-abono-form,#manual-history-form');if(!form)return;
 let banner=form.querySelector('[data-monthly-banner]');
 if(!banner){banner=document.createElement('section');banner.dataset.monthlyBanner='true';banner.className='notice-card';banner.style.cssText='margin:0 0 14px;padding:14px;border:1px solid #abc89b';form.prepend(banner);}
 const ids=monthlyFormLots(form),info=monthlyPaymentInfo(db,ids);
 banner.replaceChildren();const heading=document.createElement('strong');
 heading.textContent=info.known?'Cuota mensual '+(ids.length>1?'de los solares seleccionados: ':': ')+money(info.monthlyCents/100):'Cuota mensual: pendiente de completar contrato';banner.append(heading);
 const note=document.createElement('p');note.className='sm';
 note.textContent=info.known?(info.primaRemainingCents>0?'Prima pendiente: '+money(info.primaRemainingCents/100)+'. Los pagos de prima se registran aparte de la mensualidad.':'El abono mensual debe ser igual o mayor a la cuota. Si el saldo final es menor, puedes cancelarlo completo.'):'Selecciona los solares. Se usa la cuota pactada o el precio, prima y plazo registrados; un pago de prima por sí solo no determina la mensualidad.';
 banner.append(note);
 if(info.known&&ids.length>1)for(const id of ids){const l=getLot(id),t=monthlyLotTerms(db,id),row=document.createElement('p');row.className='sm';row.textContent='Etapa '+(l?.stage||'—')+' · Bloque '+(l?.block||'—')+' · Solar '+(l?.sourceNumber||l?.number||id)+': '+money(t.monthlyCents/100)+' al mes';banner.append(row);}
}
const monthlyBasePlanPayment=planMultiPayment;
planMultiPayment=function(draft,data){
 const application=data.paymentApplication||'auto';
 const entries=Object.entries(draft?.amounts||{});
 const positive=entries.filter(([id,v])=>String(v??'').trim()!==''&&Number(v)!==0);
 const effective=entries.length>1?{...draft,amounts:Object.fromEntries(positive)}:draft;
 const rows=monthlyBasePlanPayment(effective,data);
 for(const r of rows){
  const lotId=getSale(r.saleId).lotId,cents=Math.round(r.amount*100);
  if(application==='prima'){assertPrimaPayment(db,lotId,cents);r.paymentApplication='prima';}
  else assertMonthlyPayment(db,[lotId],cents);
 }
 return rows;
};
const monthlyBaseShowModal=showModal;
showModal=function(...args){const result=monthlyBaseShowModal(...args);monthlyRefresh();return result;};
const monthlyBaseSelected=renderPaymentSelected;
renderPaymentSelected=function(...args){const result=monthlyBaseSelected(...args);monthlyRefresh();return result;};
document.addEventListener('input',event=>{if(event.target.closest?.('#multi-payment-form,#owner-abono-form,#manual-history-form'))monthlyRefresh();});
document.addEventListener('change',event=>{if(event.target.closest?.('#multi-payment-form,#owner-abono-form,#manual-history-form'))monthlyRefresh();});
document.addEventListener('submit',event=>{
 const form=event.target;if(!['owner-abono-form','manual-history-form','multi-payment-form'].includes(form.id))return;
 try{
  if(form.id==='multi-payment-form'){planMultiPayment(paymentDraft,Object.fromEntries(new FormData(form)));return;}
  if(form.id==='manual-history-form')assertMonthlyPayment(db,monthlyFormLots(form),Math.round(Number(form.elements.amount.value)*100),{prima:form.elements.type.value==='PRIMA'});
  else for(const el of form.querySelectorAll('[data-owner-statement]')){
   if(!(Number(el.value)>0))continue;
   const s=(db.ownershipStatements||[]).find(s=>s.id===el.dataset.ownerStatement),refs=el.dataset.ownerReference==='group'?s?.references:[s?.references?.[Number(el.dataset.ownerReference)]];
   const ids=(refs||[]).map(r=>r?.lotId).filter(Boolean);
   if(ids.length===(refs||[]).length)assertMonthlyPayment(db,ids,Math.round(Number(el.value)*100),{prima:/^PRIMA\b/i.test(form.elements.concept?.value||'')});
  }
 }catch(error){event.preventDefault();event.stopImmediatePropagation();const area=form.querySelector('#multi-payment-error,#owner-abono-error,#manual-history-error');if(area)area.textContent=error.message;toast(error.message,'error');}
},true);
