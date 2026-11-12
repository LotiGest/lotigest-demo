# LOTIGEST · Backend de la Fase 3

Portal y API para operar los registros comerciales en una única base SQLite. Requiere Node.js 24. La instalación Node sirve la operación central con la barra lateral, la cabecera, el icono y la hoja de estilos del panel aprobado. GitHub Pages sigue sirviendo el modo local. La API requiere almacenamiento persistente.

## Inicio local

```bash
export LOTIGEST_DB="$PWD/lotigest.sqlite"
node backend/server.mjs user gerente admin
node backend/server.mjs user ventas sales
node backend/server.mjs user caja cashier
node backend/server.mjs
node --test backend/*.test.mjs
```

Las pruebas HTTPS requieren OpenSSL. Cada comando `user` imprime una credencial nueva e invalida la anterior del mismo usuario. El servidor escucha en `127.0.0.1:8787`. Abre http://127.0.0.1:8787 e inicia sesión con la credencial del perfil correspondiente. El portal usa una sesión de ocho horas con cookie HttpOnly y SameSite=Strict. Guarda las credenciales y el archivo SQLite fuera de GitHub. Usa datos ficticios en la instancia local.

## API

Todas las rutas llevan el prefijo `/api/v1/`. En cada petición incluye `Authorization: Bearer <credencial>`. Para cada POST envía JSON y una clave `Idempotency-Key` única por operación. Reutiliza la misma clave y los mismos datos si reintentas tras una interrupción. Los importes están en centavos de lempira y las fechas en `AAAA-MM-DD`.

| POST | Campos | Rol adicional a administrador |
| --- | --- | --- |
| `lots` | `id`, `price_cents` | — |
| `clients` | `id`, `name` | Ventas |
| `reservations` | `lot_id`, `client_id`, `reserved_until` | Ventas |
| `cancel-reservation` | `id` del apartado | Ventas |
| `sales` | `lot_id`, `client_id`, `date`, `months`, `down_cents` para crédito, `reservation_id` cuando exista apartado | Ventas |
| `payments` | `sale_id`, `date`, `amount_cents` | Caja |
| `payment-batches` | `date`, `entries` con 2–20 objetos `{ sale_id, amount_cents }` | Caja |

Para contado envía `months: 0`. Para crédito, los vencimientos se calculan desde el día de la venta, ajustado al último día del mes cuando corresponde. Los centavos sobrantes se distribuyen entre las primeras cuotas. Las ventas y los pagos usan transacciones, y SQLite impide una segunda venta del mismo solar.

Los perfiles autenticados pueden consultar `me`, `lots`, `clients`, `reservations`, `sales`, `sales/<id>` y `receipts/<número>`. El detalle de venta incluye saldo, mora, cuotas y recibos.

El cobro múltiple se guarda en una transacción y emite un recibo agrupado. `receipt-details/<número>` muestra el saldo que quedó al emitir el recibo. `catalog` devuelve una lectura coherente del inventario comercial. `command-status/<clave>` informa si el usuario autenticado ya registró una operación cuya confirmación se perdió.

## Respaldo de la base central

```bash
LOTIGEST_DB=/ruta/lotigest.sqlite node backend/backup.mjs /ruta/privada/copia-nueva.sqlite
```

El comando permite respaldar una base activa. Comprueba integridad y referencias antes de publicar la copia en la ruta solicitada y rechaza destinos existentes. Para verificar una restauración, abre una copia en una instancia de prueba con otro puerto y comprueba los saldos antes de reemplazar una base operativa.

## Migración de registros comerciales

Conserva el respaldo original. Prueba primero con una base SQLite vacía y una copia del respaldo. La prevalidación inserta los registros dentro de una transacción, concilia los saldos y revierte los cambios. `--apply` confirma la importación.

```bash
LOTIGEST_DB=/ruta/prueba.sqlite node backend/migrate.mjs /ruta/respaldo.json
LOTIGEST_DB=/ruta/prueba.sqlite node backend/migrate.mjs /ruta/respaldo.json --apply
```

El importador conserva los identificadores de venta, los folios originales de recibos, los abonos históricos y la fecha de primera cuota. Exige estados de solares coherentes y rechaza códigos incompatibles, solares privados o solares sin precio. La migración cubre las tablas comerciales del portal. Croquis, residenciales, contratos, datos de contacto y personalización siguen en el respaldo original.

## HTTPS y dos equipos

Si usas un proxy HTTPS, deja el proceso en loopback y activa `LOTIGEST_SECURE_COOKIES=1`. También puedes servir TLS directamente con un certificado válido para el nombre usado por los equipos:

```bash
LOTIGEST_DB=/ruta/lotigest.sqlite LOTIGEST_HOST=0.0.0.0 LOTIGEST_PORT=8443 \
LOTIGEST_TLS_CERT=/ruta/certificado.pem LOTIGEST_TLS_KEY=/ruta/llave.pem \
node backend/server.mjs
```

El servidor exige TLS para escuchar fuera de loopback. Los perfiles usan sesiones independientes, mantenidas en memoria. Las pruebas automatizadas usan dos sesiones HTTPS, un certificado de prueba y una base desechable. También concilian un respaldo ficticio de 120 solares, 60 ventas y 15 apartados.

