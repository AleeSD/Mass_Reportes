# Estado actual y mejoras pendientes

Fecha de actualizacion: 2026-09-28  
Versión del proyecto: v1.4.0 (analítica de flota)

---

## 0. Novedades v1.4.0 — Hoja maestra de tiempos de flota + dashboard operativo

Implementado según `plan-desarrollo-hoja-maestra-y-dashboard-flota.md` (F0–F5 completas; F6 pendiente de días reales; F7 opcional no iniciada).

| Bloque | Estado |
|---|---|
| Configuración | ✅ `config/flota.yaml` (22 placas), `config/zonas.yaml`, `config/tiendas_mass.csv` (115 tiendas, generado con `npm run import:geocercas`), bloque `analitica_flota` en `reportes.yaml`, plantilla real de Historial (21 cols) |
| Motor `backend/src/engine/timeline/` | ✅ normalizeZone, buildEvents, cleanEvents, buildStays, buildTrips, metrics, fleetSheets, index (`buildFleetTimeline`). Solo filas de Alertas (H8) |
| Consolidado | ✅ Hojas `RESUMEN_FLOTA`, `VUELTAS`, `VISITAS` antes de las hojas por placa. Falla aislada → run `parcial`. `habilitado:false` = idéntico a v1.3 (probado) |
| SQLite | ✅ Tablas `fleet_days`, `fleet_trips`, `fleet_visits` (reemplazo por fecha en transacción) |
| API | ✅ `/api/fleet/timeline/:fecha`, `/:fecha/:placa`, `/stores/:fecha`, `/bsf-occupancy/:fecha`, `/config`, `/dates` |
| Dashboard | ✅ Vista "Operación de flota": KPIs, Gantt SVG, tabla maestra, histograma, 1.ª tienda por placa, ocupación BSF, ranking de tiendas (tienda/distrito/CD), calidad de datos, panel por placa, filtros empresa/tipo/placa/vuelta/CD. Por defecto "Ayer". Componentes compartidos extraídos a `frontend/src/components/ui.jsx` |
| Operación diaria (D6) | ✅ Scheduler revisa ayer + hoy, espera estabilidad de archivos (120 s), reprocesa solo si cambió la huella de entrada, registra cobertura "N de 22" |
| P0 cerrados | ✅ Suite `npm test` (node:test, 45 pruebas), mutex tipo+fecha (409), validación de fecha real |
| F6 — ajuste con datos reales | ⏳ Pendiente: correr 3–5 días desde el 28/09 (primer día completo con Base OS disponible el 29/09 8 am), recalibrar umbrales (paso por zona 3 min, rebote 10 min, estancia larga BSF 240 min) y revisar 3 placas a mano (≤ 1 min de diferencia) |

Decisión de implementación a validar en F6: cuando un equipo no reporta `Vehículo encendido` ni `Se movio` (BXT-918 el 27/09), el inicio de jornada es el primer evento del día marcado **estimado** (coincide con la prueba de oro de §7.4 del plan).

---

## 1. Resumen ejecutivo v1.3

El proyecto ya cuenta con una versión **operativa y rediseñada** que soporta **3 tipos de reporte Onway** (Alertas, Historial de posiciones, Consolidado combinado), con **redireccionamiento definitivo de carpetas de entrada/salida por mes** y un **Dashboard Profesional en tema claro** construido sobre Tailwind v4 + Recharts.

Estado a la fecha:

| Bloque | Estado |
|---|---|
| Motor de procesamiento Alertas | ✅ Operativo — 20 archivos por día, 0 `[object Object]`, fórmulas Onway resueltas |
| Motor de procesamiento Historial | ✅ Configurado, habilitado en YAML, pendiente export real Onway para validar plantilla 18 cols |
| Consolidado combinado Alertas + Historial | ✅ Operativo — columna `Origen del registro`, mezcla cronológica |
| Carpetas de entrada | ✅ `alertas_onway/` y `historial_onway/` (múltiples raíces fallback de lectura) |
| Carpetas de salida | ✅ `consolidados_onway/_procesados/<mes>/<YYYY-MM-DD>/REPORTE_*.xlsx` — validado con CLI real Septiembre |
| Compatibilidad legacy (sin carpeta de mes) | ✅ `findExistingOutputPath` busca y permite descargar consolidados anteriores |
| Dashboard Profesional (rediseño Figma) | ✅ Build exitoso, Tailwind v4.1 + Recharts + lucide-react, conectado 100% a API real |
| Scheduler | ✅ Cada 10 min, orden Alertas → Historial → Consolidado |
| SQLite metadatos | ✅ Guarda runs/logs (no detalle de filas). Usa `node:sqlite` → requiere **Node 22+** |
| Parser fórmulas Onway | ✅ `resolveOnwayFormula` en helpers.js: `HYPERLINK` y `IF` anidados literales |
| Hardening / pruebas | ✅ v1.4: `npm test` (node:test) + mutex tipo+fecha + validación de fecha real |
| Viajes / Combustible | 🟡 Configurado skeleton en YAML, `habilitado:false`, pendientes exports reales |
| Historial de ejecuciones (vista) | 🟡 Datos en SQLite + `/api/runs`, falta vista frontend con filtros |

Orden de trabajo actualizado:

1. ~~Preparar el núcleo~~ ✅
2. ~~Historial + Consolidado combinado~~ ✅
3. ~~Redireccionar carpetas a estructura `<mes>/`~~ ✅
4. ~~Rediseñar dashboard profesional (Figma)~~ ✅
5. **Hardening + pruebas automatizadas del motor** (actualmente P0)
6. **Historial de ejecuciones vista frontend** (P1)
7. Validar export real de Historial (Report History)
8. **Viajes** (export real + plantilla + dashboard)
9. **Combustible** (export real + plantilla + dashboard)
10. **Implementaciones avanzadas** (ver capítulo 11 en adelante)

---

## 2. Estado actual por área (v1.3)

| Area | Estado | Situacion actual |
|---|---|---|
| **Ingesta de alertas** | ✅ Operativo | Lee `.xlsx` de `alertas_onway/` + fallback `reportes_onway/`. Ignora `~$`. Estructuras: `<mes>/<DD-MM-YYYY>/alertas/*.xlsx` y `<YYYY-MM-DD>/alertas/*.xlsx` |
| **Ingesta de historial (Onway)** | ✅ Configurado | Carpeta `historial_onway/`, plantilla 18 cols, hoja `Report History`. Falta testear con export real. |
| **Consolidado combinado Alertas+Historial** | ✅ Operativo | Usa `findExistingOutputPath` para evitar reprocesar tipos base. Columna `Origen del registro`, orden por `Fecha+Hora`, poda global. |
| **Resolución Dirección / Estado GPS / Atención Alerta** | ✅ Operativo | Mini-parser `resolveOnwayFormula`. Red de seguridad: `scanWorkbookForObjectObject` ejecutado post-escritura → marca `parcial` si detecta. |
| **Rutas de salida con carpeta de mes** | ✅ Operativo | `resolveOutputPath` interpola nombre mes español entre raíz y fecha ISO. Nombres: enero, febrero, marzo, abril, mayo, junio, julio, **agosto, setiembre**, octubre, noviembre, diciembre (con variantes: `Septiembre`, `septiembre`, `sep`). |
| **Compatibilidad hacia atrás (lectura)** | ✅ Operativo | `findExistingOutputPath` busca: (1) `<raiz>/<mes>/<iso>/<arch>`, (2) variantes nombre de mes, (3) legacy `<raiz>/<iso>/<arch>`, para **todas** las roots fallback. |
| **Normalizacion** | ✅ Operativo | Mapeo por nombre columna, no posición. Detecta fila de encabezados. Integra `resolveOnwayFormula` celda por celda. |
| **Poda columnas vacías** | ✅ Operativo | Global (todo el día), no por hoja. Conserva `Origen del registro` cuando es consolidado. |
| **Consolidado Excel** | ✅ Operativo | Una hoja por placa (agrupa archivos repetidos). Formato, autofiltro, congelación, anchos. |
| **Errores por archivo** | ✅ Operativo | Un archivo corrupto no detiene el resto. Fórmula mal parseada → `warn` + estado `parcial`. |
| **Metadatos y logs SQLite** | ✅ Operativo | `node:sqlite` → **Node 22.x mínimo obligatorio**. Guarda runs de los 3 tipos + conteos + resumen placas + logs detallados. NO guarda detalle fila x fila. |
| **API REST** | ✅ Operativo (3 tipos + scheduler) | `/health`, `/report-types`, `/days`, `/summary`, `/process`, `/runs`, `/download/consolidated/:tipo/:fecha`, `/download/original/:tipo/:fecha/:placa`, `/scheduler/status`. Todos los endpoints validan `habilitado`. |
| **Dashboard Profesional (rediseño)** | ✅ Operativo | Tema claro `#F4F6FA` / cards blancas / primary `#1D4ED8`. Tailwind v4.1 con `@tailwindcss/vite`. Sidebar navegación 4 secciones (Dashboard + 3 reportes). KPIs, Bar Top10, Pie donut, AreaChart, Ranking. Selector fecha dropdown + date nativo, auto-refresh toggle, botón Procesar con spinner, Descargar condicional, logs por placa, toggle columnas podadas. |
| **Scheduler** | ✅ Operativo | `*/10 * * * *` zona `America/Lima`. Orden: tipos base (Alertas → Historial) → compuesto (Consolidado). |
| **Tipos consolidado** | ✅ Operativo | **3 tipos** habilitados: Alertas solo, Historial solo, Consolidado combinado. Los 3 usan `resolveOutputPath` y caen en `<mes>/<iso>/`. |
| **Combustible** | 🟡 Skeleton | `habilitado:false` en YAML. Carpeta `combustible_onway/`. Pendiente export real para definir plantilla. |
| **Viajes** | 🟡 Skeleton | `habilitado:false` en YAML. Carpeta `viajes_onway/`. Pendiente export real para definir plantilla. |
| **Historial ejecuciones (vista)** | 🟡 Parcial | Datos en `/api/runs`. Falta vista frontend: filtros tipo/fecha/estado, paginación, enlaces descarga, logs históricos. |
| **Pruebas automatizadas** | ✅ Operativo (v1.4) | `npm test`: 45 pruebas con reportes reales como fixtures (`backend/test/`). |
| **Analítica de flota** | ✅ Operativo (v1.4) | Motor `engine/timeline/` → hojas RESUMEN_FLOTA / VUELTAS / VISITAS en el consolidado, tablas `fleet_*` en SQLite, endpoints `/api/fleet/*`, vista "Operación de flota". Ver §0. |

