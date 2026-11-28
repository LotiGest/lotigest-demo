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
 note.textContent=info.known?(info.primaRemainingCents>0?'Prima pendiente: '+money(info.primaRemainingCents/100)+'. El pago se registrará automáticamente como PRIMA hasta completarla.':'Puedes registrar un abono parcial. El faltante del mes permanece pendiente en el calendario hasta completar la cuota.'):'Selecciona los solares. Se usa la cuota pactada o el precio, prima y plazo registrados; un pago de prima por sí solo no determina la mensualidad.';
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
  Object.assign(r,classifyAutomaticPayment(db,lotId,cents,application));
  const approval=partialApprovedFor(document.getElementById('multi-payment-form'),'sale:'+r.saleId);if(approval)r.partialPaymentConfirmation=approval;
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

// Explicit approval is scoped to one submission, not a preference or a global bypass.
const partialApprovals=new WeakMap(),partialPending=new WeakSet();
function partialApprovedFor(form,key){return form?partialApprovals.get(form)?.get(key):undefined;}
function partialAdvanceFor(state,ids,date){
 try{
  const view=contractPaymentReadView(state),sales=view.sales.filter(s=>ids.includes(s.lotId)&&s.type==='credit');
  if(sales.length!==ids.length||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const terms=installmentSalesFromContracts(sales,view.contractTexts,view.payments);
  const ledger=reconcileInstallments(terms,view.payments,date,installmentDueCents,(d,i)=>dateKey(addMonths(d,i)),{requireReference:true,repairExplicitAbonos:true});
  const rows=ledger.rows.filter(r=>r.dueDate.slice(0,7)===date.slice(0,7));
  return new Set(rows.map(r=>r.saleId)).size===sales.length?rows.reduce((n,r)=>n+r.advanceCents,0):null;
 }catch{return null;}
}
function partialEntry(state,ids,cents,date,key,{prima=false,ref='',rowId=null}={}){
 const details=partialPaymentDetails(state,ids,cents,{prima});
 if(!details)return null;
 const label=details.lotIds.map(id=>{const l=(state.lots||[]).find(x=>x.id===id);return l?'Bloque '+(l.block||'—')+' · Solar '+(l.sourceNumber||l.number||l.id):id;}).join(' / ');
 return {key,details,date,ref,rowId,label,advanceCents:partialAdvanceFor(state,details.lotIds,date)};
}
function partialSignature(entries){return JSON.stringify(entries.map(({key,details,date,ref})=>({key,details,date,ref})));}
function partialNode(tag,text,className){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;}
function partialPrompt(entries){
 if(!entries.length)return Promise.resolve('');
 return new Promise(resolve=>{
  const previous=document.activeElement,dialog=partialNode('dialog',null,'lg-partial-dialog');
  dialog.setAttribute('aria-labelledby','lg-partial-title');dialog.setAttribute('aria-modal','true');
  const title=partialNode('h2','Confirmar abono inferior a la cuota');title.id='lg-partial-title';
  dialog.append(title,partialNode('p','Se conservará el monto realmente recibido. El faltante no se convierte en descuento ni modifica la cuota contractual.'));
  for(const entry of entries){
   const block=partialNode('section',null,'lg-partial-entry'),d=entry.details;
   block.append(partialNode('strong',entry.label+' · '+entry.date+(entry.ref?' · Recibo '+entry.ref:'')));
   const detail=partialNode('dl',null,'lg-partial-values');
   for(const [label,value] of [['Cuota contractual',d.contractualCents],['Monto ingresado',d.amountCents],['Diferencia',d.differenceCents],...(entry.advanceCents>0?[['Adelanto ya aplicado al período',entry.advanceCents]]:[])]){
    detail.append(partialNode('dt',label),partialNode('dd',money(value/100)));
   }
   block.append(detail);dialog.append(block);
  }
  const label=partialNode('label','Observación (opcional)'),note=partialNode('textarea');note.maxLength=300;note.rows=3;note.placeholder='Motivo o referencia del abono parcial';label.append(note);dialog.append(label);
  const footer=partialNode('div',null,'lg-partial-actions'),correct=partialNode('button','Corregir monto','btn btn-outline'),apply=partialNode('button','Aplicar abono','btn btn-primary');
  correct.type=apply.type='button';correct.dataset.partialCorrect='';apply.dataset.partialApply='';footer.append(correct,apply);dialog.append(footer);
  let done=false;
  const finish=value=>{if(done)return;done=true;dialog.remove();if(previous?.isConnected)previous.focus();resolve(value);};
  correct.addEventListener('click',()=>finish(null));apply.addEventListener('click',()=>finish(note.value.trim()));
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});dialog.addEventListener('close',()=>finish(null));
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(null);}});
  document.body.append(dialog);
  if(typeof dialog.showModal==='function'){try{dialog.showModal();}catch{dialog.open=true;}}else dialog.open=true;
  correct.focus();
 });
}
function partialFormEntries(form){
 const data=Object.fromEntries(new FormData(form)),entries=[],add=e=>{if(e)entries.push(e);};
 if(form.id==='multi-payment-form'){
  for(const row of planMultiPayment(paymentDraft,data)){
   const sale=getSale(row.saleId);
   if(sale)add(partialEntry(db,[sale.lotId],Math.round(row.amount*100),data.date,'sale:'+row.saleId,{prima:row.paymentApplication==='prima',ref:data.receiptRef}));
  }
 }else if(form.id==='owner-abono-form'){
  for(const el of form.querySelectorAll('[data-owner-statement]')){
   if(!(Number(el.value)>0))continue;
   const index=el.dataset.ownerReference==='group'?null:Number(el.dataset.ownerReference);
   const ids=monthlyOwnerLotIds(db,el.dataset.ownerStatement,index);
   add(partialEntry(db,ids,Math.round(Number(el.value)*100),data.date,'owner:'+el.dataset.ownerStatement+':'+(index??'group'),{prima:/^PRIMA\b/i.test(data.concept||''),ref:data.receiptRef}));
  }
 }else if(form.id==='manual-history-form'){
  add(partialEntry(db,monthlyFormLots(form),Math.round(Number(data.amount)*100),data.date,'manual',{prima:data.type==='PRIMA',ref:data.receiptRef}));
 }else if(form.matches('#modal-form[data-form="payment"]')){
  const sale=getSale(data.saleId);
  if(sale)add(partialEntry(db,[sale.lotId],Math.round(Number(data.amount)*100),data.date,'sale:'+sale.id,{ref:data.receiptRef}));
 }
 return entries;
}
function partialAttachOwner(result,form){
 for(const allocation of result.receipt.allocations||[]){
  const key=form.id==='manual-history-form'?'manual':'owner:'+allocation.statementId+':'+(allocation.referenceIndex??'group');
  const approval=partialApprovedFor(form,key);if(approval)allocation.partialPaymentConfirmation=approval;
 }
 return result;
}
function partialFocusAmount(form,entry){
 const candidates=[...form.querySelectorAll('[data-payment-amount],[data-owner-statement],[name="amount"]')];
 const raw=candidates.find(el=>entry?.key==='sale:'+el.dataset.paymentAmount||entry?.key==='owner:'+el.dataset.ownerStatement+':'+(el.dataset.ownerReference||'group'))||candidates[0];
 const input=raw?.type==='hidden'?raw.parentElement?.querySelector('input:not([type="hidden"])'):raw;
 input?.focus();input?.select?.();
}
document.addEventListener('submit',event=>{
 const form=event.target;
 if(!form.matches?.('#multi-payment-form,#owner-abono-form,#manual-history-form,#modal-form[data-form="payment"]')||event.defaultPrevented)return;
 if(partialApprovals.has(form))return;
 let entries;
 try{entries=partialFormEntries(form);}catch(error){event.preventDefault();event.stopImmediatePropagation();toast(error.message,'error');return;}
 if(!entries.length)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(partialPending.has(form))return;
 partialPending.add(form);
 const signature=partialSignature(entries),submitter=event.submitter;
 void (async()=>{
  try{
   const note=await partialPrompt(entries);
   if(note===null){partialFocusAmount(form,entries[0]);return;}
   if(!form.isConnected||partialSignature(partialFormEntries(form))!==signature){toast('El monto o contrato cambió. Vuelve a revisar el abono.','error');return;}
   const actor=cloudUser?.name;if(!actor)throw Error('No se pudo verificar el usuario de la sesión.');
   const approvals=new Map(entries.map(e=>[e.key,makePartialPaymentConfirmation(e.details,{date:e.date,actor,note})]));
   partialApprovals.set(form,approvals);
   try{if(submitter?.form===form)form.requestSubmit(submitter);else form.requestSubmit();}
   finally{partialApprovals.delete(form);}
  }catch(error){toast(error.message||'No se pudo confirmar el abono.','error');}
  finally{partialPending.delete(form);}
 })();
},true);
