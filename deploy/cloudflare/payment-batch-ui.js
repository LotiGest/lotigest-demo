// LOTIGEST: pagos consecutivos sin salir de Abonos, comprobante individual opcional.
// La base y los saldos se guardan usando los mismos validadores que el formulario normal.
let pmBatchContinue=false,pmBatchBusy=false;
const pmBatchReceipts=[];
function pmBatchCurrent(){
 const sale=Boolean(document.getElementById('multi-payment-form'));
 const owner=Boolean(document.getElementById('owner-abono-form'));
 return sale?{kind:'sale',clientId:paymentDraft?.clientId,residenceId:paymentDraft?.residenceId}:
  owner?{kind:'owner',clientId:ownerPaymentDraft?.clientId,residenceId:ownerPaymentDraft?.residenceId}:null;
}
function pmBatchRender(){
 const active=pmBatchCurrent(),form=document.querySelector('#multi-payment-form,#owner-abono-form');
 if(!active||!form)return;
 const footer=form.closest('.lg-payment-modern')?.querySelector('.modal-footer');
 if(footer&&!footer.querySelector('[data-pm-batch-continue]')){
  const button=document.createElement('button');
  button.type='submit';button.className='btn pm-batch-continue';
  button.dataset.pmBatchContinue='true';button.setAttribute('form',form.id);
  button.textContent='Guardar y registrar otro abono';
  footer.append(button);
 }
 const shell=form.querySelector('.pm-shell');
 if(!shell)return;
 let panel=shell.querySelector('#pm-batch-receipts');
 if(!panel){
  panel=document.createElement('section');panel.id='pm-batch-receipts';
  panel.className='pm-batch-receipts';
  const toolbar=shell.querySelector('.pm-history-toolbar');
  if(toolbar)toolbar.after(panel);else shell.prepend(panel);
 }
 const records=pmBatchReceipts.filter(p=>p.kind===active.kind&&p.clientId===active.clientId&&p.residenceId===active.residenceId);
 panel.replaceChildren();
 if(!records.length){panel.hidden=true;return;}
 panel.hidden=false;
 const title=document.createElement('strong');
 title.textContent='Abonos guardados consecutivamente · '+records.length+' comprobante(s)';
 panel.append(title);
 const help=document.createElement('small');
 help.textContent='Cada abono tiene su propia fecha y número de recibo. El PDF es opcional y no es una factura fiscal.';
 panel.append(help);
 for(const record of records){
  const row=document.createElement('div');row.className='pm-batch-row';
  const detail=document.createElement('span');
  detail.textContent=record.date+' · '+record.amount+' · Recibo '+record.reference;
  const download=document.createElement('button');
  download.type='button';download.className='btn btn-outline btn-sm';
  download.dataset.pmBatchPdf=record.id;download.dataset.pmBatchKind=record.kind;
  download.textContent='Descargar comprobante PDF';
  row.append(detail,download);panel.append(row);
 }
}
function pmBatchRemember(kind,clientId,residenceId,id,reference,date,amount){
 pmBatchReceipts.unshift({kind,clientId,residenceId,id,reference,date,amount});
 if(pmBatchReceipts.length>30)pmBatchReceipts.length=30;
}
const pmBatchPreviousShowModal=showModal;
showModal=function(...args){
 const result=pmBatchPreviousShowModal(...args);
 pmBatchRender();
 return result;
};
document.addEventListener('click',event=>{
 if(event.target.closest?.('[data-pm-batch-continue]'))pmBatchContinue=true;
 else if(event.target.closest?.('[type="submit"]'))pmBatchContinue=false;
 const pdf=event.target.closest?.('[data-pm-batch-pdf]');
 if(!pdf)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(pdf.dataset.pmBatchKind==='sale')deliverPaymentReceipt(pdf.dataset.pmBatchPdf,false);
 else if(pdf.dataset.pmBatchKind==='owner')deliverOwnerPayment(pdf.dataset.pmBatchPdf,false);
},true);
document.addEventListener('submit',event=>{
 if(!event.target.matches?.('#multi-payment-form,#owner-abono-form'))return;
 if(event.submitter)pmBatchContinue=Boolean(event.submitter.hasAttribute('data-pm-batch-continue'));
},true);

