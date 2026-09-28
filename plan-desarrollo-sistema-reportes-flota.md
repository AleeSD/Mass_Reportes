# Plan de Desarrollo — Sistema de Automatización de Reportes de Flota (Onway)

## 1. Resumen ejecutivo

Actualmente, cada día se descargan de la plataforma **Onway** entre 15 y 20 reportes de alertas (uno por placa), en formato `.xlsx`, y se consolidan manualmente en un único libro (`REPORTE_ALERTAS.xlsx`) con una hoja por placa. Este trabajo manual es repetitivo, propenso a errores y no escala si la flota crece.

El objetivo de este proyecto es construir un **sistema web** que:

1. Detecte y lea automáticamente los reportes diarios exportados de Onway (alertas, y a futuro combustible, viajes, etc.) desde una carpeta del día.
2. Los **normalice y consolide** en un único archivo de salida, respetando el formato ya usado (una hoja por placa, mismos encabezados).
3. Exponga un **dashboard** simple para visualizar, el mismo día, qué reportes ya se procesaron, cuántas alertas hay por placa/tipo, y permitir la descarga del consolidado — **sin necesidad de subir/almacenar el detalle de cada alerta en una base de datos**, tal como se indicó.
4. Esté diseñado desde el inicio como una **plataforma multi-reporte** (alertas, combustible, viajes, y los que se sumen después), no como un script de un solo uso.

Este documento cubre: análisis de los datos fuente, arquitectura propuesta, modelo de carpetas/archivos, diseño técnico por módulos, plan de fases, y estimaciones.

---

## 2. Análisis de los archivos fuente (basado en los 3 ejemplos)

| Archivo | Contenido | Observación |
|---|---|---|
| `alerts_...xlsx` (x2) | Exportación individual de Onway, 1 placa por archivo, hoja `Report Alerts` | Entre 37 y 38 columnas; el orden/presencia de algunas columnas varía levemente (ej. la columna `Etiquetas` aparece en algunos exports y en otros no) |
| `REPORTE_ALERTAS.xlsx` | Consolidado manual actual | 13 hojas (`Hoja1`...`Hoja13`), una por placa, cada hoja conserva casi las mismas columnas que el export individual |

**Hallazgos clave que definen el diseño técnico:**

- **La placa está siempre en la columna "Placa/Patente"**, dentro de los datos — no solo en el nombre del archivo. Esto permite identificar la placa de forma confiable leyendo el contenido, no solo el filename.
- **Las columnas no son 100% idénticas entre exports.** Cualquier automatización debe **mapear por nombre de encabezado**, no por posición de columna, y tolerar columnas faltantes/adicionales.
- El consolidado actual nombra las hojas genéricamente (`Hoja1`, `Hoja2`...). Una mejora inmediata y de bajo costo es **nombrar cada hoja con la placa** (ej. `CKL-718`), lo que ya resuelve un problema de usabilidad del proceso actual.
- Los reportes son por día calendario (columna `Fecha`), consistente con la idea de organizarlos en carpetas por fecha.

### 2.1 Estructura de columnas: export crudo de Onway vs. reporte final esperado

Al comparar el export crudo de Onway (37-38 columnas) contra las primeras hojas del `REPORTE_ALERTAS.xlsx` de ejemplo (`Hoja1`, `Hoja2`, `Hoja3`), se confirma que **el reporte final no usa todas las columnas del export**: ya se descartan de forma fija columnas que no aportan valor para este reporte, como `Velocidad máxima permitida/alcanzada`, `Velocidad promedio`, `Duración (segundos)`, `Severidad de la alerta`, `Fecha y hora de inicio/fin del exceso`, `Reporte de Alerta` y sus fechas/horas, `Registro de Atención`, `Notas` y `Etiquetas`.

Es decir, el reporte final sigue una **plantilla fija de ~25 columnas**, tomando como referencia la estructura de `Hoja1`:

| # | Columna |
|---|---|
| 1 | Secuencia |
| 2 | Grupo |
| 3 | Alias |
| 4 | Placa/Patente |
| 5 | IMEI |
| 6 | Tipo de carrocería |
| 7 | Empresa |
| 8 | Conductor |
| 9 | Fecha |
| 10 | Hora |
| 11 | Latitud |
| 12 | Longitud |
| 13 | Dirección |
| 14 | Alerta |
| 15 | Odómetro (Km) |
| 16 | Zona |
| 17 | Velocidad (Km/h) |
| 18 | Horómetro (Hrs) |
| 19 | % Batería |
| 20 | Fecha GPS |
| 21 | Hora GPS |
| 22 | Estado GPS |
| 23 | Atención Alerta |
| 24 | Fecha Registro At. |
| 25 | Hora Registro At. |

### 2.2 Columnas vacías: quedan detectadas, pero también hay que eliminarlas

