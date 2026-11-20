// LOTIGEST · Reconciliar únicamente vínculos provisionales propietario↔solar.
// No eliminar clientes, solares, contratos, ventas, apartados ni pagos.
export function auditOrphanOwnerLinks(state,residenceId=null){
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
  p.lotId===lotId||(p.references||[]).some(x=>x.lotId===lotId)||
  (p.allocations||[]).some(a=>(a.references||[]).some(x=>x.lotId===lotId)));
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
  const anyHistorical=connected(state.historicalPayments||[],lot.id)||
   (state.historicalContracts||[]).some(h=>h.lotId===lot.id||salesById.get(h.saleId)?.lotId===lot.id);
  const reasons=[];
  if(!owner)reasons.push('cliente no disponible');
  if(hasThisContract)reasons.push('contrato vigente');
  else if(docs.length)reasons.push('contrato de otra persona');
  if(anySales)reasons.push('venta registrada');
  if(anyReservation)reasons.push('apartado o reserva');
  if(lot.pendingContractId)reasons.push('contrato pendiente');
  if(anyOwnerPayment)reasons.push('recibo de propietario');
  if(anyStatements)reasons.push('ficha histórica de propietario');
  if(anyHistorical)reasons.push('historial financiero');
  if(['sold','reserved'].includes(lot.status))reasons.push('estado del solar requiere revisión');
  const item={lotId:lot.id,residenceId:lot.residenceId,clientId:lot.ownerClientId,
   clientName:owner?.name||'Cliente por revisar',stage:lot.stage??'',block:lot.block??'',
   number:lot.sourceNumber||lot.number||lot.id,reason:reasons.length?reasons.join(' · '):
    activeDocs.some(d=>d.clientId===lot.ownerClientId)?
     'solar adicional sin contrato (solo vínculo provisional)':'cliente sin contrato (solo vínculo provisional)'};
  if(reasons.length)protectedLinks.push(item);else candidates.push(item);
 }
 return {candidates,protectedLinks,totals:{candidates:candidates.length,protected:protectedLinks.length}};
}
export function removeOrphanOwnerLinks(state,selectedIds,residenceId=null){
 if(!Array.isArray(selectedIds)||!selectedIds.length)throw Error('Selecciona solares para desvincular.');
 if(selectedIds.length>20)throw Error('Por seguridad, limpia hasta 20 asociaciones a la vez; vuelve a revisar antes de continuar.');
 const unique=new Set(selectedIds);
 if(unique.size!==selectedIds.length||[...unique].some(x=>typeof x!=='string'||!x))
  throw Error('Selección incompatible.');
 const review=auditOrphanOwnerLinks(state,residenceId);
 const allowed=new Set(review.candidates.map(x=>x.lotId));
 for(const id of unique)if(!allowed.has(id))throw Error('El solar '+id+' ya no es seguro para desvincular.');
 const next=structuredClone(state);let changed=0;
 for(const lot of next.lots){
  if(!unique.has(lot.id))continue;
  delete lot.ownerClientId;
  changed++;
 }
 if(changed!==unique.size)throw Error('No se pudo validar toda la selección.');
 return {state:next,changed,links:review.candidates.filter(x=>unique.has(x.lotId))};
}
