import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { prepareLegacyMigration } from './migrate.mjs';
import { openStore } from './store.mjs';

export const columns = ['cliente', 'nombre', 'identidad', 'direccion', 'telefono', 'solar', 'venta',
  'modalidad', 'fecha_venta', 'primera_cuota', 'precio', 'prima', 'plazo_meses', 'pagado_acumulado', 'saldo'];

export function parsePortfolioCsv(text) {
  const lines = [];
  let row = [], value = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === ';' || char === '\n') {
      row.push(value.replace(/\r$/, ''));
      value = '';
      closed = false;
      if (char === '\n') {
        if (row.some(cell => cell.trim())) lines.push(row);
        row = [];
      }
    } else if (char === '"' && !value && !closed) quoted = true;
    else if (closed && char === '\r' && text[i + 1] === '\n') continue;
    else if (char === '"' || closed) throw new Error('CSV con comillas inválidas.');
    else value += char;
  }
  if (quoted) throw new Error('CSV con comillas sin cerrar.');
  row.push(value);
  if (row.some(cell => cell.trim())) lines.push(row);
  return lines;
}

export function preparePortfolio(rows) {
  const [header, ...records] = rows;
  if (!header || !records.length || records.length > 10_000) throw new Error('Se requiere entre 1 y 10,000 ventas.');
  const normalized = header.map(value => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  if (new Set(normalized).size !== normalized.length || columns.some(key => !normalized.includes(key))) {
    throw new Error('Usa los encabezados de la plantilla de cartera.');
  }
  const data = { version: 3, lots: [], clients: [], sales: [], payments: [] };
  const clients = new Map(), balances = new Map();
  for (const [index, record] of records.entries()) {
    const row = Object.fromEntries(normalized.map((key, i) => [key, (record[i] ?? '').trim()]));
    const line = index + 2;
    const type = { contado: 'cash', credito: 'credit', 'crédito': 'credit' }[row.modalidad.toLowerCase()];
    if (!type || !row.cliente || !row.solar || !row.venta || record.length !== normalized.length) throw new Error('Revisa la fila ' + line + '.');
    for (const key of ['precio', 'prima', 'pagado_acumulado', 'saldo']) {
      if (!/^\d+(?:\.\d{1,2})?$/.test(row[key])) throw new Error('Importe inválido en ' + key + ', fila ' + line + '.');
    }
    const client = { id: row.cliente, name: row.nombre, identity: row.identidad, address: row.direccion, phone: row.telefono };
    const existing = clients.get(client.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(client)) throw new Error('La ficha del cliente cambia entre filas. Revisa la fila ' + line + '.');
    clients.set(client.id, client);
    data.lots.push({ id: row.solar, status: 'sold', price: row.precio });
    data.sales.push({ id: row.venta, lotId: row.solar, clientId: row.cliente, type, date: row.fecha_venta,
      firstDueDate: row.primera_cuota, price: row.precio, downPayment: row.prima,
      months: row.plazo_meses, openingPaid: row.pagado_acumulado });
    balances.set(row.venta, { cents: Math.round(Number(row.saldo) * 100), line });
  }
  data.clients = [...clients.values()];
  const plan = prepareLegacyMigration(data);
  for (const sale of plan.sales) {
    const expected = balances.get(sale.id);
    if (sale.balance !== expected.cents || sale.opening < sale.down) {
      throw new Error('El saldo o la prima no coincide con el pagado acumulado en la fila ' + expected.line + '.');
    }
  }
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, flag, ...extra] = process.argv.slice(2);
  if (!file || (flag && flag !== '--apply') || extra.length || (flag && !process.env.LOTIGEST_DB)) {
    throw new Error('Uso: node backend/portfolio-import.mjs cartera.csv [--apply]. Define LOTIGEST_DB para aplicar.');
  }
  const csv = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const plan = preparePortfolio(parsePortfolioCsv(csv));
  const store = openStore(flag ? process.env.LOTIGEST_DB : ':memory:');
  try {
    const counts = store.importLegacy(plan, !!flag);
    console.log(JSON.stringify({ aplicado: !!flag, ...counts, saldo_centavos: plan.sales.reduce((sum, sale) => sum + BigInt(sale.balance), 0n).toString() }));
  } finally { store.close(); }
}
