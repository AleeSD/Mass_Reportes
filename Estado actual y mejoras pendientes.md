# Estado actual y mejoras pendientes

Fecha de actualizacion: 2026-09-24

## 1. Resumen ejecutivo

El proyecto ya tiene una primera version funcional para **alertas**: lee exports `.xlsx`, normaliza sus columnas, consolida la informacion por placa, genera un archivo Excel y muestra un dashboard operativo del dia. Tambien guarda en SQLite los metadatos de cada ejecucion, sin almacenar el detalle fila por fila de las alertas.

Se incorpora el nuevo reporte **Historial** (Report History de Onway, 18 cols), un reporte **Consolidado combinado** (Alertas + Historial mezclados por placa) y se corrige el defecto de `Dirección` / `Estado GPS` / `Atención Alerta` que aparecian como `[object Object]` (ahora se resuelven las formulas `HYPERLINK` e `IF` literales que Onway exporta).

Orden de trabajo acordado (actualizado):

1. ~~Preparar el nucleo y agregar **combustible**.~~ → En esta iteracion se implemento **Historial** y **Consolidado** como siguiente paso inmediato.
2. Convertir las ejecuciones guardadas en un **historial operativo** visible (ahora "Historial de ejecuciones" para no confundir con el reporte Onway).
3. Agregar **viajes** usando el mismo motor, con metricas y columnas propias.
4. Agregar **combustible** despues de validar exports reales.
5. Cerrar hardening, pruebas y documentacion operativa.

## 2. Estado actual por area

| Area | Estado | Situacion actual |
|---|---|---|
| Ingesta de alertas | Funcional | Lee `.xlsx` de `alertas_onway/` y `reportes_onway/` por compatibilidad. Ignora archivos temporales `~$`. Acepta 2 estructuras de carpetas. |
| Ingesta de historial (Onway) | Funcional (sin datos reales aun) | Tipo habilitado en YAML con plantilla 18 cols y hoja `Report History`. Falta testear con export real. |
| Consolidado combinado Alertas+Historial | Funcional | Une los dos reportes por placa, añade "Origen del registro", ordena por Fecha+Hora, poda vacíos. Genera `REPORTE_CONSOLIDADO_*.xlsx`. |
| Dirección / Estado GPS / Atención Alerta | Funcional | Mini-parser de formulas Onway (`HYPERLINK`, `IF` literales). Red de seguridad anti-`[object Object]` (fuerza estado `parcial` si detecta celda con objeto stringificado). |
| Normalizacion | Funcional | Mapea por nombre de encabezado, detecta la hoja de origen y normaliza placas. Integra `resolveOnwayFormula` al leer cada celda. |
| Plantilla de alertas | Funcional | Usa la plantilla de 25 columnas definida en `config/reportes.yaml`. |
| Poda de columnas vacias | Funcional | Se evalua sobre todo el reporte del dia, no sobre cada hoja individual. |
| Consolidado Excel | Funcional | Genera una hoja por placa (agrupa archivos repetidos de la misma placa). Aplica formato, autofiltro y congelacion. |
| Errores por archivo | Parcial | Un archivo corrupto no detiene el resto; las formulas no reconocidas producen `warn` y estado `parcial`. |
| Metadatos y logs | Funcional | SQLite guarda ejecuciones (incluye tipos `historial` y `consolidado_diario`), estados, conteos, resumen y logs; no guarda detalle fila por fila. |
| API | Funcional (3 tipos) | Salud, dias, tipos (con flag `es_compuesto`), resumen, procesamiento manual, ejecuciones, descargas. Endpoints `/process` y `/summary` soportan `consolidado`. |
| Dashboard | Funcional (3 tipos) | Selector lateral con Alertas / Historial / Consolidado. Tarjeta "Registros totales" cuando no es alertas. Tabla y paneles parametrizados por tipo. |
| Scheduler | Funcional (orden dependencias) | Procesa primero los tipos base (Alertas, Historial), luego los compuestos (Consolidado). |
| Combustible | No iniciado | Configuracion preliminar sin plantilla real; deshabilitado. Pendiente de export real. |
| Historial de ejecuciones (vista frontend) | Parcial | Datos en SQLite y `/api/runs`; falta la vista historica completa con filtros. |
| Viajes | No iniciado | Configuracion preliminar sin export, esquema ni metricas reales. |
| Pruebas automatizadas | Pendiente | No se encontraron pruebas automatizadas para el motor, API o dashboard. |

## 3. Lo que ya esta implementado

### 3.1 Alertas y archivos

