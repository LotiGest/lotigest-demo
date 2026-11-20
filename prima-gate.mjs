// Regla de cobro: la prima de CADA solar debe estar documentada y cubierta
// antes de admitir mensualidades. No modifica ni interpreta recibos anteriores.
const primaCents = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : null;

export function lotPrimaStatus(state, lotId) {
  const sale = (state.sales || []).find(s => s.lotId === lotId && s.type === 'credit');
  const document = (state.contractTexts || []).find(d => d.lotId === lotId
    && d.format === 'photo+ocr' && d.status !== 'voided' && d.structured);
  const expected = primaCents(sale ? sale.downPayment : document?.structured?.down);
  let paid = 0, ambiguous = false;
  if (sale) {
    paid = Math.max(0, primaCents(sale.openingPaid) || 0);
    for (const p of state.payments || []) {
      if (p.saleId === sale.id && !p.voidedAt && !p.deletedAt)
        paid += Math.max(0, primaCents(p.amount) || 0);
    }
  } else {
    for (const p of state.ownerPayments || []) {
      if (!/^PRIMA\b/i.test(String(p.concept || '')) || p.voidedAt || p.deletedAt) continue;
      for (const a of p.allocations || []) {
        const refs = a.references || [];
        if (!refs.some(r => r.lotId === lotId)) continue;
        // Un recibo conjunto no demuestra cómo se repartió la prima entre solares.
        if (refs.length !== 1 || refs[0].lotId !== lotId) ambiguous = true;
        else paid += Math.max(0, Number(a.amountCents) || 0);
      }
    }
  }
  const known = Number.isSafeInteger(expected) && expected > 0;
  return {
    lotId, known, agreedCents: known ? expected : null, paidCents: paid,
    remainingCents: known ? Math.max(0, expected - paid) : null,
    ambiguous, covered: known && !ambiguous && paid >= expected
  };
}

export function assertPrimaCovered(state, lotIds) {
  const ids = [...new Set(lotIds || [])];
  if (!ids.length) throw Error('Selecciona el solar antes de registrar el abono mensual.');
  for (const id of ids) {
    const status = lotPrimaStatus(state, id);
    const lot = (state.lots || []).find(l => l.id === id);
    const name = lot ? 'etapa ' + (lot.stage || '—') + ', bloque ' + (lot.block || '—')
      + ', solar ' + (lot.sourceNumber || lot.number || id) : 'solar ' + id;
    if (!status.known) throw Error('Abono bloqueado para ' + name
      + ': primero confirma en el contrato la prima pactada y registra su pago.');
    if (status.ambiguous) throw Error('Abono bloqueado para ' + name
      + ': hay una prima conjunta sin distribución confirmada entre los solares.');
    if (!status.covered) throw Error('Abono bloqueado para ' + name
      + ': la prima está pendiente. Faltan L ' + (status.remainingCents / 100)
        .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      + '. Registra la prima antes de ingresar mensualidades.');
  }
  return true;
}

export function assertPrimaAmount(state, lotIds, amountCents) {
  const ids=[...new Set(lotIds || [])];
  if(!ids.length) throw Error('Selecciona el solar para registrar la prima.');
  const states=ids.map(id=>lotPrimaStatus(state,id));
  // Se puede recuperar una prima histórica sin contrato confirmado; eso NO habilita cuotas.
  if(states.every(s=>s.known)){
    const remaining=states.reduce((n,s)=>n+s.remainingCents,0);
    if(!remaining) throw Error('La prima ya está cubierta. Registra los pagos posteriores como abonos mensuales.');
    if(amountCents>remaining) throw Error('El pago de prima supera lo pendiente (L '
      +(remaining/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
      +'). Registra primero la prima y luego la mensualidad en recibos separados.');
  }
  return true;
}
