const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' }
});
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const integer = (value, min, max = 1e12) => Number.isSafeInteger(value) && value >= min && value <= max;
const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Tegucigalpa' }).format(new Date());
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

const access = {
  lots: ['admin', 'inventory'],
  reservations: ['sales', 'pending'],
  sales: ['sales', 'sales'],
  payments: ['cashier', 'cash']
};
const paid = `COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id=s.id
  AND NOT EXISTS (SELECT 1 FROM void_payments v WHERE v.receipt=p.receipt)),0)
  + COALESCE((SELECT opening_cents FROM legacy_sale_terms WHERE sale_id=s.id),0)`;
const can = (actor, role, panel) => actor.role === 'admin' ||
  (actor.role === role && (!actor.panels || actor.panels.includes(panel)));

async function read(db, actor, url, current) {
  const resource = url.searchParams.get('type') || 'account';
  const key = url.searchParams.get('id');
  const after = url.searchParams.get('after') || '';
  if ((key && !id(key)) || (after && !id(after))) return json({error:'Código inválido.'},400);
  const sales = can(actor,'sales','sales');
  const cash = can(actor,'cashier','cash');
  const inventory = can(actor,'sales','inventory');
  const pending = can(actor,'sales','pending');
  if (resource === 'account') return json({role:actor.role, inventory, pending, sales, cash});
  if (resource === 'lots' && inventory) {
    const { results } = await db.prepare(`SELECT l.*, CASE
      WHEN EXISTS (SELECT 1 FROM sales WHERE lot_id=l.id) THEN 'vendido'
      WHEN EXISTS (SELECT 1 FROM reservations WHERE lot_id=l.id AND status='active' AND reserved_until>=?) THEN 'apartado'
      ELSE 'disponible' END AS status FROM lots l WHERE l.id>? ORDER BY l.id LIMIT 100`).bind(current,after).all();
    return json({lots:results});
  }
  if (resource === 'reservations' && pending) {
    const {results} = await db.prepare(`SELECT * FROM reservations WHERE status='active' AND reserved_until>=?
      AND id>? ORDER BY id LIMIT 100`).bind(current,after).all();
    return json({reservations:results});
  }
  if (resource === 'sales' && (sales || cash)) {
    const query = `SELECT s.*, c.name AS client_name, (${paid}) AS paid_cents,
      COALESCE(t.first_due_date,d.first_due_date) AS first_due_date,
      t.sale_id IS NOT NULL AS legacy FROM sales s JOIN clients c ON c.id=s.client_id
      LEFT JOIN sale_due_dates d ON d.sale_id=s.id LEFT JOIN legacy_sale_terms t ON t.sale_id=s.id`;
    if (!key) {
      const {results} = await db.prepare(query + ' WHERE s.id>? ORDER BY s.id LIMIT 100').bind(after).all();
      return json({sales:results});
    }
    const [saleResult, paymentResult] = await db.batch([
      db.prepare(query + ' WHERE s.id=?').bind(key),
      db.prepare(`SELECT p.* FROM payments p WHERE p.sale_id=?
        AND NOT EXISTS (SELECT 1 FROM void_payments v WHERE v.receipt=p.receipt) ORDER BY p.receipt`).bind(key)
    ]);
    const sale = saleResult.results[0];
    if (!sale) return json({error:'Venta no encontrada.'},404);
    const principal = sale.price_cents - sale.down_cents;
    let applied = Math.max(0,sale.paid_cents-sale.down_cents);
    const installments = Array.from({length:sale.months}, (_,i) => {
      const regular = Math.round(principal/sale.months);
      const amount = sale.legacy ? Math.max(0,i===sale.months-1 ? principal-regular*i : Math.min(regular,principal-regular*i)) :
        Math.floor(principal/sale.months)+Number(i<principal%sale.months);
      const start = sale.first_due_date || sale.sale_date;
      const due = new Date(start+'T00:00:00Z');
      const day = due.getUTCDate();
      due.setUTCDate(1);
      due.setUTCMonth(due.getUTCMonth()+i+Number(!sale.first_due_date));
      const end = new Date(due);
      end.setUTCMonth(end.getUTCMonth()+1,0);
      due.setUTCDate(Math.min(day,end.getUTCDate()));
      const due_date = due.toISOString().slice(0,10);
      const covered = Math.min(applied,amount);
      applied -= covered;
      return {number:i+1,due_date,amount_cents:amount,pending_cents:amount-covered,
        status:amount===covered?'pagada':due_date<current?'vencida':'pendiente'};
    });
    return json({sale, balance_cents:sale.price_cents-sale.paid_cents, installments, payments:paymentResult.results});
  }
  if (resource === 'receipts' && (cash || sales) && key && /^\d{1,15}$/.test(key)) {
    const receipt = await db.prepare(`SELECT p.*,s.lot_id,c.name AS client_name,r.balance_cents,
      EXISTS(SELECT 1 FROM void_payments WHERE receipt=p.receipt) AS voided
      FROM payments p JOIN sales s ON s.id=p.sale_id JOIN clients c ON c.id=s.client_id
      LEFT JOIN d1_receipt_balances r ON r.receipt=p.receipt WHERE p.receipt=?`).bind(Number(key)).first();
    return receipt ? json({receipt}) : json({error:'Recibo no encontrado.'},404);
  }
  return json({error:'No tienes acceso a esta consulta.'},403);
}

