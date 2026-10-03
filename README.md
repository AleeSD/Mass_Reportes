# Sistema de Reportes de Flota (Onway)

Consolida los exports diarios de Onway (uno por placa) en un único Excel, con una hoja por placa, y muestra un dashboard operativo del día.

El detalle de cada alerta **no se guarda en base de datos**. Solo se almacenan metadatos del proceso (conteos, estado, logs). El `.xlsx` consolidado es la fuente de verdad.

## Requisitos

- Node.js 20 o superior (probado con Node 24)
- Los archivos `.xlsx` de Onway depositados en la carpeta del día

## Estructura de carpetas

**ENTRADAS** (exports de Onway, separados por placa):

```
alertas_onway/                          ← Alertas (renombrado; reportes_onway/ sigue leído como fallback)
  2026-09-17/alertas/*.xlsx             ← estructura recomendada
  setiembre/17-09-2026/*.xlsx           ← estructura actual del equipo

historial_onway/                        ← Historial
  2026-09-17/historial/*.xlsx
  setiembre/17-09-2026/*.xlsx

reportes_onway/                         ← (legacy) Alertas antiguos — solo lectura por compatibilidad
```

**SALIDAS** (consolidados generados por el motor, todos en una misma carpeta):

```
consolidados/
  _procesados/
    2026-09-17/
      REPORTE_ALERTAS_2026-09-17.xlsx        ← consolidado solo alertas
      REPORTE_HISTORIAL_2026-09-17.xlsx      ← consolidado solo historial
      REPORTE_CONSOLIDADO_2026-09-17.xlsx    ← alertas + historial combinados
```

> Nota de compatibilidad: los consolidados antiguos generados antes de este redireccionamiento (en `alertas_onway/_procesados` o `reportes_onway/_procesados`) siguen apareciendo en el selector de días del dashboard y se pueden descargar sin mover archivos.

Combustible y viajes se habilitan más adelante en `config/reportes.yaml` (mismos motor y dashboard).

## Cómo ejecutar

Si en tu equipo PowerShell bloquea la ejecución de scripts de npm, una sola vez:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Luego, siempre:

```bash
npm install
npm run dev
```

- API: http://localhost:8000
- Dashboard: http://localhost:5173

En el dashboard: elige la fecha → **Procesar ahora** → descarga el consolidado.

Procesar por consola:

```bash
# Alertas (tipo por defecto)
npm run process -- --fecha 2026-09-17 --tipo alertas

# Historial (Report History de Onway, 21 cols)
npm run process -- --fecha 2026-09-17 --tipo historial

# Consolidado combinado Alertas + Historial
#   - Genera ambos tipos base si aún no existen en disco
#   - Mezcla cronológicamente las filas en una hoja por placa
#   - Añade columna "Origen del registro"
npm run process -- --fecha 2026-09-17 --tipo consolidado
```

## Qué hace el motor

- **Alertas (`--tipo alertas`)**:
  1. Lee todos los `.xlsx` de `alertas_onway/` o `reportes_onway/` (compatibilidad).
  2. Identifica la placa en `Placa/Patente` (si falta, intenta el nombre de archivo).
  3. Resuelve fórmulas de Onway: `Dirección` extrae el texto de `HYPERLINK(...)`, `Estado GPS` y `Atención Alerta` resuelven `IF(...)` literales.
  4. Aplica plantilla fija y elimina columnas totalmente vacías.
  5. Genera `REPORTE_ALERTAS_YYYY-MM-DD.xlsx` con una hoja por placa.
  6. Red de seguridad: si detecta `[object Object]` en celdas, marca el estado `parcial`.

- **Historial (`--tipo historial`)**:
  1. Lee `.xlsx` de `historial_onway/` con hoja `Report History` (21 cols).
  2. Procesamiento igual que Alertas (plantilla propia, poda vacíos).
  3. Produce `REPORTE_HISTORIAL_YYYY-MM-DD.xlsx`.

- **Consolidado (`--tipo consolidado`)**:
  1. Asegura que existan los `REPORTE_ALERTAS_*` y `REPORTE_HISTORIAL_*` (procesa si faltan).
  2. Une ambas salidas por placa.
  3. Añade columna `Origen del registro` = "Alertas" / "Historial".
  4. Ordena filas por `Fecha + Hora` en cada hoja.
  5. Antepone las hojas de **analítica de flota** (ver abajo).
  6. Produce `REPORTE_CONSOLIDADO_YYYY-MM-DD.xlsx`.

## Analítica de flota (v1.4)

El consolidado trae tres hojas nuevas, **antes** de las hojas por placa (que no cambian):

| Hoja | Contenido |
|---|---|
| `RESUMEN_FLOTA` | Una fila por placa de la flota (22, orden alfabético): inicio de jornada, BSF, vueltas 1–4, tiendas, Base OS, fin de servicio, totales y observaciones de calidad. Las placas sin archivo salen como *Sin reporte del día*. |
| `VUELTAS` | Una fila por placa × vuelta: origen, carga en BSF, hasta 7 tiendas (llegada, salida, permanencia, acumulado, traslado), retorno, cierre y duración. |
| `VISITAS` | Una fila por estancia (BSF, Base OS, tienda o paso por zona) con sus marcas de calidad. Útil para tablas dinámicas. |

