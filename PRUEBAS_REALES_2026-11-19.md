# LOTIGEST — Pruebas reales y limpieza de abonos

Fecha: 19 de noviembre de 2026. Código probado: 0.22.29; corrección de identidad de cuenta: 0.22.30.

## Limpieza solicitada en el sistema real

Se eliminaron 542 abonos históricos y su lote de importación. Se conservaron 64 clientes, 417 solares, 53 fichas históricas y la residencial. Las referencias de pagos de las fichas quedaron vacías. Ventas y pagos de ventas ya estaban vacíos. No se sustituyeron medidas, precios ni propietarios.

Respaldo completo previo: `LOTIGEST_antes_de_borrar_abonos_2026-11-19.json`, SHA-256 `663c0484c2735e51261558d2b524039d3a7ff633a4e6769cd6932d05a9890231`. También quedó una instantánea de recuperación en el historial del servidor. Revisión posterior 47. Comparación de clientes, solares y residencial contra el respaldo: cero filas alteradas.

## Pruebas reales en Chrome

Se usó una base independiente con usuarios y datos ficticios. No se incorporaron movimientos de prueba a la base real. Los perfiles administrador y vendedor entraron mediante sesiones de prueba; no se probó la escritura manual de contraseñas en la pantalla de acceso.

| Recorrido | Resultado observado |
| --- | --- |
| Abrir los 19 paneles de administrador | Abrieron sin error visible; esto no verifica cada función interna |
| Crear cliente con identidad, dirección y teléfono | Persistió tras recargar |
| Crear solar y calcular 10 × 20 metros | Área 200 m², precio L 100,000 |
| Venta a crédito: prima L 10,000, 12 meses | Saldo L 90,000 y cuota L 7,500 |
| Abono L 5,000 menor que cuota | Rechazado, sin crear pago |
| Abono exacto L 7,500 por transferencia | Guardado; saldo L 82,500 y 11 cuotas pendientes |
| Recibo | Vista con período y saldos correctos; descarga PDF carta completada |
| Ficha PDF desde cliente existente | Descarga real completada; PDF de una página contiene nombre, DNI, dirección y solar ficticios |
| Finanzas | Prima + abono = ingresos L 17,500 |
| Vendedor | Solo catálogo y consulta de cuenta propia; sin altas de clientes ni cobros; cero mutaciones del vendedor en servidor |
| Sesión vencida | Recarga regresó al acceso y retiró el catálogo privado |
| Fallo temporal HTTP 503 y recuperación | Gasto L 1,000 quedó pendiente; al recuperar servicio se guardó una sola vez y persistió tras recargar; utilidad L 16,500 |

El fallo simulado del servidor no equivale a una prueba física de desconexión de internet del teléfono.

## Corrección encontrada

El encabezado decía Administrador para el perfil vendedor. Ahora muestra el nombre y perfil real. Compilación y 10 pruebas dirigidas: aprobadas.

## Límites y pendientes

La carga de una imagen sintética por el selector del navegador de pruebas quedó bloqueada por la herramienta; se interrumpió y reinició el navegador. No se certifica OCR real ni el registro de una ficha de tres solares mediante fotografía en esta sesión. No se verificaron cámara del teléfono, WhatsApp, impresión física, todos los flujos de Excel ni QR contra producción. El QR de un recibo del entorno QA apunta al origen de producción y por ello no demuestra su verificación en QA.

La suite automatizada general terminó con 171 pruebas: 153 aprobadas y 18 fallidas. Los 18 fallos ya estaban documentados en la versión anterior; varios usan controles antiguos o montajes parciales de funciones. No se consideran resueltos ni se certifica el sistema completo libre de errores. Deben revisarse por separado para distinguir pruebas desactualizadas de defectos del producto.

### Pruebas generales fallidas

- Etapa no se infiere: aparece selector con Etapa 1 y Etapa 2
- Tras elegir Etapa 1 solo selecciona el solar G16 de la primera etapa
- Tras elegir Etapa 2 solo selecciona G16 de la segunda etapa
- plantillas y exportaciones descargan XLSX válido con enlace persistente incluso sin pagos
- mapa PDF y contratos usan la misma ventana y exigen vínculo del cliente
- Excel real: vista previa, comprador existente con varios solares, aviso sin croquis, exportación y recuperación de D1
- Excel de pagos identifica etapa, bloque y números de solares, agrupa al cliente y exporta el monto conjunto una vez
- al tocar solar disponible, prima editable inmediatamente recalcula 84 cuotas y no crea abonos
- prima del mapa pasa a la venta sin duplicar controles; propuesta sin guardar bloquea venta
- mapa móvil: no mantiene ancho mínimo fijo y los botones siguen funcionando
- pellizcar: distancia doble amplía al 200% y desplaza el plano sin cambiar solares
- deslizar con un dedo deja funcionar el scroll táctil nativo y no abre el solar
- el gesto de zoom también mantiene las teclas y ratón en el escritorio
- calendario histórico permite ver y seleccionar meses de 2024 aunque no existan cuotas contratadas
- recorrido cliente, terreno, venta crédito, abono, recibo histórico y finanzas se recupera al reabrir
- contratos conserva el texto revisado sin fotos y muestra nombres como texto seguro
- el panel de cobros importa el formato de ocho columnas, conserva historial y permite completar condiciones reales
- el vendedor ve el catálogo y la ficha sin poder abrir altas ni cobros

No se debe repetir la limpieza después de que se ingresen nuevos abonos manuales. Una copia local antigua debe resolver el conflicto usando los datos actuales del servidor, sin sobrescribirlos.
