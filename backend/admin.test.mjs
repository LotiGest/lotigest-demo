import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from './store.mjs';

test('permisos por panel y anulación administrativa con bitácora', () => {
  const store = openStore(':memory:', () => '2026-11-13');
  try {
    store.addUser('admin', 'admin', 'a'.repeat(64));
    const admin = store.authenticate('Bearer ' + 'a'.repeat(64));
    const command = (route, key, data) => store.command(admin, route, key, data);
    command('manage-user', 'staff', { name: 'caja', role: 'normal', panels: ['cash'], token: 'b'.repeat(64) });
    const cashier = store.authenticate('Bearer ' + 'b'.repeat(64));
    assert.deepEqual(cashier.panels, ['cash']);
    assert.throws(() => store.readFor(cashier, 'removal-log'), { status: 403 });
    assert.throws(() => store.readFor(cashier, 'clients'), { status: 403 });
    assert.throws(() => store.command(cashier, 'release-sale', 'no', { id: 'x' }), { status: 403 });
    command('clients', 'client', { id: 'C1', name: 'Cliente de prueba', identity: 'PRUEBA1' });
    command('lots', 'lot', { id: 'L1', price_cents: 10000 });
    const sale = command('sales', 'sale', { lot_id: 'L1', client_id: 'C1', date: '2026-11-13', months: 2, down_cents: 1000 });
    assert.deepEqual(store.readFor(cashier, 'catalog').clients, [{ id: 'C1', name: 'Cliente de prueba' }]);
    const payment = store.command(cashier, 'payments', 'payment', { sale_id: sale.id, amount_cents: 2000, date: '2026-11-13' });
    assert.equal(store.read('sales', sale.id).balance_cents, 7000);
    command('void-payment', 'void', { id: String(payment.receipt), reason: 'Cobro de prueba duplicado' });
    assert.equal(store.read('sales', sale.id).balance_cents, 9000);
    assert.throws(() => store.read('receipts', String(payment.receipt)), { status: 409 });
    command('release-sale', 'release', { id: sale.id, reason: 'Compra anulada de prueba' });
    assert.equal(store.read('lots')[0].status, 'available');
    assert.equal(store.read('clients').length, 1);
    assert.deepEqual(store.readFor(admin, 'removal-log').map(row => row.action), ['release-sale','void-payment']);
    command('manage-user', 'edit', { name: 'caja', role: 'normal', panels: ['inventory'] });
    assert.throws(() => store.command(store.authenticate('Bearer ' + 'b'.repeat(64)), 'payments', 'no', {}), {status:403});
  } finally { store.close(); }
});
