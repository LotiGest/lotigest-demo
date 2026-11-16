# Publicar la demo de LOTIGEST en Cloudflare Pages

Esta rama genera una demo con datos ficticios guardados en el navegador.
El artefacto incluye solo el panel, el lector de campos de recibos, el
manifiesto de versión y la configuración estática de Pages. El OCR
descarga su motor y el idioma desde los mismos servicios externos utilizados
en la demo anterior y procesa las imágenes en el navegador.

## Configuración de Cloudflare Pages

- Repositorio: `LotiGest/lotigest-demo`
- Rama: `cloudflare/lotigest-demo-ready`
- Directorio raíz: raíz del repositorio
- Preset: ninguno
- Comando de compilación: `node deploy/cloudflare/build.mjs`
- Directorio de salida: `cloudflare-pages`

También puedes ejecutar el comando en un checkout limpio y subir la carpeta
generada mediante Direct Upload. Usa un proyecto de prueba. Antes de compartir
la URL, prueba en computadora y teléfono: entrada, tema oscuro, cierre de
ventanas, apartado, venta, abono normal, escaneo OCR e impresión del recibo.
Usa un recibo ficticio para las pruebas. El mapa interno sigue accesible. La
publicación del mapa a clientes requiere una API y se desactiva en esta demo.

## Backend operativo pendiente

El backend Node/SQLite no forma parte del artefacto estático. Para operar en
Workers hace falta adaptar su API, sesiones y persistencia, y validar cobros,
anulaciones, permisos, restauración y avisos programados con una base aislada
de prueba. No se requiere una base de datos de producción para esa etapa.

Los recibos nuevos del backend Node registran el saldo vigente al emitirse.
Los recibos antiguos conservan el cálculo anterior, porque no existe una
instantánea histórica para ellos. Verifica la migración y la secuencia de
abono, anulación, nuevo abono y reimpresión con SQLite antes de operar.
