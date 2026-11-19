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

Las fichas y el selector de abonos muestran **1 solar** o **N solares según Excel**. El conteo usa referencias distintas de bloque y número; una referencia con dos candidatos físicos en el mapa sigue contando como un solo solar declarado. Las referencias incompletas se señalan para confirmar su cantidad cuando no puede determinarse.

Las etiquetas dibujadas del plano coinciden con los registros: **I** corresponde al grupo superior de 20 y **L** al grupo inferior de 12. Se conservan los códigos únicos, ubicaciones y abonos existentes. La vista registrada del PDF oficial también superpone estas dos etiquetas corregidas sin modificar el archivo original.

## LOTIGEST 0.22.17 — Centro de importaciones unificado

Desde los encabezados de Mapa de solares, Terrenos, Clientes, Ventas, Residenciales y cobros, Cuotas, Recibos, Contratos y los demás módulos administrativos pertinentes aparece **Importar**. La ventana es la misma para todos: identifica la residencial activa y comienza en la categoría relacionada con el panel. Se puede cambiar de categoría sin salir de la ventana. Los botones antiguos «Importar Excel» también abren la misma ventana.

| Categoría | Archivo | Cómo se procesa |
|---|---|---|
| Medidas y precios | `.xlsx` | Localiza un solar de la residencial por código o bloque+solar; calcula la vista previa de cambios y rechaza referencias ambiguas. No altera ventas, abonos ni contratos. |
| Clientes y compras | `.xlsx` | Cada fila describe una compra; la identidad vincula al cliente, y los solares se buscan en la residencial seleccionada. Una persona con varios solares ocupa varias filas. |
| Primas y abonos | `.xlsx` | Valida movimientos por cliente, fecha y lote, conserva observaciones y evita repetir el historial ya importado. No transforma automáticamente el historial en nuevos cobros. |
| Croquis PDF | `.pdf` o mapa trazado `.json` | Usa el importador del croquis existente; debe verificarse contra el inventario. |
| Contratos | Fotos `.jpg/.png/.webp` en lector existente | Selecciona primero el cliente y solar; el OCR permite revisar el texto, pero **las fotos originales no se conservan** en el módulo actual. |

Todas las cargas de Excel requieren vista previa, sin confirmar automáticamente. El mismo selector en la ventana acepta un formato en cada categoría; no sube todo un ZIP indiscriminadamente.

**Secuencia recomendada de carga:** crear/seleccionar residencial → verificar etapas/bloques/solares → importar medidas/precios → importar compradores y ventas → incorporar histórico de primas/abonos → vincular contratos y documentos → revisar excepciones → verificar guardado en la nube. Los pagos de varios solares se documentan una sola vez por movimiento y se asignan después a sus solares correctos; no dupliques el importe por fila.

**Pendientes de fases siguientes:** un archivo XLSX multipestaña con asistente de asignación de columnas, carga con diagnóstico completo de repetidos, informe descargable de errores, historial inmutable de importación con huella del archivo, y almacenamiento privado del documento original por cliente en un servicio de objetos con permisos y respaldo. Ninguno de estos puntos se declara implementado en esta versión.

El Centro de importaciones es administrativo. Si el usuario está autenticado como vendedor de consulta, no aparecen los botones para modificar datos. Antes de confirmar cualquier carga, descarga un respaldo y comprueba el nombre de la residencial.

## LOTIGEST 0.22.19 — Contratos primero: reconstruir clientes

Flujo recomendado: **Contratos → Subir contrato y crear ficha**. En sesión administrativa se carga JPG/PNG/WebP de hasta 12 MB. OCR en el navegador lee nombre, DNI, RTN, estado civil, oficio, domicilio, solar, etapa, bloque, medidas, colindancias, precio, prima, saldo, mensualidad, plazo y observaciones; el administrador revisa y corrige antes de guardar.

**Nunca se inventan etapa, fecha de contrato ni primer vencimiento.** La imagen de ejemplo contiene G-16, pero no etapa ni fechas. Se elige el solar exacto del inventario. Ninguna medida existente se sobrescribe: solo pueden completarse área, varas² o precio si estaban vacíos. El texto y la descripción estructurada se guardan en la ficha y la foto original se almacena de forma privada en D1, accesible solamente tras autenticación.

**Guardar ficha** crea o vincula el cliente y el contrato, sin registrar venta ni pago. **Activar crédito** exige fecha de contrato y primera cuota. El crédito registra la prima pactada, pero deja el pago inicial recibido en L 0.00; los cobros se ingresan luego desde **Abonos**. No se fabrican recibos ni pagos históricos.

Para reiniciar el padrón: **Contratos → Preparar limpieza de clientes**. El administrador ve las cantidades de clientes, ventas, pagos, apartados e historiales que se eliminarían; debe descargar y verificar respaldo JSON, marcar casilla, escribir BORRAR PADRON y aceptar una última confirmación. **La publicación no ejecuta ninguna limpieza automáticamente**. El reinicio conserva solares, etapas, bloques, áreas, medidas, precios y croquis, borrando referencias de propietario sin cliente. Los ingresos y gastos manuales de Caja permanecen y deben revisarse. El respaldo JSON no contiene archivos binarios originales.

