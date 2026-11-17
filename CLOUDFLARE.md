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