- Lectura de archivos `.xlsx` desde `reportes_onway` y `alertas_onway` (con fallback por compatibilidad).
- Soporte para `setiembre/DD-MM-YYYY` y `YYYY-MM-DD/alertas`.
- Hoja `Report Alerts`, con fallback a la primera hoja.
- Deteccion de encabezados aunque no comiencen en la primera fila.
- Mapeo por nombre de columna, no por posicion.
- Identificacion de placa desde `Placa/Patente`, con fallback al nombre del archivo.
- Normalizacion de espacios, mayusculas y separadores de la placa.
- **Resolucion de formulas Onway**: `Dirección` extrae el texto de `HYPERLINK(url, texto)`. `Estado GPS` y `Atención Alerta` resuelven `IF(a=b, "X", IF(…))` literales.
- **Red de seguridad anti-`[object Object]`**: despues de escribir el workbook se lee y escanea; si encuentra la cadena marca estado `parcial`.
- Tolerancia a archivos corruptos sin detener todos los archivos del dia.

### 3.2 Historial (Report History)

- Tipo `historial` habilitado en `config/reportes.yaml`.
- Plantilla de 18 columnas: Secuencia, Grupo, Alias, Placa/Patente, Tipo de carrocería, Empresa, Conductor, Fecha, Hora, Latitud, Longitud, Dirección, Velocidad (Km/h), Odómetro (Km), Horómetro (Hrs), Alerta, Zona/Marca, Notas.
- Columnas obligatorias: Fecha, Hora, Placa/Patente.
- Hoja de origen: `Report History`.
- Nombre salida: `REPORTE_HISTORIAL_YYYY-MM-DD.xlsx`.

### 3.3 Consolidado combinado Alertas + Historial

- Tipo compuesto `consolidado_diario` con `key_publico=consolidado`.
- Antes de generar, verifica que existan los `REPORTE_ALERTAS_*` y `REPORTE_HISTORIAL_*`; si no, llama a `processDay` sobre el tipo base.
- Carga ambos workbooks, une filas por placa en un solo mapa.
- Añade columna `Origen del registro` = "Alertas" o "Historial".
- Orden filas por `Fecha + Hora` (empate por origen: Alertas primero).
- Plantilla union con orden fijo segun plan §4.2: Secuencia, Grupo, Alias, Placa/Patente, **Origen del registro**, IMEI, Tipo carrocería, Empresa, Conductor, Fecha, Hora, Latitud, Longitud, Dirección, Alerta, Odómetro (Km), Zona, Zona/Marca, Velocidad, Horómetro, % Batería, Fecha GPS, Hora GPS, Estado GPS, Atención Alerta, Fecha Registro At., Hora Registro At., Notas.
- Poda columnas completamente vacías (conservando siempre Origen del registro).
- Nombre salida: `REPORTE_CONSOLIDADO_YYYY-MM-DD.xlsx`.

### 3.4 Consolidacion

- Aplicacion de plantilla fija por tipo.
- Descarte de columnas que no pertenecen al formato final.
- Eliminacion global de columnas vacías.
- Formato basico de hojas, encabezados, autofiltro, congelacion y anchos.

### 3.5 Operacion

- Tipos de reporte: `alertas`, `historial`, `consolidado` (3 botones en dashboard y CLI).
- API: `/report-types` expone key_publico + flag `es_compuesto` + `tipos_incluidos`; `/days?tipo=consolidado` une fechas de los tipos base.
- Procesamiento manual por fecha y tipo (distingue base vs compuesto).
- Descarga del consolidado y originales (originales solo para tipos base).
- Scheduler configurable por cron y zona horaria (primero base, luego compuestos).
- Dashboard con estado, conteos, placas, errores, columnas conservadas y logs.
- SQLite limitado a metadatos.

## 4. Pendientes tecnicos antes de ampliar el sistema

Estos puntos pertenecen al nucleo comun y deben resolverse antes o durante la implementacion de viajes o combustible.

### Prioridad P0: correcciones del motor

- **~Descubrimiento de fechas~** ✓ implementado: detecta `YYYY-MM-DD/subtipo` y `setiembre/DD-MM-YYYY` con listado de roots por tipo.
- **Agrupacion por placa:** ✓ implementado: filas de archivos con la misma placa se unen en una sola hoja, nunca `ABC123` y `ABC123-2`.
- **Validacion de obligatorias:** ✓ implementado: columna faltante marca el archivo como error con `campo_faltante` en log.
- **Esquema sin plantilla:** pendiente para viajes/combustible; historial y alertas usan plantilla explicita.
- **~Estados consistentes~** ✓: `ok`, `parcial`, `error`, `sin_archivos`. Dashboard traduce a etiquetas humanas.
- **Bloqueo de ejecuciones:** pendiente (mutex tipo+fecha en memoria o DB).
- **Fechas reales:** validar calendario (no solo patron).
- **~Tipos deshabilitados~** ✓: `/process` rechaza con 400 cuando `habilitado=false`.

