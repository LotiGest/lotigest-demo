import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { columns, parsePortfolioCsv, preparePortfolio } from './portfolio-import.mjs';
import { openStore } from './store.mjs';

function fixture(count) {
  const rows = [columns];
  for (let index = 1; index <= count; index++) {
    const cash = index % 4 === 0;
    rows.push(['C-' + index, 'Cliente ficticio ' + index, 'TEST-' + index,
      'Calle ficticia; casa "' + index + '"', String(index).padStart(8, '0'), 'L-' + index, 'V-' + index,
      cash ? 'contado' : 'crédito', '2026-01-15', cash ? '' : '2026-02-15',
      '200000.25', cash ? '200000.25' : '50000', cash ? '0' : '60',
      cash ? '200000.25' : '75000', cash ? '0' : '125000.25']);
  }
  return rows;
}

test('2,000 clientes, solares y ventas se concilian y sobreviven al reinicio', () => {
  const csv = fixture(2000).map(row => row.map(cell => '"' + cell.replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const plan = preparePortfolio(parsePortfolioCsv(csv));
  const dir = mkdtempSync(join(tmpdir(), 'lotigest-portfolio-'));
  const filename = join(dir, 'data.sqlite');
  const today = () => '2026-12-20';
  let store;
  try {
    store = openStore(filename, today);
    const counts = { lots: 2000, clients: 2000, sales: 2000, payments: 0, reservations: 0 };
    assert.deepEqual(store.importLegacy(plan), counts);
    assert.equal(store.read('clients').length, 0);
    assert.deepEqual(store.importLegacy(plan, true), counts);
    store.close();
    store = openStore(filename, today);
    const catalog = store.read('catalog');
    assert.equal(catalog.clients.length, 2000);
    assert.equal(catalog.lots.filter(row => row.status === 'sold').length, 2000);
    assert.equal(catalog.sales.length, 2000);
    const contacts = new Map(catalog.clients.map(row => [row.id, row]));
    let balance = 0n, installments = 0;
    for (let index = 1; index <= 2000; index++) {
      const sale = store.read('sales', 'V-' + index);
      const cash = index % 4 === 0;
      assert.equal(sale.client_id, 'C-' + index);
      assert.equal(sale.lot_id, 'L-' + index);
      assert.equal(sale.down_cents, cash ? 20_000_025 : 5_000_000);
      assert.equal(sale.opening_cents, cash ? 20_000_025 : 7_500_000);
      assert.equal(sale.balance_cents, cash ? 0 : 12_500_025);
      assert.equal(sale.installments.length, cash ? 0 : 60);
      assert.equal(sale.payments.length, 0);
      assert.equal(contacts.get(sale.client_id).address, 'Calle ficticia; casa "' + index + '"');
      assert.equal(contacts.get(sale.client_id).identity, 'TEST' + index);
      assert.equal(contacts.get(sale.client_id).phone, String(index).padStart(8, '0'));
      balance += BigInt(sale.balance_cents);
      installments += sale.installments.length;
    }
    assert.equal(balance, 18_750_037_500n);
    assert.equal(installments, 90_000);
    const credit = store.read('sales', 'V-1');
    assert.equal(credit.installments[0].due, '2026-02-15');
    assert.ok(credit.overdue_cents > 0);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rechaza saldos descuadrados y reutiliza un cliente con dos solares', () => {
  const rows = fixture(2);
  rows[2].splice(0, 5, ...rows[1].slice(0, 5));
  assert.equal(preparePortfolio(rows).clients.length, 1);
  rows[2][columns.indexOf('saldo')] = '125000.24';
  assert.throws(() => preparePortfolio(rows), /fila 3/);
  assert.throws(() => parsePortfolioCsv('"sin cerrar'), /comillas/);
});