**Validación matemática del documento ejemplo**: área 176 m² y 252.42 varas²; precio L 580,564.16; prima pactada L 58,056.42; saldo L 522,507.74; 84 cuotas de L 6,220.33. Antes de activar el crédito se requieren etapa y fechas verificadas.

**Límites pendientes**: se deben probar visualmente las cargas en teléfono; la base D1 actual usa un estado JSON general con tope de 4 MB por petición. No se debe confiar en cargas de miles de OCR extensos sin separar documentos por entidad y ejecutar pruebas de concurrencia y recuperación.

## LOTIGEST 0.22.20 — reparar nombre y ficha que no aparecen después de Contratos

La versión previa guardaba el cliente y el OCR, pero solo vinculaba el solar a la venta al pulsar Activar crédito. En Clientes, Terrenos y Mapa se mostraba el comprador exclusivamente al existir venta, por lo que el nombre y la ficha no eran visibles durante la etapa pendiente.

**Corrección:** en Contratos → Subir contrato y crear ficha se permite elegir un cliente existente. La búsqueda por DNI recupera ese cliente, completa datos personales que estuvieran vacíos y no crea una segunda persona. Si falta el nombre leído, se muestra advertencia y debe completarse antes de guardar. Al confirmar, el contrato y el solar almacenan clientId/ownerClientId/pendingContractId, mientras que la fotografía original y todos los detalles permanecen en contractTexts. El solar figura como no disponible en la API pública sin publicar identidad ni precio. No se crea todavía una venta o pago.

En **Clientes → Ver ficha** se presenta toda la descripción contractual: identidad, RTN, estado civil, oficio, dirección, etapa/bloque/solar, varas²/m², colindancias, valor, prima pactada, saldo, cuota, plazo y observaciones. También hay **Completar ficha desde contrato** para un cliente que ya existe y todavía no tiene documento estructurado. En Terrenos y en la ventana del Mapa se muestra el cliente y un acceso a la ficha completa. El inventario reconoce nombres preexistentes vinculados mediante ownerClientId aunque aún no exista el OCR.

**Protecciones:** la prima del contrato no se registra como pago, los meses se cargan después por Abonos, el precio/área existente no se reemplaza, un contrato pendiente bloquea ventas o importaciones duplicadas del solar, y al activar crédito se conserva el cliente previamente vinculado. La limpieza del padrón no es automática ni se ha ejecutado.

Si un cliente se guardó previamente sin ficha documental, no se debe crear un cliente nuevo ni borrar registros: entra a **Clientes → Ver ficha → Completar ficha desde contrato**, sube la foto y selecciona la etapa y solar correctos. Comprueba después el estado de sincronización D1.

## LOTIGEST v0.22.21 — Bloque y solar detectados por OCR, etapa manual

Al subir una imagen en **Contratos → Subir contrato y crear ficha**, el lector busca las etiquetas `LOTE`, `LOTE(S)`, `LOTES`, `SOLAR`, `BLOQUE`, `BLOQUE(S)` o `BLOQUES`. Rellena automáticamente los campos editables de bloque y número de solar. A continuación exige elegir **Etapa 1** o **Etapa 2** desde un menú; el programa NO asume una etapa basándose en la imagen.

Al seleccionar la etapa, el sistema busca un solar que coincida con esa triple referencia (etapa + bloque + número). Si la coincidencia es única lo selecciona; si falta, ofrece corregir el OCR o buscarlo manualmente en esa etapa. Antes de guardar valida de nuevo que los tres datos coincidan y evita registros en una etapa equivocada. Por ejemplo, bloque G, solar 16, etapa 1 y bloque G, solar 16, etapa 2 son registros diferentes.

Esto NO sustituye ni borra medidas ya registradas, contratos anteriores, personas, ventas o abonos. La etapa puede cambiarse antes de guardar; al hacerlo se actualiza la referencia seleccionada y se conservan los demás datos revisados del contrato.

## LOTIGEST v0.22.22 — Guardado completo de identidad y verde limón en Mapa

**Contratos:** al leer una fotografía se busca el DNI de la persona titular (13 dígitos), sin tomar el número de identidad del representante que pueda aparecer en Observaciones. Se permite revisar manualmente los trece dígitos antes de confirmar. Una identidad incompleta **bloquea** el guardado de la ficha. El cliente se guarda con identidad en `clients[].identity` y además en `contractTexts[].structured.identity`, junto con nombre, estado civil, dirección, oficio, RTN, etapa (selección manual), bloque, solar, varas², m², cuatro colindancias, precio, prima, saldo, cuota, plazo, precio por vara y observaciones completas. El original sigue privado y las medidas del inventario no se sobrescriben.

**Reparar cliente ya registrado:** al abrir su contrato, pulsar **Corregir DNI del cliente**. Se actualizan la identidad del cliente existente y las fichas estructuradas vinculadas, sin duplicar clientes, ventas ni pagos. Se valida que el DNI no pertenezca a otra persona y que las otras fichas no sean contradictorias. Si se guardó un cliente por el formulario antiguo sin ficha estructurada, primero usar **Clientes → Completar ficha desde contrato**.