### Prioridad P1: pruebas y soporte

Agregar pruebas automaticas para:

- Encabezados en distinto orden.
- Columnas faltantes y obligatorias.
- Archivo corrupto o vacio.
- Dos archivos de una misma placa.
- Estructuras de carpetas actual y recomendada.
- Poda global de columnas vacias.
- Fechas invalidas.
- Tipo de reporte deshabilitado.
- Parser formulas: `HYPERLINK` normal, `IF` anidado, formula no reconocida.
- Consolidado combinado: con solo alertas, con alertas+historial, sin archivos.

Tambien se debe revisar la documentacion de version de Node. El proyecto declara Node 20 o superior, pero `backend/src/db.js` utiliza `node:sqlite`, por lo que el minimo real debe comprobarse y documentarse, o debe incorporarse una alternativa compatible.

## 5. Fase siguiente: reportes de viajes / combustible (proximo despues de validar historial real)

### 5.1 Informacion necesaria antes de programar

Para **viajes** y **combustible** solicitar exports reales con:

- Nombre exacto de la hoja.
- Fila real de encabezados.
- Columna de placa.
- Columnas de fecha y periodo.
- Unidades (litros, km, horas).
- Como se representan valores vacios, cero y errores.

No activar `habilitado: true` hasta completar esta validacion.

## 6. Fase posterior: Historial de ejecuciones

El Historial de ejecuciones se implementara despues de tener viajes/combustible funcionando, aprovechando la tabla de ejecuciones existente en SQLite. Muestra ejecuciones pasadas del propio sistema (dias procesados, estados, conteos, descargas). No se almacenara el detalle fila por fila de alertas, historial de posiciones, combustible o viajes.

> Nota de nombre: a partir de la incorporacion del nuevo reporte de Onway "Historial de posiciones", esta fase se renombro de "Historial operativo" a "Historial de ejecuciones" para evitar ambiguedades.

### Funcionalidades

- Vista de ejecuciones anteriores.
- Filtro por tipo de reporte (alertas, historial, consolidado, combustible, viajes).
- Filtro por fecha o rango de fechas.
- Estado de cada ejecucion.
- Archivos encontrados, procesados y con error.
- Placas procesadas y con error.
- Total de registros y metricas principales del tipo.
- Descarga del consolidado asociado a cada ejecucion.
- Acceso a logs de la ejecucion.
- Indicacion clara cuando no existen archivos para una fecha.

### Mejoras de backend necesarias

- Revisar que `/api/runs` entregue paginacion o limites razonables.
- Agregar filtros por `tipo`, `fecha_desde`, `fecha_hasta` y `estado`.
- Garantizar que cada ejecucion tenga una referencia estable al archivo generado.
- Definir politica de retencion de metadatos y logs.
- Documentar que eliminar una ejecucion no elimina automaticamente los archivos originales, salvo que se defina expresamente.

### Criterios de terminado del Historial de ejecuciones

- El usuario puede consultar ejecuciones pasadas sin modificar archivos.
- Puede filtrar por tipo y periodo.
- Puede distinguir una ejecucion correcta de una parcial o fallida.
- Puede descargar el consolidado desde el registro historico.
- Los datos mostrados coinciden con SQLite y con el archivo generado.
- La retencion y limpieza estan documentadas.

## 7. Fase posterior: reportes de viajes

### Informacion necesaria

Solicitar exports reales de viajes antes de definir la plantilla. Confirmar:

- Nombre de la hoja y fila de encabezados.
- Placa y fecha.
- Inicio y fin del viaje.
- Origen y destino.
- Distancia.
- Duracion.
- Paradas o eventos intermedios.
- Reglas para viajes abiertos, cancelados o sin GPS.

### Implementacion propuesta

- Definir la plantilla de viajes en `config/reportes.yaml`.
- Generar `REPORTE_VIAJES_YYYY-MM-DD.xlsx`.
- Consolidar por placa y mantener la granularidad de un viaje por fila.
- Guardar solo resumen y metadatos en SQLite.
- Incorporar metricas especificas:
  - total de viajes;
  - distancia acumulada;
  - duracion acumulada;
  - viajes por placa;
  - viajes sin origen o destino;
  - viajes con datos incompletos.
- Adaptar el dashboard para no mostrar columnas o metricas propias de alertas.

### Criterios de terminado de viajes

- Se procesa un export real de viajes de principio a fin.
- Las columnas y unidades estan documentadas.
- El consolidado conserva un viaje por fila.
- Los casos incompletos se identifican sin detener el resto.
- Las metricas del dashboard coinciden con el Excel.
- Existen pruebas para viajes normales, incompletos y con varias placas.

