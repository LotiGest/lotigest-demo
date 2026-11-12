import assert from 'node:assert/strict';
import { test } from 'node:test';
import { synchronizeQueue } from './offline-queue.mjs';
import { openStore } from './store.mjs';

function memoryQueue(rows) {
  const data = new Map(rows.map(row => [row.sequence, row]));
  return {
    list: async owner => [...data.values()].filter(row => row.owner === owner),
    remove: async sequence => data.delete(sequence),
    update: async row => data.set(row.sequence, row),
  };
}
test('un pago confirmado cuya respuesta se pierde se reenvía una sola vez', async () => {
  const store = openStore(':memory:', () => '2026-11-12');
  const actor = { name: 'admin', role: 'admin' };
  store.addUser(actor.name, actor.role, 'a'.repeat(64));
  try {
    store.command(actor, 'clients', 'c', { id: 'C1', name: 'Cliente ficticio' });
    store.command(actor, 'lots', 'l', { id: 'L1', price_cents: 10000 });
    const sale = store.command(actor, 'sales', 's', { lot_id: 'L1', client_id: 'C1', date: '2026-11-12', months: 10, down_cents: 0 });
    const operation = { owner: 'admin', sequence: 1, key: 'pay', route: 'payments',
      data: { sale_id: sale.id, amount_cents: 1000, date: '2026-11-12' } };
    const queue = memoryQueue([operation]);
    const send = row => store.command(actor, row.route, row.key, row.data);
    const lost = await synchronizeQueue(queue, 'admin', row => { send(row); throw Error('Sin conexión'); });
    assert.equal(lost.waiting, true);
    assert.equal((await queue.list('admin')).length, 1);
    assert.equal((await synchronizeQueue(queue, 'otra-cuenta', send)).confirmed.length, 0);
    assert.equal((await synchronizeQueue(queue, 'admin', send)).confirmed.length, 1);
    const ledger = store.read('sales', sale.id);
    assert.equal(ledger.payments.length, 1);
    assert.equal(ledger.balance_cents, 9000);
  } finally { store.close(); }
});

test('una venta rechazada conserva el conflicto y detiene las operaciones posteriores', async () => {
  const queue = memoryQueue([{ sequence: 1, owner: 'ventas', route: 'sales' }, { sequence: 2, owner: 'ventas', route: 'payments' }]);
  const calls = [];
  const send = async row => {
    calls.push(row.sequence);
    throw Object.assign(Error('Solar vendido en otro equipo.'), { status: 409 });
  };
  assert.match((await synchronizeQueue(queue, 'ventas', send)).conflict.conflict, /Solar vendido/);
  await synchronizeQueue(queue, 'ventas', send);
  assert.deepEqual(calls, [1]);
  assert.equal((await queue.list('ventas')).length, 2);
});
