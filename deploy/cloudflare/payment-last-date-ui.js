// LOTIGEST · último pago recibido por cliente y solar; componente informativo.
// No incluye primas pactadas, cuotas futuras, recibos anulados ni historial importado sin confirmar.
function pmLatestClientPayments(clientId,residenceId){
 const rows=[],salesById=new Map(),groups=new Map();
 const reference=p=>String(p.receiptReference||p.receiptRef||p.originalReceiptRef||p.receiptReferenceNormalized||'').trim();
 const inactive=p=>p.voidedAt||p.deletedAt||p.cancelledAt||['voided','cancelled','annulled'].includes(p.status);
 if(!clientId||!residenceId)return {latest:null,bySolar:[]};
 const validDate=value=>{
  const d=String(value||'').slice(0,10);
  return /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(d)?d:'';
 };
 const lotText=lot=>lot?'Etapa '+(lot.stage||'—')+' · Bloque '+(lot.block||'—')+' · Solar '+(lot.sourceNumber||lot.number||lot.id):'';
 for(const s of db.sales||[]){
  const lot=getLot(s.lotId);
  if(s.clientId===clientId&&lot?.residenceId===residenceId&&!inactive(s))
   salesById.set(s.id,lot);
 }
 for(const p of db.payments||[]){
  const lot=salesById.get(p.saleId),date=validDate(p.date);
  const cents=Math.round(Number(p.amount)*100);
  if(!lot||!date||inactive(p)||!Number.isSafeInteger(cents)||cents<=0)continue;
  const key=p.groupId?'sale:'+p.groupId+':'+date:'sale:'+p.id;
  if(!groups.has(key)){const row={date,labels:[],amountCents:0,reference:'',recordedAt:'',parts:new Map()};groups.set(key,row);rows.push(row);}
  const row=groups.get(key),label=lotText(lot),folio=reference(p);
  row.amountCents+=cents;
  if(folio&&!row.reference.split(' / ').includes(folio))row.reference+=(row.reference?' / ':'')+folio;
  if(String(p.recordedAt||p.createdAt||'')>row.recordedAt)row.recordedAt=String(p.recordedAt||p.createdAt||'');
  if(!row.labels.includes(label))row.labels.push(label);
  row.parts.set(label,(row.parts.get(label)||0)+cents);
 }
 for(const p of db.ownerPayments||[]){
  const date=validDate(p.date);
  if(p.clientId!==clientId||p.residenceId!==residenceId||!date||
     inactive(p)||!Number.isSafeInteger(Number(p.amountCents))||Number(p.amountCents)<=0)continue;
  const labels=[];
  for(const allocation of p.allocations||[])for(const ref of allocation.references||[]){
   const lot=ref.lotId?getLot(ref.lotId):null;
   const description=lot?.residenceId===residenceId?lotText(lot):
    'Etapa '+(ref.stage||'—')+' · Bloque '+(ref.block||'—')+' · Solar '+(ref.solar||ref.lot||'—');
   if(!labels.includes(description))labels.push(description);
  }
  const parts=new Map();
  for(const allocation of p.allocations||[]){
   const refs=allocation.references||[];
   if(refs.length!==1)continue; // no atribuir a cada solar el importe conjunto
   const ref=refs[0],lot=ref.lotId?getLot(ref.lotId):null;
   const label=lot?.residenceId===residenceId?lotText(lot):'Etapa '+(ref.stage||'—')+' · Bloque '+(ref.block||'—')+' · Solar '+(ref.solar||ref.lot||'—');
   const amount=Number(allocation.amountCents);
   if(Number.isSafeInteger(amount)&&amount>0)parts.set(label,(parts.get(label)||0)+amount);
  }
  // Si toda la asignación corresponde a un solar, el total sí es identificable.
  if(labels.length===1)parts.set(labels[0],Number(p.amountCents));
  rows.push({date,labels,parts,amountCents:Number(p.amountCents),reference:reference(p),recordedAt:String(p.recordedAt||p.createdAt||'')});
 }
 rows.sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt.localeCompare(a.recordedAt));
 const bySolar=new Map();
 for(const row of rows)for(const label of row.labels){
  if(label&&!bySolar.has(label))bySolar.set(label,{label,date:row.date,reference:row.reference,amountCents:row.parts.get(label)??null,sameReceipt:row===rows[0]});
 }
 return {latest:rows[0]||null,bySolar:[...bySolar.values()]};
}
function pmLastPaymentMoney(cents){return cents==null?'Monto por solar no desglosado':'L '+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function pmLastPaymentDetails(item){
 const info=pmNode('div','pm-last-payment-details');
 info.append(pmNode('strong','pm-last-payment-amount',pmLastPaymentMoney(item.amountCents)),pmNode('span','pm-last-payment-reference','Correlativo: '+(item.reference||'Sin registrar')));
 return info;
}
function pmUpdateLastPayment(clientId,residenceId){
 const root=document.getElementById('pm-last-payment');
 if(!root)return;
 root.replaceChildren();
 const {latest,bySolar}=pmLatestClientPayments(clientId,residenceId);
 const heading=pmNode('div','pm-last-payment-main');
 heading.append(pmNode('small','','Fecha del último pago registrado'),
  pmNode('strong','',latest?pmReadableDate(latest.date):clientId?'Sin pagos registrados':'Selecciona un cliente'));
 if(latest)heading.append(pmLastPaymentDetails(latest));
 heading.append(pmNode('p','',latest?
  'Fecha del recibo, no de la cuota.':
  clientId?'Este cliente todavía no tiene un pago confirmado en esta residencial.':
  'La fecha aparecerá al seleccionar al cliente.'));
 root.append(heading);
 if(bySolar.length>1){
  const list=pmNode('div','pm-last-payment-solares');
  list.append(pmNode('small','','Último pago por solar:'));
  for(const item of bySolar){
   const line=pmNode('div','pm-last-payment-solar');
   const label=pmNode('span','',item.label),detail=pmNode('div','pm-last-payment-solar-detail');
   detail.append(pmNode('strong','pm-last-payment-amount',pmLastPaymentMoney(item.amountCents)));
   if(!item.sameReceipt){
    const other=pmNode('span','pm-last-payment-other','Otro recibo');
    if(item.date!==latest.date)other.append(pmNode('span','',' · '+pmReadableDate(item.date)));
    other.append(pmNode('span','pm-last-payment-reference',' · #'+(item.reference||'Sin registrar')));
    detail.append(other);
   }
   line.append(label,detail);
   list.append(line);
  }
  root.append(list);
 }else if(bySolar.length===1&&latest){
  root.append(pmNode('small','pm-last-payment-lot',bySolar[0].label));
 }
}