const pmBatchOriginalSubmitMultiPayment=submitMultiPayment;
submitMultiPayment=function(form){
 if(!pmBatchContinue)return pmBatchOriginalSubmitMultiPayment(form);
 pmBatchContinue=false;
 if(pmBatchBusy)return;
 const error=document.getElementById('multi-payment-error');
 pmBatchBusy=true;
 try{
  if(!paymentDraft||!form?.isConnected)throw Error('Abre nuevamente el formulario de abonos.');
  const draft=paymentDraft,d=Object.fromEntries(new FormData(form)),rows=planMultiPayment(draft,d);
  const originalRef=String(d.receiptRef||'').trim(),normalizedRef=lotigestOwnerPayments.requireReceiptCorrelativo(originalRef);
  if(lotigestOwnerPayments.findReceiptCorrelativo(db,originalRef))throw Error(lotigestOwnerPayments.receiptCorrelativoMessage(db,originalRef));
  if(JSON.stringify(db)!==draft.snapshot||localStorage.getItem(STORAGE)!==draft.stored)
   throw Error('Los datos cambiaron. Abre Registrar pago nuevamente para evitar duplicados.');
  const reference=uid('RC'),next=JSON.parse(JSON.stringify(db)),stamp=new Date().toISOString();
  const payments=rows.map((r,i)=>({...r,id:reference+'-'+(i+1),groupId:reference,date:d.date,
   concept:r.concept||String(d.concept||'Abono').trim().slice(0,300),
   method:String(d.method||'').trim().slice(0,80),receiptReference:originalRef,receiptReferenceNormalized:normalizedRef,recordedAt:stamp}));
  for(const payment of payments)payment.receiptInfo=buildReceiptInfo(payment,paidAmount(payment.saleId));
  next.payments.unshift(...payments);
  // Primero registrar en cola D1; si falla, no cambiar db ni dar un recibo inexistente.
  cloudWrite(JSON.stringify(next));
  db=next;
  draft.snapshot=JSON.stringify(db);
  draft.stored=localStorage.getItem(STORAGE);
  draft.amounts=Object.fromEntries(Object.keys(draft.amounts)
   .filter(id=>{const sale=getSale(id);return sale&&balance(sale)>.009;}).map(id=>[id,'']));
  paymentDraft=draft;
  form.elements.date.value=businessToday();
  if(form.elements.receiptRef){form.elements.receiptRef.value='';if(typeof suggestReceiptField==='function')suggestReceiptField(form.elements.receiptRef);form.elements.receiptRef.dispatchEvent(new Event('input',{bubbles:true}));}
  if(form.elements.concept)form.elements.concept.value='Abono a crédito';
  if(error)error.textContent='';
  pmBatchRemember('sale',draft.clientId,draft.residenceId,payments[0].id,reference,d.date,
   money(rows.reduce((sum,row)=>sum+row.amount,0)));
  renderPaymentSelected();
  renderPaymentResults();
  pmRepaintSales();
  pmBatchRender();
  toast('Abono guardado. Puedes registrar otro con distinta fecha o descargar su comprobante.');
 }catch(e){
  if(error)error.textContent=e.message;
  toast(e.message||'No se pudo guardar el abono.','error');
 }finally{pmBatchBusy=false;}
};

const pmBatchOriginalSubmitOwnerAbono=submitOwnerAbono;
submitOwnerAbono=async function(form){
 if(!pmBatchContinue)return pmBatchOriginalSubmitOwnerAbono(form);
 pmBatchContinue=false;
 if(pmBatchBusy)return;
 const error=document.getElementById('owner-abono-error'),button=document.querySelector('[data-pm-batch-continue]');
 pmBatchBusy=true;
 if(button)button.disabled=true;
 try{
  const draft=ownerPaymentDraft;
  if(!draft||!form?.isConnected||JSON.stringify(db)!==draft.snapshot)
   throw Error('Los datos cambiaron. Abre la ficha de Abonos nuevamente para evitar duplicados.');
  const data=Object.fromEntries(new FormData(form));
  const allocations=[...form.querySelectorAll('[data-owner-statement]')]
   .filter(el=>el.value!=='').map(el=>({statementId:el.dataset.ownerStatement,
    referenceIndex:el.dataset.ownerReference==='group'?null:Number(el.dataset.ownerReference),amount:el.value}));
  const period=form.elements.period?.dataset.pmPeriodEdited==='true'?
   String(data.period||''):String(data.date||'').slice(0,7);
  if(period&&!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(period))throw Error('Mes de cuota inválido.');
  const concept=String(data.concept||'').trim()+(period?' · Mes '+period:'');
  const result=lotigestOwnerPayments.createOwnerPayment(db,{
   ...draft,...data,concept,reviewed:data.reviewed==='on',allocations
  });
  partialAttachOwner(result,form);cloudWrite(JSON.stringify(result.state));
  db=result.state;
  const clientId=draft.clientId,residenceId=draft.residenceId,receipt=result.receipt;
  ownerPaymentDraft=null;
  pmBatchRemember('owner',clientId,residenceId,receipt.id,receipt.id,receipt.date,
   money(receipt.amountCents/100));
  // Reconstruir el formulario en la misma ventana, con el mismo cliente y sus solares.
  // Se reinician importes, fecha y comprobante; no se altera el recibo previo.
  openOwnerAbono(clientId,residenceId);
  pmBatchRender();
  toast('Abono guardado. Puedes registrar otro con otra fecha; comprobante individual disponible.');
  await cloudFlush();
  if(cloudBlocked)toast('El abono quedó pendiente de conciliación con Cloudflare. Revisa el indicador de sincronización.','error');
 }catch(e){
  if(error?.isConnected)error.textContent=e.message;
  toast(e.message||'No se pudo guardar el abono.','error');
 }finally{pmBatchBusy=false;if(button?.isConnected)button.disabled=false;}
};
