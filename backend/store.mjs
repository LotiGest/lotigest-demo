import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const roles = {
  lots: ['admin'],
  clients: ['admin', 'sales'],
  reservations: ['admin', 'sales'],
  'cancel-reservation': ['admin', 'sales'],
  sales: ['admin', 'sales'],
  payments: ['admin', 'cashier'],
};
const digest = value => createHash('sha256').update(value).digest('hex');
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' });
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function bad(message) {
  throw new HttpError(400, message);
}
function conflict(message) {
  throw new HttpError(409, message);
}
export function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) bad('Identificador inválido.');
  return value;
}
export function integer(value, min, max = 1_000_000_000_000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) bad('Importe o plazo inválido.');
  return value;
}
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) bad('Fecha inválida.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) bad('Fecha inválida.');
  return value;
}
function dueDate(saleDate, months) {
  const [, month, day] = saleDate.split('-').map(Number);
  const result = new Date(saleDate + 'T00:00:00Z');
  result.setUTCDate(1);
  result.setUTCMonth(month - 1 + months);
  const end = new Date(result);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  result.setUTCDate(Math.min(day, end.getUTCDate()));
  return result.toISOString().slice(0, 10);
}
export function hondurasToday(now = new Date()) {
  const parts = Object.fromEntries(dateFormat.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function openStore(filename, today = hondurasToday) {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  db.exec(schema);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function addUser(name, role, token) {
    identifier(name);
    if (!['admin', 'sales', 'cashier', 'reader'].includes(role) || !/^[a-f0-9]{64}$/.test(token ?? '')) {
      bad('Rol o token inválido.');
    }
    run('INSERT INTO users VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET role=excluded.role,token_hash=excluded.token_hash', name, role, digest(token));
  }
  function authenticate(header) {
    const token = typeof header === 'string' && /^Bearer ([a-f0-9]{64})$/.exec(header)?.[1];
    return token ? get('SELECT name,role FROM users WHERE token_hash=?', digest(token)) : undefined;
  }
  function requireRecord(table, id) {
    const row = get('SELECT * FROM ' + table + ' WHERE id=?', identifier(id));
    if (!row) throw new HttpError(404, 'Registro no encontrado.');
    return row;
  }
  function saleLedger(sale, asOf = today()) {
    const payments = all(`SELECT payments.*,legacy_receipts.legacy_id FROM payments
      LEFT JOIN legacy_receipts USING (receipt) WHERE sale_id=? ORDER BY receipt`, sale.id);
    for (const payment of payments) if (payment.legacy_id === null) delete payment.legacy_id;
    const terms = get('SELECT * FROM legacy_sale_terms WHERE sale_id=?', sale.id);
    const paid = payments.reduce((sum, payment) => sum + payment.amount_cents, terms?.opening_cents ?? 0);
    const principal = sale.price_cents - sale.down_cents;
    const scheduled = sale.months ? Math.floor(principal / sale.months) : 0;
    const remainder = sale.months ? principal % sale.months : 0;
    let applied = Math.max(0, paid - sale.down_cents);
    const installments = Array.from({ length: sale.months }, (_, index) => {
      let amount = scheduled + Number(index < remainder);
      if (terms) {
        const regular = Math.round(principal / sale.months);
        amount = index === sale.months - 1 ? Math.max(0, principal - regular * index) :
          Math.max(0, Math.min(regular, principal - regular * index));
      }
      const covered = Math.min(applied, amount);
      applied -= covered;
      const due = terms?.first_due_date ? dueDate(terms.first_due_date, index) : dueDate(sale.sale_date, index + 1);
      const pending = amount - covered;
      return { number: index + 1, due, amount_cents: amount, pending_cents: pending,
        status: pending === 0 ? 'paid' : due < asOf ? 'late' : 'pending' };
    });
    return { ...sale, payments, installments, paid_cents: paid, balance_cents: sale.price_cents - paid,
      overdue_cents: installments.filter(item => item.status === 'late').reduce((sum, item) => sum + item.pending_cents, 0) };
  }
  function recordPayment(saleId, amount, paymentDate, kind) {
    const receipt = Number(run('INSERT INTO payments (sale_id,amount_cents,payment_date,kind) VALUES (?,?,?,?)',
      saleId, amount, paymentDate, kind).lastInsertRowid);
    return get('SELECT * FROM payments WHERE receipt=?', receipt);
  }
  function execute(operation, data) {
    if (operation === 'lots') {
      const id = identifier(data.id);
      if (get('SELECT id FROM lots WHERE id=?', id)) conflict('El solar ya existe.');
      run('INSERT INTO lots VALUES (?,?)', id, integer(data.price_cents, 1));
      return requireRecord('lots', id);
    }
    if (operation === 'clients') {
      const id = identifier(data.id);
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name || name.length > 180) bad('Nombre de cliente inválido.');
      if (get('SELECT id FROM clients WHERE id=?', id)) conflict('El cliente ya existe.');
      run('INSERT INTO clients VALUES (?,?)', id, name);
      return requireRecord('clients', id);
    }
    if (operation === 'payments') {
      const sale = requireRecord('sales', data.sale_id);
      const paymentDate = date(data.date);
      if (paymentDate < sale.sale_date || paymentDate > today()) bad('Fecha de pago fuera del período válido.');
      const amount = integer(data.amount_cents, 1);
      const { balance_cents: balance } = saleLedger(sale);
      if (amount > balance) conflict('El pago supera el saldo.');
      return recordPayment(sale.id, amount, paymentDate, 'installment');
    }
    if (operation === 'cancel-reservation') {
      const reservation = requireRecord('reservations', data.id);
      if (reservation.status !== 'active') conflict('El apartado ya está cerrado.');
      run("UPDATE reservations SET status='cancelled' WHERE id=?", reservation.id);
      return requireRecord('reservations', reservation.id);
    }
    const lot = requireRecord('lots', data.lot_id);
    const client = requireRecord('clients', data.client_id);
    if (get('SELECT id FROM sales WHERE lot_id=?', lot.id)) conflict('El solar ya está vendido.');
    const current = today();
    run("UPDATE reservations SET status='expired' WHERE lot_id=? AND status='active' AND reserved_until<?", lot.id, current);
    const active = get("SELECT * FROM reservations WHERE lot_id=? AND status='active'", lot.id);
    const id = randomUUID();
    if (operation === 'reservations') {
      if (active) conflict('El solar ya está apartado.');
      const until = date(data.reserved_until);
      if (until < current) bad('El apartado debe vencer hoy o después.');
      run("INSERT INTO reservations (id,lot_id,client_id,reserved_until) VALUES (?,?,?,?)", id, lot.id, client.id, until);
      return requireRecord('reservations', id);
    }
    if (active ? data.reservation_id !== active.id || client.id !== active.client_id : data.reservation_id != null) {
      conflict('El apartado indicado no corresponde al cliente o ya venció.');
    }
    const saleDate = date(data.date);
    if (saleDate > current) bad('La fecha de venta no puede ser futura.');
    const months = integer(data.months, 0, 360);
    const down = months ? integer(data.down_cents, 0, lot.price_cents - 1) : lot.price_cents;
    run('INSERT INTO sales VALUES (?,?,?,?,?,?,?,?)', id, lot.id, client.id, active?.id ?? null, lot.price_cents, down, months, saleDate);
    if (down) recordPayment(id, down, saleDate, months ? 'down' : 'cash');
    if (active) run("UPDATE reservations SET status='converted' WHERE id=?", active.id);
    return saleLedger(requireRecord('sales', id));
  }
  function command(actor, operation, key, data) {
    if (!Object.hasOwn(roles, operation)) throw new HttpError(404, 'Operación inexistente.');
    if (!roles[operation].includes(actor.role)) throw new HttpError(403, 'El usuario no tiene permiso.');
    identifier(key);
    if (!data || typeof data !== 'object' || Array.isArray(data)) bad('Se requiere un objeto JSON.');
    const fingerprint = digest(JSON.stringify([operation, Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)))]));
    return transaction(() => {
      const existing = get('SELECT fingerprint,response FROM commands WHERE actor=? AND request_id=?', actor.name, key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) conflict('La clave ya se usó con otra operación.');
        return JSON.parse(existing.response);
      }
      const result = execute(operation, data);
      run('INSERT INTO commands (actor,request_id,fingerprint,response) VALUES (?,?,?,?)', actor.name, key, fingerprint, JSON.stringify(result));
      return result;
    });
  }
  function read(resource, id) {
    if (resource === 'sales' && id) return saleLedger(requireRecord('sales', id));
    if (resource === 'receipts' && id) {
      const receipt = get('SELECT payments.*,legacy_receipts.legacy_id FROM payments LEFT JOIN legacy_receipts USING (receipt) WHERE receipt=?', integer(Number(id), 1));
      if (!receipt) throw new HttpError(404, 'Recibo no encontrado.');
      if (receipt.legacy_id === null) delete receipt.legacy_id;
      return receipt;
    }
    if (id || !['lots', 'clients', 'reservations', 'sales'].includes(resource)) throw new HttpError(404, 'Recurso inexistente.');
    if (resource === 'lots') {
      return all(`SELECT lots.*, CASE WHEN EXISTS(SELECT 1 FROM sales WHERE lot_id=lots.id) THEN 'sold'
        WHEN EXISTS(SELECT 1 FROM reservations WHERE lot_id=lots.id AND status='active' AND reserved_until>=?) THEN 'reserved'
        ELSE 'available' END AS status FROM lots ORDER BY id`, today());
    }
    return all('SELECT * FROM ' + resource + ' ORDER BY id');
  }
  function importLegacy(plan, apply = false) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (['lots', 'clients', 'sales', 'reservations', 'payments'].some(table => get('SELECT 1 FROM ' + table + ' LIMIT 1'))) {
        conflict('La migración requiere una base comercial vacía.');
      }
      for (const lot of plan.lots) run('INSERT INTO lots VALUES (?,?)', lot.id, lot.price);
      for (const client of plan.clients) run('INSERT INTO clients VALUES (?,?)', client.id, client.name);
      for (const res of plan.reservations) run('INSERT INTO reservations VALUES (?,?,?,?,?)', res.id, res.lotId, res.clientId, res.until, res.status);
      for (const sale of plan.sales) {
        run('INSERT INTO sales VALUES (?,?,?,?,?,?,?,?)', sale.id, sale.lotId, sale.clientId, sale.reservationId, sale.price, sale.down, sale.months, sale.date);
        run('INSERT INTO legacy_sale_terms VALUES (?,?,?)', sale.id, sale.opening, sale.firstDue);
      }
      for (const payment of plan.payments) {
        const receipt = recordPayment(payment.saleId, payment.amount, payment.date, payment.kind);
        run('INSERT INTO legacy_receipts VALUES (?,?)', receipt.receipt, payment.id);
      }
      for (const sale of plan.sales) {
        if (saleLedger(requireRecord('sales', sale.id)).balance_cents !== sale.balance) conflict('El saldo importado no coincide.');
      }
      db.exec(apply ? 'COMMIT' : 'ROLLBACK');
      return Object.fromEntries(Object.entries(plan).map(([name, records]) => [name, records.length]));
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return { addUser, authenticate, command, read, importLegacy, close: () => db.close() };
}
