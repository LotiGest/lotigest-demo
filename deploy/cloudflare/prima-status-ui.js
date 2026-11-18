// Estado de prima en Abonos. Lectura de los registros sin crear deudas ni modificar pagos.
// Fuente principal: venta contractual; respaldo documental: prima importada y recibos.
function lotigestPrimaStatus(clientId,rid,selectedLotIds=null){
 const ids=selectedLotIds?new Set(selectedLotIds):
  new Set((db.lots||[]).filter(l=>l.residenceId===rid&&(l.ownerClientId===clientId||
   (db.sales||[]).some(s=>s.lotId===l.id&&s.clientId===clientId))).map(l=>l.id));
 const linked=r=>r&&ids.has(r.lotId);
 const sales=(db.sales||[]).filter(s=>s.clientId===clientId&&ids.has(s.lotId));
 const cents=n=>Math.round(Number(n||0)*100);
 const contracted=sales.filter(s=>s.type==='credit'&&Number(s.downPayment)>0);
 const agreedCents=contracted.reduce((sum,s)=>sum+cents(s.downPayment),0);
 const paidCents=contracted.reduce((sum,s)=>sum+Math.max(0,Math.min(cents(s.downPayment),cents(paidAmount(s.id)))),0);
 if(agreedCents>0){
  const remainingCents=Math.max(0,agreedCents-paidCents);
  return {
   kind:remainingCents===0?'paid':paidCents===0?'missing':'partial',
   label:remainingCents===0?'Prima cubierta':paidCents===0?'Sin prima registrada':'Prima incompleta',
   agreedCents,paidCents,remainingCents,contractVerified:true
  };
 }
 const docs=(db.ownershipStatements||[]).filter(s=>s.clientId===clientId&&s.residenceId===rid&&
  (s.references||[]).some(linked));
 const relatedOwner=(db.ownerPayments||[]).filter(p=>p.clientId===clientId&&p.residenceId===rid&&!p.voidedAt&&!p.deletedAt&&
  /^prima\b/i.test(String(p.concept||''))&&
  (p.allocations||[]).some(a=>(a.references||[]).some(linked)));
 const receiptCents=relatedOwner.reduce((sum,p)=>sum+Math.max(0,cents(Number(p.amountCents||0)/100)),0);
 const statementIds=new Set(docs.flatMap(s=>s.paymentIds||[]));
 const imported=(db.historicalPayments||[]).filter(p=>p.residenceId===rid&&p.type==='PRIMA'&&
  (p.clientId===clientId||statementIds.has(p.id))&&
  (ids.has(p.lotId)||(p.references||[]).some(linked)||statementIds.has(p.id))&&
  Number.isSafeInteger(p.amountCents)&&p.amountCents>0);
 const importedCents=imported.reduce((sum,p)=>sum+p.amountCents,0);
 // Un valor de prima del Excel puede ser el mismo recibo histórico;
 // se toma el máximo y NO se suma dos veces la misma documentación.
 const documentCents=Math.max(0,...docs.filter(s=>Number.isSafeInteger(s.documentedDownPaymentCents)&&s.documentedDownPaymentCents>=0)
  .map(s=>s.documentedDownPaymentCents));
 const recordedCents=Math.max(documentCents,receiptCents,importedCents);
 if(recordedCents>0)return {kind:'recorded',label:'Prima registrada',agreedCents:null,
  paidCents:recordedCents,remainingCents:null,contractVerified:false};
 // Un cero explícito del Excel significa "sin prima documentada", no
 // prueba absoluta de que el cliente nunca haya pagado.
 const documentedZero=docs.some(s=>s.documentedDownPaymentCents===0);
 if(documentedZero)return {kind:'missing-record',label:'Sin prima registrada',agreedCents:null,
  paidCents:0,remainingCents:null,contractVerified:false};
 return {kind:'unknown',label:'Prima por verificar',agreedCents:null,
  paidCents:null,remainingCents:null,contractVerified:false};
}
function lotigestPrimaHighlight(status){
 return ['missing','missing-record','partial'].includes(status.kind);
}
function lotigestPrimaLabel(status){
 if(status.kind==='missing'||status.kind==='partial')
  return status.label+' · falta '+money(status.remainingCents/100);
 if(status.kind==='recorded')return 'Prima registrada · al menos '+money(status.paidCents/100);
 if(status.kind==='paid')return 'Prima cubierta · '+money(status.paidCents/100);
 if(status.kind==='missing-record')return 'Sin prima registrada · monto pactado por verificar';
 return 'Prima por verificar · faltan datos del contrato';
}