Antes de activar el uso real, configura el servidor persistente, verifica el panel en dos navegadores y concilia una copia representativa del respaldo operativo. El modo central cubre la operación comercial. Croquis, OCR, personalización y otros módulos locales requieren una migración aparte.

## Puesta en marcha en Linux

El servicio de ejemplo `backend/deploy/lotigest.service` usa una cuenta de sistema
`lotigest`, el checkout en `/opt/lotigest`, Node.js 24 en el PATH del servicio y
una base privada en `/var/lib/lotigest`. Coloca un proxy HTTPS delante del
servicio y dirige sus solicitudes a `127.0.0.1:8787`. GitHub Pages puede seguir
sirviendo la versión local por separado.

1. Ejecuta `node --test backend/*.test.mjs` en el checkout que vas a instalar.
2. Concilia una copia del respaldo local con
   `node backend/readiness.mjs backup /ruta/privada/respaldo.json`. El comando usa
   una base temporal en memoria e informa conteos y montos exactos en centavos.
3. Instala la unidad y crea las cuentas de acceso con el comando `user` descrito
   arriba. Ejecuta las tareas de base como el usuario del servicio y usa la ruta
   configurada en la unidad. Guarda la credencial de cada perfil fuera del repositorio.
4. Valida la instalación con
   `node backend/readiness.mjs server https://tu-dominio`. Define
   `LOTIGEST_READER_TOKEN` en el entorno con una credencial de consulta. El
   comando comprueba la interfaz, los recursos estáticos y el acceso al catálogo
   sin registrar movimientos.
5. En una instalación de pruebas y con dos navegadores, inicia sesión con
   perfiles distintos. Registra un apartado desde uno, conviértelo en venta
   y confirma que Caja ve la venta tras actualizar. Registra un pago de prueba
   y verifica el saldo y el recibo desde el otro. Prueba claro y oscuro.
6. Importa el respaldo operativo a una base vacía después de conciliar los
   conteos y saldos. Conserva la copia original y toma un respaldo SQLite
   verificado antes de habilitar la operación. Las pruebas de escritura se
   realizan con datos ficticios.

## Importación de clientes desde Excel

En **Clientes**, Ventas y Administración pueden cargar una hoja `.xlsx` o
`.csv` de hasta 100 filas. Usa la plantilla descargable o encabezados compatibles.
La vista previa muestra el destino de cada campo y advierte qué columnas se
omitirán. Nombre y Código o Identidad son obligatorios. Formatea Identidad y
Teléfono como texto en Excel para preservar los ceros iniciales.
El lote se guarda en una transacción. Si el código o la identidad ya existen,
se rechaza el lote completo. La importación cubre la ficha de cliente.
Solar, modalidad, cuotas, pagos y saldos históricos requieren su propio proceso
de importación y conciliación.

## Cobertura de verificación comercial

| Área | Evidencia disponible | Pendiente |
| --- | --- | --- |
| Acceso, roles y panel central | Dos sesiones HTTPS y permisos por API | Navegación visual y temas claro/oscuro |
| Terrenos, apartados y ventas | Alta, conversión de apartado y concurrencia | Recorrido completo en navegador |
| Cuotas, mora, caja y recibos | Cálculo, abono, cobro agrupado, reintento y saldo histórico | Impresión carta y envío de recibos |
| Clientes y Excel | Mapeo, duplicados, permisos y transacción | Probar archivos reales anonimizados y selección de hoja en navegador |
| Respaldo y migración | Copia de SQLite activa, restauración de prueba y conciliación ficticia | Conciliar un respaldo operativo |
| Residenciales, mapas y croquis | Implementación en el HTML local | Integración central y pruebas funcionales |
| Contratos y OCR | Implementación en el HTML local | Integración central y pruebas con documentos ficticios |
| Finanzas, reportes y configuración | Implementación en el HTML local | Integración central y pruebas funcionales |

## Migrar una cartera completa desde Excel

Esta herramienta de instalación importa ventas históricas y fichas de clientes
en una base central vacía. Exporta la hoja como CSV UTF-8 separado por punto y
coma. Usa una fila por venta y estos encabezados:

```text
cliente;nombre;identidad;direccion;telefono;solar;venta;modalidad;fecha_venta;primera_cuota;precio;prima;plazo_meses;pagado_acumulado;saldo
```

Usa fechas AAAA-MM-DD, importes con punto decimal, y texto para identidades,
teléfonos y códigos. Modalidad admite contado o crédito. El pagado acumulado
incluye la prima. Para contado, usa prima y pagado iguales al precio, plazo
cero y saldo cero. Para crédito, indica el plazo y, si existe, la fecha
de primera cuota. Una persona con varios solares usa el mismo código de cliente
y los mismos datos de contacto.

```bash
node backend/portfolio-import.mjs /ruta/privada/cartera.csv
LOTIGEST_DB=/ruta/privada/base-vacia.sqlite node backend/portfolio-import.mjs /ruta/privada/cartera.csv --apply
```

El primer comando valida y revierte la importación en memoria. El segundo
confirma una transacción si la cartera concilia y la base está vacía.
El importe histórico se conserva como acumulado inicial. Para conservar
cada pago antiguo y su folio se requiere el historial desglosado y el proceso
de migración JSON. La pantalla de importación de clientes sigue destinada a
fichas de contacto. Prueba la cartera en una copia antes del corte operativo.
