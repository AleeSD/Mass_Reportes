# Especificación — Reporte de Historial, Consolidado Combinado y Corrección de Dirección

## 1. Problema, usuarios, metas y no-metas

### Problema
El sistema actual solo procesa **Alertas** desde la carpeta `reportes_onway`. Se requiere:
- Incorporar un nuevo tipo de reporte de Onway llamado **Historial** (log continuo de posición/estado por placa).
- Generar un **consolidado combinado** que una filas de Alertas + Historial por placa, en una sola línea de tiempo.
- Corregir tres columnas que hoy se guardan como `[object Object]` porque sus valores reales vienen embebidos en fórmulas de Excel (`Dirección`, `Estado GPS`, `Atención Alerta`).
- Renombrar la carpeta de entrada de `reportes_onway` a `alertas_onway` para evitar ambigüedad con el nuevo `historial_onway`.

### Usuarios
- Operadores de flota que consultan y descargan reportes diarios desde el dashboard.
- Equipo de datos/operaciones que revisa el Excel consolidado por placa.

### Metas
1. Soporte de ingesta independiente para Alertas e Historial, cada uno con su carpeta de entrada, plantilla de columnas, y archivo de salida propio.
2. Un tercer reporte **compuesto** (consolidado diario) que combina Alertas + Historial, hoja por placa, con una columna de "Origen del registro" y orden cronológico mezclado.
3. Ninguna celda del Excel de salida contiene `[object Object]`; las fórmulas `HYPERLINK`/`IF` literales usadas por Onway se resuelven al texto correcto.
4. El dashboard expone los tres reportes (Alertas, Historial, Consolidado) para procesar y descargar.
5. En documentación: la vista de ejecuciones pasadas existente se renombra de "Historial operativo" a "Historial de ejecuciones" para no confundirla con el nuevo reporte de Onway.

### No-metas (fuera de alcance)
- Activar Combustible o Viajes (siguen deshabilitados como en la actualidad).
- Implementar la vista de "Historial de ejecuciones" en el frontend (solo renombrar la sección en los docs de roadmap).
- Deduplicar filas coincidentes entre Alertas e Historial en la V1 (se deja como backlog, ambos orígenes se muestran con su columna de origen).
- Almacenar detalle fila por fila en SQLite (solo metadatos, como hoy).
- Guardar la URL del mapa extraída de `HYPERLINK` (solo se extrae el texto visible).

---

## 2. Requisitos funcionales

### RF-1: Renombre de carpetas y descubrimiento de archivos
- La ruta raíz de entrada pasa de `reportes_onway` a `alertas_onway` para alertas.
- Nueva raíz de entrada `historial_onway` para historial, con el mismo esquema de subcarpetas soportado (`setiembre/DD-MM-YYYY` y `YYYY-MM-DD/historial`).
- La raíz de salida `_procesados` se **comparte** en `alertas_onway/_procesados` (no hay un `_procesados` separado por tipo; los tres archivos `REPORTE_ALERTAS_*`, `REPORTE_HISTORIAL_*` y `REPORTE_CONSOLIDADO_*` van dentro de la misma carpeta `_procesados/YYYY-MM-DD/`).
- Si existe la carpeta antigua `reportes_onway` con datos, el sistema debe leerla como fallback (compatibilidad con datos históricos).

### RF-2: Tipo de reporte `historial` (ingesta y salida independiente)
- Nueva entrada `historial` en `config/reportes.yaml` con:
  - `hoja_origen: "Report History"`, `columna_placa: "Placa/Patente"`.
  - Columnas obligatorias: `Fecha`, `Hora`, `Placa/Patente`.
  - Plantilla de 18 columnas (Secuencia, Grupo, Alias, Placa/Patente, Tipo de carrocería, Empresa, Conductor, Fecha, Hora, Latitud, Longitud, Dirección, Alerta, Odómetro (Km), Zona/Marca, Velocidad (Km/h), Horómetro (Hrs), Notas).
  - `podar_columnas_vacias: true`.
  - `nombre_salida: "REPORTE_HISTORIAL_{fecha}.xlsx"`.