---

## 3. Lo que ya esta implementado (detalle ténico)

### 3.1 Carpetas de entrada y salida (OFICIALES v1.3)

```
📁 REPORTE ALERTAS ONWAY/
│
├── 📁 alertas_onway/                 ← ENTRADA: reportes individuales x placa de ALERTAS
│   ├── 📁 setiembre/                 │   Estructura 1 (actual Onway):
│   │   └── 📁 24-09-2026/
│   │       └── 📁 alertas/
│   │           ├── AAR-880.xlsx
│   │           ├── AJQ-739.xlsx
│   │           └── ...
│   └── 📁 2026-09-24/                │   Estructura 2 (recomendada ISO):
│       └── 📁 alertas/
│           └── *.xlsx
│
├── 📁 historial_onway/               ← ENTRADA: reportes individuales x placa de HISTORIAL
│   ├── 📁 setiembre/
│   │   └── 📁 24-09-2026/
│   │       └── 📁 historial/
│   │           └── *.xlsx
│   └── 📁 2026-09-24/
│       └── 📁 historial/
│           └── *.xlsx
│
├── 📁 combustible_onway/             ← ENTRADA (future, skeleton)
└── 📁 viajes_onway/                  ← ENTRADA (future, skeleton)
│
└── 📁 consolidados_onway/            ← SALIDA OFICIAL (escritura desde v1.3)
    └── 📁 _procesados/
        ├── 📁 setiembre/             │   ⚠️ CARPETA DE MES (nuevo v1.3)
        │   └── 📁 2026-09-24/
        │       ├── REPORTE_ALERTAS_2026-09-24.xlsx          ← Consolidado separado (solo alertas)
        │       ├── REPORTE_HISTORIAL_2026-09-24.xlsx        ← Consolidado separado (solo historial)
        │       └── REPORTE_CONSOLIDADO_2026-09-24.xlsx      ← Consolidado COMBINADO
        └── 📁 2026-09-24/           │   ⚠️ LEGACY (antes v1.3, sin mes — solo lectura, no escritura)
            └── *.xlsx               │   Soportado por findExistingOutputPath
```