Al revisar el detalle celda por celda, se confirma lo señalado: dentro de esa misma plantilla de 25 columnas, **hay columnas que quedan sin ningún dato** en varias hojas del ejemplo — por ejemplo `Empresa`, `Conductor` y `Zona` no traen valor en ninguna fila de `Hoja1`, `Hoja2` ni `Hoja3`. Onway simplemente no está enviando esos datos para esta flota (no es un error del proceso actual, es que el campo llega vacío desde el origen).

Hoy esas columnas quedan en el archivo, pero en blanco. Para el reporte final automatizado, el sistema debe **eliminarlas por completo** (no solo dejarlas vacías), y esto se resuelve con dos pasos de filtrado de columnas, en este orden:

1. **Filtro de plantilla (fijo):** de todo lo que trae el export crudo, solo se conservan las columnas de la plantilla del §2.1. Todo lo demás (velocidad máxima, duración de exceso, severidad, notas, etc.) se descarta siempre, tenga o no datos.
2. **Poda de columnas vacías (dinámico):** de esas columnas de la plantilla, cualquiera que **no tenga ningún dato** se elimina también del reporte final de ese día — por ejemplo, si ese día ninguna placa reporta `Conductor`, esa columna no aparece en ninguna hoja del consolidado.

El punto 2 se evalúa **a nivel de todo el reporte del día** (considerando todas las placas), no hoja por hoja, para que todas las hojas del mismo consolidado mantengan las mismas columnas entre sí y el archivo sea consistente de leer. Si más adelante se prefiere evaluar la poda por placa individual (columnas distintas por hoja), es un ajuste de configuración simple sobre el mismo mecanismo — pero no es el comportamiento recomendado por defecto, ya que dificulta comparar hojas entre sí.

---

## 3. Alcance del sistema

### 3.1 Alcance funcional (fase 1 — Alertas)

- Ingesta automática de todos los `.xlsx` de alertas colocados en la carpeta del día.
- Detección de la placa por archivo (leyendo la columna `Placa/Patente`, con fallback al nombre de archivo si es necesario).
- Normalización de columnas (mapeo por nombre, orden estándar, columnas faltantes se dejan vacías).
- Generación de un `REPORTE_ALERTAS_YYYY-MM-DD.xlsx` con una hoja por placa (nombrada con la placa).
- Dashboard web del día: lista de placas procesadas, cantidad de alertas por placa, por tipo de alerta y por severidad, con posibilidad de descargar el consolidado y los reportes individuales del día.
- Registro de ejecución (log): qué archivos se procesaron, cuáles fallaron y por qué (ej. archivo corrupto, columna de placa vacía, formato inesperado).

### 3.2 Alcance funcional (fases siguientes — otros reportes)

- Mismo patrón (ingesta → normalización → consolidado → dashboard) para:
  - **Combustible** (consumo por vehículo).
  - **Viajes** (recorridos, paradas, kilometraje).
  - Otros reportes de Onway que se identifiquen luego.
- El sistema debe soportar agregar un nuevo "tipo de reporte" **sin reescribir el núcleo**, solo agregando su definición (ver §5.3).

### 3.3 Fuera de alcance (explícito, según lo indicado)

- No se requiere persistir el detalle fila por fila de las alertas en una base de datos para visualización histórica extensa — el dashboard es del día/reporte, no un data warehouse.
- No se contempla, en esta fase, integración directa vía API con Onway (se asume que los archivos se siguen descargando/depositando manualmente en la carpeta del día, salvo que a futuro Onway exponga una API y se decida automatizar también esa parte).

---

## 4. Estructura de carpetas propuesta

Para que la automatización sea confiable, se propone estandarizar la estructura de carpetas de entrada (ajustable a como ya la tengan, pero este es el criterio recomendado):

```
/reportes-onway/
  /2026-09-17/                     ← carpeta del día (YYYY-MM-DD)
    /alertas/
      alerts_CKL-718.xlsx
      alerts_CJS-721.xlsx
      ...
    /combustible/                  ← se habilita en fase 2
      fuel_CKL-718.xlsx
      ...
    /viajes/                       ← se habilita en fase 3
      trips_CKL-718.xlsx
      ...
  /2026-09-18/
    ...
  /_procesados/                    ← salida generada por el sistema
    /2026-09-17/
      REPORTE_ALERTAS_2026-09-17.xlsx
      REPORTE_COMBUSTIBLE_2026-09-17.xlsx
      ...
```

Esto permite que el sistema simplemente "observe" la carpeta del día y sepa, por subcarpeta, qué tipo de reporte está leyendo — clave para reusar el mismo motor con distintos tipos de reporte.

---

## 5. Arquitectura propuesta

### 5.1 Visión general