Las horas son valores de hora de Excel (`hh:mm:ss`) y las duraciones `[h]:mm:ss`. Colores: BSF azul, Base OS morado, tiendas verde; *estimado* en cursiva sobre ámbar; `—` = dato faltante.

Reglas principales (detalle en `plan-desarrollo-hoja-maestra-y-dashboard-flota.md` §4):

- Se usan **solo las filas de Alertas** (el historial repite los mismos eventos).
- La zona se identifica por la columna `Zona`: `MASS BSF 1` (BSF), `BASE-OSLOGISTICS` (Base OS) o `CÓDIGO-LOCAL` (tienda, unida por código con el catálogo).
- Depuración: duplicados en 120 s, rebotes de geocerca en 10 min, llegada repetida sin salida = misma estancia; una estancia en tienda < 3 min es *paso por zona* y no cuenta como visita.
- La jornada empieza en el primer `Vehículo encendido` (si no hay: `Se movio` o el primer evento, marcados *estimado*).
- BSF y Base OS cierran la vuelta y abren la siguiente al salir. Si tras la última tienda no hay BSF, Base OS ni otra tienda, la vuelta termina en *fin de servicio en tienda*.

Si el cálculo falla, el consolidado se genera igual (sin las hojas nuevas) y el run queda `parcial` con el motivo en el log. Con `analitica_flota.habilitado: false` el consolidado es idéntico al v1.3.

En el dashboard, la sección **Operación de flota** muestra (por defecto el día anterior): KPIs, línea de tiempo tipo Gantt por placa, tabla maestra, distribución de tiempos, ocupación de BSF, ranking de tiendas, calidad de datos y el detalle de cada placa, con filtros por empresa, tipo, placa, vuelta y CD.

API: `/api/fleet/timeline/:fecha`, `/api/fleet/timeline/:fecha/:placa`, `/api/fleet/stores/:fecha`, `/api/fleet/bsf-occupancy/:fecha`, `/api/fleet/config`, `/api/fleet/dates`.

## Operación diaria (8 am)

1. Hacia las 8:00 se suben los reportes por placa **del día anterior** a `alertas_onway/<mes>/<DD-MM-YYYY>/` e `historial_onway/<mes>/<DD-MM-YYYY>/`.
2. El scheduler (cada 10 min) revisa **ayer y hoy** y corre **Alertas → Historial → Consolidado**:
   - espera si algún `.xlsx` cambió hace menos de 2 min (carga a medias);
   - solo reprocesa si cambió la cantidad, tamaño o fecha de los archivos del día;
   - registra la cobertura (*N de 22 placas con reporte*) en el log del run.
3. El dashboard abre **Operación de flota** en *Ayer*.

Scheduler y "Procesar ahora" no se pisan: si ya hay un proceso del mismo tipo y fecha, el segundo recibe `409`.

```bash
# Procesar a mano el día anterior (acepta también YYYY-MM-DD, DD-MM-YYYY u "hoy")
npm run process -- --fecha ayer --tipo consolidado
```

## Configuración

- `config/reportes.yaml`: columnas, cron, días a revisar y el bloque `analitica_flota` (umbrales del motor: `dedupe_segundos`, `fusion_rebote_minutos`, `paso_por_zona_segundos`, `resaltar_estancia_bsf_min`, `max_tiendas_por_vuelta_en_hoja`, `max_vueltas_en_resumen`, alertas de inicio de jornada).
- `config/flota.yaml`: las 22 placas (placa, alias sin guion, empresa, tipo OS/MASS). Agregar o dar de baja una unidad = editar esta lista.
- `config/zonas.yaml`: nombres de zona de BSF y Base OS, patrón del código de tienda y textos de alerta de ingreso/salida (admiten `*`).
- `config/tiendas_mass.csv`: catálogo de tiendas (código, local, CD, distrito, coordenadas). **No editar a mano**: se regenera desde `GEOCERCAS.xlsx`:

```bash
npm run import:geocercas
```

  El script descarta filas sin código (ej. `FILMS A OSLO`) y avisa de duplicados o coordenadas inválidas.

## Pruebas

```bash
npm test
```

Usa `node:test` con recortes de reportes reales (`backend/test/fixtures`): pruebas de oro del 27/09 (AAR-880, AKO-712, BXQ-847, BXT-918, C6E-921), casos sintéticos (medianoche, Base OS, zona fuera de catálogo…), consolidado de punta a punta, no regresión, API, mutex y scheduler.

Variables de entorno útiles en desarrollo: `ONWAY_DB_PATH` (otra base SQLite), `ONWAY_SCHEDULER=off` (no arranca el scheduler), `PORT`.