**Mapa interno:** los solares con fotografía/contrato estructurado en estado pendiente de activar o activo aparecen en verde limón (`#A3E635`) y muestran la leyenda **Contrato registrado**. Las cuotas vencidas conservan rojo, y los apartados vigentes no se vuelven verdes por accidente. La página pública de WhatsApp mantiene el solar no disponible sin exponer clientes, DNI ni precios. El color no equivale a prima cobrada ni a cuota pagada.

La actualización no ejecuta limpieza ni altera los clientes y pagos ya existentes. Validar manualmente el OCR de una fotografía real, corregir DNI existente sin crear persona nueva, y confirmar en el mapa el solar de la etapa correcta antes de ingresar abonos.

### 0.22.24 — Fotografía completa para lectura contractual

Se corrige el recorte de fotografías de más de 2200 píxeles: el lienzo y la imagen usan ahora el mismo tamaño de destino, conservando toda la ficha y su proporción antes del OCR. El lector usa rutas explícitas compatibles de Tesseract 5 y español. Pruebas de regresión con fotos verticales de 4000 × 6000, horizontales de 6000 × 4000 y pequeñas de 900 × 1400 comprueban que la entrada completa llega al OCR, y que nombre, DNI, bloque y solar extraídos llegan al formulario. La etapa sigue siendo manual. No hay migraciones ni cambios de clientes, medidas o abonos existentes.

### 0.22.25 — Lector contractual autocontenido y recuperable

El build incluye script, worker, motores LSTM con/sin SIMD y modelo español comprimido best_int en `/ocr/v5/`. Descargas fijadas y verificadas con SHA-256; un recurso incompleto bloquea el build. La lectura contractual usa el mismo origen, sin worker Blob ni descargas de terceros desde el teléfono. Se conserva la imagen para reintento y se muestra la causa del fallo con texto seguro. Si createImageBitmap no abre la imagen se intenta el decodificador de imágenes del navegador. El parser acepta `(5)` como variante OCR de la etiqueta `(S)`, sin alterar dígitos de identidad ni números de solar. Validación con motor OCR real sobre ficha sintética sin datos personales y pruebas de regresión de fotos, error recuperable, guardado y arranque. Requiere aún comprobar una foto del usuario desde su sesión de teléfono.

### 0.22.27 — Varios solares por ficha contractual

El formulario permite añadir o quitar solares y escoger la etapa manual de cada uno. Las listas explícitas de números separadas por coma, punto y coma, barra o Y se proponen como filas adicionales; no se adivina la etapa. Una sola foto y un cliente se vinculan a un documento por solar, agrupados por contractGroupId. Para varios solares el precio y prima individual deben sumar los totales de la ficha. Cada crédito se activa por separado con su importe, sin registrar pagos ni prima recibida. No se copian áreas conjuntas al catastro individual. Selecciones duplicadas, ventas, apartados y contratos existentes bloquean todo el guardado. Las medidas originales siguen protegidas. Pruebas: tres solares en distintas etapas/bloques, cliente único y foto compartida, sumas monetarias, bloqueo sin guardado parcial, UI agregar/quitar, y activación de tres créditos sin duplicar deuda o abonos.

### 0.22.28 — Ficha PDF y cuota mínima mensual

- Descarga privada en PDF carta desde la ficha contractual, el cliente o la venta. Tablas para generales, DNI, dirección, etapa/bloque/solar, medidas, colindancias, precio, prima, financiamiento, mensualidad, plazo, observaciones y firma. Incluye solares agrupados y pagina texto largo. No declara pagos recibidos ni inventa campos faltantes.
- Cuota visible arriba de Abonos: condiciones existentes en venta o ficha estructurada, por solar y total seleccionado. Sin condiciones suficientes se solicita completar contrato; una prima aislada no determina plazo ni mensualidad.
- Validación del pago nuevo en interfaz y servidor D1: mensualidad completa o más, limitada al saldo disponible; excepción de cancelación del saldo final inferior. Prima pendiente diferenciada: los pagos de prima pueden completarse sin confundirse con mensualidades. Al cruzar de prima a mensualidad debe cubrirse una cuota o el saldo final.
- No se recalculan ni borran recibos anteriores. La conciliación de pagos históricos previamente guardados conserva el comprobante verificado; una etiqueta de importación inventada no elude el mínimo.
- Verificación específica: cálculo de L 6,220.33, rechazo de importe menor sin escritura ni cambio de revisión, cuota exacta, importe superior, varios solares, prima, saldo final, historial, PDF con texto largo y descarga desde datos existentes. PDF de prueba sintético revisado visualmente en carta (una página para una ficha normal).

Verificación ampliada: la suite general mantiene los mismos 18 fallos de 0.22.27; comparación contra checkout aislado de esa versión sin fallos nuevos. Las 12 pruebas específicas de esta entrega (PDF, reglas, servidor, interfaz, varios solares y menú móvil) pasan. Los fallos previos no se declaran resueltos por esta entrega.
