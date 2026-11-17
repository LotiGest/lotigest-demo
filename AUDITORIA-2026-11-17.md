# Revisión de LOTIGEST — 17 de noviembre de 2026

Versión revisada: **0.18.0**. Repositorio oficial: `LotiGest/lotigest-demo`, rama `main`. Único programa publicado: https://lotigest-demo.pages.dev/.

## Resultado y alcance

Se revisaron el código del panel original, su adaptación a Cloudflare, el guardado de registros y documentos, la cola local, las sesiones, las validaciones financieras y los recorridos de los formularios. La revisión no constituye una certificación de que todas las funciones comerciales estén terminadas ni una prueba de penetración externa.

Se ejecutaron **42 pruebas automatizadas**: 25 del backend Node/SQLite, 6 de los handlers de D1, 10 del DOM del panel original y 1 del service worker. Todas pasan. El backend Node y el panel Cloudflare son implementaciones distintas: las pruebas del primero no se presentan como prueba de que sus funciones estén publicadas en Pages.

La auditoría de dependencias de desarrollo mediante `npm audit` informó **0 vulnerabilidades conocidas**. No se incluyeron contraseñas, claves, identidades ni archivos de clientes en los cambios de GitHub.

## Correcciones realizadas

- **Conflicto de datos:** “Usar datos del servidor” ahora descarta explícitamente la cola seleccionada después de descargar la copia, en vez de reenviar el conflicto indefinidamente.
- **Validaciones del servidor:** rechaza dos ventas del mismo terreno, identidades duplicadas, abonos que superen el precio, importes con más de dos decimales, fechas imposibles, pagos anteriores a la venta y apartados incompatibles. Los fallos no cambian la revisión guardada.
- **Recuperación:** una copia local dañada queda intacta hasta que se descarga y el usuario elige recuperar el servidor. Si otra pestaña reemplaza una cola pendiente, se conserva una copia adicional accesible desde Respaldo.
- **Almacenamiento local:** la copia confirmada no se serializa repetida tres veces. Los errores de espacio se muestran y no se afirman como guardado en D1.
- **Conexión:** las solicitudes tienen un tiempo máximo. Se reintenta automáticamente, se revisa la revisión del servidor con una consulta ligera y se actualiza la pantalla cuando no hay cambios locales ni un formulario abierto.
- **Inicio de sesión:** se limitan los intentos por origen de red. La sesión del servidor sigue en una cookie Secure, HttpOnly y SameSite=Strict. Se añaden cabeceras contra la inserción de la aplicación en marcos externos.
- **Aprendizaje:** se incluye Guía de uso y se eliminan mensajes de Configuración que aún afirmaban que el sistema era temporal.
- **Notificaciones:** desaparece la barra de ancho completo. Hay una notificación con botón de cierre, cierre automático para confirmaciones y un indicador pequeño que permite volver a consultar el estado.

## Trabajo sin conexión

El service worker descarga el inicio y los recursos básicos. Después de abrir e iniciar sesión con internet una vez, el equipo conserva una copia de los registros y un verificador de contraseña para desbloquearla sin red. No se guarda la contraseña ni la credencial del servidor en el perfil offline. El acceso sin conexión exige renovar el inicio con internet cada siete días.

Las operaciones se conservan localmente hasta la confirmación de D1. Volver a abrir la copia sin red exige la contraseña. Al recuperar la conexión, la aplicación intenta reenviar los cambios automáticamente y puede renovar la sesión utilizando la credencial mantenida en memoria durante ese inicio. Si la contraseña fue cambiada o la autorización ya no es válida, se solicita autenticación.

Los PDF se conservan en IndexedDB y se envían antes de confirmar el estado que los referencia. Los PDF descargados también se conservan para consultar en el equipo sin red. El service worker **no almacena respuestas de la API**. Las fotos del OCR no se archivan; los contratos guardan únicamente el texto revisado.

No se fusionan automáticamente dos cobros o dos ventas en conflicto. Se bloquea la sobrescritura y se ofrecen las copias para revisión. El cierre de sesión sin red bloquea la interfaz y conserva las operaciones pendientes.

La primera descarga, WhatsApp y los servicios externos requieren internet. El OCR y las capas de fondo de mapas necesitan haberse descargado previamente; los recursos externos se conservan con un límite de entradas, por lo que no se promete acceso indefinido a cualquier mapa u OCR externo. La aplicación no puede recuperar datos locales si se borra el almacenamiento del navegador, se utiliza otro perfil o se pierde el equipo antes de sincronizar.

La copia offline es almacenamiento local del navegador y no está cifrada como un archivo independiente. Debe utilizarse en un equipo de confianza con su cuenta de sistema protegida. El JSON exportado no incluye el contenido binario de los PDF; esos documentos requieren su propia copia o una restauración completa de D1.

## Evidencia por recorrido

| Área | Comprobación | Resultado |
|---|---|---|
| Paneles | Apertura de las páginas originales y guía, sin excepciones del DOM | Aprobado |
| Clientes y terrenos | Altas por los formularios, validación de referencias y reapertura | Aprobado |
| Apartados | Cliente existente, apartado, conversión a venta y bloqueo de otra compra | Aprobado |
| Ventas y abonos | Crédito, prima, abono, rechazo de exceso y segundo abono | Aprobado |
| Recibos | Instantánea del recibo anterior permanece después de nuevos pagos | Aprobado |
| Finanzas | Gasto registrado y recuperado | Aprobado |
| Contratos | Texto revisado, reapertura y ausencia de fotos archivadas | Aprobado |
| OCR | Extracción de campos y ambigüedades en los tests del parser | Aprobado; cámara y motor externo pendientes de prueba física |
| PDF | Guardado, lectura íntegra, clave inmutable y subida de cola offline | Aprobado |
| Concurrencia | Reintento sin duplicación, rechazo de revisión vieja y resolución del conflicto | Aprobado |
| Recuperación | Corte de red, reapertura, contraseña offline, envío automático y copia dañada | Aprobado |
| Service worker | Descarga del inicio, respuesta sin red y exclusión de la API de la caché | Aprobado en prueba aislada |
| Seguridad | Sesiones, roles denegados, origen, límites, contraseña, referencias y texto escapado | Aprobado en los escenarios probados |
| Escala | 2,000 clientes y registros de prueba; conciliación de 2,000 ventas en Node/SQLite | Aprobado localmente; no equivale a una prueba de carga de producción |

## Pendientes que impiden declarar el programa completo para venta

1. Terminar los permisos y la interfaz del usuario de ventas en el panel integrado; actualmente requiere administrador.
2. Integrar y probar los avisos automáticos de WhatsApp con el proveedor, las plantillas y la programación reales. Compartir recibos manualmente es otro flujo.
3. Terminar o mantener claramente deshabilitado el mapa público y sus solicitudes.
4. Hacer una aceptación física en computadora y teléfono: apertura instalada sin red, fotografías de recibos reales anonimizados, OCR, impresión/PDF, modo oscuro y GPS. Las pruebas del DOM no verifican diseño, cámara ni impresora.
5. Probar la restauración operativa completa de registros y PDF y establecer la política de respaldo y conservación.
6. Medir el tamaño de la cartera real y la carga con el plan de Cloudflare contratado. El estado admite 4 MiB por solicitud y cada PDF 8 MiB. Las importaciones excesivas se rechazan sin modificar el servidor.

## Reproducir las comprobaciones

```sh
npm ci
npm run build
npm test
npm audit
```

La migración aditiva `deploy/cloudflare/migrations/0004_login_limits.sql` se aplica sobre la base existente antes de publicar esta versión. No borra tablas ni registros.
