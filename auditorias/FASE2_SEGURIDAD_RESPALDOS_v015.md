# LOTIGEST — Fase 2: seguridad de datos y respaldos (v0.15)
Fecha de revisión: 11 de noviembre de 2026
Repositorio: LotiGest/lotigest-demo
Página de pruebas: https://lotigest.github.io/lotigest-demo/prueba-diseno-v08.html

## Respaldo del código
Rama recuperable: `backup/lotigest-pre-fase2-seguridad-20261111`.
Se creó antes de editar la v0.14. No se cambió la interfaz Liquid Glass, las barras flotantes ni el tema oscuro.

## Correcciones publicadas
1. **Importación JSON:** validación previa de estructura, versión, IDs duplicados, referencias venta-cliente-terreno y pago-venta, importes, plazos y apartados activos. Impide importar registros inconsistentes detectables.
2. **Prevención de sobrescritura accidental:** antes de una restauración confirmada, el navegador intenta descargar un respaldo JSON de los datos actuales.
3. **Persistencia de restauración:** primero escribe el JSON validado en `localStorage`; solo después actualiza la variable `db`, la pantalla y el mensaje de éxito. Si falla el almacenamiento, informa el error y mantiene la sesión de datos previa.
4. **Reinicio seguro del demo:** genera una descarga preventiva, guarda el conjunto nuevo antes de sustituir los datos visibles y comunica un error sin presentar falso éxito si falla el almacenamiento.
5. **Archivo JSON con BOM:** admite la marca inicial UTF-8 en archivos exportados.
6. **Advertencia de privacidad:** explica que los JSON pueden contener datos personales y no deben subirse a repositorios públicos ni compartirse sin protección.
7. **Límite preventivo:** importación de un único JSON con tamaño máximo 15 MB y límites estructurales para evitar bloqueos accidentales.

## Pruebas ejecutadas
**13/13 casos positivos y negativos del validador superados**: respaldo válido, versión incompatible, ID de solar repetido, venta duplicada, pago sin venta, sobrepago, importe negativo, importe subcentavo, cliente ausente, plazo inválido, apartado huérfano, apartado activo de solar vendido y apartado válido en solar sin venta.

**8/8 scripts inline** pasan la comprobación sintáctica con el código extraído de GitHub.

Estas pruebas son unitarias/sintácticas de código. **No son una validación end-to-end del navegador, ni comprueban persistencia simultánea en varios dispositivos.**

## Riesgos abiertos / prioridades altas
1. **Autenticación de demostración:** el login `admin/admin123` y el módulo de usuarios no son seguridad real, por tanto no introducir información confidencial.
2. **Base de datos y transacciones:** `localStorage` es local al navegador; no hay sincronización, servidor central, control concurrente de ventas, roles reales ni bitácora inmutable.
3. **Compra desde enlace público:** el estado remoto de solicitudes y el registro local de ventas se actualizan en pasos separados, y puede haber desincronización. Requiere transacción/idempotencia en backend.
4. **Copia en la nube:** descargar un JSON no es una copia automática de servidor; archivos y PDFs adicionales pueden necesitar respaldo independiente.
5. **Inicio con datos incompatibles:** la carga actual del prototipo vuelve a datos demostrativos ante errores de almacenamiento o formato. Conviene construir una pantalla de recuperación bloqueante antes de la puesta en producción, para impedir que datos anteriores queden ocultos o sobrescritos.
6. **Compatibilidad de backups antiguos:** se debe probar con archivos reales de versiones anteriores antes de usar importaciones reales.
7. **Restauración por descarga:** la descarga se inicia en el navegador, pero no es posible garantizar desde el código que el usuario conservó realmente el archivo; comprobar manualmente el respaldo.
8. **Datos sensibles:** los JSON de prueba no se guardaron en GitHub. La rama de respaldo cubre solo el código fuente, no la información que reside en cada navegador.

## Ruta de producción propuesta (sin Vercel)
- Backend autenticado con roles reales (por ejemplo Cloudflare Workers + base de datos adecuada) y migración controlada desde prototipo.
- Registros transaccionales/idempotentes para apartados, ventas, cuotas, pagos y asignación de recibos.
- Auditoría y respaldos automáticos cifrados, probando periódicamente la restauración.
- Pruebas end-to-end de los módulos y flujo multiusuario con datos ficticios.
No crear ni publicar backend sin definición de infraestructura y políticas de acceso.

## Estado
**Fase 2 parcialmente implementada**: protección de respaldos locales y validaciones publicadas. **Seguridad de producción pendiente de backend**, autenticación y pruebas de integración.
