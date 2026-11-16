import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractPaymentFields, suggestPaymentSale } from './payment-fields.mjs';

test('extrae monto en lempiras, fecha, nombre, solar y folio', () => {
  const data = extractPaymentFields('Recibí de: Ana López\nAbono: L. 1,250.50\nFecha: 16/11/2026\nSolar: A-03\nFolio: 001\nSaldo: 20000');
  assert.deepEqual(data, { amount: '1250.5', date: '2026-11-16', name: 'Ana López', lot: 'A-03', reference: '001' });
  assert.equal(extractPaymentFields('Monto pagado: L 1.250,50').amount, '1250.5');
});

test('deja campos ambiguos vacíos y requiere una coincidencia única', () => {
  assert.equal(extractPaymentFields('Monto pagado: 200\nAbono: 300').amount, undefined);
  assert.equal(extractPaymentFields('Saldo: 200\nCuota: 300').amount, undefined);
  assert.equal(extractPaymentFields('Fecha: 31/02/2026').date, undefined);
  const sales = [{ id: 'S1', client_id: 'C', lot_id: 'A-03' }, { id: 'S2', client_id: 'C', lot_id: 'A-04' }];
  const clients = [{ id: 'C', name: 'ANA LOPEZ' }];
  assert.equal(suggestPaymentSale({ name: 'Ana López' }, sales, clients), undefined);
  assert.equal(suggestPaymentSale({ name: 'Ana López', lot: 'A-03' }, sales, clients), 'S1');
  assert.equal(suggestPaymentSale({ name: 'Otro nombre', lot: 'A-03' }, sales, clients), undefined);
});
