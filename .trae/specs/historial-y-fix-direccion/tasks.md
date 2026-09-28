# Plan de tareas — Historial + Consolidado + Fix Dirección

## Task 1: Renombre de carpetas y descubrimiento (Fase A)

Status: pending
Priority: high

### Descripción
Actualizar rutas raíz: Alertas pasa de `reportes_onway` a `alertas_onway` (con fallback a la vieja por compatibilidad), y se agrega `historial_onway` con el mismo descubrimiento de fechas/subcarpetas. Actualizar README y docs.

### Modifica
- [config/reportes.yaml](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/config/reportes.yaml)
- [backend/src/engine/paths.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/paths.js)
- [README.md](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/README.md)
- [Estado actual y mejoras pendientes.md](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/Estado%20actual%20y%20mejoras%20pendientes.md) (renombrar sección §6 a "Historial de ejecuciones")

### Test Requirements (TR)
- **TR-1.1 (rule)**: `resolveInputDirs` para alertas encuentra archivos tanto en `alertas_onway/YYYY-MM-DD/alertas/` como en `reportes_onway/YYYY-MM-DD/alertas/` (fallback).
- **TR-1.2 (rule)**: `resolveInputDirs` para historial soporta `historial_onway/setiembre/DD-MM-YYYY/` y `historial_onway/YYYY-MM-DD/historial/`.
- **TR-1.3 (rule)**: `discoverAvailableDates` no rompe cuando existe solo la carpeta antigua `reportes_onway`; incluye también fechas detectadas en `historial_onway`.
- **TR-1.4 (rule)**: `README.md` actualiza el ejemplo de estructura de carpetas a `alertas_onway/` + `historial_onway/` + `_procesados/` con los tres nombres de salida.
- **TR-1.5 (rule)**: §6 de `Estado actual y mejoras pendientes.md` se llama "Historial de ejecuciones" y el texto interno ya no dice "historial operativo" refiriéndose a runs del sistema.

### Bloquea
Task 2, Task 3, Task 4

---

## Task 2: Evaluador de fórmulas mínimo (Dirección / Estado GPS / Atención Alerta) + red de seguridad (Fase C)

Status: pending
Priority: high

### Descripción
Implementar en `helpers.js` una función `resolveOnwayFormula(value)` que, al recibir el valor crudo de una celda de ExcelJS, detecte si trae `formula` y resuelva los patrones `HYPERLINK(..., "texto")` e `IF(a=b, "X", Y)` con literales (incluido anidado). Si no reconoce la fórmula, devuelve `{ unresolved: true }`.

Integrar la función en `normalize.js` / `cellToString` de modo que:
- Si hay fórmula reconocida → sale el texto.
- Si hay fórmula no reconocida → se registra warn por placa+columna y la celda sale vacía.

Agregar una función `scanWorkbookForObjectObject(workbook)` que recorra todas las hojas/celdas y detecte la cadena `[object Object]`; si aparece, cambiar el estado del run a `parcial`/`error` y loguear.

### Modifica
- [backend/src/engine/helpers.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/helpers.js) (nueva `resolveOnwayFormula`, ajusta `cellToString` si es necesario)
- [backend/src/engine/normalize.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/normalize.js) (lectura de celda + warn por fórmula no reconocida)
- [backend/src/engine/processDay.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/processDay.js) (después de `writeConsolidatedWorkbook`, correr `scanWorkbookForObjectObject` y ajustar `estado`)
- [backend/src/engine/consolidate.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/consolidate.js) (opcionalmente exponer escaneo allí)

