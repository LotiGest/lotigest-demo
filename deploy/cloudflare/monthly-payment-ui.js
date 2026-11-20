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
 const isPrima=form.id==='manual-history-form'?form.elements.type?.value==='PRIMA':
   /^PRIMA\\b/i.test(form.elements.concept?.value||'');
 const blocked=ids.length&&!isPrima&&ids.some(id=>!lotPrimaStatus(db,id).covered);
 banner.replaceChildren();const heading=document.createElement('strong');
 heading.textContent=info.known?'Cuota mensual '+(ids.length>1?'de los solares seleccionados: ':': ')+money(info.monthlyCents/100):'Cuota mensual: pendiente de completar contrato';banner.append(heading);
 const note=document.createElement('p');note.className='sm';
 note.textContent=blocked?'🔒 Abonos mensuales bloqueados. Primero registra y completa la prima de cada solar seleccionado. Usa «Prima» como tipo o concepto de pago para registrar únicamente la prima.':
  isPrima?'Registro de prima: puedes completar el importe pendiente. Las mensualidades se habilitan en un pago posterior, cuando la prima esté cubierta.':
  info.known?'La prima está cubierta. El abono mensual debe ser igual o mayor a la cuota (salvo el saldo final menor).':
  'Completa las condiciones del contrato para verificar prima y mensualidad.';
 banner.append(note);
 if(info.known&&ids.length>1)for(const id of ids){const l=getLot(id),t=monthlyLotTerms(db,id),row=document.createElement('p');row.className='sm';row.textContent='Etapa '+(l?.stage||'—')+' · Bloque '+(l?.block||'—')+' · Solar '+(l?.sourceNumber||l?.number||id)+': '+money(t.monthlyCents/100)+' al mes';banner.append(row);}
}
const monthlyBasePlanPayment=planMultiPayment;
planMultiPayment=function(draft,data){const rows=monthlyBasePlanPayment(draft,data);for(const r of rows)assertMonthlyPayment(db,[getSale(r.saleId).lotId],Math.round(r.amount*100),{prima:/^PRIMA\b/i.test(data.concept||'')});return rows;};
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
   const isPrima=/^PRIMA\b/i.test(form.elements.concept?.value||'');if(!isPrima&&ids.length!==(refs||[]).length)throw Error('Abono bloqueado: confirma los solares exactos antes de pagar mensualidades.');if(ids.length===(refs||[]).length)assertMonthlyPayment(db,ids,Math.round(Number(el.value)*100),{prima:isPrima});
  }
 }catch(error){event.preventDefault();event.stopImmediatePropagation();const area=form.querySelector('#multi-payment-error,#owner-abono-error,#manual-history-error');if(area)area.textContent=error.message;toast(error.message,'error');}
},true);
