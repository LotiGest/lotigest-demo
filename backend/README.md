# LOTIGEST · Backend de la Fase 3

Portal y API para operar los registros comerciales en una única base SQLite. Requiere Node.js 24. La aplicación estática de GitHub Pages conserva su almacenamiento local. La API requiere un proceso Node.js con almacenamiento persistente.

## Inicio local

```bash
export LOTIGEST_DB="$PWD/lotigest.sqlite"
node backend/server.mjs user gerente admin
node backend/server.mjs user ventas sales
node backend/server.mjs user caja cashier
node backend/server.mjs
node --test backend/*.test.mjs
```

Cada comando `user` imprime una credencial nueva e invalida la anterior del mismo usuario. El servidor escucha en `127.0.0.1:8787`. Abre http://127.0.0.1:8787 e inicia sesión con la credencial del perfil correspondiente. El portal usa una sesión de ocho horas con cookie HttpOnly y SameSite=Strict. Guarda las credenciales y el archivo SQLite fuera de GitHub. Usa datos ficticios en la instancia local.

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

Para contado envía `months: 0`. Para crédito, los vencimientos se calculan desde el día de la venta, ajustado al último día del mes cuando corresponde. Los centavos sobrantes se distribuyen entre las primeras cuotas. Las ventas y los pagos usan transacciones, y SQLite impide una segunda venta del mismo solar.

Los perfiles autenticados pueden consultar `me`, `lots`, `clients`, `reservations`, `sales`, `sales/<id>` y `receipts/<número>`. El detalle de venta incluye saldo, mora, cuotas y recibos.

## Migración de registros comerciales

Conserva el respaldo original. Prueba primero con una base SQLite vacía y una copia del respaldo. La prevalidación inserta los registros dentro de una transacción, concilia los saldos y revierte los cambios. `--apply` confirma la importación.

```bash
LOTIGEST_DB=/ruta/prueba.sqlite node backend/migrate.mjs /ruta/respaldo.json
LOTIGEST_DB=/ruta/prueba.sqlite node backend/migrate.mjs /ruta/respaldo.json --apply
```

El importador conserva los identificadores de venta, los folios originales de recibos, los abonos históricos y la fecha de primera cuota. Exige estados de solares coherentes y rechaza códigos incompatibles, solares privados o solares sin precio. La migración cubre las tablas comerciales del portal. Croquis, residenciales, contratos, datos de contacto y personalización siguen en el respaldo original.

## Validación pendiente para operación con datos reales

- Incorporar la API al panel completo de LOTIGEST. El portal de prueba usa sus propias pantallas de operación y la página de GitHub Pages sigue operando con su almacenamiento local.
- Conciliar un respaldo representativo de LOTIGEST y verificar los campos que no tienen equivalencia en el portal.
- Configurar un alojamiento Node con almacenamiento persistente, HTTPS y `LOTIGEST_SECURE_COOKIES=1` detrás del proxy. El servicio escucha en loopback y las sesiones están en memoria.
- Probar recuperación y operación comercial en dos navegadores independientes. Las pruebas automatizadas incluidas ejecutan el servidor y dos clientes HTTP.
