// LOTIGEST · Revisión conservadora de compras SIN contrato.
// No ejecutar sobre D1 automáticamente. Solo administrador, vista previa, respaldo y confirmación.
export function auditUncontractedSales(state,residenceId=null){
 const candidates=[],protectedSales=[];
 const lots=new Map((state.lots||[]).map(l=>[l.id,l]));
 const clients=new Map((state.clients||[]).map(c=>[c.id,c]));
 const hasLot=(record,lotId)=>
  record?.lotId===lotId||
  (record?.references||[]).some(r=>r.lotId===lotId)||
  (record?.allocations||[]).some(a=>(a.references||[]).some(r=>r.lotId===lotId));
 for(const sale of state.sales||[]){
  const lot=lots.get(sale.lotId);
  if(!lot||(residenceId&&lot.residenceId!==residenceId))continue;
  const reasons=[];
  const docs=(state.contractTexts||[]).filter(d=>
   d.saleId===sale.id||d.lotId===lot.id||
   (Array.isArray(d.contractLotIds)&&d.contractLotIds.includes(lot.id)));
  if(docs.length)reasons.push('documento contractual guardado');
  if((state.historicalContracts||[]).some(h=>h.saleId===sale.id||h.lotId===lot.id))
   reasons.push('contrato histórico');
  if((state.payments||[]).some(p=>p.saleId===sale.id))
   reasons.push('abonos o recibos vinculados');
  if(Number(sale.openingPaid||0)>0||Number(sale.paid||0)>0||
     Number(sale.paidAmount||0)>0||Number(sale.downPaid||0)>0)
   reasons.push('saldo o pago anterior registrado');
  if((state.ownerPayments||[]).some(p=>p.clientId===sale.clientId&&
      p.residenceId===lot.residenceId))
   reasons.push('abonos de propietario en esta residencial');
  if((state.historicalPayments||[]).some(p=>p.saleId===sale.id||
      hasLot(p,lot.id)||(p.clientId===sale.clientId&&p.residenceId===lot.residenceId)))
   reasons.push('pagos históricos o por conciliar');
  if((state.ownershipStatements||[]).some(p=>hasLot(p,lot.id)||
      p.clientId===sale.clientId&&p.residenceId===lot.residenceId))
   reasons.push('ficha histórica de propietario');
  if((state.reservations||[]).some(r=>r.lotId===lot.id&&!['expired','cancelled'].includes(r.status)))
   reasons.push('apartado o reserva vigente');
  if(sale.sourceRequestId||(state.clientRequests||[]).some(r=>
      r.saleId===sale.id||r.lotId===lot.id&&r.status!=='rejected'))
   reasons.push('solicitud pública de compra');
  if((state.sales||[]).some(s=>s!==sale&&s.lotId===lot.id))
   reasons.push('otra venta asociada al solar');
  if(lot.pendingContractId)reasons.push('contrato pendiente del solar');
  if(lot.mapDebtFlag)reasons.push('mora o deuda señalada en el mapa');
  if(lot.status==='reserved'||lot.status==='private'||lot.type==='private')
   reasons.push('estado protegido del solar');
  if(lot.ownerClientId&&lot.ownerClientId!==sale.clientId)
   reasons.push('otro propietario vinculado al solar');
  const row={saleId:sale.id,lotId:lot.id,clientId:sale.clientId,
   clientName:clients.get(sale.clientId)?.name||'Cliente no disponible',
   stage:lot.stage||'',block:lot.block||'',number:lot.sourceNumber||lot.number||lot.id,
   date:sale.date||'',status:lot.status,
   reason:reasons.join(' · ')||'Compra sin contrato ni pagos; revisable para retirarla'};
  (reasons.length?protectedSales:candidates).push(row);
 }
 return {candidates,protectedSales,totals:{candidates:candidates.length,protected:protectedSales.length}};
}
export function removeUncontractedSales(state,selectedSaleIds,residenceId=null){
 if(!Array.isArray(selectedSaleIds)||!selectedSaleIds.length||selectedSaleIds.length>20)
  throw Error('Selecciona entre 1 y 20 compras para revisar por operación.');
 const unique=new Set(selectedSaleIds);
 if(unique.size!==selectedSaleIds.length||[...unique].some(x=>typeof x!=='string'||!x))
  throw Error('La selección tiene datos inválidos.');
 const audit=auditUncontractedSales(state,residenceId);
 const allowed=new Set(audit.candidates.map(c=>c.saleId));
 for(const id of unique)if(!allowed.has(id))
  throw Error('La compra '+id+' tiene algún respaldo o cambió. Revisa antes de continuar.');
 const next=JSON.parse(JSON.stringify(state));
 const selected=next.sales.filter(s=>unique.has(s.id));
 if(selected.length!==unique.size)throw Error('Faltan compras de la selección.');
 next.sales=next.sales.filter(s=>!unique.has(s.id));
 const affected=[];
 for(const sale of selected){
  const lot=next.lots.find(l=>l.id===sale.lotId);
  if(!lot)throw Error('Solar perdido: '+sale.lotId);
  if(lot.ownerClientId===sale.clientId)delete lot.ownerClientId;
  if(lot.status==='sold')lot.status='available';
  affected.push({saleId:sale.id,lotId:lot.id,clientId:sale.clientId});
 }
 return {state:next,changed:selected.length,affected};
}