```mermaid
flowchart LR
    A[Carpeta del día\n/alertas /combustible /viajes] --> B[Servicio de Ingesta]
    B --> C[Normalizador\n(mapeo de columnas por nombre)]
    C --> D[Aplicar plantilla de columnas\n(filtro fijo por tipo de reporte)]
    D --> E[Poda de columnas vacías\n(dinámico, a nivel del reporte del día)]
    E --> F[Consolidador\n(1 hoja por placa)]
    F --> G[Archivo .xlsx consolidado]
    F --> H[Base de datos ligera\n(solo metadatos/resumen del día)]
    H --> I[Dashboard Web]
    G --> I
```

Puntos clave del diseño:

- **Los datos crudos de cada alerta NO se guardan en base de datos.** Solo se guardan **metadatos de la ejecución** (qué placas se procesaron, conteos por tipo/severidad, fecha, estado del proceso) para poder pintar el dashboard rápido. El archivo `.xlsx` consolidado es la fuente de verdad del detalle.
- El **Normalizador** es el componente que hace el sistema extensible: cada tipo de reporte (alertas, combustible, viajes) define su propio "esquema" de columnas esperadas, cuáles son obligatorias, y cómo identificar la placa. El resto del pipeline (ingesta, consolidación, dashboard) es genérico.
- El paso de **aplicar plantilla de columnas** descarta siempre las columnas que no forman parte del formato final definido para ese tipo de reporte (ver §2.1), sin importar si el export de Onway las trae.
- El paso de **poda de columnas vacías** revisa, ya con la plantilla aplicada, cuáles columnas quedaron sin ningún dato en el reporte del día y las elimina del archivo final (ver §2.2), para que el `.xlsx` entregado no tenga columnas en blanco.

### 5.2 Stack tecnológico sugerido

| Capa | Recomendación | Motivo |
|---|---|---|
| Backend / procesamiento | **Python** (FastAPI) + `openpyxl` / `pandas` | Excelente soporte para manipular Excel (fórmulas, hojas, formato) y es el mismo ecosistema usado para el análisis inicial de estos archivos |
| Frontend / dashboard | **React** (o el framework que ya use el equipo) | Dashboard liviano, consumo de una API REST simple |
| Base de datos | **PostgreSQL** o incluso **SQLite** si el volumen es bajo | Solo se almacenan metadatos/resúmenes, no el detalle de alertas — no se necesita algo pesado |
| Almacenamiento de archivos | Sistema de archivos del servidor o un bucket (S3 / equivalente) | Los `.xlsx` originales y consolidados deben quedar accesibles para descarga |
| Automatización de ingesta | Tarea programada (cron / scheduler) o *watcher* de carpeta | Para que el consolidado se genere solo, sin intervención manual |

*(Si el equipo ya tiene un stack definido — por ejemplo Node.js, u otro proveedor cloud — la arquitectura se adapta sin problema; lo importante es el diseño por capas, no la tecnología puntual.)*

### 5.3 Diseño extensible por tipo de reporte

Para que agregar "combustible" o "viajes" después no implique reescribir nada, cada tipo de reporte se define como una configuración, por ejemplo:

```yaml
reportes:
  alertas:
    carpeta_entrada: "alertas"
    hoja_origen: "Report Alerts"
    columna_placa: "Placa/Patente"
    columnas_obligatorias: ["Fecha", "Hora", "Alerta", "Placa/Patente"]
    columnas_plantilla:              # filtro fijo — ver §2.1
      - "Secuencia"
      - "Grupo"
      - "Alias"
      - "Placa/Patente"
      - "IMEI"
      - "Tipo de carrocería"
      - "Empresa"
      - "Conductor"
      - "Fecha"
      - "Hora"
      - "Latitud"
      - "Longitud"
      - "Dirección"
      - "Alerta"
      - "Odómetro (Km)"
      - "Zona"
      - "Velocidad (Km/h)"
      - "Horómetro (Hrs)"
      - "% Batería"
      - "Fecha GPS"
      - "Hora GPS"
      - "Estado GPS"
      - "Atención Alerta"
      - "Fecha Registro At."
      - "Hora Registro At."
    podar_columnas_vacias: true       # elimina del resultado las columnas de la plantilla sin datos — ver §2.2
    nombre_salida: "REPORTE_ALERTAS_{fecha}.xlsx"

  combustible:
    carpeta_entrada: "combustible"
    hoja_origen: "Fuel Report"        # a confirmar con el export real
    columna_placa: "Placa/Patente"
    columnas_obligatorias: ["Fecha", "Placa/Patente", "Consumo (gal)"]
    nombre_salida: "REPORTE_COMBUSTIBLE_{fecha}.xlsx"

  viajes:
    carpeta_entrada: "viajes"
    hoja_origen: "Trips Report"       # a confirmar con el export real
    columna_placa: "Placa/Patente"
    columnas_obligatorias: ["Fecha", "Placa/Patente", "Origen", "Destino"]
    nombre_salida: "REPORTE_VIAJES_{fecha}.xlsx"
```

