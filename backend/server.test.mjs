import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createLotigestServer } from './server.mjs';
import { hondurasToday, openStore } from './store.mjs';

test('calendario comercial de Honduras', () => {
  assert.equal(hondurasToday(new Date('2026-11-11T02:00:00Z')), '2026-11-10');
});

test('permisos, apartado, venta concurrente, cuotas, mora y recibo persistente', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lotigest-'));
  const filename = join(dir, 'test.sqlite');
  const today = () => '2026-11-11';
  const primary = openStore(filename, today);
  const secondary = openStore(filename, today);
  const tokens = { admin: 'a'.repeat(64), sales: 'b'.repeat(64), cashier: 'c'.repeat(64), reader: 'd'.repeat(64) };
  for (const [role, token] of Object.entries(tokens)) primary.addUser(role, role, token);
  const servers = [primary, secondary].map(store => createLotigestServer(store).listen(0, '127.0.0.1'));
  try {
    await Promise.all(servers.map(server => once(server, 'listening')));
    async function request(path, role, key, data, instance = 0) {
      const response = await fetch(`http://127.0.0.1:${servers[instance].address().port}/api/v1/${path}`, {
        method: key ? 'POST' : 'GET',
        headers: { ...(role && { Authorization: 'Bearer ' + tokens[role] }),
          ...(key && { 'Idempotency-Key': key, 'Content-Type': 'application/json' }) },
        body: key ? JSON.stringify(data) : undefined,
      });
      return { status: response.status, body: await response.json() };
    }
    assert.equal((await request('lots')).status, 401);
    assert.equal((await request('lots', 'reader', 'bad', { id: 'L1', price_cents: 10001 })).status, 403);
    assert.equal((await request('lots', 'admin', 'lot', { id: 'L1', price_cents: 10001 })).status, 200);
    for (const id of ['C1', 'C2']) assert.equal((await request('clients', 'sales', id, { id, name: id })).status, 200);
    const reserve = { lot_id: 'L1', client_id: 'C1', reserved_until: '2026-11-30' };
    const apart = await request('reservations', 'sales', 'reserve', reserve);
    assert.equal(apart.status, 200);
    assert.deepEqual(await request('reservations', 'sales', 'reserve', reserve, 1), apart);
    assert.equal((await request('reservations', 'sales', 'again', { ...reserve, client_id: 'C2' })).status, 409);
    const purchase = { lot_id: 'L1', client_id: 'C1', reservation_id: apart.body.id, date: '2026-07-31', months: 3, down_cents: 1000 };
    assert.equal((await request('sales', 'sales', 'wrong', { ...purchase, client_id: 'C2' })).status, 409);
    const purchases = await Promise.all([request('sales', 'sales', 'buy-a', purchase), request('sales', 'sales', 'buy-b', purchase, 1)]);
    assert.deepEqual(purchases.map(result => result.status).sort(), [200, 409]);
    const sale = purchases.find(result => result.status === 200).body;
    assert.equal(sale.installments.reduce((total, row) => total + row.amount_cents, 0), 9001);
    assert.deepEqual(sale.installments.map(row => row.due), ['2026-08-31', '2026-09-30', '2026-10-31']);
    assert.equal(sale.overdue_cents, 9001);
    assert.equal((await request('reservations', 'reader')).body[0].status, 'converted');
    assert.equal((await request('lots', 'reader')).body[0].status, 'sold');
    const payment = { sale_id: sale.id, date: '2026-11-11', amount_cents: 9001 };
    assert.equal((await request('payments', 'sales', 'pay', payment)).status, 403);
    assert.equal((await request('payments', 'cashier', 'future', { ...payment, date: '2026-11-12' })).status, 400);
    const payments = await Promise.all([request('payments', 'cashier', 'pay-a', payment), request('payments', 'cashier', 'pay-b', payment, 1)]);
    assert.deepEqual(payments.map(result => result.status).sort(), [200, 409]);
    const winner = payments.findIndex(result => result.status === 200);
    const key = winner === 0 ? 'pay-a' : 'pay-b';
    const receipt = payments[winner].body;
    assert.deepEqual((await request('payments', 'cashier', key, payment, 1 - winner)).body, receipt);
    assert.equal((await request('payments', 'cashier', key, { ...payment, amount_cents: 1 })).status, 409);
    assert.equal((await request('sales/' + sale.id, 'reader', null, null, 1)).body.balance_cents, 0);
    const reopened = openStore(filename, today);
    try {
      assert.deepEqual({ ...reopened.read('receipts', String(receipt.receipt)) }, receipt);
      assert.equal(reopened.read('sales', sale.id).overdue_cents, 0);
    } finally {
      reopened.close();
    }
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    primary.close();
    secondary.close();
    rmSync(dir, { recursive: true, force: true });
  }
});


