import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareLegacyMigration } from './migrate.mjs';
import { openStore } from './store.mjs';

const fixture = {
  version: 3,
  lots: [{ id: 'L1', price: 100.01, status: 'sold' }],
  clients: [{ id: 'C1', name: 'Cliente de prueba' }],
  sales: [{ id: 'S1', lotId: 'L1', clientId: 'C1', type: 'credit', date: '2026-01-31',
    firstDueDate: '2026-02-28', months: 3, price: 100.01, downPayment: 10, openingPaid: 20 }],
  reservations: [{ id: 'A1', lotId: 'L1', clientId: 'C1', reservedUntil: '2026-02-01', status: 'converted', saleId: 'S1' }],
  payments: [{ id: 'R-1', saleId: 'S1', amount: 15, date: '2026-03-15' }],
};

test('la prevalidación revierte y la migración conserva saldo, primer vencimiento y folio', () => {
  const store = openStore(':memory:', () => '2026-11-11');
  try {
    const plan = prepareLegacyMigration(fixture);
    assert.equal(store.importLegacy(plan).sales, 1);
    assert.deepEqual(store.read('sales'), []);
    const inconsistent = structuredClone(plan);
    inconsistent.sales[0].balance++;
    assert.throws(() => store.importLegacy(inconsistent, true), /saldo importado/);
    assert.deepEqual(store.read('lots'), []);
    store.importLegacy(plan, true);
    const sale = store.read('sales', 'S1');
    assert.equal(sale.balance_cents, 6501);
    assert.equal(sale.installments[0].due, '2026-02-28');
    assert.equal(sale.installments.reduce((sum, row) => sum + row.amount_cents, 0), 9001);
    assert.equal(sale.payments[0].legacy_id, 'R-1');
    assert.equal(store.read('receipts', '1').legacy_id, 'R-1');
    assert.equal(sale.reservation_id, 'A1');
    assert.throws(() => store.importLegacy(plan, true), /base comercial vacía/);
  } finally {
    store.close();
  }
});

test('respaldo incompatible falla antes de importar', () => {
  for (const change of [
    data => data.payments[0].saleId = 'missing',
    data => data.payments[0].amount = 1000,
    data => data.lots[0].status = 'available',
    data => data.reservations[0].saleId = 'missing',
    data => data.sales[0].firstDueDate = '2026-02-30',
  ]) {
    const data = structuredClone(fixture);
    change(data);
    assert.throws(() => prepareLegacyMigration(data));
  }
});