**Convenciones de nombres de mes** (escritura + lectura, en [paths.js](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/paths.js#L54-L85) función `monthFolderNames`):
- Español, minúsculas, sin tildes.
- **Para septiembre: siempre `setiembre`** (no `septiembre`) — coincide con cómo Onway nombra la carpeta en la entrada real.
- Variantes de lectura soportadas (para encontrar carpetas existentes): `Septiembre`, `Septiembre`, `sep`, `09`, `9`.

### 3.2 Resolución de rutas (core del cambio v1.3)

Todo el flujo de I/O se centraliza en [paths.js](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/paths.js). Funciones clave:

| Función | Propósito |
|---|---|
| `inputRoots(config, reportType)` | Devuelve raíces de **lectura** para el tipo (principal + fallbacks). |
| `outputRoots(config)` | Devuelve raíces de **lectura/escritura** de consolidados (principal + todos los `raiz_salida_fallback` de YAML como array). |
| `monthFolderNames(isoDate)` | Devuelve array de posibles nombres de carpeta de mes (principal primero). |
| `discoverInputPaths(config, reportType, isoDate)` | Busca archivos .xlsx de entrada en las 2 convenciones de carpetas. Profundidad máxima 4. |
| `discoverAvailableDates(config, reportType)` | Lista ISO dates disponibles. **Busca en 2 niveles**: primero directo `<raiz>/YYYY-MM-DD`, luego `<raiz>/<mes>/YYYY-MM-DD` (caso mes en carpeta). |
| `resolveOutputPath(config, isoDate, reportType)` | ⚡ **SOLO ESCRITURA**: devuelve path definitivo `consolidados_onway/_procesados/<mes>/<iso>/REPORTE_<TIPO>_<iso>.xlsx`. **No chequea existencia**. |
| `ensureOutputDir(config, isoDate, reportType)` | Crea con `mkdir -p` el path de `resolveOutputPath` (solo para los dirs). |
| `findExistingOutputPath(config, isoDate, reportType)` | ⚡ **SOLO LECTURA / DECISIÓN DE EXISTENCIA**. Prueba en orden: (1) path nuevo con mes principal, (2) variantes de nombre de mes, (3) legacy sin mes. Repite para TODAS las `outputRoots`. Retorna `string` (primer match) o `null`. |

**Fix importante aplicado 2026-09-24**: `raiz_salida_fallback` en YAML es un **array** (`- "consolidados/_procesados"`, etc.), no un string. `outputRoots` en paths.js itera el arreglo con `Array.isArray()` guard clause.

### 3.3 Flujo de procesamiento de un día

Archivo orquestador: [processDay.js](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/processDay.js).

**Para tipo BASE (alertas, historial, futuros viajes, combustible):**

```
processDay(config, tipo, fecha)
  → discoverInputPaths(tipo, fecha) → [archivos xlsx]
  → por cada archivo:
      → normalizeFile(file, tipo) → {placa, rows: [...], status, log}
      → rows pasa por resolveOnwayFormula por cada celda
      → detecta columnas obligatorias faltantes → error
  → por placa:
      → mergea filas de múltiples archivos con misma placa (nunca ABC123 + ABC123-2)
  → unionColumns(plantilla, dataSet, {podar_vacias})
  → writeConsolidatedWorkbook(dataSet, resolveOutputPath, plantilla)
  → post-escritura: scanWorkbookForObjectObject → si detecta, marca estado=parcial
  → inserta run en SQLite
  → retorna summary
```

**Para tipo COMPUESTO (solo consolidado_diario hasta v1.3):**

```
processCompositeDay(config, tipo, fecha)
  → por cada tipos_incluidos: [alertas, historial]
      → existing = findExistingOutputPath(tipo_base, fecha)
      → si NO existe → llama processDay(tipo_base, fecha)
      → carga existing (o recién generado) workbook con ExcelJS
  → une hojas por nombre de placa
  → añade columna "Origen del registro" = etiqueta del tipo
  → ordena filas: Fecha + Hora (empate Alertas primero)
  → unionColumns(plantilla_union, merged, {podar_vacias})
  → writeConsolidatedWorkbook() a resolveOutputPath
  → anti-[object Object] scan
  → inserta run SQLite
```

### 3.4 Parser fórmulas Onway (helpers.js)

En [helpers.js](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/helpers.js):

```
resolveOnwayFormula(cellValue)
  - Si cell es string → retorna string (no-op)
  - Si cell es objecto {formula: "...", result: undefined} (exceljs lee asi formulas no calculadas)
      → Caso 1: HYPERLINK(url, "texto") → retorna "texto"
      → Caso 2: IF(cond,"A",IF(cond2,"B","C")) literales con strings → retorna resultado aplicando IFs anidados (sin evaluar cond numérico, solo si cond es el literal mismo o los args son constantes literales)
      → Caso 3: no reconocida → retorna (formula as string) o ""; emite warn
  - Default: retorna .text || String(value)

scanWorkbookForObjectObject(path_xlsx)
  - Reabre el xlsx con ExcelJS DESPUES de escribirlo
  - Escanea TODAS las celdas NO VACIAS de TODAS las hojas
  - Si String(valor).includes("[object Object]") → retorna conteo > 0
  - El llamador (processDay) marca estado "parcial" y agrega warn a logs
```

### 3.5 Plantillas actuales en [reportes.yaml](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/config/reportes.yaml)

| Tipo | Plantilla cols | Obligatorias |
|---|---|---|
| `alertas` (25 cols) | Secuencia, Grupo, Alias, Placa/Patente, IMEI, Tipo carrocería, Empresa, Conductor, Fecha, Hora, Latitud, Longitud, Dirección, Alerta, Odómetro, Zona, Velocidad, Horómetro, % Batería, Fecha GPS, Hora GPS, **Estado GPS**, **Atención Alerta**, Fecha Reg. At., Hora Reg. At. | Fecha, Hora, Alerta, Placa/Patente |
| `historial` (21 cols, v1.4) | Secuencia, Grupo, Alias, Placa/Patente, Etiquetas, IMEI, Tipo carrocería, Empresa, Conductor, Fecha, Hora, Latitud, Longitud, Dirección, Alerta, Odómetro, **Zona/Marca**, Velocidad, Horómetro, % Batería, **Notas** | Fecha, Hora, Placa/Patente |
| `consolidado` (union) | Secuencia, Grupo, Alias, Placa/Patente, **Origen del registro**, IMEI, Tipo carrocería, Empresa, Conductor, Fecha, Hora, Latitud, Longitud, Dirección, Alerta, Odómetro, Zona, Zona/Marca, Velocidad, Horómetro, % Batería, Fecha GPS, Hora GPS, Estado GPS, Atención Alerta, Fecha Reg. At., Hora Reg. At., Notas | (lo hereda de cada tipo base) |

**Hojas de analítica de flota (v1.4)** — solo en `REPORTE_CONSOLIDADO`, antes de las hojas por placa: `RESUMEN_FLOTA` (una fila por placa de `flota.yaml`), `VUELTAS` (placa × vuelta, hasta 7 tiendas en bloques de 6 columnas), `VISITAS` (una fila por estancia). Leyenda en la fila 2, encabezados agrupados en la fila 3, columnas en la fila 4; horas como valor de hora de Excel.

**Orden exacto de columnas del consolidado**: el primero que lo definió fue `plan-desarrollo-historial-y-fix-direccion.md §4.2`. No modificarlo sin actualizar también la documentación.

### 3.6 API REST (endpoints actuales)

Servidor: [api.js](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/api.js). Express 5.x, CORS habilitado.

| Método | Path | Descripción |
|---|---|---|
| GET | `/api/health` | `{ ok: true, version }` |
| GET | `/api/report-types` | Devuelve los tipos + flags `es_compuesto`, `tipos_incluidos`, `habilitado`. Usado por sidebar del dashboard. |
| GET | `/api/scheduler/status` | `{ habilitado, cron, timezone, next_run, last_run, procesando }` |
| GET | `/api/days?tipo=<key>` | Fechas ISO disponibles (usa `discoverAvailableDates`). Para compuestos une de tipos base. |
| GET | `/api/summary/:tipo/:fecha` | Resumen de ejecución guardado en SQLite (si existe), más `consolidado_existe: !!findExistingOutputPath(tipo,fecha)`. |
| POST | `/api/process/:tipo/:fecha` | Ejecuta `processDay` o `processCompositeDay`. Retorna summary igual que CLI. **Valida `habilitado` y retorna 400 si false**. |
| GET | `/api/runs?tipo=&fecha_desde=&fecha_hasta=&estado=&limit=&offset=` | Historial de ejecuciones SQLite (filtros parcialmente implementados, paginación pendiente). |
| GET | `/api/download/consolidated/:tipo/:fecha` | Descarga `REPORTE_*.xlsx`. Usa `findExistingOutputPath`; si null y hay run reciente, fallback a `resolveOutputPath`. |
| GET | `/api/download/original/:tipo/:fecha/:placa` | Descarga el .xlsx original que subió el usuario (**solo tipos base**). Retorna 400 para compuestos. |
| GET | `/api/fleet/dates` | (v1.4) Fechas con análisis de flota + `hoy` / `ayer`. |
| GET | `/api/fleet/timeline/:fecha` | (v1.4) KPIs, placas (espejo de RESUMEN_FLOTA), vueltas, visitas, calidad. `{ generado:false }` si el día no tiene análisis. |
| GET | `/api/fleet/timeline/:fecha/:placa` | (v1.4) Línea de tiempo de una placa + enlace al archivo original. |
| GET | `/api/fleet/stores/:fecha` | (v1.4) Ranking de tiendas: visitas, hora media de llegada, permanencia, distrito, CD. |
| GET | `/api/fleet/bsf-occupancy/:fecha` | (v1.4) Vehículos dentro de BSF por franja (15 min). |
| GET | `/api/fleet/config` | (v1.4) Flota, zonas, catálogo y parámetros vigentes (solo lectura). |

Desde v1.4 `POST /api/process/...` responde **409** si ya hay un proceso del mismo tipo y fecha (mutex en `backend/src/locks.js`), y las rutas con `:fecha` rechazan fechas imposibles (400).

### 3.7 Scheduler (orden dependencias)

[scheduler.js](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/scheduler.js). Usa `node-cron`.

**Orden fijo (HARD CONSTRAINT — no cambiar sin confirmar):**
1. Procesar `alertas` (base)
2. Procesar `historial` (base)
3. Procesar `consolidado` (compuesto → lee 1 y 2)

Esto es porque processCompositeDay no regenera tipos base si ya existen; pero scheduler siempre reintenta para garantizar que consolidado sea lo más actualizado posible.

### 3.8 Base de datos SQLite (solo metadatos)

[db.js](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/db.js). Usa `import { DatabaseSync } from "node:sqlite"`.

⚠️ **Requisito NO negociable**: Node.js **v22.0+** porque `node:sqlite` fue agregado en Node 22.

```sql
-- Tabla runs (una fila por ejecución exitosa o parcial de tipo+fecha)
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL,            -- 'alertas' | 'historial' | 'consolidado_diario' | ...
  key_publico TEXT NOT NULL,     -- 'alertas' | 'historial' | 'consolidado' | ...
  estado TEXT NOT NULL,          -- 'ok' | 'parcial' | 'error' | 'sin_archivos'
  archivos INTEGER DEFAULT 0,    -- cuantos xlsx encontró en entrada
  ok INTEGER DEFAULT 0,          -- cuantos se procesaron bien
  error INTEGER DEFAULT 0,       -- cuantos fallaron
  total_registros INTEGER DEFAULT 0,
  total_alertas INTEGER DEFAULT 0,-- solo alertas y consolidado; historial puede usar 0
  consolidado_path TEXT,         -- path absoluto al xlsx generado
  resumen_json TEXT,             -- JSON stringify: {placas: [{placa, filas, status, error?}], por_tipo: {...}, podadas: [...], ...}
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  UNIQUE(fecha, tipo, started_at)
);

-- Tabla logs (detalle por archivo procesado; run_id FK a runs.id)
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL,           -- 'info' | 'warn' | 'error'
  origen TEXT,                   -- nombre archivo o 'global'
  mensaje TEXT NOT NULL,
  detalles_json TEXT,            -- {placa?, campo_faltante?, formula?, ...}
  created_at TEXT NOT NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_runs_fecha ON runs(fecha);
CREATE INDEX IF NOT EXISTS idx_runs_tipo  ON runs(tipo);
CREATE INDEX IF NOT EXISTS idx_runs_estado ON runs(estado);
CREATE INDEX IF NOT EXISTS idx_logs_run_id ON logs(run_id);
```

**Tablas v1.4 (analítica de flota)** — ver `db.js`: `fleet_days` (KPIs y filas de placas por fecha), `fleet_trips` (una fila por vuelta, tiendas en `tiendas_json`), `fleet_visits` (una fila por estancia). Todas con `run_id` → `runs(id) ON DELETE CASCADE`; reprocesar un día borra e inserta sus filas en una transacción. Horas en texto `YYYY-MM-DD HH:MM:SS` (hora de Lima).

**Importante**: los `.xlsx` son la **source of truth**. SQLite solo guarda metadata para dashboard. Si eliminas un `.xlsx` de `_procesados/`, la data sigue apareciendo en `/api/runs` hasta que borres la fila manualmente. Dashboard marca `consolidado_existe=false` si `findExistingOutputPath` no encuentra archivo aunque exista run en SQLite.

---

## 4. Stack técnico y arquitectura de archivos

### 4.1 Dependencias por paquete

**Raíz ([package.json](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/package.json)):**

| Package | Versión | Uso |
|---|---|---|
| Node | **≥22** (no menor) | Obligatorio por `node:sqlite` |
| `express` | ^5.1.0 | API REST (v5) |
| `exceljs` | ^4.4.0 | Leer/escribir XLSX |
| `cors` | ^2.8.5 | CORS API |
| `js-yaml` | ^4.1.0 | Parsear `config/reportes.yaml` |
| `node-cron` | ^4.2.1 | Scheduler |
| `concurrently` | ^9.2.1 | (dev) Correr api+web juntos |

**Frontend ([frontend/package.json](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/frontend/package.json)):**

| Package | Versión | Uso |
|---|---|---|
| `react` | ^19.1.1 | UI framework |
| `react-dom` | ^19.1.1 | Render DOM |
| `vite` | ^7.1.5 | Bundler / dev server |
| `@vitejs/plugin-react` | ^5.0.2 | Plugin React para Vite |
| **`tailwindcss`** | **^4.1.12** | **⚠️ Tailwind v4** (no v3). No necesita PostCSS config. |
| **`@tailwindcss/vite`** | **^4.1.12** | **Plugin oficial Vite para Tailwind v4** (reemplaza `postcss.config`). |
| `recharts` | ^2.15.2 | Gráficos: BarChart, PieChart (donut), AreaChart, ResponsiveContainer, Cell, Legend, Tooltip |
| `lucide-react` | ^0.487.0 | Iconos: ShieldCheck, FileWarning, History, LayoutDashboard, AlertTriangle, TrendingUp, Download, PlayCircle, RefreshCw, CheckCircle, XCircle, AlertCircle, Search, Car, Clock, Calendar, BarChart3, etc. |
| `clsx` | ^2.1.1 | Utility condicional className |
| `tailwind-merge` | ^3.2.0 | twMerge → combina clases Tailwind sin conflictos |
| `tw-animate-css` | ^1.3.8 | Animaciones CSS listas (fade-in, etc.) |

### 4.2 Setup Tailwind v4 (NO PostCSS, NO config)

Frontend Vite está configurado con la vía **oficial de Tailwind v4 para Vite**:

- [frontend/vite.config.js](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/frontend/vite.config.js):
  ```js
  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
  import tailwindcss from "@tailwindcss/vite"     // ← ESTE plugin, no postcss

  export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } }
  })
  ```

- [frontend/src/index.css](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/frontend/src/index.css):
  ```css
  @import './styles/fonts.css';      /* Google Fonts: Plus Jakarta Sans + JetBrains Mono */
  @import './styles/tailwind.css';   /* @import 'tailwindcss' source(none) + @source glob */
  @import './styles/theme.css';      /* @theme inline + variables CSS + @layer base */
  ```

- [frontend/src/styles/theme.css](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/frontend/src/styles/theme.css):
  ```css
  :root {
    --font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, monospace;
    --background: #F4F6FA;
    --card: #FFFFFF;
    --primary: #1D4ED8;
    --primary-foreground: #FFFFFF;
    --radius: 0.75rem;
    --sidebar: #FFFFFF;
    --sidebar-foreground: #0F172A;
    --muted: #64748B;
    --border: #E2E8F0;
  }

  @theme inline {
    --font-sans: var(--font-sans);
    --font-mono: var(--font-mono);
    --color-background: var(--background);
    --color-card: var(--card);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --radius-lg: var(--radius);
    ...
  }
  ```

**Para agregar un color nuevo**, solo modifica `theme.css`, no hay `tailwind.config`.

### 4.3 Arquitectura de archivos del repo

```
📁 REPORTE ALERTAS ONWAY/
├── package.json                       ← root, scripts dev/process/postinstall
├── README.md                          ← docs operativos (leer antes de instalar)
├── plan-desarrollo-sistema-reportes-flota.md
├── plan-desarrollo-historial-y-fix-direccion.md
├── Estado actual y mejoras pendientes.md   ← ESTE ARCHIVO (referencia central)
├── config/
│   ├── reportes.yaml                 ← ✅ ÚNICA fuente de tipos de reporte + bloque analitica_flota
│   ├── flota.yaml                    ← (v1.4) 22 placas: empresa, tipo OS/MASS, alias
│   ├── zonas.yaml                    ← (v1.4) BSF, Base OS, patrón de tienda, textos de alerta
│   └── tiendas_mass.csv              ← (v1.4) catálogo generado por scripts/import-geocercas.js
├── scripts/
│   └── import-geocercas.js           ← (v1.4) GEOCERCAS.xlsx → config/tiendas_mass.csv
├── backend/
│   └── src/
│       ├── index.js                  ← entrypoint. Monta express + scheduler. PORT=3001
│       ├── api.js                    ← rutas REST
│       ├── cli.js                    ← node backend/src/cli.js --fecha YYYY-MM-DD --tipo alertas|historial|consolidado|...
│       ├── config.js                 ← carga YAML, helpers getReportType / getCompositeReport
│       ├── db.js                     ← SQLite sync node:sqlite (Tablas runs + logs)
│       ├── scheduler.js              ← node-cron cada 10min (v1.4: ayer+hoy, estabilidad, huella)
│       ├── locks.js                  ← (v1.4) mutex tipo+fecha
│       ├── runner.js                 ← (v1.4) runReport = mutex + proceso + huella de entrada
│       └── engine/                   ← ✅ núcleo común (todo tipo de reporte reutiliza esto)
│           ├── paths.js              ← input/output roots, month folders, findExisting
│           ├── helpers.js            ← resolveOnwayFormula, anti-objectObject, utils
│           ├── normalize.js          ← lee un xlsx y lo normaliza a rows+placa
│           ├── consolidate.js        ← unionColumns, writeConsolidatedWorkbook (hojas por placa, estilos)
│           ├── processDay.js         ← orquesta todo (processDay base / processCompositeDay)
│           └── timeline/             ← (v1.4) motor de línea de tiempo de flota + hojas Excel
│   └── test/                         ← (v1.4) node:test + fixtures reales
└── frontend/
    ├── package.json
    ├── vite.config.js                ← Tailwind v4 plugin + proxy /api a 3001
    └── src/
        ├── main.jsx                  ← ReactDOM.createRoot. Importa ./index.css
        ├── App.jsx                   ← shell + vistas Dashboard / reportes
        ├── lib/                      ← (v1.4) api.js, fleetFormat.js
        ├── components/ui.jsx         ← (v1.4) KpiCard, SectionCard, StatusBadge, DateSelector…
        ├── components/fleet/         ← (v1.4) FleetView, FleetGantt, FleetMasterTable, FleetCharts, StoreRanking, QualityPanel, PlateDetailPanel
        ├── App.css                   ← placeholder, estilos en Tailwind
        ├── index.css                 ← imports fonts/tailwind/theme
        └── styles/
            ├── fonts.css             ← @import Google Fonts
            ├── tailwind.css          ← Tailwind v4 @import + @source glob
            └── theme.css             ← Design tokens @theme inline
```

### 4.4 Arquitectura del Dashboard (App.jsx)

[App.jsx](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/frontend/src/App.jsx) es monolítico (single file) y compone todo el UI.

**App Shell**:
- Sidebar izquierdo: logo, nav (Dashboard, Alertas, Historial, Consolidado), lista de tipos reportes con badges, estado scheduler.
- TopBar: título sección, toggle auto-refresh, selector fecha dropdown (populado con `/api/days`), input date nativo, botón Procesar (con spinner loading), botón Descargar (visible solo si `consolidado_existe=true`).
- `view` state: `dashboard` | `alertas` | `historial` | `consolidado`

**Sub-componentes internos (definidos en el mismo App.jsx, no separados a archivos aún)**:
```
<StatusBadge estado>                 ← ok=emerald | error=red | parcial=amber | sin_archivos=slate
<KpiCard label, value, icon, trend>  ← cards métricas con icon lucide y delta
<SectionCard title, action>          ← wrapper con sombra suave
<AlertTypeBars por_tipo>             ← BarChart horizontal minúsculo por tipo de alerta
<DashboardOverview summary>          ← 4 KPI + BarChart Top10 Placas + Pie Donut Tipos + AreaChart Hora + Ranking Top5 + Tipos/Severidad
<ReportView tipo, summary, reportType>  ← 5 Stats cards + Search bar + Placas Table (con toggle columnas podadas, descarga original por placa, tooltip si error) + Alert Types + Severidad (si aplica) + Logs panel
```

**Data Flow (hooks principales)**:
- `useEffect` on mount: `loadReportTypes`, `loadSchedulerStatus`
- `useEffect [tipo, fecha]`: `loadDays` → `loadSummary`
- `timerRef = setInterval` con `autoRefresh=true`
- `handleProcessNow`: POST `/api/process/:tipo/:fecha` → actualiza summary, setea loading, muestra banner si error.
- `handleDownload`: abre `/api/download/consolidated/...` en nueva pestaña.

> Nota: en `App.tsx` original del rediseño (carpeta `Rediseño de Dashboard Profesional/`) los datos eran hardcodeados (`PLATES`, `ALERT_TYPES`, `HOURLY_DATA`). En el dashboard real de production todos se derivan con `useMemo` a partir de `summary.run.resumen.placas`, `por_tipo`, etc.

---

## 5. Convenciones de nombres y estilo

| Área | Convención | Ejemplo |
|---|---|---|
| Carpetas entrada | `<tipo>_onway` plural | `alertas_onway`, `historial_onway`, `viajes_onway`, `combustible_onway` |
| Carpeta salida | `consolidados_onway/_procesados/<mes>/<YYYY-MM-DD>/` | `consolidados_onway/_procesados/setiembre/2026-09-24/` |
| Nombre mes carpeta | **sin tildes, minúsculas**, "setiembre" con e | `enero, febrero, ..., setiembre, octubre` |
| Nombre archivo salida | `REPORTE_<TIPO>_YYYY-MM-DD.xlsx` | `REPORTE_ALERTAS_2026-09-24.xlsx` |
| Key tipo de reporte | singular, snake_case | `alertas`, `historial`, `consolidado_diario` |
| Key público tipo | corto, URL-friendly, plural o semilla de `consolidado` | `alertas`, `historial`, `consolidado` |
| Estados run | 4 valores fijos | `ok` \| `parcial` \| `error` \| `sin_archivos` |
| Niveles log | 3 valores fijos | `info` \| `warn` \| `error` |
| Columna merge consolidado | siempre `Origen del registro` | valores `"Alertas"` \| `"Historial"` (humanos, no IDs) |
| Variables entorno | `.env` en raíz (opcional) | `PORT=3001`, `VITE_API_BASE_URL` |

---

## 6. Pendientes técnicos P0, P1, P2

### 6.1 Prioridad P0 — Hardening / Estabilidad (HACER ANTES que nuevas implementaciones avanzadas)

| Item | Detalle | Cómo validar |
|---|---|---|
| ~~**Pruebas automatizadas motor**~~ ✅ v1.4 (`npm test`, 45 pruebas; falta ampliar a encabezados desordenados / archivo corrupto / coverage) | Escribir test suite (Vitest o Jest) con samples xlsx mínimo. Cases obligatorios: encabezados desordenados, cols faltantes, arch corrupto, 2 archivos misma placa, 2 estructuras carpetas, poda cols vacías, fechas inválidas, tipo deshabilitado, parser fórmulas (HYPERLINK / IF anidado / desconocida), consolidado con solo alertas / alertas+historial / sin archivos. | `npm test` → 0 fails; coverage engine ≥80% |
| ~~**Mutex bloqueo ejecución tipo+fecha**~~ ✅ v1.4 | Evita que scheduler + click manual en dashboard procesen la misma combinación concurrentemente (sobrescribirían xlsx a la vez). Implementar: Map en memoria `runningRuns[tipo+fecha] = Promise` en scheduler.js + api.js compartido. Retornar 409 Conflict si está en progreso. | Forzar doble POST rápido → el segundo retorna 409; solo un xlsx generado |
| ~~**Validación de fecha real**~~ ✅ v1.4 | `YYYY-MM-DD` solo valida pattern con regex. Agregar `new Date(y,m,d)` check: mes 1-12, día válido para mes (30/02 es no). | Procesar 2026-02-30 → rechaza 400 |
| **Paginación /api/runs** | Actualmente sin limit. Agregar `limit=50 default`, `offset=0 default`, filtros `tipo`, `estado`, `fecha_desde`, `fecha_hasta` completos con SQL params. Retornar `{ data:[], total, limit, offset }`. | Llamar `/api/runs?limit=10&offset=10&estado=error` → responde paginado |
| **Política retención SQLite + _procesados** | Definir y documentar: cuántos días de runs se guardan en DB? cuánto retienen xlsx en _procesados? Tarea scheduler o script manual? | README con política y script `cleanup.js` |

### 6.2 Prioridad P1 — Features / Nuevos tipos

| Item | Bloqueo | Pasos |
|---|---|---|
| **Validar Historial real (Report History)** | Conseguir 1 export real Onway | 1) Subir a `historial_onway/setiembre/24-09-2026/historial/`. 2) `npm run process -- --fecha 2026-09-24 --tipo historial`. 3) Verificar plantilla 18 cols se respeta. 4) Luego correr `--tipo consolidado` y validar 1 placa intercalada cronológicamente. |
| **Vista Historial de ejecuciones (dashboard)** | Filtros `/api/runs` completos (ver P0) | Nueva nav item en Sidebar ("Historial de runs"). Tabla paginada con filtros (tipo, estado, rango fecha), expand logs, botón descarga consolidado, link al día específico. |
| **Viajes** | Conseguir export Onway real (Trips Report) | 1) Definir `columnas_plantilla` + `columnas_obligatorias` en YAML → `habilitar:true`. 2) Ajustar `normalize.js` si hoja o cols difieren. 3) Dashboard ReportView soporta viajes (metricas: total viajes, km total, duración total, viajes x placa). 4) No agrupar "por alerta" → por viaje. |
| **Refactor App.jsx en componentes** | Cuando agregues viajes/combustible, el archivo superará 1200 líneas | Extraer StatusBadge, KpiCard, SectionCard, Sidebar, TopBar, PlacasTable a `frontend/src/components/*.jsx`; hooks a `frontend/src/hooks/useReportSummary.jsx` |

