import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { extractDocumentFields } from './document-fields.mjs';
import { createLotigestServer } from './server.mjs';
import { openStore } from './store.mjs';

test('OCR no sugiere valores contradictorios y reconoce los rótulos de tres páginas', () => {
  const fields = extractDocumentFields(['Nombre: Ana Ficticia\nSolar: L-01', 'Precio: 200000.25\nSaldo pendiente: 120000',
    'Precio: 210000.25\nPrimera cuota: 2027-01-15']);
  assert.deepEqual(fields, { name: 'Ana Ficticia', lot: 'L-01', balance: '120000', firstDue: '2027-01-15' });
});

test('contratos: permisos, formatos, OCR real opcional y guardado de texto revisado', async () => {
  const fixture = process.env.LOTIGEST_OCR_TEST_FIXTURE;
  const store = openStore(':memory:', () => '2026-11-12');
  const admin = { name: 'admin', role: 'admin' };
  const token = 'a'.repeat(64), cashier = 'b'.repeat(64);
  store.addUser(admin.name, admin.role, token);
  store.addUser('caja', 'cashier', cashier);
  store.command(admin, 'clients', 'client', { id: 'C1', name: 'Ana Ficticia', identity: 'TEST-0001' });
  const server = createLotigestServer(store, { ocr: { tessdata: fixture } }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port + '/api/v1/';
    const request = (path, auth, method = 'GET', body, type = 'application/json', extra = {}) =>
      fetch(base + path, { method, headers: { ...(auth && { Authorization: 'Bearer ' + auth }),
        'Content-Type': type, 'Idempotency-Key': 'doc1', ...extra }, body });
    assert.equal((await request('documents')).status, 401);
    assert.equal((await request('documents', cashier)).status, 403);
    assert.equal((await request('document-ocr', cashier, 'POST', 'x', 'image/png')).status, 403);
    assert.equal((await request('document-ocr', token, 'POST', 'x', 'image/png', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await request('document-ocr', token, 'POST', 'x', 'image/png')).status, 400);
    assert.equal((await request('document-ocr', token, 'POST', 'x', 'image/jpeg')).status, 415);
    const huge = Buffer.alloc(33);
    Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]).copy(huge);
    huge.writeUInt32BE(2401, 16);
    huge.writeUInt32BE(100, 20);
    assert.equal((await request('document-ocr', token, 'POST', huge, 'image/png')).status, 400);
    let pages = ['Nombre: Ana Ficticia', 'Solar: L-01', 'Prima: 50000'];
    if (fixture) {
      pages = [];
      for (let index = 1; index <= 3; index++) {
        const response = await request('document-ocr', token, 'POST', readFileSync(join(fixture, 'page-' + index + '.png')), 'image/png');
        assert.equal(response.status, 200);
        pages.push((await response.json()).text);
      }
      const fields = extractDocumentFields(pages);
      assert.equal(fields.name, 'Ana Ficticia');
      assert.match(fields.lot, /^L-[0O]1$/);
      pages[1] = pages[1].replace(/L-O1/g, 'L-01');
      assert.equal(extractDocumentFields(pages).lot, 'L-01');
      assert.equal(fields.price, '200000.25');
      assert.equal(fields.firstDue, '2027-01-15');
    }
    const body = JSON.stringify({ client_id: 'C1', title: 'Contrato de prueba', pages, fields: extractDocumentFields(pages) });
    const saved = await request('documents', token, 'POST', body);
    assert.equal(saved.status, 200);
    const { id } = await saved.json();
    const duplicate = await request('documents', token, 'POST', body);
    assert.equal((await duplicate.json()).id, id);
    assert.equal((await request('documents/' + id, cashier)).status, 403);
    assert.deepEqual((await (await request('documents/' + id, token)).json()).pages, pages);
    assert.equal((await (await request('documents', token)).json()).length, 1);
    assert.equal(store.read('sales').length, 0);
    store.command(admin, 'lots', 'lot', { id: 'L-01', price_cents: 20_000_025 });
    const sale = store.command(admin, 'sales', 'sale', { lot_id: 'L-01', client_id: 'C1', date: '2026-11-12',
      months: 60, down_cents: 5_000_000, first_due_date: '2027-01-15' });
    assert.equal(sale.installments[0].due, '2027-01-15');
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});
