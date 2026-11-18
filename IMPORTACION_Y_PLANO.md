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

## Abono por persona y varios solares

**Cuotas y pagos → Registrar abono → Registrar abono normal** permite buscar a la persona y mostrar sus solares. Para fichas de Excel, escribe un monto por solar o un abono conjunto por ficha. El total es la suma de los importes indicados; no hay reparto automático. Un recibo corresponde a una sola persona y residencial.

Los abonos nuevos quedan en Recibos y se incorporan una sola vez como ingresos de **Abonos de propietarios** en Finanzas. Funcionan con la cola local sin conexión y se sincronizan al reconectar. El PDF conserva la distribución del momento del cobro. El historial importado continúa separado de los ingresos nuevos.

El saldo documentado de la ficha es una referencia del Excel menos los abonos nuevos vinculados a ella. No representa un cálculo de intereses, cuotas o mora. Cuando faltan condiciones contractuales verificadas, el recibo lo indica. La referencia de un solar puede usarse desde el Excel aunque su código exacto en el mapa siga pendiente, sin asignar por suposición a un terreno físico.

La fuente para nombres, bloques y solares son las celdas del Excel. El nombre del archivo se utiliza únicamente como referencia de origen. Si la celda no identifica el bloque, no se lo completa usando el nombre del archivo. Conciliar una ficha existente mantiene sus códigos y movimientos, y deja constancia de la corrección; no la importa por segunda vez.

## Tarjetas y ficha de cada solar

Residenciales, solares y cobros presenta las referencias de los Excel como tarjetas con el propietario y botones **Ficha** y **Abonar**. El historial de primas y abonos se consulta dentro de la ficha de la persona, junto con sus demás solares y los recibos posteriores. El panel principal ya no muestra una tabla independiente de historial de Excel.

Una referencia que coincide con varios códigos del mapa se muestra una sola vez como ficha de referencia, con la indicación de código pendiente. Dentro de Ficha se pueden consultar sus candidatos y confirmar la asignación. Esto agrupa la presentación para evitar atribuir dos terrenos físicos al mismo dueño por una coincidencia de bloque/número; no elimina ni fusiona registros del inventario. Los solares con venta y cuotas verificadas conservan sus tarjetas y cálculos anteriores.

Las cuotas y la mora solo muestran valores calculados cuando existen condiciones contractuales verificadas. Para las fichas documentales se muestra el saldo de la ficha como referencia, sin repartir un importe conjunto entre varios terrenos ni presentarlo como una deuda individual calculada.
