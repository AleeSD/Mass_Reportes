# Redireccionar salidas a consolidados/_procesados — Implementation Plan

## Repository Research

### Flujo actual (antes del cambio)
- **Entradas** (OK, no requieren modificación):
  - Alertas: `alertas_onway/` con fallback `reportes_onway/` (ambas con estructura `<mes>/<DD-MM-YYYY>/*.xlsx` o `<YYYY-MM-DD>/alertas/*.xlsx`).
  - Historial: `historial_onway/` con las mismas convenciones.
- **Salidas** (actualmente mal):
  - `rutas.raiz_salida = "alertas_onway/_procesados"`
  - `rutas.raiz_salida_fallback = "reportes_onway/_procesados"`
  - **Problema**: Los 3 archivos (REPORTE_ALERTAS_*, REPORTE_HISTORIAL_*, REPORTE_CONSOLIDADO_*) se escriben todos dentro de `alertas_onway/_procesados/<fecha>/`. Historial y Consolidado terminan dentro de la carpeta de Alertas, lo cual es confuso y rompe la convención nueva que el usuario quiere.

### Flujo deseado según el usuario
| Concepto | Carpeta |
|---|---|
| Entrada Alertas (separados por placa) | `alertas_onway/` |
| Entrada Historial (separados por placa) | `historial_onway/` |
| Entrada Alertas legacy | `reportes_onway/` (se mantiene como fallback de entrada) |
| Salida Consolidado **solo Alertas** | `consolidados/_procesados/<fecha>/REPORTE_ALERTAS_<fecha>.xlsx` |
| Salida Consolidado **solo Historial** | `consolidados/_procesados/<fecha>/REPORTE_HISTORIAL_<fecha>.xlsx` |
| Salida Consolidado **Alertas+Historial combinados** | `consolidados/_procesados/<fecha>/REPORTE_CONSOLIDADO_<fecha>.xlsx` |

