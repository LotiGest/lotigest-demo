// LOTIGEST · último pago recibido por cliente y solar; componente informativo.
// No incluye primas pactadas, cuotas futuras, recibos anulados ni historial importado sin confirmar.
function pmLatestClientPayments(clientId,residenceId){
 const rows=[],salesById=new Map();
 if(!clientId||!residenceId)return {latest:null,bySolar:[]};
 const validDate=value=>{
  const d=String(value||'').slice(0,10);
  return /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(d)?d:'';
 };
 const lotText=lot=>lot?'Etapa '+(lot.stage||'—')+' · Bloque '+(lot.block||'—')+' · Solar '+(lot.sourceNumber||lot.number||lot.id):'';
 for(const s of db.sales||[]){
  const lot=getLot(s.lotId);
  if(s.clientId===clientId&&lot?.residenceId===residenceId&&!s.voidedAt&&!s.deletedAt)
   salesById.set(s.id,lot);
 }
 for(const p of db.payments||[]){
  const lot=salesById.get(p.saleId),date=validDate(p.date);
  if(!lot||!date||p.voidedAt||p.deletedAt||p.cancelledAt||Number(p.amount||0)<=0)continue;
  rows.push({date,labels:[lotText(lot)]});
 }
 for(const p of db.ownerPayments||[]){
  const date=validDate(p.date);
  if(p.clientId!==clientId||p.residenceId!==residenceId||!date||
     p.voidedAt||p.deletedAt||p.cancelledAt||Number(p.amountCents||0)<=0)continue;
  const labels=[];
  for(const allocation of p.allocations||[])for(const ref of allocation.references||[]){
   const lot=ref.lotId?getLot(ref.lotId):null;
   const description=lot?.residenceId===residenceId?lotText(lot):
    'Etapa '+(ref.stage||'—')+' · Bloque '+(ref.block||'—')+' · Solar '+(ref.solar||ref.lot||'—');
   if(!labels.includes(description))labels.push(description);
  }
  rows.push({date,labels});
 }
 rows.sort((a,b)=>b.date.localeCompare(a.date));
 const bySolar=new Map();
 for(const row of rows)for(const label of row.labels){
  if(label&&!bySolar.has(label))bySolar.set(label,row.date);
 }
 return {latest:rows[0]||null,bySolar:[...bySolar].map(([label,date])=>({label,date}))};
}
function pmUpdateLastPayment(clientId,residenceId){
 const root=document.getElementById('pm-last-payment');
 if(!root)return;
 root.replaceChildren();
 const {latest,bySolar}=pmLatestClientPayments(clientId,residenceId);
 const heading=pmNode('div','pm-last-payment-main');
 heading.append(pmNode('small','','Fecha del último pago registrado'),
  pmNode('strong','',latest?pmReadableDate(latest.date):clientId?'Sin pagos registrados':'Selecciona un cliente'));
 heading.append(pmNode('p','',latest?
  'Fecha real del recibo de prima o abono; no es necesariamente el mes de cuota que se pagó.':
  clientId?'Este cliente todavía no tiene un pago confirmado en esta residencial.':
  'La fecha aparecerá al seleccionar al cliente.'));
 root.append(heading);
 if(bySolar.length>1){
  const list=pmNode('div','pm-last-payment-solares');
  list.append(pmNode('small','','Último pago por solar:'));
  for(const item of bySolar){
   const line=pmNode('div','pm-last-payment-solar');
   line.append(pmNode('span','',item.label),pmNode('strong','',pmReadableDate(item.date)));
   list.append(line);
  }
  root.append(list);
 }else if(bySolar.length===1&&latest){
  root.append(pmNode('small','pm-last-payment-lot',bySolar[0].label));
 }
}