El motor de consolidación (ingesta → normalización → generación de Excel) es **el mismo código** para los tres; solo cambia la configuración. Cuando llegue el momento de sumar combustible o viajes, se necesitará un ejemplo real de esos exports (igual que se hizo con alertas) para ajustar el mapeo de columnas exacto.

### 5.4 Dashboard (vista funcional)

Vista principal por día seleccionado:

- Selector de fecha (por defecto, hoy).
- Tarjetas resumen: total de placas esperadas vs. procesadas, total de alertas del día, alertas por severidad.
- Tabla por placa: nombre/alias, cantidad de alertas, última alerta registrada, estado (`OK` / `Pendiente` / `Error en archivo`).
- Botón de **descarga del consolidado** (`.xlsx`) y de los archivos individuales originales.
- Pestañas o filtro por tipo de reporte (Alertas / Combustible / Viajes) cuando esas fases estén activas.

No se requiere navegación histórica compleja tipo BI — es un panel operativo del día, en línea con lo solicitado.

---

## 6. Plan de fases y cronograma sugerido

| Fase | Contenido | Duración estimada* |
|---|---|---|
| **Fase 0 — Preparación** | Definir estructura de carpetas final, acceso a los archivos diarios reales (15-20 placas), validar variaciones de formato con más ejemplos | 3-5 días |
| **Fase 1 — Motor de consolidación de Alertas** | Ingesta, normalización por nombre de columna, aplicación de la plantilla de columnas del reporte final (§2.1) y poda de columnas vacías (§2.2), generación del `.xlsx` consolidado con hoja por placa (nombrada con la placa), manejo de errores/log | 1.5-2 semanas |
| **Fase 2 — Dashboard del día** | API de metadatos + interfaz web con resumen, tabla por placa y descargas | 1-1.5 semanas |
| **Fase 3 — Automatización de ejecución** | Programación automática (cron/scheduler) para que el consolidado se genere solo al llegar los archivos del día, notificaciones si falta algún archivo | 3-5 días |
| **Fase 4 — Extensión a Combustible** | Repetir el patrón de la Fase 1-2 para el reporte de combustible, usando su propio mapeo de columnas | 1-1.5 semanas |
| **Fase 5 — Extensión a Viajes** | Igual que Fase 4, para el reporte de viajes | 1-1.5 semanas |
| **Fase 6 — Hardening y entrega** | Pruebas con datos reales de varios días, ajustes de UX del dashboard, documentación de uso | 3-5 días |

\* Estimaciones para 1 desarrollador full-stack dedicado; se pueden paralelizar con más personas (ej. backend y frontend en simultáneo desde la Fase 2).

**Tiempo total estimado (Fases 0-3, alertas funcionando end-to-end):** ~4-5 semanas.
**Con Combustible y Viajes incluidos:** ~7-8 semanas.

---

## 7. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Los exports de Onway cambian de estructura sin aviso (nueva columna, columna renombrada) | Mapeo por nombre de columna (no por posición) + validación de columnas obligatorias con alerta clara si falta alguna |
| Un archivo del día llega corrupto o vacío | El proceso no debe detener todo el consolidado: se marca esa placa como "Error" en el dashboard y se sigue con las demás |
| Nombre de placa inconsistente entre archivos (ej. mayúsculas/espacios) | Normalizar el valor de placa (trim, mayúsculas, formato estándar) antes de usarlo como nombre de hoja |
| Crecimiento de la flota (más de 20 placas) | El diseño no tiene límite fijo — la generación de hojas es dinámica según los archivos presentes en la carpeta del día |
| Reportes de combustible/viajes con estructura muy distinta a lo previsto | Se validará con un archivo de ejemplo real de cada uno antes de construir esa fase (mismo enfoque que se usó aquí con alertas) |

---

## 8. Próximos pasos inmediatos

1. Confirmar la estructura de carpetas real que ya usan (o adoptar la propuesta en §4).
2. Confirmar el stack tecnológico si ya existe uno preferido en la organización (o se sigue lo sugerido en §5.2).
3. Compartir 1-2 ejemplos reales de los reportes de **combustible** y **viajes** de Onway, para diseñar su mapeo de columnas igual que se hizo aquí con alertas.
4. Iniciar Fase 0 y Fase 1 con el motor de consolidación de Alertas, usando como referencia exacta el formato de `REPORTE_ALERTAS.xlsx` ya compartido.

---

*Documento generado a partir del análisis de los 3 archivos de ejemplo proporcionados (`alerts_...xlsx` x2 y `REPORTE_ALERTAS.xlsx`).*