### Test Requirements (TR)
- **TR-2.1 (rule)**: `resolveOnwayFormula` con `=HYPERLINK("url","Avenida X, Lima")` → `"Avenida X, Lima"`.
- **TR-2.2 (rule)**: `resolveOnwayFormula` con `=IF("NOGPS"="NOGPS","GPS Antiguo","En línea")` → `"GPS Antiguo"`.
- **TR-2.3 (rule)**: `resolveOnwayFormula` con `=IF(0=0,"Sin atender", IF(0=1,"Atendida","Atendida y Reportada"))` → `"Sin atender"`.
- **TR-2.4 (rule)**: `resolveOnwayFormula` con `=SUM(1,2)` → `{ unresolved: true }`.
- **TR-2.5 (rule)**: Cuando `readReportFile` encuentra una fórmula no reconocida en una columna, el `logs` devuelto por `processDay` contiene un `warn` que menciona la columna y el archivo/placa.
- **TR-2.6 (rule)**: Si el workbook resultante contiene `[object Object]`, el `estado` final del run no es `"ok"`.
- **TR-2.7 (rubric, AC-8)**: Calidad de encapsulación del evaluador (0-2, umbral=2).

### Bloquea
Task 3, Task 4

---

## Task 3: Configuración e ingesta del tipo `historial` (Fase B)

Status: pending
Priority: high

### Descripción
Agregar la entrada `historial` en `reportes.yaml` con la plantilla de 18 columnas, columna de placa, hoja origen `Report History`, columnas obligatorias `Fecha, Hora, Placa/Patente`, nombre de salida `REPORTE_HISTORIAL_{fecha}.xlsx`.

Ajustar el motor donde sea necesario para que `processDay` con `reportType = historial` no trate `Alerta` como obligatoria ni espere columnas de severidad que no existen. Ajustar `summarizeTables` en `consolidate.js` para ser genérico y no romper cuando no hay `columna_alerta`/`columna_severidad` (dejar `por_tipo`/`por_severidad` vacíos en ese caso).

### Modifica
- [config/reportes.yaml](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/config/reportes.yaml)
- [backend/src/engine/processDay.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/processDay.js) (manejo de tipo sin severidad / sin alerta obligatoria)
- [backend/src/engine/consolidate.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/consolidate.js) (`summarizeTables` genérico)
- [backend/src/scheduler.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/scheduler.js) (no requiere cambios, pero validar que recorre `enabledReportTypes`)

### Test Requirements (TR)
- **TR-3.1 (rule)**: `enabledReportTypes` devuelve `alertas` e `historial` con `habilitado: true` y `combustible`/`viajes` con `false`.
- **TR-3.2 (rule)**: Simulando archivos de historial (18 cols, `Report History`), `processDay` devuelve `estado: "ok"` cuando solo faltan columnas no-obligatorias y los `logs` no contienen errores por falta de `Alerta`.
- **TR-3.3 (rule)**: `summarizeTables` para historial devuelve `por_tipo: []` y `por_severidad: []` sin lanzar.
- **TR-3.4 (rule)**: El archivo `REPORTE_HISTORIAL_*.xlsx` generado contiene las columnas de la plantilla y aplica poda de columnas vacías (por ejemplo, si `Notas` está vacía en todas las placas, no aparece).

### Bloquea
Task 4

---

## Task 4: Reporte compuesto — Consolidado diario (Alertas + Historial) (Fase D)

Status: pending
Priority: high

### Descripción
Introducir el concepto de `reportes_compuestos` en YAML y en el motor. Escribir una función nueva `processCompositeDay` (o equivalente) que:

1. Para cada tipo en `tipos_incluidos`, verifica si ya existe un run exitoso (consolidado) en disco para esa fecha; si no, llama a `processDay` primero.
2. Carga los `.xlsx` de salida de cada tipo con ExcelJS, extrae todas las filas de todas las hojas, les agrega `"Origen del registro"`.
3. Fusiona por placa: une filas de ambos tipos en un único arreglo por placa.
4. Aplica la plantilla unión (todas las columnas de Alertas ∪ Historial, ordenadas según §4.2 del plan).
5. Ordena por Fecha + Hora.
6. Aplica `pruneEmptyColumns` sobre el resultado final.
7. Escribe `REPORTE_CONSOLIDADO_*.xlsx` con `writeConsolidatedWorkbook`.
8. Registra un `run` nuevo con `tipo = "consolidado_diario"` (o `"consolidado"` como key pública) y sus propios metadatos.

