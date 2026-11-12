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

test('respaldo ficticio de escala demo concilia todos los solares y saldos', () => {
  const data = { version: 3, lots: [], clients: [], sales: [], payments: [], reservations: [] };
  for (let index = 1; index <= 120; index++) {
    const lotId = 'L-' + index;
    const clientId = 'C-' + index;
    const saleId = 'V-' + index;
    const status = index <= 60 ? 'sold' : index <= 75 ? 'reserved' : 'available';
    const price = 180000 + index * 10.01;
    data.lots.push({ id: lotId, status, price: price.toFixed(2) });
    if (index > 75) continue;
    data.clients.push({ id: clientId, name: 'Cliente de prueba ' + index });
    if (status === 'reserved') {
      data.reservations.push({ id: 'AP-' + index, lotId, clientId, status: 'active', reservedUntil: '2026-11-30' });
      continue;
    }
    const type = index % 2 ? 'cash' : 'credit';
    const downPayment = type === 'cash' ? price.toFixed(2) : '25000.00';
    data.sales.push({ id: saleId, lotId, clientId, type, price: price.toFixed(2), downPayment, date: '2026-01-31',
      months: type === 'cash' ? 0 : 48 });
    data.payments.unshift({ id: 'R-' + index, saleId, amount: downPayment, date: '2026-01-31' });
  }
  const store = openStore(':memory:', () => '2026-11-11');
  try {
    const plan = prepareLegacyMigration(JSON.parse(JSON.stringify(data)));
    assert.deepEqual(store.importLegacy(plan), { lots: 120, clients: 75, sales: 60, payments: 60, reservations: 15 });
    assert.equal(store.read('lots').length, 0);
    store.importLegacy(plan, true);
    const statuses = store.read('lots').map(row => row.status);
    assert.equal(statuses.filter(status => status === 'reserved').length, 15);
    assert.equal(statuses.filter(status => status === 'sold').length, 60);
    for (const sale of plan.sales) assert.equal(store.read('sales', sale.id).balance_cents, sale.balance);
  } finally {
    store.close();
  }
});
