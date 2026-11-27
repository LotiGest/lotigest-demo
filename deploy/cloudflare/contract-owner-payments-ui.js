// Reconcile legacy owner receipts in READS, never in the state sent to D1.
(function installContractOwnerReadModel(){
 let cache=new WeakMap();
 function read(state){
  if(!(state.ownerPayments||[]).length)return state;
  const prior=cache.get(state),keys=[state.payments,state.payments?.length,state.ownerPayments,state.ownerPayments?.length,state.sales,state.contractTexts];
  if(prior&&keys.every((v,i)=>v===prior.keys[i]))return prior.view;
  const view=contractPaymentReadView(state);cache.set(state,{keys,view});return view;
 }
 function withRead(fn,args){const original=db;db=read(original);try{return fn(...args);}finally{db=original;}}
 const originalRender=render;
 render=function(...args){cache=new WeakMap();return originalRender(...args);};
 const originalPaid=paidAmount;
 paidAmount=function(...args){return withRead(originalPaid,args);};
 const originalCalendar=pmReconciled;
 pmReconciled=function(...args){return withRead(originalCalendar,args);};
 const originalHistory=pmHistoryRows;
 pmHistoryRows=function(...args){return withRead(originalHistory,args);};
 const originalLatest=pmLatestClientPayments;
 pmLatestClientPayments=function(...args){return withRead(originalLatest,args);};
 const originalPrima=lotigestPrimaStatus;
 lotigestPrimaStatus=function(...args){return withRead(originalPrima,args);};
 const originalReceipt=paymentReceiptPreview;
 paymentReceiptPreview=function(id){
  const projected=read(db).payments.find(p=>p.id===id&&p.contractOwnerView);
  return originalReceipt(projected?.sourceOwnerPaymentId||id);
 };
 const originalOpen=openOwnerAbono;
 openOwnerAbono=function(clientId,requestedResidenceId=null){
  const rid=requestedResidenceId||residence().id,scope=contractCollectionsScope(db,rid);
  const sales=scope.sales.filter(s=>s.clientId===clientId&&balance(s)>.009);
  const docs=(db.ownershipStatements||[]).filter(s=>s.clientId===clientId&&s.residenceId===rid);
  const ids=new Set(scope.sales.filter(s=>s.clientId===clientId).map(s=>s.lotId));
  // Only replace the legacy form when every referenced lot has a verified contract.
  if(sales.length&&docs.length&&docs.every(d=>d.references?.length&&d.references.every(r=>ids.has(r.lotId)))){
   if(requestedResidenceId&&db.residences.some(r=>r.id===rid))db.currentResidence=rid;
   ownerPaymentDraft=null;baseNewPayment(sales[0].id);
   if(!paymentDraft||!document.getElementById('multi-payment-form'))return;
   paymentDraft.clientId=clientId;paymentDraft.amounts=Object.fromEntries(sales.map(s=>[s.id,'']));
   const input=document.getElementById('multi-payment-search');if(input)input.value=getClient(clientId)?.name||'';
   renderPaymentResults();renderPaymentSelected();return;
  }
  return originalOpen(clientId,requestedResidenceId);
 };
})();