### 6.3 Prioridad P2 — Operación / Documentación

| Item | Detalle |
|---|---|
| **Combustible** | Export real Fuel Report → analogamente a viajes. |
| **README operativo actualizado** | Screenshots dashboard nuevo, comandos, solución problemas típicos, lista de Node 22, cómo agregar un tipo nuevo de reporte (checklist paso a paso). |
| **Revisión seguridad API** | Si se expone fuera de localhost: auth básica o JWT, rate limit endpoints `/process`, no exponer SQLite directamente. |
| **Rendimiento escaleo flota** | Con >100 placas: validar tiempo de processDay, memoria de readFile xlsx, cache summary en Redis? |

---

## 7. Criterios de terminado por feature (checklist reusable)

Para agregar **cualquier nuevo tipo de reporte base** (viajes, combustible, mantenimientos, etc.):

- [ ] 1. Obtener export real Onway con ≥3 placas y ≥50 filas total.
- [ ] 2. Confirmar `carpeta_raiz`, `carpeta_entrada`, `hoja_origen`, `columna_placa`.
- [ ] 3. Listar todas las columnas del export → anotar exact nombre, unidad, formato de fecha/hora.
- [ ] 4. Definir `columnas_obligatorias` (mínimo fecha + placa).
- [ ] 5. Agregar entry en [reportes.yaml](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/config/reportes.yaml) bajo `reportes:` con `habilitado:false` inicial.
- [ ] 6. `npm run process -- --fecha YYYY-MM-DD --tipo <nuevo>` — debe correr sin explotar.
- [ ] 7. Validar XLSX output: hojas por placa, autofiltro, sin columnas raras, sin `[object Object]`.
- [ ] 8. Definir métricas específicas para KPI cards (total viajes, litros, etc.) en Dashboard.
- [ ] 9. Agregar `<tipo>` a nav de App.jsx (Sidebar + Route + ReportView).
- [ ] 10. Cambiar `habilitado:true` en YAML SOLO cuando todo esté validado.
- [ ] 11. Actualizar ESTE documento.

