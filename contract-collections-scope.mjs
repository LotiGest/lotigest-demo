// LOTIGEST · Vista derivada para Residenciales, solares y cobros.
// Fuente de verdad: fichas contractuales vigentes registradas en Contratos.
// IMPORTANTE: filtra la vista; NUNCA elimina historiales, solares, clientes ni recibos reales.
export function contractCollectionsScope(state,residenceId){
 const original=state||{},lotById=new Map((original.lots||[]).map(l=>[l.id,l]));
 const clientById=new Map((original.clients||[]).map(c=>[c.id,c]));
 const saleById=new Map((original.sales||[]).map(s=>[s.id,s]));
 const selected=new Map();
 for(const d of original.contractTexts||[]){
  if(!d||d.status==='voided'||!d.clientId||!clientById.has(d.clientId))continue;
  if(residenceId&&d.residenceId&&d.residenceId!==residenceId)continue;
  // Cada documento debe identificar un solar concreto. contractLotIds puede
  // contener otros solares del mismo grupo, pero sin su ficha no se asignan.
  const sale=d.saleId?saleById.get(d.saleId):null;
  const lot=lotById.get(d.lotId||sale?.lotId);
  if(!lot||residenceId&&lot.residenceId!==residenceId)continue;
  if(d.residenceId&&lot.residenceId!==d.residenceId)continue;
  if(sale&&(sale.lotId!==lot.id||sale.clientId!==d.clientId))continue;
  const previous=selected.get(lot.id);
  // Una ficha activa tiene prioridad sobre otra pendiente, nunca se mezclan.
  if(!previous||previous.status!=='active'&&d.status==='active')selected.set(lot.id,d);
 }
 const lots=[...selected].map(([id,d])=>({...lotById.get(id),ownerClientId:d.clientId}));
 const lotIds=new Set(lots.map(l=>l.id));
 const clientIds=new Set([...selected.values()].map(d=>d.clientId));
 const sales=(original.sales||[]).filter(s=>{
  const doc=selected.get(s.lotId);
  return doc&&doc.clientId===s.clientId&&
   (doc.saleId===s.id||s.documentId===doc.id||
    (!doc.saleId&&doc.status==='active'&&s.source==='contract-intake'));
 });
 const saleIds=new Set(sales.map(s=>s.id));
 const payments=(original.payments||[]).filter(p=>saleIds.has(p.saleId)&&
  !p.voidedAt&&!p.deletedAt&&!p.cancelledAt);
 return {
  ...original,lots,clients:(original.clients||[]).filter(c=>clientIds.has(c.id)),
  sales,payments,
  contractTexts:[...selected.values()],
  // Se conservarán en base, pero no se deben reconstruir tarjetas ni meses
  // con importaciones del Excel o recibos antiguos todavía sin contrato.
  ownershipStatements:[],historicalContracts:[],historicalPayments:[],ownerPayments:[],
  // La pantalla se limita a solares y apartados de contratos; los apartados
  // originales siguen vivos en inventario y no se modifican.
  reservations:(original.reservations||[]).filter(r=>lotIds.has(r.lotId))
 };
}