function writes(db, op, b, current, record, authorize) {
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  const gate = 'EXISTS (SELECT 1 FROM commands WHERE actor=? AND request_id=? AND response=?)';
  if (op === 'lots') {
    if (!id(b.id) || !integer(b.price_cents,1)) return;
    return [stmt(`INSERT INTO lots SELECT ?,? WHERE ${gate} ON CONFLICT DO NOTHING`,b.id,b.price_cents,...authorize)];
  }
  if (op === 'payments') {
    if (!id(b.sale_id) || !date(b.date) || b.date>current || !integer(b.amount_cents,1)) return;
    return [
      stmt(`INSERT INTO payments(sale_id,amount_cents,payment_date,kind)
        SELECT s.id,?,?,'installment' FROM sales s WHERE s.id=? AND s.sale_date<=?
        AND ?<=s.price_cents-(${paid}) AND ${gate}`,b.amount_cents,b.date,b.sale_id,b.date,b.amount_cents,...authorize)
    ];
  }
  if (!id(b.lot_id) || !id(b.client_id)) return;
  const available = `NOT EXISTS(SELECT 1 FROM sales WHERE lot_id=l.id) AND ${gate}`;
  const expire = stmt(`UPDATE reservations SET status='expired' WHERE lot_id=? AND status='active' AND reserved_until<? AND ${gate}`,
    b.lot_id,current,...authorize);
  if (op === 'reservations') {
    if (!date(b.reserved_until) || b.reserved_until<current) return;
    return [expire,stmt(`INSERT INTO reservations(id,lot_id,client_id,reserved_until)
      SELECT ?,l.id,c.id,? FROM lots l CROSS JOIN clients c WHERE l.id=? AND c.id=? AND ${available}
      AND NOT EXISTS(SELECT 1 FROM reservations WHERE lot_id=l.id AND status='active')`,
      record,b.reserved_until,b.lot_id,b.client_id,...authorize)];
  }
  if (!date(b.date) || b.date>current || !integer(b.months,0,360) ||
      (b.months && !integer(b.down_cents,0)) || (b.reservation_id!=null && !id(b.reservation_id))) return;
  const firstDue = b.first_due_date || null;
  if (firstDue && (!date(firstDue) || !b.months || firstDue<b.date)) return;
  return [expire,stmt(`INSERT INTO sales
    SELECT ?,l.id,c.id,r.id,l.price_cents,CASE WHEN ?=0 THEN l.price_cents ELSE ? END,?,?
    FROM lots l CROSS JOIN clients c LEFT JOIN reservations r ON r.lot_id=l.id AND r.status='active'
    WHERE l.id=? AND c.id=? AND ${available}
    AND ((? IS NULL AND r.id IS NULL) OR (r.id=? AND r.client_id=c.id))
    AND (?=0 OR ?<l.price_cents)`,record,b.months,b.down_cents??0,b.months,b.date,b.lot_id,b.client_id,...authorize,
    b.reservation_id??null,b.reservation_id??null,b.months,b.down_cents??0)];
}