---

## 8. Comandos diarios de trabajo

```bash
# =============== INSTALACION ===============
# Requisito: Node 22+ (node:sqlite)
node --version   # debería imprimir v22.x.x

# Instala root + frontend (via postinstall)
npm install

# =============== DESARROLLO FULL STACK ===============
# Corre API (backend) + Vite (frontend) juntos
npm run dev
# → API en http://localhost:3001
# → Web en http://localhost:5173 (proxy /api a 3001)

# O por separado:
npm run dev:api
npm run dev:web

# =============== PROCESAR UN DÍA MANUALMENTE ===============
# Opciones --tipo: alertas | historial | consolidado (public key)
node backend/src/cli.js --fecha 2026-09-24 --tipo alertas
node backend/src/cli.js --fecha 2026-09-24 --tipo historial
node backend/src/cli.js --fecha 2026-09-24 --tipo consolidado

# =============== SCHEDULER AUTO ===============
node backend/src/scheduler.js          # foreground, imprime logs
# o via: npm start (levanta API + scheduler juntos)

# =============== BUILD PRODUCCION FRONTEND ===============
cd frontend && npm run build           # → frontend/dist/
cd .. && npm start                     # Express sirve API + frontend/dist (mirar index.js si existe ese static serve — sino, configurarlo)

# =============== VALIDAR RAPIDAMENTE PATHS ===============
node -e "import('./backend/src/config.js').then(async(cfgModule)=>{const {loadConfig,getReportType}=cfgModule;const c=loadConfig();const {resolveOutputPath,findExistingOutputPath,discoverAvailableDates}=await import('./backend/src/engine/paths.js');console.log('out:',resolveOutputPath(c,'2026-09-24',getReportType(c,'alertas')));console.log('exists:',findExistingOutputPath(c,'2026-09-24',getReportType(c,'alertas')));console.log('dates:',discoverAvailableDates(c,getReportType(c,'consolidado')))})"
```

---

## 9. Solución de problemas típicos

