import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { documentFields } from './document-fields.mjs';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const roles = {
  lots: ['admin'],
  clients: ['admin', 'sales'],
  documents: ['admin', 'sales'],
  'client-import': ['admin', 'sales'],
  reservations: ['admin', 'sales'],
  'cancel-reservation': ['admin', 'sales'],
  sales: ['admin', 'sales'],
  payments: ['admin', 'cashier'],
  'payment-batches': ['admin', 'cashier'],
};
const panels = ['overview','inventory','pending','clients','sales','documents','cash'];
const writePanel = { lots:'inventory', clients:'clients', 'client-import':'clients', reservations:'pending',
  'cancel-reservation':'pending', sales:'sales', documents:'documents', payments:'cash', 'payment-batches':'cash' };
const readPanel = { lots:'inventory', clients:'clients', reservations:'pending', sales:'sales', documents:'documents',
  'document-ocr':'documents', receipts:'cash', 'receipt-details':'cash' };
for (const name of ['manage-user','release-sale','void-payment']) roles[name] = ['admin'];
const digest = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
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
function contactText(value, max) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.trim().length > max) bad('Campo de contacto inválido.');
  return value.trim();
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
    if (role === 'admin') run('DELETE FROM user_panels WHERE name=?', name);
  }
  function authenticate(header) {
    const token = typeof header === 'string' && /^Bearer ([a-f0-9]{64})$/.exec(header)?.[1];
    if (!token) return;
    const user = get('SELECT users.name,role,panels_json FROM users LEFT JOIN user_panels USING(name) WHERE token_hash=?', digest(token));
    if (!user) return;
    const { panels_json, ...actor } = user;
    return panels_json ? { ...actor, panels: JSON.parse(panels_json) } : actor;
  }
  function requireRecord(table, id) {
    const row = get('SELECT * FROM ' + table + ' WHERE id=?', identifier(id));
    if (!row) throw new HttpError(404, 'Registro no encontrado.');
    return row;
  }
  function saleLedger(sale, asOf = today()) {
    const payments = all(`SELECT payments.*,legacy_receipts.legacy_id FROM payments
      LEFT JOIN legacy_receipts USING (receipt) WHERE sale_id=? AND receipt NOT IN (SELECT receipt FROM void_payments) ORDER BY receipt`, sale.id);
    for (const payment of payments) if (payment.legacy_id === null) delete payment.legacy_id;
    const terms = get('SELECT * FROM legacy_sale_terms WHERE sale_id=?', sale.id);
    const firstDue = terms?.first_due_date || get('SELECT first_due_date FROM sale_due_dates WHERE sale_id=?', sale.id)?.first_due_date;
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
      const due = firstDue ? dueDate(firstDue, index) : dueDate(sale.sale_date, index + 1);
      const pending = amount - covered;
      return { number: index + 1, due, amount_cents: amount, pending_cents: pending,
        status: pending === 0 ? 'paid' : due < asOf ? 'late' : 'pending' };
    });
    return { ...sale, payments, installments, opening_cents: terms?.opening_cents ?? 0, paid_cents: paid, balance_cents: sale.price_cents - paid,
      overdue_cents: installments.filter(item => item.status === 'late').reduce((sum, item) => sum + item.pending_cents, 0) };
  }
  function recordPayment(saleId, amount, paymentDate, kind) {
    const receipt = Number(run('INSERT INTO payments (sale_id,amount_cents,payment_date,kind) VALUES (?,?,?,?)',
      saleId, amount, paymentDate, kind).lastInsertRowid);
    return get('SELECT * FROM payments WHERE receipt=?', receipt);
  }
  function pay(data, paymentDate) {
    const sale = requireRecord('sales', data.sale_id);
    if (paymentDate < sale.sale_date || paymentDate > today()) bad('Fecha de pago fuera del período válido.');
    const amount = integer(data.amount_cents, 1);
    const paid = get(`SELECT COALESCE((SELECT SUM(amount_cents) FROM payments WHERE sale_id=? AND receipt NOT IN (SELECT receipt FROM void_payments)),0)
      + COALESCE((SELECT opening_cents FROM legacy_sale_terms WHERE sale_id=?),0) AS cents`, sale.id, sale.id).cents;
    if (amount > sale.price_cents - paid) conflict('El pago supera el saldo.');
    return recordPayment(sale.id, amount, paymentDate, 'installment');
  }
  function execute(operation, data, actor) {
    if (operation === 'manage-user') {
      const name = identifier(data.name);
      if (name === actor.name) bad('No puedes cambiar tu propio usuario aquí.');
      if (!['admin','normal'].includes(data.role) || !Array.isArray(data.panels) ||
          data.panels.some(panel => !panels.includes(panel))) bad('Revisa el tipo de usuario y sus paneles.');
      const existing = get('SELECT name FROM users WHERE name=?', name);
      const role = data.role === 'admin' ? 'admin' : 'reader';
      if (data.token) addUser(name, role, data.token);
      else if (existing) run('UPDATE users SET role=? WHERE name=?', role, name);
      else bad('Genera una credencial para el usuario nuevo.');
      if (role === 'admin') run('DELETE FROM user_panels WHERE name=?', name);
      else run('INSERT INTO user_panels VALUES (?,?) ON CONFLICT(name) DO UPDATE SET panels_json=excluded.panels_json',
        name, JSON.stringify([...new Set(data.panels)]));
      return { name, role: data.role };
    }
    if (operation === 'release-sale' || operation === 'void-payment') {
      const reason = contactText(data.reason, 250);
      if (!reason) bad('Indica el motivo.');
      let snapshot;
      if (operation === 'release-sale') {
        const sale = requireRecord('sales', data.id);
        const payments = all('SELECT * FROM payments WHERE sale_id=?', sale.id);
        snapshot = { sale, payments, ledger: saleLedger(sale),
          reservation: sale.reservation_id ? requireRecord('reservations', sale.reservation_id) : null,
          due: get('SELECT * FROM sale_due_dates WHERE sale_id=?', sale.id),
          terms: get('SELECT * FROM legacy_sale_terms WHERE sale_id=?', sale.id),
          receipt_links: all('SELECT receipt, legacy_id, group_id, void_payments.receipt IS NOT NULL AS voided FROM payments LEFT JOIN legacy_receipts USING(receipt) LEFT JOIN payment_groups USING(receipt) LEFT JOIN void_payments USING(receipt) WHERE sale_id=?', sale.id) };
        if (snapshot.receipt_links.some(link => link.group_id &&
            get('SELECT 1 FROM payment_groups JOIN payments USING(receipt) WHERE group_id=? AND sale_id<>?', link.group_id, sale.id))) {
          conflict('La venta tiene un recibo compartido con otro solar. Requiere conciliación administrativa.');
        }
        for (const table of ['void_payments','legacy_receipts','payment_groups']) {
          run('DELETE FROM ' + table + ' WHERE receipt IN (SELECT receipt FROM payments WHERE sale_id=?)', sale.id);
        }
        for (const table of ['payments','legacy_sale_terms','sale_due_dates']) run('DELETE FROM ' + table + ' WHERE sale_id=?', sale.id);
        run('DELETE FROM sales WHERE id=?', sale.id);
      } else {
        const receipt = read('receipts', data.id);
        const group = get('SELECT group_id FROM payment_groups WHERE receipt=?', receipt.receipt);
        snapshot = group ? all('SELECT payments.* FROM payment_groups JOIN payments USING(receipt) WHERE group_id=?', group.group_id) : [receipt];
        if (snapshot.some(item => item.kind !== 'installment')) conflict('Para revertir la prima o una compra de contado, usa Anular venta.');
        if (snapshot.some(item => get('SELECT 1 FROM void_payments WHERE receipt=?', item.receipt))) conflict('El recibo ya está anulado.');
        for (const item of snapshot) run('INSERT INTO void_payments VALUES (?)', item.receipt);
      }
      run('INSERT INTO removal_log (actor,action,target,reason,snapshot_json) VALUES (?,?,?,?,?)', actor.name, operation,
        String(data.id), reason, JSON.stringify(snapshot));
      return { id: data.id };
    }
    if (operation === 'documents') {
      const client = requireRecord('clients', data.client_id);
      const title = contactText(data.title, 160);
      if (!title || !Array.isArray(data.pages) || !data.pages.length || data.pages.length > 3) bad('Indica un título y entre una y tres páginas.');
      const pages = data.pages.map(page => contactText(page, 30000));
      if (pages.some(page => !page)) bad('Revisa el texto de cada página.');
      if (!data.fields || typeof data.fields !== 'object' || Array.isArray(data.fields)) bad('Revisa los campos detectados.');
      const fields = Object.fromEntries(documentFields.map(key => [key, contactText(data.fields[key], 250)]));
      const id = randomUUID();
      run('INSERT INTO documents (id,client_id,title,pages_json,fields_json,created_by) VALUES (?,?,?,?,?,?)',
        id, client.id, title, JSON.stringify(pages), JSON.stringify(fields), actor.name);
      return { id, client_id: client.id, title };
    }
    if (operation === 'lots') {
      const id = identifier(data.id);
      if (get('SELECT id FROM lots WHERE id=?', id)) conflict('El solar ya existe.');
      run('INSERT INTO lots VALUES (?,?)', id, integer(data.price_cents, 1));
      return requireRecord('lots', id);
    }
    if (operation === 'client-import') {
      if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > 100) bad('Importa entre 1 y 100 clientes por archivo.');
      for (const [index, row] of data.rows.entries()) {
        try {
          if (!row || typeof row !== 'object' || Array.isArray(row)) bad('Registro inválido.');
          const name = contactText(row.name, 180);
          if (!name) bad('Falta el nombre.');
          const identity = contactText(row.identity, 32).toUpperCase().replace(/[ -]/g, '');
          if (identity && !/^[A-Z0-9]+$/.test(identity)) bad('Identidad inválida.');
          const id = identifier(row.id || (identity && 'ID-' + identity)).toUpperCase();
          const phone = contactText(row.phone, 40);
          const email = contactText(row.email, 180);
          const address = contactText(row.address, 250);
          if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Correo inválido.');
          if (get('SELECT id FROM clients WHERE id=? COLLATE NOCASE', id)) conflict('El código ya existe.');
          if (identity && get('SELECT client_id FROM client_contacts WHERE identity=?', identity)) conflict('La identidad ya existe.');
          run('INSERT INTO clients VALUES (?,?)', id, name);
          run('INSERT INTO client_contacts VALUES (?,?,?,?,?)', id, identity || null, phone, email, address);
        } catch (error) {
          if (error instanceof HttpError) throw new HttpError(error.status, 'Registro ' + (index + 1) + ': ' + error.message);
          throw error;
        }
      }
      return { imported: data.rows.length };
    }
    if (operation === 'clients') {
      const id = identifier(data.id);
      if (data.identity || data.phone || data.address || data.email) {
        if (id !== id.toUpperCase()) bad('Usa el código de cliente en mayúsculas.');
        execute('client-import', { rows: [data] }, actor);
      } else {
        const name = contactText(data.name, 180);
        if (!name) bad('Nombre de cliente inválido.');
        if (get('SELECT id FROM clients WHERE id=? COLLATE NOCASE', id)) conflict('El cliente ya existe.');
        run('INSERT INTO clients VALUES (?,?)', id, name);
      }
      return requireRecord('clients', id);
    }
    if (operation === 'payments') return pay(data, date(data.date));
    if (operation === 'payment-batches') {
      const paymentDate = date(data.date);
      if (!Array.isArray(data.entries) || data.entries.length < 2 || data.entries.length > 20) bad('Selecciona entre 2 y 20 ventas.');
      const group = randomUUID();
      const sales = new Set();
      const payments = data.entries.map(entry => {
        const id = identifier(entry?.sale_id);
        if (sales.has(id)) bad('La misma venta aparece dos veces en el cobro.');
        sales.add(id);
        const payment = pay(entry, paymentDate);
        run('INSERT INTO payment_groups VALUES (?,?)', payment.receipt, group);
        return payment;
      });
      return { group_id: group, payments };
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
    const firstDue = data.first_due_date ? date(data.first_due_date) : null;
    if (firstDue && (!months || firstDue < saleDate)) bad('Revisa la fecha de primera cuota.');
    const down = months ? integer(data.down_cents, 0, lot.price_cents - 1) : lot.price_cents;
    run('INSERT INTO sales VALUES (?,?,?,?,?,?,?,?)', id, lot.id, client.id, active?.id ?? null, lot.price_cents, down, months, saleDate);
    if (firstDue) run('INSERT INTO sale_due_dates VALUES (?,?)', id, firstDue);
    if (down) recordPayment(id, down, saleDate, months ? 'down' : 'cash');
    if (active) run("UPDATE reservations SET status='converted' WHERE id=?", active.id);
    return saleLedger(requireRecord('sales', id));
  }
  function command(actor, operation, key, data) {
    if (!Object.hasOwn(roles, operation)) throw new HttpError(404, 'Operación inexistente.');
    if (!(actor.role === 'admin' || (actor.panels ? actor.panels.includes(writePanel[operation]) : roles[operation].includes(actor.role)))) throw new HttpError(403, 'El usuario no tiene permiso.');
    identifier(key);
    if (!data || typeof data !== 'object' || Array.isArray(data)) bad('Se requiere un objeto JSON.');
    const normalized = ['payment-batches', 'client-import'].includes(operation) ? canonical(data) :
      Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
    const fingerprint = digest(JSON.stringify([operation, normalized]));
    return transaction(() => {
      const existing = get('SELECT fingerprint,response FROM commands WHERE actor=? AND request_id=?', actor.name, key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) conflict('La clave ya se usó con otra operación.');
        return JSON.parse(existing.response);
      }
      const result = execute(operation, data, actor);
      run('INSERT INTO commands (actor,request_id,fingerprint,response) VALUES (?,?,?,?)', actor.name, key, fingerprint, JSON.stringify(result));
      return result;
    });
  }
  function receiptDetails(id) {
    const receipt = read('receipts', id);
    const group = get('SELECT group_id FROM payment_groups WHERE receipt=?', receipt.receipt);
    const ids = group ? all('SELECT receipt FROM payment_groups WHERE group_id=? ORDER BY receipt', group.group_id) : [receipt];
    return ids.map(item => {
      const payment = read('receipts', String(item.receipt));
      const sale = requireRecord('sales', payment.sale_id);
      const client = requireRecord('clients', sale.client_id);
      const paid = get(`SELECT COALESCE((SELECT SUM(amount_cents) FROM payments WHERE sale_id=? AND receipt<=?),0)
        + COALESCE((SELECT opening_cents FROM legacy_sale_terms WHERE sale_id=?),0) AS cents`, sale.id, payment.receipt, sale.id).cents;
      return { ...payment, lot_id: sale.lot_id, client_name: client.name, balance_at_receipt_cents: sale.price_cents - paid };
    });
  }
  function commandStatus(actor, key) {
    const result = get('SELECT 1 AS saved FROM commands WHERE actor=? AND request_id=?', actor.name, identifier(key));
    return { saved: !!result };
  }
  function readFor(actor, resource, id) {
    if (['users','removal-log'].includes(resource)) {
      if (actor.role !== 'admin') throw new HttpError(403, 'El usuario no tiene permiso.');
      if (id && resource === 'removal-log') {
        const event = get('SELECT * FROM removal_log WHERE id=?', integer(Number(id), 1));
        if (!event) throw new HttpError(404, 'Registro no encontrado.');
        const { snapshot_json, ...metadata } = event;
        return { ...metadata, snapshot: JSON.parse(snapshot_json) };
      }
      if (id) throw new HttpError(404, 'Registro no encontrado.');
      return resource === 'users' ? all('SELECT users.name,role,panels_json FROM users LEFT JOIN user_panels USING(name) ORDER BY name').map(row =>
        ({ name: row.name, role: row.role, panels: row.panels_json ? JSON.parse(row.panels_json) : null })) :
        all('SELECT id,actor,action,target,reason,created_at FROM removal_log ORDER BY id DESC');
    }
    if (resource === 'catalog' && !id && actor.panels) {
      const rights = actor.panels;
      const any = (...names) => names.some(name => rights.includes(name));
      const catalog = read('catalog');
      return {
        lots: any('inventory','pending','sales') ? catalog.lots : rights.includes('overview') ? catalog.lots.map(({status}) => ({status})) : [],
        clients: rights.includes('clients') ? catalog.clients : any('pending','sales','cash','documents') ? catalog.clients.map(({id,name}) => ({id,name})) : [],
        reservations: any('pending','sales') ? catalog.reservations : [],
        sales: any('sales','cash') ? catalog.sales : rights.includes('overview') ? catalog.sales.map(({price_cents}) => ({price_cents})) : [],
      };
    }
    if (actor.panels && !(actor.panels.includes(readPanel[resource]) || resource === 'sales' && id && actor.panels.includes('cash'))) {
      throw new HttpError(403, 'El usuario no tiene permiso para este panel.');
    }
    return resource === 'documents' ? readDocument(id) : read(resource, id);
  }
  function readDocument(id) {
    if (!id) return all('SELECT id, client_id, title, created_at FROM documents ORDER BY created_at DESC, id');
    const row = requireRecord('documents', id);
    const { pages_json, fields_json, ...metadata } = row;
    return { ...metadata, pages: JSON.parse(pages_json), fields: JSON.parse(fields_json) };
  }
  function read(resource, id) {
    if (resource === 'catalog' && !id) {
      db.exec('BEGIN');
      try {
        const result = Object.fromEntries(['lots', 'clients', 'reservations', 'sales'].map(name => [name, read(name)]));
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    if (resource === 'receipt-details' && id) return receiptDetails(id);
    if (resource === 'sales' && id) return saleLedger(requireRecord('sales', id));
    if (resource === 'receipts' && id) {
      const receipt = get('SELECT payments.*,legacy_receipts.legacy_id FROM payments LEFT JOIN legacy_receipts USING (receipt) WHERE receipt=?', integer(Number(id), 1));
      if (receipt && get('SELECT 1 FROM void_payments WHERE receipt=?', receipt.receipt)) conflict('El recibo está anulado.');
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
    if (resource === 'clients') {
      return all('SELECT clients.id, clients.name, identity, phone, email, address FROM clients LEFT JOIN client_contacts ON client_id=id ORDER BY id');
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
      for (const client of plan.clients) {
        run('INSERT INTO clients VALUES (?,?)', client.id, client.name);
        if (client.identity || client.phone || client.email || client.address) {
          run('INSERT INTO client_contacts VALUES (?,?,?,?,?)', client.id, client.identity || null, client.phone, client.email, client.address);
        }
      }
      for (const res of plan.reservations) run('INSERT INTO reservations VALUES (?,?,?,?,?)', res.id, res.lotId, res.clientId, res.until, res.status);
      for (const sale of plan.sales) {
        run('INSERT INTO sales VALUES (?,?,?,?,?,?,?,?)', sale.id, sale.lotId, sale.clientId, sale.reservationId, sale.price, sale.down, sale.months, sale.date);
        run('INSERT INTO legacy_sale_terms VALUES (?,?,?)', sale.id, sale.opening, sale.firstDue);
      }
      for (const payment of plan.payments) {
        const receipt = recordPayment(payment.saleId, payment.amount, payment.date, payment.kind);
        run('INSERT INTO legacy_receipts VALUES (?,?)', receipt.receipt, payment.id);
        if (payment.groupId) run('INSERT INTO payment_groups VALUES (?,?)', receipt.receipt, 'legacy-' + payment.groupId);
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
  return { addUser, authenticate, command, commandStatus, read, readFor, readDocument, importLegacy, close: () => db.close() };
}