async function write(db, actor, request, current) {
  const key = request.headers.get('Idempotency-Key');
  if (!id(key)) return json({error:'Se requiere un código de operación válido.'},400);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return json({error:'Se requiere JSON.'},415);
  let body;
  try {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let input = '';
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size>4096) {
        await reader.cancel();
        return json({error:'Solicitud demasiado grande.'},413);
      }
      input += decoder.decode(value,{stream:true});
    }
    body = JSON.parse(input+decoder.decode());
  } catch {
    return json({error:'Solicitud inválida.'},400);
  }
  const op = body?.operation;
  if (!Object.hasOwn(access,op) || !can(actor,...access[op])) return json({error:'No tienes permiso para esta operación.'},403);
  const fingerprint = await hash(JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a],[b])=>a.localeCompare(b)))));
  const record = crypto.randomUUID();
  const authorize = [actor.name,key,record];
  const statements = writes(db,op,body,current,record,authorize);
  if (!statements) return json({error:'Revisa los códigos, fechas e importes.'},400);
  const stmt = (sql,...args) => db.prepare(sql).bind(...args);
  const gate = 'actor=? AND request_id=? AND response=?';
  const response = op==='payments' ? "json_object('receipt',last_insert_rowid())" : "json_object('id',?)";
  const args = op==='payments' ? [] : [op==='lots'?body.id:record];
  const paymentBalance = `INSERT INTO d1_receipt_balances SELECT p.receipt,s.price_cents-(${paid})
    FROM payments p JOIN sales s ON s.id=p.sale_id WHERE p.receipt=last_insert_rowid() AND changes()=1`;
  const finish = stmt(`UPDATE commands SET response=CASE WHEN changes()=1 THEN ${response}
    ELSE json_object('conflict',1) END WHERE ${gate}`,...args,...authorize);
  const saleGate = `WHERE s.id=? AND EXISTS(SELECT 1 FROM commands
    WHERE actor=? AND request_id=? AND json_extract(response,'$.id')=s.id)`;
  const tail = op==='sales' ? [
    stmt(`INSERT INTO sale_due_dates SELECT s.id,? FROM sales s ${saleGate} AND ? IS NOT NULL`,body.first_due_date||null,record,actor.name,key,body.first_due_date||null),
    stmt(`UPDATE reservations SET status='converted' WHERE id=(SELECT s.reservation_id FROM sales s ${saleGate})`,record,actor.name,key),
    stmt(`INSERT INTO payments(sale_id,amount_cents,payment_date,kind)
      SELECT s.id,s.down_cents,s.sale_date,CASE WHEN s.months=0 THEN 'cash' ELSE 'down' END
      FROM sales s ${saleGate} AND s.down_cents>0`,record,actor.name,key),
    stmt(paymentBalance)
  ] : [];
  const result = await db.batch([
    stmt('INSERT INTO commands(actor,request_id,fingerprint,response) VALUES (?,?,?,?) ON CONFLICT DO NOTHING',actor.name,key,fingerprint,record),
    ...statements,
    ...(op==='payments'?[stmt(paymentBalance)]:[]),
    finish,...tail,
    stmt('SELECT fingerprint,response FROM commands WHERE actor=? AND request_id=?',actor.name,key)
  ]);
  const command = result.at(-1).results[0];
  if (command.fingerprint!==fingerprint) return json({error:'El código ya corresponde a otra operación.'},409);
  const saved = JSON.parse(command.response);
  return saved.conflict ? json({error:'Operación incompatible con el estado actual del solar, apartado o saldo.'},409) :
    json(saved,result[0].meta.changes?201:200);
}

export async function onRequest({request,env}) {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if (!token) return json({error:'Se requiere una credencial de LOTIGEST.'},401);
  const db = env.LOTIGEST_DB;
  if (!db) return json({error:'Base de datos no disponible.'},503);
  try {
    const actor = await db.prepare('SELECT name,role,panels_json FROM users LEFT JOIN user_panels USING(name) WHERE token_hash=?').bind(await hash(token)).first();
    if (!actor) return json({error:'Credencial inválida.'},401);
    actor.panels = actor.panels_json ? JSON.parse(actor.panels_json) : null;
    if (request.method==='GET') return await read(db,actor,new URL(request.url),today());
    if (request.method==='POST') return await write(db,actor,request,today());
    return json({error:'Método no permitido.'},405);
  } catch (error) {
    console.error('LOTIGEST D1 operations',error.name);
    return json({error:'No fue posible completar la operación.'},503);
  }
}
