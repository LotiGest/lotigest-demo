# LOTIGEST: publicación oficial

- Código oficial: https://github.com/LotiGest/lotigest-demo
- Programa publicado: https://lotigest-demo.pages.dev/
- Único proyecto de Cloudflare Pages: `lotigest-demo`.
- Rama de producción: `main`.
- Publicación automática de producción activada. Publicaciones de vista previa desactivadas.
- El sitio anterior de Sites quedó archivado y con acceso restringido al propietario. No es el programa oficial.

## Compilación

- Directorio raíz: raíz del repositorio.
- Preset: ninguno.
- Comando: `node deploy/cloudflare/build.mjs`.
- Directorio de salida: `cloudflare-pages`.
- Las funciones HTTP se encuentran en `functions/`.
- Binding de producción: `LOTIGEST_DB`, base existente `lotigest-pruebas`.

Continuar las actualizaciones en este repositorio y publicar en este mismo proyecto. No crear otro sitio, proyecto Pages o base para sustituirlos. No borrar información para cambiar la rama de publicación.

## Estado real de la integración

El panel principal conserva el diseño completo y utiliza almacenamiento local del navegador. Los paneles `/clientes-nube` y `/operaciones-nube` utilizan las APIs de D1 del mismo despliegue; todavía tienen flujos separados. Unificar el repositorio y la publicación no convierte automáticamente el almacenamiento del panel principal en D1.

La integración pendiente debe conectar los formularios originales, sus consultas, roles y sesiones a la persistencia del servidor; incluir migración revisable de datos locales, concurrencia, recuperación y pruebas del recorrido completo. No presentar el panel local como un sistema conectado íntegramente a D1 ni eliminar los paneles actuales antes de sustituir su funcionalidad.

El OCR procesa imágenes en el navegador y descarga recursos externos. La publicación del mapa a clientes sigue desactivada en esta compilación. El backend Node/SQLite no se ejecuta en Pages; las rutas D1 son funciones independientes.

Antes de operar con clientes reales, validar autenticación, permisos, ventas, apartados, cuotas, abonos, recibos, anulaciones y restauración en el panel integrado. Los datos existentes de D1 y del navegador deben conservarse durante esa transición.