| Problema | Causa probable | Solución |
|---|---|---|
| `TypeError: DatabaseSync is not a constructor` | Node <22 | `nvm use 22` o instalar Node 22.x |
| `paths[1] argument must be string, received Array` | `raiz_salida_fallback` en YAML como array pero outputRoots no lo iteraba. | Actualizado en v1.3; si vuelve, verifica que outputRoots en paths.js tenga guard clause `Array.isArray()`. |
| Dashboard muestra "Sin datos" pero hay archivos en carpetas | Fecha seleccionada no tiene run guardado. | Clic **Procesar ahora** una vez; o correr CLI. `consolidado_existe=true/false` se muestra en el summary del día. |
| Descargar retorna 404 para un día que sé que fue procesado | Archivo fue movido o eliminado de `_procesados/`, pero run SQLite sigue ahí. | Reprocesar (sobrescribe); o mover el archivo a la carpeta que findExistingOutputPath detecte. |
| Dirección muestra "[object Object]" en una celda | Formula HYPERLINK/IF no reconocida por parser. | Revisar `resolveOnwayFormula` en helpers.js. El post-write scan marca estado=parcial — revisar logs. |
| Consolidado genera 0 filas de historial | No hay archivos subidos a `historial_onway/`. | Es esperado. El consolidado se genera como "parcial" porque el tipo base historial retorna sin_archivos. |
| Vite build falla "Can't resolve './fonts.css'" | Imports en index.css apuntaban a root src en lugar de src/styles. | Corregido v1.3 a `./styles/*.css`. |
| Tailwind v4 no pinta colores | Falta `import tailwindcss from "@tailwindcss/vite"` en vite.config.js o falta `@theme inline` en theme.css. | Verificar setup en §4.2. |

---

## 10. Proximo paso inmediato (post v1.3)

**Orden de ejecución recomendado:**

1. ✅ (Listo) Revisar y entender este documento completo.
2. 🔴 **P0**: Crear tests suite del motor (al menos 5 cases base).
3. 🔴 **P0**: Agregar mutex tipo+fecha para evitar sobrescritura concurrente.
4. 🟡 **P1**: Validar **export real de Historial (Report History)** de Onway.
5. 🟡 **P1**: Implementar **vista Historial de ejecuciones** en dashboard.
6. 🟡 **P1**: Obtener export de **Viajes (Trips Report)** y agregar tipo.
7. 🟠 **P2**: Obtener export de **Combustible (Fuel Report)** y agregar tipo.
8. 🔵 Avanzar con **implementaciones avanzadas** del capítulo siguiente, cuando P0 y P1 estén cerrados.

---

---

# 🚀 IMPLEMENTACIONES AVANZADAS (planeadas)

El usuario mencionó que desea agregar implementaciones **algo avanzadas**. El resto de este documento detalla **qué se quiere implementar, arquitectura propuesta, archivos a tocar y criterios de terminación** para cada feature avanzada. Esto sirve como **spec listo para ejecutar** (no hace falta análisis adicional previo).

---

## 11. Roadmap general de implementaciones avanzadas

| Fase | Feature | Complejidad | Impacto operativo |
|---|---|---|---|
| A1 | Dashboard: lista de **placas esperadas / faltantes** | ⭐⭐ | Muy alto — operador sabe qué placas le faltan subir |
| A2 | **Dashboard multiview**: comparar 2 fechas o 2 tipos lado a lado | ⭐⭐⭐ | Alto — análisis de tendencia día a día |
| A3 | **Export resumen PDF / PNG** de la vista del día (KPIs + Top 10) | ⭐⭐⭐ | Muy alto — reporte ejecutivo para gerencia |
| A4 | **Alertas por correo o WhatsApp** si faltan placas o hay run con estado=error | ⭐⭐⭐⭐ | Muy alto — operación sin necesidad de abrir dashboard |
| A5 | **Búsqueda global across fechas**: "todas alertas de placa XYY-123 en septiembre" | ⭐⭐⭐ | Alto — auditoría y trazabilidad |
| A6 | **Agregaciones semanales / mensuales** + consolidado `REPORTE_MENSUAL_SETIEMBRE.xlsx` | ⭐⭐⭐⭐ | Alto — reportes consolidados de cierre mensual |
| A7 | **Mapa geográfico** (Leaflet/MapLibre) de alertas/historial del día | ⭐⭐⭐ | Medio/Alto — visualización geoespacial |
| A8 | **Autenticación + roles** (admin, operador, lectura) | ⭐⭐⭐⭐ | Alto — si se expone fuera de localhost |
| A9 | **Detección de anomalias**: placas sin GPS >2h, velocidad > umbral, zonas prohibidas | ⭐⭐⭐⭐⭐ | Muy alto — inteligencia operativa |
| A10 | **Worker pool** para procesamiento en paralelo multi-día / histórico grande | ⭐⭐⭐⭐ | Medio — cuando se reprocesen meses completos |

Orden recomendado: **A1 → A2 → A3 → A4 → A6 → A5 → A7 → A8 → A9 → A10** (prioriza valor operativo rápido con bajo riesgo).

---

## 12. Feature A1: Placas esperadas / faltantes

### 12.1 Objetivo
El operador actualmente ve **qué placas vinieron** (procesadas), pero no **qué placas deberían haber venido**. Con esta feature:
- Definir lista de placas activas de la flota.
- Dashboard muestra badge: "Faltan 7 placas de 35 esperadas".
- Lista explícita de placas faltantes (con links para re-subir el xlsx).

### 12.2 Implementación

#### 12.2.1 Nuevo archivo config: `config/flota.yaml`

```yaml
# Lista oficial de placas activas de la flota
# Actualizar cuando ingresen / den de baja unidades
fecha_actualizacion: 2026-09-28
empresa: "MASS TRANSPORTES"
placas_activas:
  - AAR-880
  - AJQ-739
  - AKO-712
  - ARY-825
  - B1Y-801
  - BXQ-847
  # ...
grupos:                   # (opcional) para filtros por grupo
  "FLOTA SUR":
    - AAR-880
    - AKO-712
  "FLOTA NORTE":
    - B1Y-801
empresas:                 # (opcional)
  "MASS": [ AAR-880, AJQ-739 ]
  "SUB":  [ B1Y-801 ]
```

#### 12.2.2 Backend: `config.js` — nuevo loader

```js
export function loadFleet() {
  // carga config/flota.yaml, retorna {placas_activas:Set, grupos, empresas}
}
```

#### 12.2.3 Backend: nuevo endpoint

```
GET /api/fleet/expected?tipo=&fecha=
→ {
    total_esperadas: 35,
    total_encontradas: 28,
    total_faltantes: 7,
    procesadas_ok: ["AAR-880", ...],
    procesadas_con_error: [...],
    faltantes: ["XYZ-123", "ZZZ-001", ...],
    por_grupo_faltantes: { "FLOTA SUR": ["XYZ-123"], ... }
  }
```

Idea: `findExistingOutputPath(tipo,fecha)` para ver si hay workbook; si sí, listar hojas del workbook → nombres de hojas son placas procesadas. Restar de `placas_activas`.
Si no hay workbook (sin run), `procesadas_ok = []` y todo son faltantes.

#### 12.2.4 Dashboard: nuevo componente `<FleetCoverageCard>`

En `DashboardOverview` y en `ReportView` (como stats card extra):
- KPIs: `Cobertura flota: 80% (28/35)`
- Badge rojo: `7 faltantes → ver lista` (popover con nombres)
- Botón: "Recordarme por email" (integra con A4).

#### 12.2.5 Archivos a tocar

| Archivo | Modificación |
|---|---|
| `config/flota.yaml` (NUEVO) | Crear con lista oficial de placas. |
| `backend/src/config.js` | + `loadFleet()`, cachear en memoria. |
| `backend/src/api.js` | + `GET /api/fleet/expected?tipo=&fecha=` |
| `frontend/src/App.jsx` | + FleetCoverageCard, fetch en loadSummary |
| `Estado actual y mejoras pendientes.md` | Marcar A1 done cuando pase tests |

#### 12.2.6 Criterios de terminado A1

- [ ] Lista YAML de placas se carga y valida (placas con formato alfanumérico patente)
- [ ] Endpoint `/api/fleet/expected` para tipo alertas 2026-09-24 retorna correcto faltantes
- [ ] Dashboard muestra badge faltantes con 0, 1, N casos.
- [ ] Al agregar/quitar una placa de flota.yaml y refrescar dashboard, cambia conteo.
- [ ] Funciona para los 3 tipos (alertas / historial / consolidado)

---

## 13. Feature A2: Dashboard multiview (comparar 2 fechas lado a lado)

### 13.1 Objetivo
Poder tener:
- Selector de "comparar con fecha: [2026-09-23]"
- 2 columnas en Dashboard: "Hoy 24/09" vs "Ayer 23/09"
- Deltas automáticos en KPIs: `+4% alertas, -2 placas procesadas`

### 13.2 Implementación

- Agregar nuevo state en App.jsx: `compareFecha = null | YYYY-MM-DD`
- Toggle en TopBar: "Comparar con otra fecha" → muestra 2do selector.
- Nuevo layout condicional: si compareFecha → renderiza `DashboardOverview` con `summaryCompare` al lado.
- KpiCard acepta `{compareValue, labelCompare}` opcional y pinta delta color verde/rojo.

Archivos a tocar:
- `frontend/src/App.jsx` (KpiCard, DashboardOverview, TopBar, data layer `loadSummaryCompare`)
- `backend/src/api.js`: ningún cambio, /summary/:tipo/:fecha ya existe

Criterios terminado A2:
- [ ] Puedo seleccionar 2 fechas distintas y ver 2 paneles.
- [ ] Deltas KPI se pintan verde/rojo según mejora/empeora.
- [ ] Opción de limpiar comparación (1 sola vista).

