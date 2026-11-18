# Importación de historial y plano oficial

En **Residenciales, solares y cobros → Importar Excel** se acepta CLIENTE, BLOQUE, SOLAR, FECHA DE PAGO, MONTO (L), TIPO DE PAGO, ESTADO e ID CONTRATO. El sistema identifica la hoja de movimientos; los totales de otras hojas no son nuevos pagos. La vista previa explica las observaciones antes de confirmar.

Las primas, abonos y pagos se guardan en el historial con la fila de origen. Reimportar el mismo movimiento no lo duplica. Las coincidencias de nombre no acreditan identidad; las referencias ambiguas, fechas inválidas y posibles duplicados requieren revisión. No se inventan precios, saldos ni mora a partir de pagos históricos.

En **Revisar contrato** confirma cliente, solar exacto (la numeración puede repetirse por etapa), precio pactado, prima, plazo y fechas reales. Solo entonces se crean la venta y los abonos operativos. Los movimientos históricos no se suman como ingresos nuevos. Conserva un respaldo y revisa el contrato original antes de confirmar condiciones.

El plano oficial sustituye la vista del plano sin eliminar solares, ventas o pagos existentes. Sus archivos se guardan mediante la API privada en D1, fuera del repositorio. Las cotas provienen del plano; las áreas calculadas o estimadas se identifican como pendientes de verificación. Se conserva el área en metros cuadrados y se permite convertir a varas cuadradas con un factor configurable en Configuración (inicial: 0.6972 m² por vara², referencia normativa hondureña enlazada en el panel). La conversión no modifica precios.

El punto GPS identifica la ubicación de la residencial; no equivale a un levantamiento de linderos georreferenciados. Para ubicar cada solar sobre satélite hacen falta puntos de control del levantamiento.

Administradores pueden crear usuarios de ventas en Configuración. Estos usuarios ven el catálogo y fichas comerciales con medidas y precios; el servidor excluye clientes, saldos, cobros e historial privado. La ficha para mostrar al cliente omite datos del propietario.

El primer uso sin conexión requiere abrir e iniciar sesión antes con internet. Los documentos consultados se conservan en la caché local del dispositivo; los cambios pendientes se sincronizan al reconectar. No borres los datos del navegador mientras haya pendientes. Un conflicto de edición conserva la copia pendiente para revisión.

## Fichas de propietarios

En Residenciales, solares y cobros, **Propietarios de los Excel** presenta las fichas individuales importadas. El propietario se vincula al solar existente por su código único, y aparece al abrirlo desde el mapa. No se crea otro terreno ni se sustituye una venta existente.

Cuando bloque y número coinciden con varios terrenos, la ficha conserva los candidatos. **Ver ficha y abonos → Confirmar solar exacto** permite al administrador seleccionar el código después de revisar el plano. Las contradicciones entre el nombre del archivo y las celdas quedan indicadas. Un importe que cubre varios solares se conserva una sola vez en la ficha y requiere distribución confirmada antes de contabilizarlo.

Las primas, abonos y saldos documentados se conservan con su archivo y fila de origen. El historial no es un ingreso nuevo ni una cuota calculada. Las fechas o montos inválidos permanecen señalados para revisión; los originales no se corrigen por suposición. Importar otra vez una ficha idéntica no duplica datos.

La corrección confirmada de las referencias del plano para los grupos I (20 solares) y L (12 solares) se aplica al leer y guardar, manteniendo intactos sus códigos.
