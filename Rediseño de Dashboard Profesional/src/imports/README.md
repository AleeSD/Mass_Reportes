# Sistema de Reportes de Flota (Onway)

Consolida los exports diarios de Onway (uno por placa) en un único Excel, con una hoja por placa, y muestra un dashboard operativo del día.

El detalle de cada alerta **no se guarda en base de datos**. Solo se almacenan metadatos del proceso (conteos, estado, logs). El `.xlsx` consolidado es la fuente de verdad.

## Requisitos

- Node.js 20 o superior (probado con Node 24)
- Los archivos `.xlsx` de Onway depositados en la carpeta del día

## Estructura de carpetas

Se aceptan ambas convenciones.

```
alertas_onway/                          ← antes era reportes_onway
  2026-09-17/alertas/*.xlsx             ← estructura recomendada
  setiembre/17-09-2026/*.xlsx           ← estructura actual del equipo
  (carpeta reportes_onway/ sigue leída como fallback por compatibilidad)

historial_onway/                        ← nuevo
  2026-09-17/historial/*.xlsx
  setiembre/17-09-2026/*.xlsx

alertas_onway/_procesados/              ← salida compartida
  2026-09-17/
    REPORTE_ALERTAS_2026-09-17.xlsx        ← solo alertas
    REPORTE_HISTORIAL_2026-09-17.xlsx      ← solo historial
    REPORTE_CONSOLIDADO_2026-09-17.xlsx    ← alertas + historial combinados
```

Combustible y viajes se habilitan más adelante en `config/reportes.yaml` (mismos motor y dashboard).

## Cómo ejecutar
```QUITAR PERMISOS
 Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
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

# Historial (Report History de Onway, 18 cols)
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
  1. Lee `.xlsx` de `historial_onway/` con hoja `Report History` (18 cols).
  2. Procesamiento igual que Alertas (plantilla propia, poda vacíos).
  3. Produce `REPORTE_HISTORIAL_YYYY-MM-DD.xlsx`.

- **Consolidado (`--tipo consolidado`)**:
  1. Asegura que existan los `REPORTE_ALERTAS_*` y `REPORTE_HISTORIAL_*` (procesa si faltan).
  2. Une ambas salidas por placa.
  3. Añade columna `Origen del registro` = "Alertas" / "Historial".
  4. Ordena filas por `Fecha + Hora` en cada hoja.
  5. Produce `REPORTE_CONSOLIDADO_YYYY-MM-DD.xlsx`.

Cada 10 minutos el scheduler vuelve a procesar el día actual si hay archivos nuevos; corre **Alertas → Historial → Consolidado** en ese orden.

## Configuración

Edita `config/reportes.yaml` para columnas, cron y tipos de reporte.