---

## 14. Feature A3: Export resumen ejecutivo (PDF / PNG)

### 14.1 Objetivo
Un botón "Exportar resumen" en ReportView que descarga un PDF o PNG con:
- Título del reporte, tipo, fecha
- 4 KPI cards
- Gráfico Top 10 Placas
- Gráfico distribución tipos
- Tabla Top 5 placas con más alertas
- Pie de página: fecha generación, versión sistema

### 14.2 Implementación

2 opciones:

**Opción A (recomendada, cliente-side — sin servidor de PDF):**
- Librería: `html-to-image` (PNG) + `jspdf` (PDF embebiendo la imagen del DOM).
- Agrega `npm install html-to-image jspdf --prefix frontend`.
- Agrega un `<div id="summary-export" ref={summaryRef}>` que envuelve los elementos a exportar.
- Botón llama a `toPng(node)` + `jsPDF.save()`.

**Opción B (servidor-side):**
- Puppeteer/Playwright en backend. Pesado, requiere headless Chrome instalado.
- **Solo usa Opción B si tienes que enviar PDF por correo (A4) y necesitas calidad perfecta.**

Archivos a tocar:
- `frontend/package.json` (deps nuevas)
- `frontend/src/App.jsx` (+ `ExportReportButton`)

---

## 15. Feature A4: Notificaciones (Correo / WhatsApp) ante errores o faltantes

### 15.1 Objetivo
Cuando scheduler corre y se cumple una condición, dispara una notificación:
1. Run con `estado=error` → notificar inmediatamente.
2. Run con `estado=parcial` + ≥3 archivos con error → notificar.
3. Cobertura flota (A1) < 90% a las 18:00 → recordatorio de placas faltantes.

### 15.2 Implementación

#### 15.2.1 Config: `config/notificaciones.yaml` (NUEVO)

```yaml
canales:
  email:
    habilitado: false
    smtp:
      host: smtp.gmail.com
      port: 587
      user: alertas@mass.com.pe
      pass_from_env: "SMTP_PASSWORD"      # lee process.env.SMTP_PASSWORD, NO guardar pass en yaml
      secure: false
    destinatarios:
      - "operaciones@mass.com.pe"
      - "jefe.flota@mass.com.pe"
  whatsapp:
    habilitado: false
    # Meta WhatsApp Cloud API o Twilio (cuenta existente requerida)
    provider: "meta"
    token_from_env: "WHATSAPP_TOKEN"
    numero_remitente_id_from_env: "WHATSAPP_PHONE_ID"
    destinatarios:
      - "+51987654321"
      - "+51999888777"

reglas:
  - condicion: "estado_run == 'error'"
    cuando: inmediato
    canales: [email, whatsapp]
  - condicion: "estado_run == 'parcial' AND run.error >= 3"
    cuando: inmediato
    canales: [email]
  - condicion: "cobertura_flota < 0.9"
    cuando: "todos los dias a las 18:00 America/Lima"
    canales: [whatsapp]
    solo_tipos: [alertas]
```

#### 15.2.2 Backend: `notifications.js` (NUEVO)

- Load config notificaciones.
- Funciones `sendEmail(summary, fleet)`, `sendWhatsApp(summary, fleet)` con fetch/axios a APIs.
- Integramos en `scheduler.js` DESPUÉS de cada run completado.
- **Rate limit / dedup**: no enviar mismo correo 2 veces en < 1 hora por el mismo tipo+fecha+condicion. Guardar `notifications_sent` table en SQLite.

#### 15.2.3 Dependencias nuevas (root package.json)
- `nodemailer` ^6.9+ (email SMTP)
- No requiere dep para WhatsApp si llamas API REST directa con `fetch` (nativa Node 18+).

#### 15.2.4 Archivos a tocar

| Archivo | Cambio |
|---|---|
| `config/notificaciones.yaml` (NUEVO) | Crear con canal email/WhatsApp y reglas. |
| `backend/src/notifications.js` (NUEVO) | Loader + sendEmail + sendWhatsApp + dedup. |
| `backend/src/db.js` | Tabla `notifications_sent`. |
| `backend/src/scheduler.js` | `await notifyIfRulesMatch(runSummary)` después de cada run. |
| `.env.example` (NUEVO) | `SMTP_PASSWORD=`, `WHATSAPP_TOKEN=`, etc. **Sin valores reales**. |
| `README.md` | Sección Notificaciones: cómo activar y variables .env. |

#### 15.2.5 Criterios terminado A4
- [ ] Mock SMTP (Ethereal email) recibe correo con estado=error.
- [ ] Desactivar canales en YAML no envía nada (incluso si regla coincide).
- [ ] No envía duplicados en 1 hora por misma combinación.
- [ ] Variables de entorno NUNCA se guardan en YAML.

---

## 16. Feature A5: Búsqueda global across fechas

### 16.1 Objetivo
Pregunta típica operativa: **"me muestran todas las alertas de la placa BXQ-847 del mes de setiembre"**. Actualmente hay que abrir cada día uno por uno y descargar xlsx.

Con A5:
- Search bar "Buscar en histórico: [BXQ-847]"
- Filtros: tipo reporte, rango fecha, alerta específica (ex: "Exceso Velocidad"), zona, conductor.
- Tabla paginada de resultados, export a xlsx con `REPORTE_BUSQUEDA_BXQ-847_setiembre.xlsx`.

### 16.2 Arquitectura (2 opciones)

**Opción A (simple): búsqueda in-memory + apertura de workbook bajo demanda**  
Pros: sin nueva base de datos.  
Contras: lento si buscas 30 días (abre 30 xlsx de 5MB cada uno).  
Cuándo: flotilla <100 placas, búsquedas esporádicas.

```
GET /api/search?q=BXQ-847&rango_desde=2026-09-01&rango_hasta=2026-09-30&tipo=alertas
→ discoverAvailableDates(tipo) en rango
→ por fecha: findExistingOutputPath → si existe abrir workbook → iterar hoja de la placa
→ filtrar rows matching q (alerta, zona, conductor, etc.)
→ mergear, paginar
```

**Opción B (escalable): índice SQLite de searchable columns**  
Cuando se escribe un consolidado, a la vez se insertan rows en tabla `alert_search_index` (placa, fecha, tipo, alerta, severidad, zona, conductor, **consolidado_path**, fila número). La búsqueda es 1 SQL query `SELECT * FROM alert_search_index WHERE placa=? AND fecha BETWEEN ? AND ?`.  
Pros: sub-500ms en 100k filas.  
Contras: doble escritura; si mueves xlsx, el index queda desactualizado (necesita `reindex` script).

**Recomendación**: Arranca con Opción A. Si los usuarios se quejan de lentitud, migra a Opción B.

---

## 17. Feature A6: Agregaciones semanales / mensuales

### 17.1 Objetivo
Generar `REPORTE_CONSOLIDADO_MENSUAL_SETIEMBRE_2026.xlsx`:
- Una hoja por placa
- Toda la data de alertas + historial de todo el mes, concatenada
- Hoja extra "Resumen del mes": por placa, total alertas, top tipo, km totales, horas motor, etc.
- Dashboard vista "Mensual" (selector mes/año → KPIs, ranking mensual).

### 17.2 Implementación

Nuevo tipo compuesto en [reportes.yaml](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/config/reportes.yaml) bajo `reportes_compuestos:`:

```yaml
reportes_compuestos:
  # (ya existe) consolidado_diario: ...
  consolidado_mensual:
    key_publico: "mensual"
    etiqueta: "Consolidado Mensual"
    habilitado: false          # activar cuando se implemente
    tipo_incluido_base: "consolidado"   # el input son REPORTE_CONSOLIDADO de cada día
    resolucion: "month"        # "week" | "month"
    orden_filas: "fecha_hora"
    nombre_salida: "REPORTE_CONSOLIDADO_MENSUAL_{mes_espanol}_{anio}.xlsx"
    salida_raiz_relativa: "_consolidados_mensuales"   # dentro de consolidados_onway
```

Luego, en `processDay.js` → nueva función `processAggregatePeriod(config, aggKey, {year, month, week?})`. Itera cada día del periodo, abre workbook, concatena.

Carpeta salida: `consolidados_onway/_consolidados_mensuales/2026/REPORTE_CONSOLIDADO_MENSUAL_SETIEMBRE_2026.xlsx`.

---

## 18. Feature A7: Mapa geográfico de alertas

### 18.1 Objetivo
Visualizar en un mapa interactivo las alertas del día, con popover:
- Puntos coloreados por severidad (rojo=alta, amarillo=media, verde=info)
- Zoom a Lima (bounding box inicial)
- Click placa → centrar y mostrar últimas 5 alertas en panel lateral

### 18.2 Stack
- **MapLibre GL JS** (open source, compatible con OpenStreetMap tiles, sin key requerida)
- Opcionalmente **Leaflet 1.9** si quieres bundle más chico y menos features 3D.
- Tile server: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (gratis, no abusar) o **MapTiler** con key si quieres rendimiento.

