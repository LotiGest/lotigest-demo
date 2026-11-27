# Revisión funcional de LOTIGEST · 26 noviembre 2026

Base: `LotiGest/lotigest-demo`, commit `9dc34f135007fa3a471a33c322d72380e2b01ac4` (versión publicada de referencia 1.0.37).

## Resultado

La revisión general todavía NO está aprobada. Las correcciones están preparadas para revisión, sin desplegar a producción.

| Comprobación | Resultado |
|---|---|
| Línea base antes de cambios | 509 pruebas: 439 aprobadas y 70 fallidas |
| Última ejecución completa | 507 pruebas: 468 aprobadas y 39 fallidas |
| Cobertura combinada con repetición de último pago | 511 casos: 472 aprobados y 39 fallidos |
| Recorrido y reglas de pagos (`npm run test:payments`) | 16 aprobadas, 0 fallidas |
| Compilación Cloudflare Pages (`npm run build`) | Correcta |
| Sintaxis JavaScript y módulos | 235 archivos, 0 errores |

No se eliminaron pruebas ni se añadieron exclusiones. La última ejecución general informó 507 resultados; se repitió aparte el archivo de último pago (5 resultados: 4 aprobados y 1 fallo ya incluido en la ejecución general) para cubrir sus cuatro casos adicionales. La cobertura combinada es de 511 casos distintos de la colección ejecutada. El listado de las comprobaciones pendientes está en [2026-11-26-results.json](2026-11-26-results.json).

## Correcciones preparadas

- Permitir pagos mensuales parciales positivos, tanto individuales como distribuidos entre solares. Se conservan los controles de prima previa, saldo máximo, fechas, correlativos y separación de clientes/residenciales.
- Mantener el faltante en el calendario hasta completar la cuota. Prueba integrada: cuota L 3,400; primer recibo L 1,700; faltante L 1,700; segundo recibo L 1,700; dos abonos posteriores de L 3,400; la prima no cuenta como cuota.
- Mostrar los abonos inferiores a la cuota como parciales en la revisión de abonos varios; el excedente mostrado nunca es negativo.
- Excluir pagos anulados, eliminados o cancelados al validar prima pendiente y saldo en las reglas de abonos. Esto corrige esa validación; no pretende certificar todos los demás reportes.
- Actualizar pruebas para el formulario vigente de total y prima del contrato, fechas, cliente seleccionado y funciones auxiliares. Corregir el entorno de pruebas que serializaba el valor anterior de campos monetarios convertidos a ocultos.
- Compilar antes de `npm test` y agregar `npm run test:payments` para repetir el recorrido crítico.

## Funciones comprobadas con datos ficticios

La prueba integrada usa la interfaz generada y los manejadores reales de sesión y persistencia, con una base SQLite/D1 de prueba. Cubre alta desde contrato en tres pasos, selección del solar, prima recibida, guardar y crear otro, abonos parciales, completar cuota, abonos varios, revisión sin escrituras, guardado doble protegido, recibos separados, bloqueo de correlativos repetidos aun con ceros iniciales, bloqueo de sobrepago, segundo contrato sin cobrar prima y recuperación de los pagos al reabrir.

La prueba de ficha PDF verifica datos existentes y mensualidad, descarga el PDF, registra un parcial de L 5,000 sobre L 6,220.33 y completa los L 1,220.33 faltantes. Las pruebas de servidor verifican que D1 acepta el parcial y su complemento. Se verifican distribución exacta de centavos y rechazo de pagos mensuales sin prima completa.

## Pendientes y límites

Siguen fallando 39 comprobaciones generales. Incluyen pruebas de importaciones y controles anteriores al flujo de Contratos, exportaciones, historial, PIN, conciliación sin conexión y filtros del mapa. Varios fallos corresponden a simulaciones incompletas o expectativas de controles retirados; otros requieren reproducción adicional. No se han descartado como simples errores de prueba ni se afirma que todos sean defectos del programa.

Las pruebas se ejecutaron de manera aislada. No se modificaron clientes, contratos, recibos ni bases de producción. No se comprobó una instalación Android real, biometría, impresora física, WhatsApp Business real ni una sesión del sitio publicado. La compilación correcta y las pruebas de pago aprobadas no equivalen a aprobar todo el sistema.

## Reproducción

```sh
npm ci
npm run build
node --test --test-force-exit --test-concurrency=4 backend/*.test.mjs deploy/cloudflare/*.test.mjs tests/*.test.mjs
npm run test:payments
```