## 8. Mejoras de dashboard y modelo comun

El frontend actual funciona para alertas / historial / consolidado. Para combustible y viajes se requiere un resumen configurable por tipo:

- nombre y etiqueta del reporte;
- metrica principal y unidad;
- metricas secundarias;
- columnas visibles del resumen;
- agrupacion por placa;
- filtros aplicables;
- textos para estados y errores.

La pantalla debe conservar los controles comunes (fecha, tipo, procesar, descargar, logs) y cambiar solo las metricas y tablas especificas del reporte.

## 9. Riesgos operativos pendientes

- Cambios de nombres o columnas en los exports de Onway.
- Archivos duplicados o repetidos para una placa.
- Archivos que llegan mientras se esta procesando.
- Falta de una placa esperada sin una lista de referencia.
- Sobrescritura por ejecuciones concurrentes.
- Diferencias de unidades entre reportes de combustible.
- Viajes sin cierre o con datos GPS incompletos.
- Crecimiento indefinido de SQLite y de la carpeta `_procesados`.
- Ausencia de autenticacion si el dashboard se expone fuera del equipo local.

Mitigaciones recomendadas:

- Lista configurable de placas esperadas.
- Estado `pendiente` para placas o archivos faltantes.
- Bloqueo por tipo y fecha.
- Validacion de esquema antes de consolidar.
- Logs claros por archivo.
- Politica de retencion.
- Copia o versionado de salidas si el reporte debe conservarse legal u operativamente.
- Autenticacion antes de exponer la API en red.

## 10. Backlog priorizado

### P0 - Hardening pendiente

- ~Corregir descubrimiento de fechas.~ ✓
- ~Agrupar filas por placa~ ✓.
- ~Hacer efectivas las columnas obligatorias~ ✓.
- Corregir union de columnas sin plantilla (para viajes/combustible futuros).
- Validar fechas reales (no solo patron YYYY-MM-DD).
- ~Respetar `habilitado` en todos los endpoints~ ✓.
- Agregar bloqueo de ejecuciones (mutex tipo+fecha).
- Crear pruebas del motor y parser formulas.

### P1 - Validar Historial real

- Conseguir export real de `Report History` y ejecutar `processDay historial` end-to-end.
- Ajustar plantilla / obligatorias si el export real diverge del supuesto §2.3.
- Correr consolidado combinado Alertas + Historial real y validar:
  - placa que aparece en ambos reportes tenga filas intercaladas por fecha;
  - Origen del registro = "Alertas" vs "Historial" correctos;
  - columnas solo historial (Zona/Marca, Notas, etc.) aparezcan con valor en filas Historial y vacías en Alertas (no podadas).

### P1 - Viajes

- Conseguir exports reales.
- Definir plantilla, granularidad y unidades.
- Implementar resumen especifico (total viajes, km, duración).
- Activar el reporte solo despues de validarlo.
- Probar reproceso, errores y varias placas.

### P1 - Historial de ejecuciones (vista frontend)

- Exponer filtros de `/api/runs` (tipo, rango fechas, estado).
- Crear vista historica en el dashboard.
- Agregar enlaces de descarga y logs.
- Definir politica de retencion.

### P2 - Combustible

- Conseguir exports reales.
- Definir plantilla y unidades.
- Implementar resumen de combustible.
- Activar el reporte solo despues de validarlo.

### P2 - Entrega y hardening

- ~Completar README con instalacion, operacion y solucion de problemas~ ✓ (añadidos CLI de los 3 tipos y descripcion del motor).
- Probar varios dias reales de Alertas + Historial.
- Documentar cambios de esquema (historial y consolidado nuevo).
- Revisar seguridad de la API.
- Revisar rendimiento con el crecimiento de la flota.

## 11. Proximo paso inmediato

El siguiente paso concreto es **obtener y analizar un export real de Historial (`Report History`) de Onway** para validar la plantilla de 18 columnas supuesta. Con ese archivo:
1. Correr `npm run process -- --fecha YYYY-MM-DD --tipo historial` y confirmar que el XLSX generado no rompe.
2. Ejecutar luego `npm run process -- --fecha YYYY-MM-DD --tipo consolidado` y revisar una placa que aparezca en ambos reportes (Alertas + Historial): filas mezcladas cronologicamente, columna "Origen del registro" correcta, y columnas específicas (Zona/Marca, Notas, Estado GPS, etc.) pobladas solo en las filas del origen correspondiente.
3. Una vez validado, se puede proceder con **Viajes** (exports reales + plantilla) o **Combustible**.

Mientras tanto, el sistema ya soporta los 3 tipos (Alertas / Historial / Consolidado) con corrección de fórmulas Onway, red de seguridad anti-`[object Object]` y selectores en API, CLI y dashboard.
