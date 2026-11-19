# LOTIGEST: publicación oficial

- Repositorio: https://github.com/LotiGest/lotigest-demo
- Programa: https://lotigest-demo.pages.dev/
- Cloudflare Pages: `lotigest-demo`, rama de producción `main`.
- Compilación: `node deploy/cloudflare/build.mjs`, salida `cloudflare-pages`.
- Binding: `LOTIGEST_DB`, base existente `lotigest-pruebas`.
- El antiguo Sites está archivado y restringido al propietario.

## Persistencia del panel original

El artefacto conecta los formularios originales a `/api/app/state`. Conserva todos los campos JSON del programa, con registros separados por colección, elemento y fragmento cuando un valor es grande. Guarda solamente los registros modificados. Una revisión global impide sobrescribir una edición concurrente; los lotes de escritura son transacciones D1. Cada solicitud tiene un identificador para que un reintento no duplique la operación. Los valores anteriores de registros editados o eliminados quedan en `app_history`.

El aviso inferior distingue pendiente, guardando, guardado confirmado y error. La copia pendiente local se conserva hasta recibir confirmación del servidor. Se reintenta al recuperar conexión o pulsar Reintentar. Un conflicto bloquea nuevas modificaciones; se ofrece descargar la copia pendiente y cargar el estado actual de D1. No fusiona cobros concurrentes automáticamente. El almacenamiento local no sustituye al servidor y no garantiza trabajo offline si nunca se cargó la aplicación en ese equipo.

El estado admite hasta 4 MiB por solicitud y rechaza modificaciones demasiado grandes sin alterar D1. Las fotografías usadas por el OCR no se archivan. Los planos PDF se guardan separadamente en D1, hasta 8 MiB por documento. Los PDF retirados se archivan conservando el contenido para evitar romper referencias de una revisión anterior.

Las rutas antiguas de clientes y operaciones redirigen al programa principal. Sus tablas anteriores se conservan; no hay migración automática entre los esquemas. Al activar este despliegue, esas tablas estaban vacías. Los datos anteriores del navegador se conservan en su clave original: al iniciar el servidor vacío se ofrece descargarlos. La importación se realiza explícitamente desde Respaldo, previa revisión y validación. No se importan datos ficticios automáticamente. El inventario base del plano integrado se conserva.

## Autenticación

El acceso admin/admin123 de demostración está desactivado en el artefacto de Pages. Se requiere una cuenta provisionada en D1, con sal y credencial derivada PBKDF2. El servidor crea una sesión de 12 horas en cookie Secure, HttpOnly, SameSite=Strict. El panel integrado se restringe a administradores; la integración de permisos específicos para vendedores sigue pendiente y no debe habilitarse mediante controles visuales únicamente. La contraseña puede cambiarse desde Usuarios; el cambio revoca las demás sesiones.

## Instalación y pruebas

Aplicar `deploy/cloudflare/migrations/0003_app_persistence.sql` en la base existente antes del despliegue. No reiniciar ni sustituir la base. La migración solamente agrega tablas.

- `node --test deploy/cloudflare/app.test.mjs`
- `node --test backend/payment-fields.test.mjs backend/backup.test.mjs`
- `node deploy/cloudflare/build.mjs`

Las pruebas verifican 2,000 clientes y datos de todos los módulos, relectura completa, cambios incrementales, reintentos, conflictos, rollback por fallo SQL, sesiones, restricciones de rol y origen, límites, contraseña y PDF. También se verificó el DOM del panel original con inicio de sesión, alta de cliente, reapertura y recuperación de cambios sin red. Esas comprobaciones locales no sustituyen las comprobaciones del despliegue real.

El mapa público, avisos WhatsApp y evaluación completa para venta requieren validación independiente. Este cambio conecta el almacenamiento del panel y no certifica todo el programa para comercialización.


## Actualización 0.18.1: desconexiones y aprendizaje

Consulta `AUDITORIA-2026-11-17.md` para los resultados y límites de la revisión. La aplicación incorpora service worker, manifest y cola local de PDF. Abre el programa e inicia sesión con internet en cada equipo antes de necesitarlo sin red. En Guía de uso se muestra si el arranque sin conexión está preparado. El acceso offline se renueva con un inicio online cada siete días.

La notificación de sincronización se puede cerrar. El indicador pequeño permite consultarla de nuevo. Se reintenta el envío automáticamente y se comprueba la revisión del servidor sin cambiar un formulario que esté abierto. Los conflictos financieros requieren revisión; no se sobrescriben ni se fusionan automáticamente.

Aplicar también `deploy/cloudflare/migrations/0004_login_limits.sql` antes de desplegar. Desarrollo reproducible: `npm ci`, `npm run build`, `npm test`. El service worker se actualiza cuando no hay cambios pendientes ni un modal abierto.

## Mapa público de solares y enlace WhatsApp (candidato 0.22.14)

El botón **Compartir mapa con clientes** está en Mapa de solares. Una cuenta administradora publica el croquis actual; LOTIGEST devuelve un enlace de `/seleccionar-solar.html?map=...` alojado en el mismo dominio de Cloudflare Pages. El modal permite copiarlo o abrir WhatsApp con un mensaje de invitación. Al volver a publicar una residencial conserva el enlace.

El enlace público muestra únicamente ubicación de solares en el dibujo, etapa, bloque, número, medidas registradas y disponibilidad. Los solares disponibles se pintan amarillos, comprados verdes y apartados no disponibles grises. Los datos se consultan del inventario actual cada vez; no se exponen precios, identidad, teléfono ni movimientos de clientes. La página pública recibe una solicitud con nombre, WhatsApp, solar elegido, modalidad, prima propuesta y fecha. No recibe dinero ni aparta ningún lote. La petición aparece en **Pendientes** del administrador, que debe validar precio y contrato y confirmar manualmente el apartado/cotización/venta.

**Requisito antes de publicar**: respaldar D1 y aplicar la migración aditiva `deploy/cloudflare/migrations/0006_public_lot_maps.sql` en el binding `LOTIGEST_DB` de `lotigest-pruebas`. No borra pagos ni altera contratos. En el entorno local de pruebas, la migración se añade a `test-d1.mjs`. Después ejecutar `npm ci && npm run build && npm test`, comprobar tanto el enlace en navegador incógnito como las solicitudes en el panel privado, y probar desde Android y Windows.

Estas funciones se prepararon en `feature/pdf-prices-84-20261118` y no deben confundirse con la versión publicada hasta que se combine la rama, se aplique la migración y se despliegue. Abrir WhatsApp prepara el texto del enlace; no envía mensajes automáticamente ni requiere la API de WhatsApp Business.
