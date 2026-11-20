// Conciliación visual de cuotas: nunca usa openingPaid ni saldo total como prueba de pago mensual.
// Los anticipos siguen en contabilidad pero se muestran separados del mes pagado.
export function reconcileInstallments(sales,payments,asOf,installmentCents,addMonth) {
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
  const chronological=payments.filter(p=>p.saleId===sale.id&&!p.voidedAt&&!p.deletedAt)
   .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id||'').localeCompare(String(b.id||'')));
  // La prima, el saldo inicial y el precio financiado NO son recibos de mensualidad.
  // Por seguridad, solo se acreditan meses respaldados por un detalle explícito
  // de cuota o período; un pago antiguo ambiguo queda pendiente de conciliación.
  for (const payment of chronological) {
   const amount=cents(payment.amount);
   if(!amount)continue;
   const dated=valid(payment.date)&&payment.date<=asOf&&payment.date>=sale.date;
   const saved=payment.receiptInfo?.allocations;
   let allocations=Array.isArray(saved)?
    saved.filter(a=>Number.isInteger(Number(a.number))&&Number(a.number)>0&&Number(a.amount)>0):null;
   if(!allocations){
    // Compatibilidad con recibos antiguos que sí especificaban número o mes
    // de cuota. No se distribuye dinero basándose únicamente en su monto.
    const explicitNumber=Number(payment.installmentNumber||0);
    const period=String(payment.period||payment.paymentMonth||payment.installmentMonth||'');
    const matchByMonth=/^\d{4}-(?:0[1-9]|1[0-2])$/.test(period)?
     saleRows.filter(row=>row.dueDate.slice(0,7)===period):[];
    const row=Number.isInteger(explicitNumber)&&explicitNumber>0?
     saleRows[explicitNumber-1]:matchByMonth.length===1?matchByMonth[0]:null;
    allocations=row?[{number:row.number,amount:payment.amount}]:[];
    const isPrima=/\bprima\b/i.test(String(payment.concept||'')+' '+String(payment.kind||'')+' '+String(payment.type||''));
    if(!row&&!isPrima)unmatched.push({saleId:sale.id,paymentId:payment.id,reason:'pago sin cuota identificada (no confundir con prima)'});
   }
   if(!dated){unmatched.push({saleId:sale.id,paymentId:payment.id,reason:'sin fecha válida o posterior al corte'});continue;}
   for(const allocation of allocations) {
    const row=saleRows[Number(allocation.number)-1];
    if(!row)continue;
    const value=Math.min(row.dueCents-row.appliedCents,cents(allocation.amount));
    if(value<=0)continue;
    const advance=payment.date.slice(0,7)<row.dueDate.slice(0,7);
    row.appliedCents+=value;
    if(advance)row.advanceCents+=value;
    else row.confirmedCents+=value;
    row.receipts.push({paymentId:payment.id,date:payment.date,amountCents:value,
     groupId:payment.groupId||payment.id,method:payment.method||'',advance});
   }
  }
  for(const row of saleRows){
   const completed=row.confirmedCents>=row.dueCents&&row.dueCents>0;
   const confirmedDates=row.receipts.filter(p=>!p.advance).map(p=>p.date).sort();
   const last=confirmedDates.at(-1)||null;
   row.status=completed?(last>row.dueDate?'paid-late':'paid'):
     row.advanceCents>0?'advance':row.confirmedCents>0?'partial':
     row.dueDate<asOf?'late':'pending';
   row.remainingCents=Math.max(0,row.dueCents-row.confirmedCents-row.advanceCents);
   row.lastPaidAt=last;
  }
  rows.push(...saleRows);
 }
 return {rows,unmatched};
}