test('dos hilos de ejecución independientes compiten por el mismo solar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lotigest-lock-'));
  const filename = join(dir, 'test.sqlite');
  const store = openStore(filename);
  const actor = { name: 'admin', role: 'admin' };
  const workers = [];
  const barrier = new Int32Array(new SharedArrayBuffer(4));
  try {
    store.addUser(actor.name, actor.role, 'a'.repeat(64));
    store.command(actor, 'lots', 'lot', { id: 'L1', price_cents: 100 });
    store.command(actor, 'clients', 'client', { id: 'C1', name: 'Cliente de prueba' });
    const code = `
      import { parentPort, workerData } from 'node:worker_threads';
      import { openStore } from ${JSON.stringify(new URL('./store.mjs', import.meta.url).href)};
      const db = openStore(workerData.filename, () => '2026-11-11');
      parentPort.postMessage('ready');
      Atomics.wait(workerData.barrier, 0, 0);
      try {
        const sale = db.command(workerData.actor, 'sales', workerData.key,
          { lot_id: 'L1', client_id: 'C1', date: '2026-01-01', months: 0 });
        parentPort.postMessage({ status: 200, sale });
      } catch (error) {
        parentPort.postMessage({ status: error.status ?? 500 });
      } finally {
        db.close();
      }
    `;
    for (const key of ['purchase-a', 'purchase-b']) {
      workers.push(new Worker(code, { eval: true, workerData: { filename, actor, key, barrier } }));
    }
    assert.deepEqual(await Promise.all(workers.map(worker => once(worker, 'message'))), [['ready'], ['ready']]);
    const results = Promise.all(workers.map(worker => once(worker, 'message')));
    Atomics.store(barrier, 0, 1);
    Atomics.notify(barrier, 0);
    const responses = (await results).map(([response]) => response);
    assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
    const sale = store.read('sales')[0];
    assert.equal(store.read('sales').length, 1);
    assert.equal(store.read('sales', sale.id).payments.length, 1);
    assert.equal(store.read('sales', sale.id).balance_cents, 0);
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('portal, sesión web, permisos y cierre desde dos clientes HTTP', async () => {
  const store = openStore(':memory:');
  const token = 'a'.repeat(64);
  store.addUser('gerente', 'admin', token);
  store.addUser('consulta', 'reader', 'b'.repeat(64));
  const server = createLotigestServer(store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const get = (path, cookie) => fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
    const post = (path, data, cookie, site = 'same-origin') => fetch(base + '/api/v1/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': site,
        'Idempotency-Key': 'portal-lote', ...(cookie && { Cookie: cookie }) },
      body: JSON.stringify(data),
    });
    const page = await get('/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await page.text(), /workspace\.mjs/);
    assert.equal((await get('/workspace.mjs')).status, 200);
    assert.equal((await get('/workspace.css')).status, 200);
    assert.equal((await post('session', { token }, undefined, 'cross-site')).status, 403);
    assert.equal((await post('session', { token: 'invalid' })).status, 401);
    const signIn = await post('session', { token });
    const rawCookie = signIn.headers.get('set-cookie');
    assert.match(rawCookie, /HttpOnly; SameSite=Strict/);
    assert.ok(!rawCookie.includes(token));
    const cookie = rawCookie.split(';')[0];
    const observer = (await post('session', { token: 'b'.repeat(64) })).headers.get('set-cookie').split(';')[0];
    assert.equal((await get('/api/v1/me', cookie)).status, 200);
    assert.equal((await post('lots', { id: 'A1', price_cents: 100 }, observer)).status, 403);
    assert.equal((await post('lots', { id: 'A1', price_cents: 100 }, cookie)).status, 200);
    const catalog = await (await get('/api/v1/catalog', observer)).json();
    assert.equal(catalog.lots[0].id, 'A1');
    assert.deepEqual(await (await get('/api/v1/command-status/portal-lote', cookie)).json(), { saved: true });
    assert.deepEqual(await (await get('/api/v1/command-status/portal-lote', observer)).json(), { saved: false });
    assert.equal((await post('logout', {}, cookie)).status, 200);
    assert.equal((await get('/api/v1/me', cookie)).status, 401);
    assert.equal((await get('/api/v1/me', observer)).status, 200);
    store.addUser('consulta', 'reader', 'c'.repeat(64));
    assert.equal((await get('/api/v1/me', observer)).status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});

test('cobro de dos solares es atómico, idempotente y conserva el saldo del recibo', () => {
  const store = openStore(':memory:', () => '2026-11-11');
  const actor = { name: 'gerente', role: 'admin' };
  store.addUser(actor.name, actor.role, 'a'.repeat(64));
  const command = (route, key, data) => store.command(actor, route, key, data);
  try {
    command('clients', 'client', { id: 'C1', name: 'Cliente de prueba' });
    const sales = ['L1', 'L2'].map(id => {
      command('lots', 'lot-' + id, { id, price_cents: 10000 });
      return command('sales', 'sale-' + id, { lot_id: id, client_id: 'C1', date: '2026-01-01', months: 12, down_cents: 0 });
    });
    const [first, second] = sales.map(sale => sale.id);
    const entries = [{ sale_id: first, amount_cents: 3000 }, { sale_id: second, amount_cents: 2000 }];
    const date = '2026-11-11';
    assert.throws(() => command('payment-batches', 'bad', { date, entries: [entries[0], { ...entries[1], amount_cents: 10001 }] }), /supera el saldo/);
    assert.deepEqual(store.read('sales', first).payments, []);
    assert.throws(() => command('payment-batches', 'duplicate', { date, entries: [entries[0], entries[0]] }), /dos veces/);
    assert.deepEqual(store.read('sales', first).payments, []);
    const group = command('payment-batches', 'good', { date, entries });
    const reordered = entries.map(({ sale_id, amount_cents }) => ({ amount_cents, sale_id }));
    assert.deepEqual(command('payment-batches', 'good', { entries: reordered, date }), JSON.parse(JSON.stringify(group)));
    command('payments', 'after', { sale_id: first, amount_cents: 1000, date });
    const rows = store.read('receipt-details', String(group.payments[1].receipt));
    assert.deepEqual(rows.map(row => row.lot_id), ['L1', 'L2']);
    assert.deepEqual(rows.map(row => row.balance_at_receipt_cents), [7000, 8000]);
    assert.equal(store.read('sales', first).balance_cents, 6000);
  } finally {
    store.close();
  }
});

test('dos sesiones HTTPS comparten registros con permisos independientes', async () => {
  const { execFileSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const { request } = await import('node:https');
  const dir = mkdtempSync(join(tmpdir(), 'lotigest-tls-'));
  const store = openStore(':memory:', () => '2026-11-11');
  let server;
  try {
    const certFile = join(dir, 'cert.pem'), keyFile = join(dir, 'key.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', keyFile, '-out', certFile],
    { stdio: 'ignore' });
    const cert = readFileSync(certFile);
    server = createLotigestServer(store, { tls: { cert, key: readFileSync(keyFile) } }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    store.addUser('ventas', 'admin', 'a'.repeat(64));
    store.addUser('caja', 'cashier', 'b'.repeat(64));
    function call(path, { data, cookie, id } = {}) {
      return new Promise((resolve, reject) => {
        const req = request({
          hostname: '127.0.0.1', port: server.address().port, ca: cert, path,
          method: data === undefined ? 'GET' : 'POST',
          headers: { ...(data !== undefined && { 'Content-Type': 'application/json' }),
            ...(cookie && { Cookie: cookie }), ...(id && { 'Idempotency-Key': id }) },
        }, res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end(data === undefined ? undefined : JSON.stringify(data));
      });
    }
    const signin = async token => {
      const result = await call('/api/v1/session', { data: { token } });
      assert.equal(result.status, 200);
      assert.match(result.headers['set-cookie'][0], /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
      return result.headers['set-cookie'][0].split(';')[0];
    };
    const shell = await call('/');
    assert.equal(shell.status, 200);
    assert.match(shell.body, /lotigest-sidebar/);
    assert.match((await call('/approved-panel.css')).body, /\.lotigest-sidebar\{/);
    const icon = await call('/lotigest-icon.webp');
    assert.match(icon.headers['content-type'], /^image\/webp/);
    const [sales, cash] = await Promise.all([signin('a'.repeat(64)), signin('b'.repeat(64))]);
    const post = (path, cookie, id, data) => call('/api/v1/' + path, { cookie, id, data });
    assert.equal((await post('lots', sales, 'lot', { id: 'L1', price_cents: 10000 })).status, 200);
    assert.equal((await post('clients', sales, 'client', { id: 'C1', name: 'Cliente ficticio' })).status, 200);
    const reserve = JSON.parse((await post('reservations', sales, 'apart', { lot_id: 'L1', client_id: 'C1', reserved_until: '2026-11-30' })).body);
    const purchase = { lot_id: 'L1', client_id: 'C1', reservation_id: reserve.id, date: '2026-11-11', months: 12, down_cents: 1000 };
    assert.equal((await post('sales', cash, 'denied', purchase)).status, 403);
    const sale = JSON.parse((await post('sales', sales, 'buy', purchase)).body);
    const payment = await post('payments', cash, 'pay', { sale_id: sale.id, date: '2026-11-11', amount_cents: 2500 });
    assert.equal(payment.status, 200);
    const ledger = JSON.parse((await call('/api/v1/sales/' + sale.id, { cookie: sales })).body);
    assert.equal(ledger.balance_cents, 6500);
    assert.equal(ledger.payments.length, 2);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