Dependencias frontend: `npm install maplibre-gl @maplibre/maplibre-gl-react` (o `react-leaflet`).

### 18.3 Data
Desde el summary del día:
- Endpoint nuevo `GET /api/map-points/:tipo/:fecha`
- Retorna `[{placa, lat, lon, alerta, severidad, hora, direccion}]`
- Se arma iterando hojas del workbook (o resumen_json) y extrayendo cols Latitud, Longitud, Alerta, Hora.
- Nota: placas con Lat/Lon vacías se omiten (info en tooltip del badge).

---

## 19. Feature A8: Autenticación + roles

### 19.1 Objetivo
Si se expone el dashboard a red LAN o internet (no solo localhost), **debe** haber login. Roles:

| Rol | Puede | No puede |
|---|---|---|
| `admin` | Todo: procesar, re-procesar, descargar originales, ver configuración, usuarios | - |
| `operador` | Procesar, descargar consolidados y originales, ver dashboard, ver historial runs | Editar usuarios, cambiar configuración notificaciones/flota |
| `lectura` | Ver dashboard y historial runs, descargar consolidados | Procesar nada, descargar originales (datos crudos sensibles) |

### 19.2 Stack simple
- **JWT en cookie HttpOnly**, no localStorage (más seguro contra XSS).
- Passwords **bcrypt** (costo 12).
- Usuarios guardados en SQLite tabla nueva `users`.

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','operador','lectura')),
  nombre TEXT,
  created_at TEXT,
  ultimo_login TEXT
);
```

Endpoints nuevos:
```
POST /api/auth/login              {username, password} → set-cookie access_token, user data
POST /api/auth/logout             → clear cookie
GET  /api/auth/me                 → usuario actual (o 401)
POST /api/admin/users             (solo admin) crear nuevo usuario
PATCH /api/admin/users/:id/role   (solo admin) cambiar rol
```

Middleware `requireAuth(role?)` en [api.js](file:///C:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/api.js) para proteger:
- `/api/process/*` → admin/operador (no lectura)
- `/api/download/original/*` → admin/operador (no lectura)
- `/api/admin/*` → solo admin
- Todo lo demás: login requerido.

Primer usuario admin se crea con script `node backend/src/seed-admin.js --password "Cambiar123!"` que se genera una sola vez y muestra en consola "primer login".

---

## 20. Feature A9: Detección de anomalías

### 20.1 Objetivo
Más allá de solo consolidar datos, **el sistema analiza** y resalta automáticamente eventos raros. Reglas predefinidas (configurables por placa o global):

| ID | Regla | Severidad | Ejemplo |
|---|---|---|---|
| A9-1 | `sin_gps > 2h` | Alta | Placa ARY-825 no reporta posición desde 14:00 (ahora son 16:30) |
| A9-2 | `velocidad_promedio_ruta > umbral_legal` (zona urbana 60km/h, carretera 100) | Alta | Placa BXQ-847 a 112km/h en Panamericana Norte 10:45 |
| A9-3 | `salida_de_zona_permitida` (polígono configurable) | Alta | Placa XYZ-123 se fue a Callao cuando su zona es Lima Sur |
| A9-4 | `consumo_combustible_desviado > 15% vs esperado` (cuando A2 combustible exista) | Media | Consumo 38L vs 30L esperados de recorrido |
| A9-5 | `parada_prolongada > 45min en lugar_no_autorizado` | Media | Detenida 1h12 en C.C. Plaza Lima Sur |
| A9-6 | `encendido_fuera_de_horario` (flota de 6am-10pm, encendido 2:17am) | Alta | Motor encendido a las 02:17 |

### 20.2 Implementación

- **Nuevo engine** `backend/src/engine/anomalies.js` (separado del core, no rompe processDay actual).
- Ejecuta DESPUÉS de processCompositeDay sobre el workbook consolidado.
- Reglas son funciones puras: `(filasPlaca[], configRegla) => [{tipo, severidad, descripcion, hora_inicio, hora_fin, lat, lon}]`
- Resultados guardados en SQLite tabla `anomalies` (run_id FK, placa, tipo, severidad, detalles_json, hora_UTC detectada).
- Dashboard: nuevo panel `<AnomaliesPanel>` lateral derecho con contadores severity + lista clickeable (centra mapa si A7 existe).
- Integración A4: reglas de anomalías con severidad=alta dispara notificación WhatsApp/correo.

Para polígonos de zonas y geofences (A9-3): `npm install @turf/turf` en root. Con `turf.booleanPointInPolygon(lngLat, polygonFeature)` chequeas cada punto del historial.

---

## 21. Feature A10: Worker pool y reprocesamiento histórico en lote

### 21.1 Objetivo
Cuando se agregue A5 search index o A6 mensual, suele haber necesidad de "reprocesar todo setiembre" → 30 días × 3 tipos = 90 runs. En single-thread Node puede demorar 2+ horas bloqueando scheduler normal.

Con A10:
- CLI nuevo: `node backend/src/batchReprocess.js --desde 2026-09-01 --hasta 2026-09-30 --tipo alertas --workers 4`
- Cola de jobs procesados en paralelo por N workers (usar `p-queue` npm).
- Barra de progreso en stdout.
- Dashboard: vista "Jobs en progreso" con WebSocket (opcional SSE: Server-Sent Events `/api/jobs/stream`) para ver progreso.

### 21.2 Stack
- `npm install p-queue` en root
- Opcional: `WebSocket` con `ws` package en backend para stream de eventos al dashboard (para no hacer polling cada 2s).

---

## 22. Orden recomendado de ejecución avanzado (cronograma propuesto)

```
Semana 1 (P0 hardening):
  Lu-Mi: Tests suite motor + Mutex ejecuciones
  Ju-Vi: Validación export Historial real + fix plantilla si desvia

Semana 2:
  Lu-Mi: A1 Placas esperadas/faltantes (entrega operativa inmediata)
  Ju-Vi: A2 Dashboard comparar fechas (bajo riesgo, UI-only)

Semana 3:
  Lu-Mi: A3 Export PDF/PNG resumen (solo frontend, 1-2 días)
  Ju-Vi: A4 Notificaciones email + WhatsApp (requiere credenciales reales del usuario)

Semana 4:
  Lu-Mi: A5 Búsqueda global across fechas (Opción A — simple)
  Ju-Vi: A6 Consolidado mensual + Dashboard vista mensual

Semana 5+:
  A7 Mapa geográfico (Libre)
  A8 Autenticación roles (solo si se expone en red)
  A9 Anomalías (solo si flota > 50 unidades)
  A10 Worker batch (solo si se reprocesan meses frecuentemente)
```

---

## 23. Checklist de entrega por cada feature avanzada

Plantilla reusable. Copiar y pegar en una nueva tarea del backlog interno:

- [ ] 1. **Config YAML** si aplica: creado, con comentarios, `habilitado:false` inicial.
- [ ] 2. **Archivos nuevos creados** (engine, notificaciones, anomalies, batch). Nombres siguen convención.
- [ ] 3. **Archivos existentes modificados** solo en lugares definidos (api.js, scheduler.js, App.jsx, config.js).
- [ ] 4. **Backward compatibility**: feature apagada (flag) = sistema sigue =v1.3 sin breaks. `npm test` (cuando exista) sin breaks.
- [ ] 5. **Endpoints nuevos** documentados en este documento (copiar a §4.5 API REST).
- [ ] 6. **Errores retornan HTTP codes correctos**: 400 bad request, 401 unauth, 404 no existe, 409 conflict, 500 crash.
- [ ] 7. **Dashboard**: vista nueva no rompe otras vistas (navegar entre las 3 originales luego de implementar).
- [ ] 8. **Vite build exitoso** (frontend): 0 errores.
- [ ] 9. **CLI processing exitoso** (alertas/historial/consolidado) sigue funcionando.
- [ ] 10. **README actualizado** con sección nueva y variables .env si agregó.
- [ ] 11. **ESTE documento actualizado** (secciones correspondientes + backlog + estado).

---

## 24. Referencia rápida de archivos (mapa mental)

```
AGREGAR UN TIPO DE REPORTE NUEVO (ej: viajes):
  1. config/reportes.yaml       ← entry viajes: {...}
  2. backend/src/engine/paths.js  ← (sin cambio — lee el YAML)
  3. backend/src/engine/normalize.js ← (sin cambio, a menos que hoja_origen tenga trucos)
  4. backend/src/engine/helpers.js ← (sin cambio a menos que tenga formulas nuevas)
  5. backend/src/api.js         ← (sin cambio, usa getReportType yaml)
  6. backend/src/scheduler.js   ← agregar viajes al orden (antes de consolidado si es base)
  7. frontend/src/App.jsx       ← ReportView + DashboardOverview metricas especificas + sidebar
  8. ✅ validar con CLI + dashboard
  9. Actualizar este documento.

AGREGAR FEATURE AVANZADA:
  1. Leer capítulo correspondiente (A1-A10)
  2. Marcar items checklist §23
  3. Crear archivos/config
  4. Implementar
  5. Build & test
  6. Actualizar §2 estado por area y §6 backlog
```
