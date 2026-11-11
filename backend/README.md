# LOTIGEST · Backend de la Fase 3

API local de referencia para operar los registros comerciales en una única base SQLite. Requiere Node.js 24. La aplicación estática de GitHub Pages conserva su almacenamiento local. La API requiere un proceso Node.js con almacenamiento persistente.

## Inicio local

```bash
export LOTIGEST_DB="$PWD/lotigest.sqlite"
node backend/server.mjs user gerente admin
node backend/server.mjs user ventas sales
node backend/server.mjs user caja cashier
node backend/server.mjs
node --test backend/server.test.mjs
```

Cada comando `user` imprime una credencial nueva e invalida la anterior del mismo usuario. El servidor escucha en `127.0.0.1:8787`. Guarda las credenciales y el archivo SQLite fuera de GitHub. Usa datos ficticios en la instancia local.

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

## Trabajo pendiente para uso operativo

- Integrar la interfaz aprobada con una sesión de usuario y con los endpoints.
- Completar el modelo de residenciales, catálogos, recibos PDF y fechas históricas para migrar la base local de LOTIGEST con conciliación de saldos.
- Configurar alojamiento con HTTPS, alta y baja de usuarios, copias de seguridad del servidor y pruebas con dos equipos. GitHub Pages puede alojar la interfaz estática.
- Ejecutar en navegador la recuperación de la Fase 2 y el flujo integrado de la Fase 3 antes de habilitar datos reales.