- En historial la columna `Alerta` **no es obligatoria** (la mayoría de filas son posición GPS sin evento); no debe invalidar filas.
- El procesamiento de Alertas no depende de Historial y viceversa: cada uno genera su archivo de salida independiente y sus metadatos en `runs` (tipo `alertas` / tipo `historial`).

### RF-3: Reporte compuesto — Consolidado diario (Alertas + Historial)
- Nueva sección `reportes_compuestos` en config, con al menos una entrada `consolidado_diario`:
  - `tipos_incluidos: ["alertas", "historial"]`.
  - `columna_origen: "Origen del registro"` (valores `"Alertas"` / `"Historial"`).
  - `orden_filas: "fecha_hora"`.
  - `podar_columnas_vacias: true`.
  - `nombre_salida: "REPORTE_CONSOLIDADO_{fecha}.xlsx"`.
- El consolidado:
  1. Requiere que ambos tipos base (alertas e historial) hayan sido procesados **primero** (llama a `processDay` para cada uno si no hay un run del día, o reutiliza los archivos ya generados).
  2. Por cada placa, une todas las filas de Alertas y de Historial en una sola hoja.
  3. La plantilla final es la **unión** de ambas plantillas, sin duplicar columnas comunes; las columnas exclusivas de un tipo quedan vacías en las filas del otro tipo.
  4. Agrega la columna "Origen del registro".
  5. Ordena filas por `Fecha` + `Hora` (cronológico mezclado).
  6. Aplica poda global de columnas vacías sobre el resultado unido.
  7. Guarda un `run` nuevo en SQLite con `tipo = "consolidado_diario"` (o similar), con sus propios conteos, resumen y logs.
- El consolidado no requiere archivos de entrada propios; usa los .xlsx ya normalizados de Alertas e Historial.

### RF-4: Corrección de fórmulas (Dirección, Estado GPS, Atención Alerta)
- Al leer el valor de una celda, si el valor recibido de ExcelJS es un objeto con `formula` (o equivalentemente `cellToString` devuelve un objeto/`[object Object]`), se intenta resolver:
  1. Patrón `HYPERLINK("url","texto")` → devolver `texto`.
  2. Patrón `IF(a=b, "X", Y)` con literales, incluido anidado → evaluar comparación literal y devolver la rama que corresponda.
- Si la fórmula no coincide con los patrones anteriores, se deja la celda **vacía** y se registra un `warn` en `logs` con columna, fila aproximada y placa; la ejecución **no** marca `ok`, sino `parcial` si todo lo demás salió bien.
- **Red de seguridad**: después de generar cualquier archivo de salida (incluido el consolidado), se escanea todo el libro en memoria buscando la cadena exacta `[object Object]` en cualquier celda. Si se encuentra:
  - Agregar un error al log.
  - Cambiar el estado de esa ejecución a `parcial` o `error` (nunca `ok`).
- Esta capa de resolución se aplica de forma **genérica** a todas las columnas de cualquier tipo de reporte, de modo que si Onway agrega una fórmula en otra columna en el futuro, no pase desapercibida.

### RF-5: API
- `/api/report-types` incluye `historial` y (como tipo virtual) `consolidado_diario` si así se decide, o bien consolidado se procesa a través de un endpoint dedicado.
- El endpoint `POST /api/process/:tipo/:fecha` acepta `alertas`, `historial`, y un nuevo valor `consolidado` (o el key del reporte compuesto) que dispara el procesamiento compuesto.
- `/api/download/consolidated/:tipo/:fecha` funciona con los tres tipos (`alertas`, `historial`, `consolidado`).
- `/api/summary/:tipo/:fecha` y `/api/days?tipo=...` funcionan para los tres tipos; para `consolidado`, la lista de días se obtiene como la intersección/unión de los días de los tipos incluidos.
- `/api/scheduler/status` incluye los tres tipos activos en `tipos_activos` / `ultimas_ejecuciones`.

