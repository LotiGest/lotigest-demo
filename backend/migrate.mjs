import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { date, identifier, integer, openStore } from './store.mjs';

function fail(message) { throw new Error(message); }
function cents(value, minimum = 0) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value))) fail('Importe inválido.');
  const raw = Number(value) * 100;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 0.00001) fail('Importe con más de dos decimales.');
  return integer(rounded, minimum);
}
function index(data, field) {
  if (!Array.isArray(data[field])) fail('Lista inválida: ' + field);
  const records = new Map();
  for (const record of data[field]) {
    const id = identifier(record?.id);
    if (records.has(id)) fail('Código duplicado en ' + field + ': ' + id);
    records.set(id, record);
  }
  return records;
}
export function prepareLegacyMigration(data) {
  if (data?.version !== 3) fail('Se requiere un respaldo LOTIGEST versión 3.');
  const lots = index(data, 'lots'), clients = index(data, 'clients'), sales = index(data, 'sales');
  const payments = index(data, 'payments'), reservations = index({ reservations: data.reservations ?? [] }, 'reservations');
  const plan = { lots: [], clients: [], sales: [], payments: [], reservations: [] };
  const salesByLot = new Map(), converted = new Map(), active = new Set(), totals = new Map();
  for (const lot of lots.values()) {
    if (!['available', 'reserved', 'sold'].includes(lot.status)) fail('Estado de solar sin equivalencia: ' + lot.id);
    plan.lots.push({ id: lot.id, price: cents(lot.price, 1) });
  }
  const identities = new Set();
  for (const client of clients.values()) {
    if (typeof client.name !== 'string' || !client.name.trim() || client.name.length > 180) fail('Nombre de cliente inválido: ' + client.id);
    const contact = (value, limit) => {
      if (value == null) return '';
      if (typeof value !== 'string' || value.trim().length > limit) fail('Dato de contacto inválido para ' + client.id);
      return value.trim();
    };
    const identity = contact(client.identity, 32).toUpperCase().replace(/[ -]/g, '');
    if (identity && (!/^[A-Z0-9]+$/.test(identity) || identities.has(identity))) fail('Identidad inválida o duplicada: ' + client.id);
    if (identity) identities.add(identity);
    plan.clients.push({ id: client.id, name: client.name.trim(), identity,
      phone: contact(client.phone, 40), email: contact(client.email, 180), address: contact(client.address, 250) });
  }
  for (const sale of sales.values()) {
    if (!lots.has(sale.lotId) || !clients.has(sale.clientId) || salesByLot.has(sale.lotId)) fail('Venta duplicada o sin referencia: ' + sale.id);
    salesByLot.set(sale.lotId, sale);
  }
  for (const res of reservations.values()) {
    if (!lots.has(res.lotId) || !clients.has(res.clientId)) fail('Apartado sin referencia: ' + res.id);
    if (!['active', 'cancelled', 'converted', 'expired'].includes(res.status)) fail('Estado de apartado inválido: ' + res.id);
    if (res.status === 'active') {
      if (active.has(res.lotId) || salesByLot.has(res.lotId)) fail('Apartado activo incompatible: ' + res.id);
      active.add(res.lotId);
    }
    if (res.status === 'converted') {
      const sale = sales.get(res.saleId);
      if (!sale || sale.lotId !== res.lotId || sale.clientId !== res.clientId || converted.has(sale.id)) fail('Apartado convertido sin venta compatible: ' + res.id);
      converted.set(sale.id, res.id);
    }
    plan.reservations.push({ id: res.id, lotId: res.lotId, clientId: res.clientId, until: date(res.reservedUntil), status: res.status });
  }
  for (const lot of lots.values()) {
    const expected = salesByLot.has(lot.id) ? 'sold' : active.has(lot.id) ? 'reserved' : 'available';
    if (lot.status !== expected) fail('El estado del solar no coincide con sus movimientos: ' + lot.id);
  }
  for (const payment of [...payments.values()].reverse()) {
    const sale = sales.get(payment.saleId);
    if (!sale || date(payment.date) < date(sale.date)) fail('Pago sin venta compatible: ' + payment.id);
    const amount = cents(payment.amount, 1);
    totals.set(sale.id, (totals.get(sale.id) ?? 0) + amount);
    const kind = sale.type === 'cash' ? 'cash' : payment.concept === 'Prima inicial' ? 'down' : 'installment';
    plan.payments.push({ id: payment.id, saleId: sale.id, amount, date: payment.date, kind,
      groupId: payment.groupId ? identifier(payment.groupId) : null });
  }
  for (const sale of sales.values()) {
    if (!['cash', 'credit'].includes(sale.type)) fail('Modalidad inválida: ' + sale.id);
    const price = cents(sale.price, 1);
    const down = cents(sale.downPayment ?? 0);
    const months = sale.type === 'cash' ? 0 : integer(Number(sale.months), 1, 360);
    const opening = cents(sale.openingPaid ?? 0);
    const balance = price - opening - (totals.get(sale.id) ?? 0);
    const firstDue = sale.firstDueDate ? date(sale.firstDueDate) : null;
    const saleDate = date(sale.date);
    if (balance < 0 || (!months && (down !== price || balance !== 0)) ||
        (months && down >= price) || (firstDue && firstDue < saleDate)) fail('Importes o fechas incompatibles: ' + sale.id);
    plan.sales.push({ id: sale.id, lotId: sale.lotId, clientId: sale.clientId, reservationId: converted.get(sale.id) ?? null,
      price, down, months, opening, balance, date: saleDate, firstDue });
  }
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, option, ...extra] = process.argv.slice(2);
  if (!file || !process.env.LOTIGEST_DB || (option && option !== '--apply') || extra.length) {
    throw new Error('Uso: LOTIGEST_DB=/ruta/base.sqlite node backend/migrate.mjs respaldo.json [--apply]');
  }
  const data = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const plan = prepareLegacyMigration(data);
  const store = openStore(process.env.LOTIGEST_DB);
  try {
    const counts = store.importLegacy(plan, option === '--apply');
    console.log(JSON.stringify({ applied: option === '--apply', ...counts }, null, 2));
  } finally {
    store.close();
  }
}