### Arquitectura relevante
- `resolveOutputPath(config, isoDate, reportType)` en [paths.js](file:///c:/Users/transporte.ope4/Pictures/AS/Automatizaciones/MASS/REPORTE%20ALERTAS%20ONWAY/backend/src/engine/paths.js#L109-L115) usa **la config global** `config.rutas.raiz_salida` para construir la ruta (no la carpeta_raiz del tipo individual). Esto es exactamente lo que queremos: **una sola carpeta compartida** para los 3 tipos de salida. Solo hay que cambiar el valor en la YAML.
- `discoverAvailableDates()` además escanea `outputRoots()` para detectar días pasados. Si dejamos un `raiz_salida_fallback` apuntando a `alertas_onway/_procesados` y `reportes_onway/_procesados`, seguiremos viendo los días antiguos aunque las salidas nuevas vayan a la carpeta nueva.
- `ensureOutputDir()` ya usa `{recursive: true}`, así que `consolidados/_procesados/2026-09-25/` se crea sola sin intervención manual.

### README.md tiene un error sintáctico
En la línea 42 hay un bloque de código con triple backtick que el IDE muestra abierto (`Line 42: ``````). Hay que repararlo y además actualizar "Estructura de carpetas" para el nuevo layout.

---

## Files and Modules

- `config/reportes.yaml`: cambiar `rutas.raiz_salida` y `rutas.raiz_salida_fallback` para apuntar a `consolidados/_procesados` como principal, con las carpetas antiguas como fallback de lectura (detección días pasados y descargas).
- `README.md`: (a) corregir bloque de código mal cerrado, (b) actualizar estructura de carpetas, (c) aclarar dónde van entradas y salidas de cada tipo.
- **Sin cambios necesarios en**:
  - `backend/src/engine/paths.js`: su lógica ya es correcta (usa config global). Revisión solo de lectura para confirmar.
  - `backend/src/engine/processDay.js`: `processCompositeDay` carga REPORTE_ALERTAS_* desde `resolveOutputPath(alertas)` — ahora que `resolveOutputPath` apunta a la carpeta compartida, el workflow de "si no existe, lo genero y leo" seguirá funcionando sin tocarlo.
  - `backend/src/api.js` / `cli.js` / `App.jsx`: todos usan `resolveOutputPath`, así que no requieren cambio.

---

## Implementation Steps

1. **`config/reportes.yaml` — actualizar `rutas.raiz_salida`**:
   ```yaml
   rutas:
     raiz_salida: "consolidados/_procesados"
     raiz_salida_fallback:
       - "alertas_onway/_procesados"
       - "reportes_onway/_procesados"
   ```
   Los fallbacks se usan solo para **lectura** (encontrar días pasados / descargar consolidados antiguos generados antes de este cambio). Las escrituras nuevas siempre van a `consolidados/_procesados`.

2. **`README.md` — corregir bloque dañado y redactar estructura de carpetas nueva**:
   - Reparar los backticks sobrantes en la sección de estructura.
   - Diagrama de carpetas actualizado (entradas por un lado, salidas consolidadas por otro).
   - Nota de compatibilidad: las salidas antiguas generadas en `alertas_onway/_procesados/` siguen apareciendo en el selector de días.

3. **Revisión sin cambios**: confirmar que `paths.js` produce la ruta correcta para los 3 tipos (test programático corto).

---

## Dependencies and Considerations

- **Backwards compat / días pasados**: sin los fallbacks, `discoverAvailableDates` dejaría de ver las fechas procesadas antes del redireccionamiento. Por eso mantenemos las 2 rutas antiguas como lectura.
- **Permisos de escritura**: `consolidados/` no existe en el disco actual. `ensureOutputDir` lo crea con `recursive: true`, así que no hay que crearlo manualmente.
- **`processCompositeDay` sigue funcionando**: la función pregunta por `fs.existsSync(outputPath)` para cada tipo base. Como `outputPath` ahora es `consolidados/_procesados/<fecha>/REPORTE_ALERTAS_*.xlsx`, si todavía no existe (primera vez después del cambio), volverá a ejecutar `processDay` y lo escribirá en la **nueva** carpeta. Esto es correcto y evita mezclar rutas.
- **3 tipos de consolidado son exactamente los que tenemos**: REPORTE_ALERTAS (solo alertas), REPORTE_HISTORIAL (solo historial), REPORTE_CONSOLIDADO (combinado). Coincide 1:1 con "1 por separado, ya sea de solo alertas o historial, y otro uniendo" del usuario.

---

## Validation

1. **Smoke test paths.js**: correr `resolveOutputPath` para los 3 tipos con fecha 2026-09-18 y confirmar que devuelven `...\consolidados\_procesados\2026-09-18\REPORTE_*.xlsx` (no más `alertas_onway\_procesados`).
2. **Regenerar alertas 2026-09-18**:
   - `node backend/src/cli.js --fecha 2026-09-18 --tipo alertas`
   - Confirmar que se creó `consolidados/_procesados/2026-09-18/REPORTE_ALERTAS_2026-09-18.xlsx` y `estado = ok`.
3. **Ejecutar consolidado 2026-09-18** (historial sin archivos reales; parcial es aceptable):
   - `node backend/src/cli.js --fecha 2026-09-18 --tipo consolidado`
   - Confirmar que aparecen en `consolidados/_procesados/2026-09-18/` tanto `REPORTE_ALERTAS_*` como `REPORTE_CONSOLIDADO_*` (historial `sin_archivos`, no genera el suyo).
4. **Días pasados visibles**: `GET /days?tipo=alertas` debe devolver `2026-09-18, 2026-09-17` (se lee el fallback `reportes_onway/_procesados` además de la ruta nueva).
5. **Inspección de contenido**: abrir el consolidado nuevo y confirmar que `Dirección` sigue mostrándose como texto (no `[object Object]`) y que Origen del registro = "Alertas" en filas del consolidado.

---

## Risks

| Riesgo | Mitigación |
|---|---|
| "Se perdieron los consolidados antiguos" | Mantener `raiz_salida_fallback` con las 2 carpetas antiguas para que `discoverAvailableDates` y los endpoints de descarga los sigan encontrando. |
| `processCompositeDay` no carga el archivo de Alertas después del cambio | Antes de reusar un consolidado, el composite comprueba `fs.existsSync(outputPath)` en la ruta nueva. Si no existe (primera ejecución post-cambio), corre `processDay` y lo genera en la ubicación nueva. |
| Permisos o path largo en Windows | Las rutas son relativas al proyecto, sin caracteres especiales. `ensureOutputDir` usa `recursive: true`. |
| Usuario confunde "consolidados" entrada vs salida | README lo documenta claramente: `alertas_onway/` y `historial_onway/` = **entradas** (exports separados por placa). `consolidados/_procesados/` = **salidas** generadas por el motor. |
