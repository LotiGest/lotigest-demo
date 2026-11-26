# LOTIGEST · pruebas funcionales de contratos y abonos

Versión de corrección: 1.0.23. Fecha: 25 noviembre 2026 (Honduras).

## Entorno y alcance

Pruebas automatizadas aisladas, sin modificar datos de producción. El recorrido usa el HTML compilado y sus eventos DOM, las rutas reales de autenticación y persistencia y una base SQLite en memoria que ejecuta las consultas de D1. No es una prueba visual en un teléfono ni una sesión contra la base Cloudflare de producción. No se enviaron mensajes a clientes.

## Recorrido comprobado

1. Inicializar una base vacía e iniciar sesión.
2. Preparar dos solares disponibles exclusivamente de prueba.
3. Crear un cliente desde Contratos siguiendo Cliente → Solares → Revisar.
4. Registrar contrato y prima realmente recibida con su propio correlativo; usar «Guardar y crear otro» y comprobar que conserva etapa/plazo pero limpia cliente, solar y recibo.
5. Registrar un abono individual mediante el control de importe visible.
6. Registrar dos fechas en Abonos varios, revisar antes de guardar y confirmar.
7. Repetir el clic de guardado sin duplicar movimientos.
8. Verificar recibos separados y tres cuotas cubiertas, sin contar la prima como cuota.
9. Rechazar por API un correlativo repetido con ceros iniciales y un sobrepago, manteniendo la revisión y los datos anteriores.
10. Buscar al mismo cliente y registrar un segundo contrato sin prima cobrada: no duplica el cliente, no inventa cobros ni activa una venta pagada.
11. Reabrir la aplicación y comprobar los pagos persistidos.

| Comprobación del primer contrato ficticio | Resultado esperado y verificado |
| --- | --- |
| Precio | L 200,000.00 |
| Prima realmente recibida | L 30,000.00 |
| Saldo a financiar inicial | L 170,000.00 |
| Plazo y cuota | 50 meses · L 3,400.00 |
| Abono individual | L 3,400.00 |
| Dos abonos adicionales | L 6,800.00 |
| Total recibido incluyendo prima | L 40,200.00 |
| Saldo restante | L 159,800.00 |
| Movimientos | 1 prima + 3 abonos; 4 correlativos únicos |
| Cuotas cubiertas | 3; la prima permanece aparte |

## Errores corregidos

- La validación de correlativos consultaba `previous.payments` cuando la base todavía no tenía un estado anterior. Ahora admite ese predecesor nulo y conserva las validaciones de recibos nuevos. Se añadió una regresión de primera carga por API.
- Los atajos de pago individual y varios no reutilizaban el contexto del cliente al regresar al panel Abonos. Ahora reconocen también ese panel y mantienen la comprobación de residencial.
- El desplazamiento entre pasos usa una llamada opcional cuando el entorno no implementa `Element.scrollTo`.
- Los metadatos de la interfaz de tres pasos se actualizan solo para formularios de esa interfaz.

## Mantenimiento de las pruebas

La espera de guardado del banco de pruebas dependía de un mensaje visual antiguo. Se sustituyó por un observador de estado de confirmación instalado únicamente en el HTML de prueba. Los simuladores de formularios y las expectativas de Enter se actualizaron al flujo de revisión actual. Esta instrumentación no se incorpora al HTML de producción.

## Resultado

62 pruebas de la batería funcional aprobadas, sin fallos ni omitidas. Compilación y comprobación de espacios del diff aprobadas.

La batería incluye contratos, precios negociados, varios solares, prima recibida, identidad, eliminación segura de selección, prelistado de abonos, guardado pendiente, correlativos, reglas de mensualidades, servidor D1 y el recorrido completo.

## Reproducción

```sh
npm ci
npm run build
node --test --test-force-exit deploy/cloudflare/contract-to-payments-e2e.test.mjs deploy/cloudflare/contract-intake-autofill.test.mjs deploy/cloudflare/contract-manual-payment.test.mjs deploy/cloudflare/contract-intake.test.mjs deploy/cloudflare/contract-intake-remove-primary.test.mjs deploy/cloudflare/contract-quick-steps.test.mjs deploy/cloudflare/multi-date-wizard.test.mjs deploy/cloudflare/multi-date-abonos-ui.test.mjs deploy/cloudflare/payment-reference-layout.test.mjs deploy/cloudflare/control-panels-ui.test.mjs deploy/cloudflare/monthly-payment-server.test.mjs tests/monthly-payment-rules.test.mjs deploy/cloudflare/receipt-duplicate-client.test.mjs
```