### RF-6: Dashboard (frontend)
- El selector de tipos de reporte muestra Alertas, Historial, y Consolidado (este último con etiqueta "Consolidado").
- Las métricas del panel son configurables: "Alertas totales" debe etiquetarse como "Registros totales" (o similar) cuando el tipo no es alertas, y se oculta la severidad cuando no existe en ese tipo.
- Los botones de "Procesar ahora" y "Descargar consolidado" funcionan para los tres tipos.
- Se mantiene la búsqueda por placa, log de ejecución y detalle de columnas (conservadas / eliminadas) para todos los tipos.

### RF-7: Documentación y renombre conceptual
- En `Estado actual y mejoras pendientes.md`, la sección 6 ("Fase posterior: historial operativo") se renombra a **"Fase posterior: Historial de ejecuciones"**; todo el texto interno se ajusta en consecuencia.
- En `README.md`:
  - Se actualiza la estructura de carpetas mostrando `alertas_onway/` y `historial_onway/` junto a `_procesados/` con los tres nombres de archivo de salida.
  - El comando `npm run process -- --fecha ... --tipo alertas` se acompaña de ejemplos para `--tipo historial` y `--tipo consolidado`.
- En `plan-desarrollo-historial-y-fix-direccion.md` (este mismo plan), el checklist de criterios de terminado se marca conforme se implementa (no es necesario, pero sí en los docs de usuario).

---

## 3. Requisitos no funcionales

### RNF-1: Compatibilidad hacia atrás
- Si existe `reportes_onway/` pero no `alertas_onway/`, el sistema debe seguir encontrando archivos de alertas (fallback) para no romper días ya guardados.
- El nombre de salida `REPORTE_ALERTAS_{fecha}.xlsx` no cambia.

### RNF-2: Robustez frente a fórmulas
- Una fórmula no reconocida **no** detiene el procesamiento del resto de archivos ni del resto de columnas.
- Un solo `[object Object]` residual en la salida impide que la ejecución se marque `ok`.

### RNF-3: Tolerancia a tipos faltantes para el consolidado
- Si en un día hay solo Alertas y no hay Historial (o viceversa), el consolidado se genera igual (con las filas del tipo presente y las columnas del otro tipo vacías), marcando el run como `parcial` en vez de `error` si se desea advertir.

### RNF-4: Rendimiento
- El evaluador de fórmulas mínimo opera en O(1) por celda (regex / parseo simple), sin librerías extra de cálculo de Excel.
- La generación del consolidado reutiliza los archivos ya escritos para alertas e historial (vuelve a leerlos con ExcelJS) en vez de repetir la ingesta desde cero, a menos que no existan.

---

## 4. Restricciones, dependencias y supuestos

### Restricciones
- Sin nuevas dependencias de runtime. Se usa `exceljs`, `js-yaml`, `express`, `node-cron`, `node:sqlite` existentes.
- Node.js 20+ como mínimo (ya declarado).
- Sin detalle fila por fila en SQLite (solo metadatos).

### Dependencias
- ExcelJS lee fórmulas vía `cell.value.formula`. Se asume que el objeto celda expone `{ formula, result }` o similar (común en ExcelJS para celdas con fórmula sin valor precalculado).
- La estructura real del export de Historial sigue el análisis: hoja `Report History` con 18 columnas (documento plan §2.3).

### Supuestos (decisiones adoptadas desde el plan §7, marcadas si cambian)
1. `Zona` (Alertas) y `Zona/Marca` (Historial) son **columnas separadas** en el consolidado.
2. Orden de filas en el consolidado: **cronológico mezclado** por Fecha + Hora.
3. No se deduplican eventos repetidos entre Alertas e Historial en V1; la columna de origen los distingue.
4. Combustible y Viajes quedan **fuera** del consolidado combinado por ahora (reportes independientes).
5. Se siguen generando los tres archivos: individuales + combinado.
6. Se incluye la corrección de `Estado GPS` y `Atención Alerta` junto con `Dirección` (misma causa raíz).
7. Se agrega la columna **"Origen del registro"** en el consolidado.

---

## 5. Preguntas abiertas

Ninguna pendiente; se adoptaron las recomendaciones del plan de desarrollo §7 como supuestos operativos. Si negocio rectifica alguno, se ajustan las columnas/orden en config sin tocar el motor.

---

