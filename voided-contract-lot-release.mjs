// LOTIGEST · Liberar un solar de un contrato anulado sin borrar su historial.
// No modifica ventas, primas, abonos, clientes ni otros solares.
export function auditVoidedContractSolarRelease(state,documentId,lotId,residenceId=null){
 const doc=(state.contractTexts||[]).find(x=>x.id===documentId);
 const lot=(state.lots||[]).find(x=>x.id===lotId);
 const reasons=[];
 if(!doc||doc.status!=='voided')reasons.push('El contrato no existe o no está anulado.');
 if(!lot)reasons.push('El solar no existe.');
 if(!doc||!lot)return {allowed:false,reasons,documentId,lotId};
 if(doc.residenceId!==lot.residenceId||(residenceId&&doc.residenceId!==residenceId))
  reasons.push('La ficha y el solar pertenecen a otra residencial.');
 const saleById=new Map((state.sales||[]).map(s=>[s.id,s]));
 const refs=new Set([doc.lotId,...(doc.contractLotIds||[]),saleById.get(doc.saleId)?.lotId].filter(Boolean));
 if(!refs.has(lot.id))reasons.push('El solar no corresponde a este contrato anulado.');
 if((doc.lotReleaseHistory||[]).some(x=>x.lotId===lot.id))reasons.push('El solar ya fue liberado de esta ficha.');
 if(!doc.clientId)reasons.push('El contrato no identifica al cliente.');
 if(lot.ownerClientId&&lot.ownerClientId!==doc.clientId)reasons.push('El terreno tiene otro propietario.');
 if(lot.clientId&&lot.clientId!==doc.clientId)reasons.push('Existe otro cliente vinculado al terreno.');
 if(lot.pendingContractId&&lot.pendingContractId!==doc.id)reasons.push('Hay otro contrato pendiente para el solar.');
 if(lot.contractId&&lot.contractId!==doc.id)reasons.push('Existe otro contrato vinculado.');
 if(lot.type==='private'||lot.status==='private'||lot.purchaseFromPlan)
  reasons.push('El terreno es privado o figura vendido en el plano original.');
 if(!['available','sold','reserved'].includes(lot.status))reasons.push('Estado del solar no reconocido; requiere revisión.');
 if(lot.mapDebtFlag)reasons.push('Hay una alerta de mora o deuda.');
 if(doc.saleId)
  reasons.push('Esta ficha contiene una referencia de venta; debe revisarse antes de liberar.');
 if((state.sales||[]).some(s=>s.lotId===lot.id))
  reasons.push('Existe una venta registrada; no es posible liberar este terreno.');
 const mentions=d=>d.lotId===lot.id||(d.contractLotIds||[]).includes(lot.id)||
  saleById.get(d.saleId)?.lotId===lot.id;
 if((state.contractTexts||[]).some(d=>d.id!==doc.id&&d.status!=='voided'&&mentions(d)))
  reasons.push('Hay un contrato vigente de este solar.');
 if((state.reservations||[]).some(x=>x.lotId===lot.id&&!['expired','cancelled','voided'].includes(x.status)))
  reasons.push('Hay un apartado o reserva activo.');
 if((state.clientRequests||[]).some(x=>x.lotId===lot.id&&!['rejected','cancelled','voided'].includes(x.status)))
  reasons.push('Hay una solicitud pública pendiente.');
 const linked=record=>record&&typeof record==='object'&&(
  record.lotId===lot.id||(record.lotIds||[]).includes(lot.id)||
  (record.references||[]).some(r=>r.lotId===lot.id)||
  (record.allocations||[]).some(a=>a.lotId===lot.id||(a.references||[]).some(r=>r.lotId===lot.id))||
  (record.saleId&&saleById.get(record.saleId)?.lotId===lot.id));
 const ambiguous=record=>record?.clientId===doc.clientId&&record?.residenceId===doc.residenceId&&
  !record.lotId&&!record.saleId&&!(record.lotIds||[]).length&&
  !(record.references||[]).length&&!(record.allocations||[]).length;
 for(const [key,label] of [
  ['payments','abonos'],['ownerPayments','abonos de propietario'],
  ['historicalPayments','pagos históricos'],['historicalContracts','contratos históricos'],
  ['ownershipStatements','fichas históricas'],['cashEntries','movimientos de caja'],
  ['receipts','recibos emitidos']]){
  if((state[key]||[]).some(x=>linked(x)||ambiguous(x)))
   reasons.push('Hay '+label+' vinculados o sin conciliar.');
 }
 const map=state.residences?.find(r=>r.id===lot.residenceId)?.records?.[lot.sourceFeatureKey];
 if(map?.lotId&&map.lotId!==lot.id)reasons.push('El plano oficial relaciona la figura con otro solar.');
 return {allowed:reasons.length===0,reasons,documentId:doc.id,lotId:lot.id,
  clientId:doc.clientId,residenceId:doc.residenceId,stage:lot.stage,
  block:lot.block,number:lot.sourceNumber||lot.number||lot.id,
  previousStatus:lot.status,hasOwner:lot.ownerClientId===doc.clientId||lot.clientId===doc.clientId};
}
export function releaseVoidedContractSolar(state,documentId,lotId,residenceId,actor,reason,at=new Date().toISOString()){
 const audit=auditVoidedContractSolarRelease(state,documentId,lotId,residenceId);
 if(!audit.allowed)throw Error('No se puede liberar el solar: '+audit.reasons.join(' '));
 if(!String(actor||'').trim())throw Error('Se requiere identificación del administrador.');
 const why=String(reason||'').trim();
 if(why.length<5||why.length>300)throw Error('Escribe un motivo de 5 a 300 caracteres.');
 const next=JSON.parse(JSON.stringify(state)),doc=next.contractTexts.find(d=>d.id===documentId);
 const lot=next.lots.find(l=>l.id===lotId);
 const previousOwner=lot.ownerClientId||lot.clientId||null,previousStatus=lot.status;
 if(lot.ownerClientId===doc.clientId)delete lot.ownerClientId;
 if(lot.clientId===doc.clientId)delete lot.clientId;
 if(lot.pendingContractId===doc.id)delete lot.pendingContractId;
 if(lot.contractId===doc.id)delete lot.contractId;
 if(['sold','reserved'].includes(lot.status))lot.status='available';
 const map=next.residences?.find(r=>r.id===lot.residenceId)?.records?.[lot.sourceFeatureKey];
 if(map&&(!map.lotId||map.lotId===lot.id)&&['sold','reserved'].includes(map.status))
  map.status='available';
 doc.lotReleaseHistory??=[];
 doc.lotReleaseHistory.push({lotId:lot.id,at,by:String(actor).trim().slice(0,120),reason:why,
  previousOwnerClientId:previousOwner,previousStatus});
 doc.updatedAt=at;
 return {state:next,lotId:lot.id,documentId:doc.id,previousStatus,unlinked:!!previousOwner};
}
