import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { reconcileBackup, verifyInstallation } from './readiness.mjs';
import { createLotigestServer } from './server.mjs';
import { openStore } from './store.mjs';

test('la conciliación informa montos exactos en centavos y rechaza inconsistencias', () => {
  const data = {
    version: 3,
    lots: [{ id: 'L1', status: 'sold', price: 100.01 }],
    clients: [{ id: 'C1', name: 'Cliente ficticio' }],
    sales: [{ id: 'V1', type: 'credit', lotId: 'L1', clientId: 'C1', date: '2026-01-01',
      price: 100.01, downPayment: 10, openingPaid: 10, months: 12 }],
    payments: [{ id: 'R1', saleId: 'V1', amount: 15.01, date: '2026-02-01' }],
  };
  assert.deepEqual(reconcileBackup(data), {
    counts: { lots: 1, clients: 1, sales: 1, payments: 1, reservations: 0 },
    centavos: { valor_ventas: '10001', abonos_historicos: '1000', pagos: '1501', saldo: '7500' },
  });
  data.payments[0].amount = 200;
  assert.throws(() => reconcileBackup(data), /Importes o fechas incompatibles/);
});

test('verificación de instalación comprueba recursos, consulta y acceso protegido', async () => {
  const store = openStore(':memory:');
  const token = 'a'.repeat(64);
  const admin = 'b'.repeat(64);
  store.addUser('lector', 'reader', token);
  store.addUser('gerente', 'admin', admin);
  const server = createLotigestServer(store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const url = 'http://127.0.0.1:' + server.address().port;
    assert.deepEqual(await verifyInstallation(url, token), { transporte: 'http', panel: 'ok',
      autenticacion: 'ok', registros: { lots: 0, clients: 0, reservations: 0, sales: 0 } });
    await assert.rejects(verifyInstallation(url, admin), /consulta/);
    await assert.rejects(verifyInstallation('http://example.com', token), /HTTPS/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});
