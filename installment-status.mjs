// La ficha contractual activa es la fuente de las fechas pactadas. No modifica datos.
export function installmentSalesFromContracts(sales,documents){
 const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 return sales.map(s=>{
  const doc=(documents||[]).find(d=>d.status!=='voided'&&d.status!=='pending-sale'&&(d.saleId===s.id||s.documentId&&d.id===s.documentId));
  const t=doc?.structured;
  if(s.type!=='credit'||!valid(t?.date)||!valid(t?.firstDueDate)||t.firstDueDate<t.date)return s;
  return {...s,date:t.date,firstDueDate:t.firstDueDate};
 });
}
// Conciliación visual de cuotas: nunca usa openingPaid ni saldo total como prueba de pago mensual.
// Los anticipos siguen en contabilidad pero se muestran separados del mes pagado.
export function reconcileInstallments(sales,payments,asOf,installmentCents,addMonth,{requireReference=false,repairExplicitAbonos=false}={}) {
 const cents=v=>Math.max(0,Math.round(Number(v||0)*100));
 const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')) && !Number.isNaN(Date.parse(v+'T12:00:00Z'));
 const rows=[];
 const unmatched=[];
 for (const sale of sales.filter(s=>s?.type==='credit'&&Number.isInteger(Number(s.months))&&Number(s.months)>0)) {
  const months=Number(sale.months),first=sale.firstDueDate||sale.date;
  if(!valid(first))continue;
  const saleRows=Array.from({length:months},(_,i)=>({
   saleId:sale.id,number:i+1,total:months,dueDate:addMonth(first,sale.firstDueDate?i:i+1),
   dueCents:Math.max(0,Number(installmentCents(sale,i+1))||0),
   appliedCents:0,confirmedCents:0,advanceCents:0,receipts:[]
  }));
  const chronological=payments.filter(p=>p.saleId===sale.id&&!p.voidedAt&&!p.deletedAt&&!p.cancelledAt&&!['voided','cancelled'].includes(p.status))
   .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id||'').localeCompare(String(b.id||'')));
  // Reparar solamente abonos inequívocos con prima explícita comprobada.
  const explicitPrima=p=>p.paymentApplication==='prima'||/\bprima\b/i.test(String(p.kind||'')+' '+String(p.type||'')+' '+String(p.concept||''));
  const folio=p=>String(p.receiptReference||p.receiptRef||p.originalReceiptRef||p.receiptReferenceNormalized||'').trim();
  const reliable=p=>valid(p.date)&&p.date<=asOf&&p.date>=sale.date&&/^\d+$/.test(folio(p))&&cents(p.amount)>0;
  const verifiedPrima=chronological.filter(p=>explicitPrima(p)&&reliable(p)).reduce((n,p)=>n+cents(p.amount),0);
  const canRepair=repairExplicitAbonos&&verifiedPrima>=cents(sale.downPayment);
  // La prima, el saldo inicial y el precio financiado NO son recibos de mensualidad.
  // Por seguridad, solo se acreditan meses respaldados por un detalle explícito
  // de cuota o período; un pago antiguo ambiguo queda pendiente de conciliación.
  for (const payment of chronological) {
   const amount=cents(payment.amount);
   if(!amount)continue;
   const dated=valid(payment.date)&&payment.date<=asOf&&payment.date>=sale.date;
   const primaType=/\bprima\b/i.test(String(payment.kind||'')+' '+String(payment.type||''));
   const saved=payment.receiptInfo?.allocations;
   let allocations=Array.isArray(saved)?
    saved.filter(a=>!(/\bprima\b/i.test(String(a.label||'')))&&!primaType&&Number.isInteger(Number(a.number))&&Number(a.number)>0&&Number(a.amount)>0):null;
   const explicitAbono=/^(abono|cuota|mensualidad)\b/i.test(String(payment.concept||payment.type||'').trim())&&!explicitPrima(payment);
   if(canRepair&&explicitAbono&&reliable(payment)){
    // Se reconstruye la distribución visual con el importe original, sin crear pagos.
    let remaining=amount;
    allocations=[];
    for(const row of saleRows){
     const take=Math.min(remaining,Math.max(0,row.dueCents-row.appliedCents));
     if(take>0){allocations.push({number:row.number,amount:take/100});remaining-=take;}
     if(!remaining)break;
    }
    if(remaining)unmatched.push({saleId:sale.id,paymentId:payment.id,reason:'abono supera mensualidades disponibles'});
   }
   if(!allocations){
    // Compatibilidad con recibos antiguos que sí especificaban número o mes
    // de cuota. No se distribuye dinero basándose únicamente en su monto.
    const explicitNumber=Number(payment.installmentNumber||0);
    const period=String(payment.period||payment.paymentMonth||payment.installmentMonth||'');
    const matchByMonth=/^\d{4}-(?:0[1-9]|1[0-2])$/.test(period)?
     saleRows.filter(row=>row.dueDate.slice(0,7)===period):[];
    const isPrima=primaType||/\bprima\b/i.test(String(payment.concept||''));
    const row=!isPrima&&Number.isInteger(explicitNumber)&&explicitNumber>0?
     saleRows[explicitNumber-1]:!isPrima&&matchByMonth.length===1?matchByMonth[0]:null;
    allocations=row?[{number:row.number,amount:payment.amount}]:[];
    if(!row&&!isPrima)unmatched.push({saleId:sale.id,paymentId:payment.id,reason:'pago sin cuota identificada (no confundir con prima)'});
   }
   if(!dated){unmatched.push({saleId:sale.id,paymentId:payment.id,reason:'sin fecha válida o posterior al corte'});continue;}
   // Cada centavo debe estar respaldado por el importe real del recibo.
   // No acreditar una prima ni un recibo sin correlativo en la vista verificada.
   const reference=String(payment.receiptReference||payment.receiptRef||payment.originalReceiptRef||payment.receiptReferenceNormalized||'').trim();
   if(requireReference&&allocations.length&&!/^\d+$/.test(reference)){
    unmatched.push({saleId:sale.id,paymentId:payment.id,reason:'recibo sin correlativo numérico verificable'});continue;
   }
   const primaOnly=payment.paymentApplication==='prima'||primaType||(/^prima\b/i.test(String(payment.concept||''))&&(!Array.isArray(saved)||repairExplicitAbonos));
   if(primaOnly){if(allocations.length)unmatched.push({saleId:sale.id,paymentId:payment.id,reason:'prima con aplicación mensual incompatible'});continue;}
   const totalSaved=Array.isArray(saved)&&!(canRepair&&explicitAbono&&reliable(payment))?saved.reduce((n,a)=>n+cents(a.amount),0):allocations.reduce((n,a)=>n+cents(a.amount),0);
   if(totalSaved>amount){unmatched.push({saleId:sale.id,paymentId:payment.id,reason:'detalle de cuotas supera el importe recibido'});continue;}
   let available=amount;

   for(const allocation of allocations) {
    const row=saleRows[Number(allocation.number)-1];
    if(!row)continue;
    const value=Math.min(available,row.dueCents-row.appliedCents,cents(allocation.amount));
    if(value<=0)continue;
    available-=value;
    const advance=payment.date.slice(0,7)<row.dueDate.slice(0,7);
    row.appliedCents+=value;
    if(advance)row.advanceCents+=value;
    else row.confirmedCents+=value;
    row.receipts.push({paymentId:payment.id,date:payment.date,amountCents:value,
     groupId:payment.groupId||payment.id,reference,method:payment.method||'',advance});
   }
  }
  for(const row of saleRows){
   // Los adelantos SI pagan anticipadamente la cuota del mes señalado:
   // el dinero no entra de nuevo a caja cuando llega su vencimiento.
   row.remainingCents=Math.max(0,row.dueCents-row.appliedCents);
   const completed=row.dueCents>0&&row.remainingCents===0;
   const dates=row.receipts.map(p=>p.date).sort();
   const last=dates.at(-1)||null;
   row.coveredByAdvance=completed&&row.advanceCents>0;
   row.status=completed?(row.coveredByAdvance?'advance-covered':last>row.dueDate?'paid-late':'paid'):
     row.dueDate<asOf?'late':row.advanceCents>0?'advance':
     row.confirmedCents>0?'partial':'pending';
   row.lastPaidAt=last;
  }
  rows.push(...saleRows);
 }
 return {rows,unmatched};
}