Registrar `consolidado` como un "tipo virtual" que `getReportType` / `enabledReportTypes` / la API puedan exponer (adaptando `config.js` si es necesario).

### Modifica
- [config/reportes.yaml](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/config/reportes.yaml) (nueva sección `reportes_compuestos`)
- [backend/src/config.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/config.js) (helpers: `getCompositeReport`, `allExposedTypes`)
- [backend/src/engine/paths.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/paths.js) (`resolveOutputPath` para compuestos)
- Nuevo archivo o extender [backend/src/engine/processDay.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/processDay.js) con `processCompositeDay`
- [backend/src/engine/consolidate.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/consolidate.js) (si es útil un helper `unionColumns`)
- [backend/src/scheduler.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/scheduler.js) (procesar compuestos después de cada enabled base type, o en un segundo pase)

### Test Requirements (TR)
- **TR-4.1 (rule)**: Orden de columnas del consolidado coincide con §4.2 del plan (Secuencia, Grupo, Alias, Placa/Patente, **Origen del registro**, IMEI, Tipo carrocería, … Notas) cuando todas las columnas tienen datos.
- **TR-4.2 (rule)**: Columna "Origen del registro" contiene exactamente `"Alertas"` o `"Historial"` en cada fila (sin vacíos).
- **TR-4.3 (rule)**: Dados 5 filas de historial y 3 de alertas para la misma placa con fechas mezcladas, las 8 filas aparecen en la hoja de esa placa ordenadas cronológicamente (Fecha + Hora).
- **TR-4.4 (rule)**: Si un día hay solo alertas (sin historial), `processCompositeDay` genera el consolidado con solo esas filas, sin romperse.
- **TR-4.5 (rule)**: Se persiste un `run` con `tipo = "consolidado_diario"` en SQLite y `/api/runs` lo devuelve.
- **TR-4.6 (rubric, AC-7)**: Calidad de la abstracción (0-2, umbral=2).

---

## Task 5: Endpoints API + Scheduler para el tipo compuesto (Fase A/D/E)

Status: pending
Priority: medium

### Descripción
Ajustar la API para que:
- `/api/report-types` incluya al consolidado (etiqueta "Consolidado").
- `/api/days?tipo=consolidado` devuelva días presentes en cualquiera de los tipos incluidos.
- `/api/process/consolidado/:fecha` dispare `processCompositeDay`.
- `/api/summary/consolidado/:fecha` lea el run compuesto y el archivo `REPORTE_CONSOLIDADO_*.xlsx`.
- `/api/download/consolidated/consolidado/:fecha` descargue el archivo.

Scheduler: después de correr los tipos base habilitados, dispara también los compuestos asociados, siempre que haya archivos.

### Modifica
- [backend/src/api.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/api.js)
- [backend/src/scheduler.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/scheduler.js)
- [backend/src/cli.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/cli.js) (si existe un `--tipo consolidado`)

### Test Requirements (TR)
- **TR-5.1 (rule)**: `GET /api/report-types` incluye una entrada con `key: "consolidado"` (o equivalente) y `etiqueta: "Consolidado"`.
- **TR-5.2 (rule)**: `POST /api/process/consolidado/YYYY-MM-DD` genera el archivo `REPORTE_CONSOLIDADO_*.xlsx` y guarda un run.
- **TR-5.3 (rule)**: `GET /api/download/consolidated/consolidado/YYYY-MM-DD` descarga el archivo correcto (200).
- **TR-5.4 (rule)**: Scheduler, cuando corre el día, registra en consola/guarda runs para `alertas`, `historial` y `consolidado_diario` (o log indicativo).

### Bloquea
Task 6

