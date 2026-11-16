// Only use explicitly labeled amounts. A balance or installment value is not a payment.
function labeled(text, labels, normalize = value => value.trim()) {
  const pattern = new RegExp('^[ \\t]*(?:' + labels + ')[ \\t]*[:=][ \\t]*(.+)$', 'gimu');
  const values = [...text.matchAll(pattern)].map(match => normalize(match[1]));
  const unique = [...new Set(values)];
  return unique.length === 1 && unique[0] ? unique[0] : undefined;
}
function paymentAmount(value) {
  let amount = value.trim().replace(/^(?:L\.?|HNL)\s*/i, '').trim();
  if (/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(amount)) amount = amount.replace(/,/g, '');
  else if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(amount)) amount = amount.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(amount)) amount = amount.replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return;
  const cents = Math.round(Number(amount) * 100);
  if (Number.isSafeInteger(cents) && cents > 0 && cents <= 1e12) return String(cents / 100);
}
function paymentDate(value) {
  const raw = value.trim();
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const date = local ? local[3] + '-' + local[2].padStart(2, '0') + '-' + local[1].padStart(2, '0') : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const time = Date.parse(date + 'T00:00:00Z');
  if (Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date) return date;
}
export function extractPaymentFields(text) {
  return {
    amount: labeled(text, 'monto pagado|total pagado|importe pagado|valor recibido|abono(?: recibido)?|monto del abono', paymentAmount),
    date: labeled(text, 'fecha(?: de pago| del recibo)?', paymentDate),
    name: labeled(text, 'cliente|nombre(?: completo| del cliente)?|recib[ií] de|pagador'),
    lot: labeled(text, 'solar|lote|c[oó]digo (?:del )?solar'),
    reference: labeled(text, 'folio|referencia|recibo(?: n[úu]mero| no\\.?| n[.°º])?'),
  };
}

export function suggestPaymentSale(fields, sales, clients) {
  const normalize = value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
  const name = normalize(fields.name), lot = normalize(fields.lot);
  if (!name && !lot) return;
  const matches = sales.filter(sale => (!lot || normalize(sale.lot_id) === lot) &&
    (!name || clients.some(client => client.id === sale.client_id && normalize(client.name) === name)));
  if (matches.length === 1) return matches[0].id;
}
