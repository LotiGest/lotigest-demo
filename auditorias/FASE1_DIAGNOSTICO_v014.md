# LOTIGEST — Auditoría funcional Fase 1 (v0.14)
Fecha: 2026-11-11
Repositorio: LotiGest/lotigest-demo
Página de pruebas: https://lotigest.github.io/lotigest-demo/prueba-diseno-v08.html

## Alcance
Se revisó el HTML/JavaScript publicado en GitHub, sin modificar el diseño visual aprobado (Liquid Glass, barras flotantes, tema nocturno y logo Nexora). La base es un prototipo de GitHub Pages que mantiene parte de sus datos en localStorage.

## Respaldo recuperable
Rama: backup/lotigest-pre-auditoria-fase1-20261111
Archivo respaldado: prueba-diseno-v08.html
Blob SHA anterior verificado: 0a562bd26d55bd8292c0850d3afc61a24d72b6b1
Para recuperar: comparar/extraer ese archivo desde la rama de respaldo y restaurarlo mediante commit. No se efectuó reset ni borrado.

## Fallos confirmados y corregidos
1. **Redondeo de cuotas:** antes, en créditos con muchos meses y capital pequeño, el total de las cuotas podía exceder el capital. Ahora `installmentDueCents` reparte el importe en centavos sin exceder el principal; el último vencimiento ajusta el residuo.
2. **Inconsistencia entre cuotas y recibos:** `schedule`, `receiptAllocation` y `receiptNextDate` usan el mismo reparto monetario.
3. **Solar apartado sin reserva activa:** ahora se rechaza vender un solar en estado `reserved` sin una reserva válida; también se bloquea el estado `available` cuando conserva una reserva activa inconsistente.
4. **Fechas futuras:** se rechazan ventas futuras en el flujo del solar y en la conversión de solicitudes de clientes.
5. **Mora y fecha local:** el calendario de cuotas y el informe de morosidad comparan con `businessToday()`, fijado en America/Tegucigalpa, no con la fecha del huso horario del dispositivo.
6. **Cuotas pagadas mostradas en inventario:** se cuentan contra el calendario real y no con una división aproximada.
7. **Prima con decimales no válidos:** se rechazan fracciones menores al centavo tanto en ventas desde solares como en solicitudes de compra.
8. **Mensajes de cobro:** WhatsApp usa la marca configurada de la empresa en lugar de un nombre comercial antiguo.
Se preservan las protecciones de v0.13 para guardar clientes, terrenos, ventas y pagos, validar pagos y evitar ventas manuales duplicadas.

## Pruebas ejecutadas sobre las funciones extraídas del código GitHub
**30/30 casos de lógica aprobados**. Estos tests ejecutaron funciones reales extraídas del HTML con datos simulados e implementaciones de apoyo; NO son pruebas completas de navegador, de servicios externos ni de integración con base de datos.

**Cálculo de cuotas (6):** capital pequeño a 360 meses, crédito de 48 meses, importes con centavos, crédito de un mes, principal cero, crédito de 240 meses. Todas las sumas de cuotas coinciden exactamente con el principal en centavos.

**Ciclo financiero (8):** total de 36 cuotas, suma del principal, reparto de un recibo parcial, mes asignado al recibo, siguiente vencimiento, aplicación de abonos a las cuotas más antiguas, cómputo de meses en mora y crédito completamente cancelado.

**Apartados y ventas (9):** venta disponible válida, fecha futura rechazada, propiedad privada bloqueada, reserva huérfana bloqueada, apartado ajeno bloqueado, conversión para mismo cliente, venta duplicada bloqueada, prima negativa rechazada y plazo cero rechazado.

**Pagos múltiples (7):** dos solares del mismo cliente admitidos, cliente distinto bloqueado, sobrepago bloqueado, negativo bloqueado, fracción de centavo bloqueada, fecha futura bloqueada y fecha anterior a la venta bloqueada.

## Riesgos no resueltos en Fase 1
- El prototipo usa localStorage; no ofrece transacciones multipuesto, historial de auditoría resistente a manipulaciones ni respaldo de servidor. **No utilizar para operaciones reales sin base de datos central y autenticación**.
- La compra a partir de una solicitud pública involucra aprobación remota y grabación local en pasos separados: puede haber desincronización si falla uno de los pasos. Requiere transacción/idempotencia en backend antes de producción.
- Faltan pruebas end-to-end de navegador para formularios reales, PDF, WhatsApp, OCR, Excel, mapa e interacción de varios usuarios.
- Aún se deben auditar datos importados históricos: saldos iniciales, cuotas irregulares, cobros anulados y registros huérfanos.
- La rama de respaldo protege la versión del repositorio, pero NO respalda automáticamente los datos guardados en el navegador de los usuarios.

## Estado y recomendación
Fase 1 completada como auditoría estática con pruebas de lógica y correcciones puntuales; **no equivale a certificación de producción**. Próximo paso: pruebas interactivas en navegador con datos ficticios y diseño de backend transaccional.
