const labels = {
  name: 'nombre(?: completo| del cliente| del comprador)?|comprador',
  identity: 'identidad|dni|cédula',
  phone: 'tel[eé]fono|celular',
  address: 'direcci[oó]n|domicilio',
  residence: 'residencial|lotificaci[oó]n',
  block: 'bloque|manzana',
  lot: 'solar|lote',
  area: 'área|superficie|medidas',
  price: 'precio(?: total)?',
  down: 'prima(?: inicial)?',
  months: 'plazo(?: en meses)?',
  firstDue: 'primera cuota|fecha de primera cuota',
  paid: 'pagado acumulado|total abonado',
  balance: 'saldo(?: pendiente)?|capital restante',
};
export const documentFields = Object.keys(labels);

export function extractDocumentFields(pages) {
  const text = pages.join('\n');
  const fields = {};
  for (const [key, names] of Object.entries(labels)) {
    const expression = new RegExp('^\\s*(?:' + names + ')\\s*[:=]\\s*(.+)$', 'gimu');
    const candidates = [...new Set([...text.matchAll(expression)].map(match => match[1].trim()).filter(Boolean))];
    if (candidates.length === 1) fields[key] = candidates[0];
  }
  return fields;
}
