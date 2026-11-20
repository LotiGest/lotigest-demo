import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappPhone } from './whatsapp-reminders.mjs';

test('teléfonos de Estados Unidos se convierten al formato internacional correcto de WhatsApp', () => {
 for (const value of ['3055550123', '(305) 555-0123', '1 305-555-0123', '+1 (305) 555-0123', '+13055550123'])
  assert.equal(whatsappPhone(value), '13055550123', value);
});
test('los números hondureños siguen funcionando y otros países conservan +', () => {
 for (const value of ['9999-1234', '50499991234', '+504 9999-1234'])
  assert.equal(whatsappPhone(value), '50499991234', value);
 assert.equal(whatsappPhone('+44 20 7946 0958'), '442079460958');
});
test('evita marcar números incompletos, prefijos sueltos y números mal formados', () => {
 for (const value of ['', '+1', '5550123', '1 (005) 555-0123', '0-000-000-0000', '305-111-0123', 'hola 3055550123'])
  assert.equal(whatsappPhone(value), null, value);
});
