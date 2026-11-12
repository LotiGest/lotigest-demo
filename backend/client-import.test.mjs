import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapClientRows } from './client-import.mjs';
import { openStore } from './store.mjs';

test('mapea encabezados en español, preserva ceros y reporta columnas sin destino', () => {
  const rows = [['Nombre completo', 'DNI', 'Teléfono', 'Correo electrónico', 'Dirección', 'Cuotas'],
    ['Ana Ficticia', '0101-2000-00001', '00001234', 'ana@example.com', 'Calle A', '8']];
  const mapped = mapClientRows(rows);
  assert.deepEqual(mapped, { clients: [{ id: 'ID-0101200000001', name: 'Ana Ficticia',
    identity: '0101200000001', phone: '00001234', email: 'ana@example.com', address: 'Calle A' }], ignored: ['Cuotas'] });
  assert.throws(() => mapClientRows(rows, mapped.clients), /duplicados/);
  assert.throws(() => mapClientRows([['Nombre', 'DNI', 'Identidad'], rows[1]]), /dos columnas/);
});

test('importación transaccional respeta permisos y rechaza duplicados sin guardar parte del lote', () => {
  const store = openStore(':memory:');
  const user = { name: 'ventas', role: 'sales' };
  store.addUser(user.name, user.role, 'a'.repeat(64));
  try {
    const first = { id: 'C1', name: 'Cliente de prueba', identity: '0101-2000-00001', phone: '01234' };
    assert.throws(() => store.command({ ...user, role: 'cashier' }, 'client-import', 'deny', { rows: [first] }), /permiso/);
    assert.throws(() => store.command(user, 'client-import', 'bad', { rows: [first, { ...first, id: 'C2' }] }), /Registro 2/);
    assert.equal(store.read('clients').length, 0);
    assert.deepEqual(store.command(user, 'client-import', 'ok', { rows: [first] }), { imported: 1 });
    assert.deepEqual(store.command(user, 'client-import', 'ok', { rows: [first] }), { imported: 1 });
    assert.equal(store.read('clients')[0].phone, '01234');
    assert.equal(store.read('clients')[0].identity, '0101200000001');
    assert.throws(() => store.command(user, 'client-import', 'duplicate', { rows: [{ ...first, id: 'C2' }] }), /identidad ya existe/);
  } finally { store.close(); }
});
