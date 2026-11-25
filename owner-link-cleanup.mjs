// LOTIGEST · Reconciliar únicamente vínculos provisionales propietario↔solar.
// No eliminar clientes, solares, contratos, ventas, apartados ni pagos.
export function auditOrphanOwnerLinks(state,residenceId=null,allowImported=false){
 const candidates=[],protectedLinks=[],clients=new Map((state.clients||[]).map(c=>[c.id,c]));
 const salesById=new Map((state.sales||[]).map(s=>[s.id,s]));
 const activeDocs=(state.contractTexts||[]).filter(d=>d.status!=='voided');
 const validDocLots=new Map();
 for(const d of activeDocs){
  const ids=new Set([d.lotId,...(d.contractLotIds||[]),salesById.get(d.saleId)?.lotId].filter(Boolean));
  for(const id of ids){
   if(!validDocLots.has(id))validDocLots.set(id,[]);
   validDocLots.get(id).push(d);
  }
 }
 const connected=(records,lotId)=>records.some(p=>
  p.lotId===lotId||(p.lotIds||[]).includes(lotId)||
  (p.saleId&&salesById.get(p.saleId)?.lotId===lotId)||
  (p.references||[]).some(x=>x.lotId===lotId)||
  (p.allocations||[]).some(a=>a.lotId===lotId||(a.references||[]).some(x=>x.lotId===lotId)));
 for(const lot of state.lots||[]){
  if(!lot.ownerClientId||(residenceId&&lot.residenceId!==residenceId))continue;
  const owner=clients.get(lot.ownerClientId);
  const docs=validDocLots.get(lot.id)||[];
  const hasThisContract=docs.some(d=>d.clientId===lot.ownerClientId);
  const anySales=(state.sales||[]).some(s=>s.lotId===lot.id);
  const anyReservation=(state.reservations||[]).some(x=>x.lotId===lot.id&&
   !['expired','cancelled'].includes(x.status));
  const anyOwnerPayment=connected(state.ownerPayments||[],lot.id);
  const anyStatements=connected(state.ownershipStatements||[],lot.id);
  const historicalRows=(state.historicalPayments||[]).filter(p=>connected([p],lot.id));
  const historicalDocs=(state.historicalContracts||[]).filter(p=>connected([p],lot.id));
  const statementRows=(state.ownershipStatements||[]).filter(p=>connected([p],lot.id));
  const anyHistorical=historicalRows.length>0||historicalDocs.length>0;
  // Solo datos documentales importados sin contabilizar; jamás liberar una venta
  // ni un cobro real. Las referencias históricas quedan intactas.
  const importedEvidence=historicalRows.length>0||historicalDocs.length>0||
   statementRows.some(p=>p.sourceName||p.sourceSheet);
  const importedOnly=allowImported&&importedEvidence&&
   historicalRows.every(p=>!p.postedPaymentId&&!p.saleId)&&
   historicalDocs.every(p=>!p.saleId&&p.status!=='posted')&&
   statementRows.every(p=>p.sourceName||p.sourceSheet);
  const anyFinancial=['payments','receipts','cashEntries'].some(key=>connected(state[key]||[],lot.id));
  // Cuando un recibo solo tiene cliente y residencial, no asumir que pertenece a otro solar.
  const anyAmbiguous=['payments','ownerPayments','historicalPayments','historicalContracts',
   'receipts','cashEntries','ownershipStatements'].some(key=>(state[key]||[]).some(p=>
    p.clientId===lot.ownerClientId&&(!p.residenceId||p.residenceId===lot.residenceId)&&
    !p.lotId&&!p.saleId&&!(p.lotIds||[]).length&&
    !(p.references||[]).length&&!(p.allocations||[]).length));
  const anyRequest=(state.clientRequests||[]).some(p=>p.lotId===lot.id&&
   !['rejected','cancelled','voided'].includes(p.status));
  const plan=state.residences?.find(r=>r.id===lot.residenceId)?.records?.[lot.sourceFeatureKey];

  const reasons=[];
  if(!owner)reasons.push('cliente no disponible');
  if(hasThisContract)reasons.push('contrato vigente');
  else if(docs.length)reasons.push('contrato de otra persona');
  if(lot.type==='private'||lot.status==='private')reasons.push('propiedad privada');
  if(anySales)reasons.push('venta registrada');
  if(anyReservation)reasons.push('apartado o reserva');
  if(lot.pendingContractId)reasons.push('contrato pendiente');
  if(anyOwnerPayment)reasons.push('recibo de propietario');
  if(anyStatements&&!importedOnly)reasons.push('ficha histórica de propietario');
  if(anyHistorical&&!importedOnly)reasons.push('historial financiero');
  if(anyFinancial||anyAmbiguous)reasons.push('pagos, caja o recibos vinculados o sin conciliar');
  if(anyRequest)reasons.push('solicitud pública pendiente');
  if((lot.mapDebtFlag||lot.historyRequiresReview)&&!importedOnly)reasons.push('deuda o historial pendiente de revisión');
  if(lot.contractId||lot.pendingContractId)reasons.push('referencia contractual del terreno');
  if(lot.clientId&&lot.clientId!==lot.ownerClientId)reasons.push('otro cliente relacionado con el solar');
  if(plan?.lotId&&plan.lotId!==lot.id)reasons.push('croquis asociado con otro solar');
  if(plan?.status==='reserved')reasons.push('apartado señalado en croquis');
  // "Comprado" por una carga provisional de Excel no equivale a una venta real.
  if(!['available','sold'].includes(lot.status))reasons.push('estado del solar requiere revisión');
  const item={lotId:lot.id,residenceId:lot.residenceId,clientId:lot.ownerClientId,
   clientName:owner?.name||'Cliente por revisar',stage:lot.stage??'',block:lot.block??'',
   number:lot.sourceNumber||lot.number||lot.id,previousStatus:lot.status,
   importedOnly:Boolean(importedOnly),reason:reasons.length?reasons.join(' · '):
    importedOnly?'asignación importada sin contabilizar: se conserva historial separado':
    lot.status==='sold'?'marcado Comprado sin venta real: se podrá liberar con respaldo':
    activeDocs.some(d=>d.clientId===lot.ownerClientId)?
     'solar adicional sin contrato (solo vínculo provisional)':'cliente sin contrato (solo vínculo provisional)'};
  if(reasons.length)protectedLinks.push(item);else candidates.push(item);
 }
 return {candidates,protectedLinks,totals:{candidates:candidates.length,protected:protectedLinks.length}};
}
export function removeOrphanOwnerLinks(state,selectedIds,residenceId=null,
 actor='Administrador',reason='Corrección de asignación provisional',at=new Date().toISOString(),allowImported=false,allowBulk=false){
 if(!Array.isArray(selectedIds)||!selectedIds.length)throw Error('Selecciona solares para desvincular.');
 if(!allowBulk&&selectedIds.length>20)throw Error('Por seguridad, limpia hasta 20 asociaciones a la vez; vuelve a revisar antes de continuar.');
 const unique=new Set(selectedIds);
 if(unique.size!==selectedIds.length||[...unique].some(x=>typeof x!=='string'||!x))
  throw Error('Selección incompatible.');
 const who=String(actor||'').trim(),why=String(reason||'').trim();
 if(!who||why.length<5||why.length>300)throw Error('Identifica al administrador y escribe un motivo de 5 a 300 caracteres.');
 const review=auditOrphanOwnerLinks(state,residenceId,allowImported);
 const candidateById=new Map(review.candidates.map(x=>[x.lotId,x]));
 const allowed=new Set(candidateById.keys());
 for(const id of unique)if(!allowed.has(id))throw Error('El solar '+id+' ya no es seguro para desvincular.');
 const next=JSON.parse(JSON.stringify(state));let changed=0;
 for(const lot of next.lots){
  if(!unique.has(lot.id))continue;
  const previousOwnerClientId=lot.ownerClientId,previousStatus=lot.status;
  const previousPurchaseFromPlan=Boolean(lot.purchaseFromPlan);
  lot.ownerUnlinkHistory??=[];
  lot.ownerUnlinkHistory.push({at,by:who.slice(0,120),reason:why,
   previousOwnerClientId,previousStatus,previousPurchaseFromPlan});
  const candidate=candidateById.get(lot.id);
  if(candidate?.importedOnly){
   lot.ownerUnlinkHistory.at(-1).legacyImportArchived=true;
   lot.ownerUnlinkHistory.at(-1).previousMapDebtFlag=lot.mapDebtFlag;
   lot.ownerUnlinkHistory.at(-1).previousHistoryRequiresReview=lot.historyRequiresReview;
   lot.mapDebtFlag=false;lot.historyRequiresReview=false;
  }
  delete lot.ownerClientId;
  if(lot.clientId===previousOwnerClientId)delete lot.clientId;
  if(['sold'].includes(lot.status))lot.status='available';
  if(previousPurchaseFromPlan)lot.purchaseFromPlan=false;
  const plan=next.residences?.find(r=>r.id===lot.residenceId)?.records?.[lot.sourceFeatureKey];
  if(plan&&(!plan.lotId||plan.lotId===lot.id)&&plan.status==='sold')plan.status='available';
  changed++;
 }
 if(changed!==unique.size)throw Error('No se pudo validar toda la selección.');
 return {state:next,changed,links:review.candidates.filter(x=>unique.has(x.lotId))};
}