## 6. Criterios de aceptación

### Regla AC-1
El endpoint `GET /api/report-types` devuelve, al menos, entradas para `alertas`, `historial` y `consolidado` (o el key del reporte compuesto); `alertas` e `historial` vienen con `habilitado: true`.

### Regla AC-2
Dada una fecha con archivos de alertas en `alertas_onway/...` o en `reportes_onway/...` como fallback:
- `POST /api/process/alertas/:fecha` retorna `estado: "ok"` y genera `REPORTE_ALERTAS_*.xlsx`.
- El archivo **no** contiene la cadena `[object Object]` en ninguna celda.
- La columna `Dirección` contiene el texto visible del `HYPERLINK`, no la URL ni un objeto.
- Las columnas `Estado GPS` y `Atención Alerta` contienen el texto resuelto de sus `IF(...)` literales, no `[object Object]`.

### Regla AC-3
Dada una fecha con exports de historial en `historial_onway/setiembre/DD-MM-YYYY/` o `historial_onway/YYYY-MM-DD/historial/`:
- `POST /api/process/historial/:fecha` retorna `estado: "ok"` y genera `REPORTE_HISTORIAL_*.xlsx`.
- El archivo contiene la plantilla de 18 columnas y aplica poda de vacías.
- Fila con `Alerta == ""` no se descarta.

### Regla AC-4
Dada una fecha con ambos tipos procesados:
- `POST /api/process/consolidado/:fecha` genera `REPORTE_CONSOLIDADO_*.xlsx`.
- Por cada placa presente en cualquiera de los dos tipos, existe una hoja cuyo nombre es la placa.
- La hoja incluye la columna `"Origen del registro"` con valores `"Alertas"` y `"Historial"`.
- Dentro de cada hoja las filas están ordenadas por `Fecha` + `Hora` (validar tomando las primeras 3 y últimas 3 filas y comprobando el orden).
- Ninguna celda contiene `[object Object]`.
- La plantilla de columnas de la hoja es la unión (sin duplicar comunes) de las plantillas de Alertas e Historial.

### Regla AC-5
Si una celda contiene una fórmula distinta de `HYPERLINK` o `IF` literal (ej: `=SUM(1,2)`):
- Esa celda queda vacía en el archivo de salida.
- El log de la ejecución contiene al menos un `warn` con la columna y la placa afectada.
- El estado de la ejecución **no es** `"ok"`.

### Regla AC-6
Dashboard:
- La barra lateral muestra botones para Alertas, Historial y Consolidado.
- Al cambiar de tipo, el encabezado cambia de etiqueta y las métricas se adaptan (p. ej., no mostrar severidad para historial si no existe la columna).
- "Procesar ahora" y "Descargar consolidado" ejecutan las acciones correspondientes sin error.

### Rubrica AC-7 (Calidad de la abstracción del motor, 0-2)
- **2 (umbral)**: Los conceptos de `reporte base` vs `reporte compuesto` están separados en el código (p. ej., una función `processCompositeDay` distinta de `processDay` o un flag), y `config/reportes.yaml` usa una sección `reportes_compuestos` explícita; agregar Combustible al consolidado en el futuro solo requiere editar YAML.
- **1**: Funciona, pero el consolidado está hardcodeado como `alertas + historial` dentro de `processDay` y para incluir otro tipo hay que tocar código.
- **0**: El consolidado es un script ad-hoc fuera del motor, con rutas duplicadas.

### Rubrica AC-8 (Calidad del evaluador de fórmulas, 0-2)
- **2 (umbral)**: El evaluador está encapsulado en una función pura (p. ej., `resolveOnwayFormula(formulaText) -> string | { unresolved: true }`) en `helpers.js` o un módulo propio, con patrones claros para `HYPERLINK` e `IF` anidado; tiene cubrimiento evidente vía comentarios o estructura.
- **1**: La lógica está inline dentro de `normalize.js` y funciona, pero es difícil de extender.
- **0**: La corrección solo funciona para `Dirección`; `Estado GPS` y `Atención Alerta` siguen con `[object Object]` o no se contemplan fórmulas no reconocidas.