---

## Task 6: Dashboard — selector, métricas genéricas y descargas (Fase E)

Status: pending
Priority: medium

### Descripción
Actualizar `App.jsx` para que:
- El selector lateral muestre los 3 tipos (Alertas, Historial, Consolidado) usando la respuesta de `/api/report-types`.
- Las tarjetas del resumen muestren etiquetas adaptadas: cuando el tipo no es alertas, la tercera tarjeta dice "Registros totales" en vez de "Alertas totales".
- Los paneles de "por severidad" y "por tipo" se ocultan o muestran un placeholder neutro cuando no existen datos (hoy ya muestran "Sin datos", pero asegurar que no dependen de campos inexistentes en el tipo).
- Botones "Procesar ahora" y "Descargar consolidado" usan el tipo seleccionado.
- (Opcional, dentro de scope) Título de la tabla "Placas del día" se adapta si en Historial queremos mostrar una etiqueta distinta a "Alertas" en la columna numérica (p. ej. "Registros").

### Modifica
- [frontend/src/App.jsx](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/frontend/src/App.jsx)

### Test Requirements (TR)
- **TR-6.1 (rule)**: Sidebar muestra 3 botones habilitados: Alertas, Historial, Consolidado.
- **TR-6.2 (rule)**: Al cambiar a Historial, la tarjeta que antes mostraba "Alertas totales" muestra una etiqueta genérica (ej. "Registros totales"), sin que la página lance errores en consola.
- **TR-6.3 (rule)**: Para los tres tipos, el botón "Descargar consolidado" hace hit al endpoint correcto (revisar URL generada en href).
- **TR-6.4 (rule)**: Al presionar "Procesar ahora" sobre el tipo Consolidado, se llama a `POST /api/process/consolidado/:fecha` (sin errores 404).

---

## Task 7: Hardening, documentación final y checklist (Fase F)

Status: pending
Priority: medium

### Descripción
- Actualizar `README.md` con ejemplos de `npm run process` para historial y consolidado.
- Actualizar `Estado actual y mejoras pendientes.md`: cambiar "Proximo paso inmediato" si corresponde, marcar el estado de Historial como "Implementado (ingesta + consolidado)" y dejar backlog lo que siga pendiente (ej: vista de Historial de ejecuciones en el frontend, combustible, viajes).
- Ejecución final: correr el sistema con los archivos reales de `reportes_onway/_procesados/2026-09-17` y `2026-09-18` como muestra, y verificar que el consolidado, el fix de dirección y los tipos nuevos funcionan sin excepciones.
- Asegurar que el checklist del plan §9 se cumpla (marcar los items en memoria como evidencia, no es necesario editar el md del plan).

### Modifica
- [README.md](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/README.md)
- [Estado actual y mejoras pendientes.md](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/Estado%20actual%20y%20mejoras%20pendientes.md)

### Test Requirements (TR)
- **TR-7.1 (rule)**: `README.md` contiene al menos un ejemplo `npm run process -- --fecha X --tipo historial` y uno para `--tipo consolidado`.
- **TR-7.2 (rule)**: `Estado actual y mejoras pendientes.md` §2 "Estado actual por área" actualiza la fila de Historial (antes decía "Parcial — datos de ejecución en SQLite…") para reflejar el nuevo reporte de Onway y el reporte compuesto.
- **TR-7.3 (rule)**: Ejecución real de `POST /api/process/consolidado/2026-09-18` devuelve estado no-error y el `consolidado` apunta a un path existente en `_procesados/2026-09-18/REPORTE_CONSOLIDADO_2026-09-18.xlsx` (si se cuenta con archivos de historial de esa fecha; si no, verificar con alertas-only).
- **TR-7.4 (rule)**: Revisión manual (o script) del Excel generado para una placa real con Dirección vía HYPERLINK confirma que la celda contiene el texto de la dirección (no `[object Object]` ni la URL).
