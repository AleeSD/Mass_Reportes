# Plan de Desarrollo — Reporte de Historial, Consolidado Combinado y Corrección de Dirección

Fecha: 2026-09-24
Basado en: estado actual del proyecto (`Estado actual y mejoras pendientes.md`, `README.md`), el consolidado real `REPORTE_ALERTAS_2026-09-18.xlsx`, y el export real de historial `history_...xlsx`.

## 1. Alcance de esta ampliación

Se solicitaron 4 cambios, que en este documento se tratan como un solo paquete de trabajo porque están relacionados entre sí:

1. Renombrar la carpeta de origen de alertas de `reportes_onway` a `alertas_onway`.
2. Agregar un nuevo tipo de reporte, **Historial**, que se ingiere y normaliza con el mismo motor que alertas, desde una nueva carpeta `historial_onway/<mes>/<dia>`.
3. El consolidado final por placa deja de ser exclusivo de alertas: debe **unir alertas + historial en una sola hoja por placa**, ampliando las columnas para incluir todos los campos propios de historial.
4. Corregir el campo `Dirección`, que hoy no se inserta correctamente porque el dato real viene dentro de un vínculo (fórmula), y hay que extraer el texto entre comillas al final de ese vínculo.

Antes de entrar al diseño, hay dos hallazgos del análisis de los archivos reales que cambian el diseño y que es importante dejar explícitos.

---

## 2. Hallazgos del análisis de los archivos adjuntos

### 2.1 Colisión de nombres: "Historial" ya significa otra cosa en el roadmap actual

En `Estado actual y mejoras pendientes.md`, la sección 6 define una fase llamada **"Historial operativo"**, que es una vista en el dashboard para consultar **ejecuciones pasadas del sistema** (qué días se procesaron, con qué estado, cuántas placas, etc.), usando la tabla de ejecuciones que ya existe en SQLite. Esa fase **no tiene relación** con lo que se pide ahora.

Lo que se pide en este documento es un **nuevo tipo de reporte de Onway** llamado "Historial" (igual que "Alertas" o "Combustible" son tipos de reporte), que trae un registro periódico de posición/estado del vehículo por placa (similar a un track GPS), y que en varias filas también incluye alertas puntuales (`Vehículo encendido`, `Inicio de ralentí`, `Exceso de velocidad en segmento vial`, etc.).

**Para evitar confusión en el resto del proyecto (código, configuración, documentación y este mismo plan), se recomienda renombrar la fase existente del roadmap:**

| Nombre actual (ambiguo) | Nombre propuesto |
|---|---|
| "Historial operativo" (vista de ejecuciones pasadas del sistema) | **"Historial de ejecuciones"** |
| "Historial" (nuevo tipo de reporte de Onway, este documento) | **"Reporte de Historial"** o **"Historial de posiciones"** |

Este cambio de nombre es solo documental/de configuración (`tipo: historial` en `reportes.yaml` para el reporte de Onway, y renombrar la sección del dashboard de ejecuciones), pero es importante hacerlo antes de escribir código para no mezclar ambos conceptos.

### 2.2 El campo `Dirección` no es el único afectado por el problema de fórmulas

Se pidió corregir `Dirección`, y al revisar el consolidado real (`REPORTE_ALERTAS_2026-09-18.xlsx`) se confirma el síntoma: la columna `Dirección` contiene literalmente el texto **`[object Object]`** en vez de la dirección. Pero al revisar el mismo archivo, **`Estado GPS` y `Atención Alerta` tienen exactamente el mismo problema** — también contienen `[object Object]` en cada fila.

La causa es la misma en los tres casos: en el export original de Onway, esas tres columnas **no son valores planos, son fórmulas de Excel**, y el archivo no trae el resultado ya calculado (se comprobó abriendo el export con `data_only=True`: las tres celdas devuelven vacío, es decir, Onway nunca calculó ni guardó el resultado, solo la fórmula). Ejemplos reales encontrados en los exports:

```
Dirección:        =HYPERLINK("https://www.google.com/maps/search/?api=1&query=-12.212955,-76.959015","Avenida Villa del Mar, Villa El Salvador, Lima")
Estado GPS:        =IF("NOGPS"="NOGPS","GPS Antiguo","En línea")
Atención Alerta:   =IF(0=0,"Sin atender", IF(0=1,"Atendida","Atendida y Reportada"))
```

Es decir, Onway no calcula el resultado: "hornea" el valor real dentro de la propia fórmula (por ejemplo, si el vehículo está atendido, exporta `=IF(0=0,...)`, y si no, exporta `=IF(1=0,...)` o similar) y deja que Excel la resuelva al abrir el archivo. Cuando el motor actual lee estas celdas con la librería de Excel del backend (Node.js), una celda con fórmula no calculada se recibe como un **objeto** (`{ formula, result }` o equivalente), no como texto. Como el código actual inserta ese objeto directamente en la celda de salida, JavaScript lo convierte a la cadena literal `"[object Object]"`.

**Implicación para el alcance de esta ampliación:** lo que se pidió arreglar para `Dirección` (extraer el texto entre comillas al final del vínculo) es la solución correcta para `Dirección`, pero como `Estado GPS` y `Atención Alerta` tienen la misma causa raíz, se recomienda resolver el problema de forma general (ver §5), no solo para `Dirección`, para no dejar dos columnas rotas sin que se haya pedido explícitamente.

### 2.3 Estructura de columnas del reporte de Historial (export real)

El export real de historial (`history_...xlsx`, hoja `Report History`) trae 18 columnas:

`Secuencia, Grupo, Alias, Placa/Patente, Tipo de carrocería, Empresa, Fecha, Hora, Latitud, Longitud, Dirección, Velocidad (Km/h), Odómetro (Km), Horómetro (Hrs), Alerta, Zona/Marca, Conductor, Notas`

Comparado con la plantilla de 25 columnas ya definida para Alertas (documento de arquitectura previo, §2.1):

| Situación | Columnas |
|---|---|
| **Comunes a ambos** (mismo nombre) | Secuencia, Grupo, Alias, Placa/Patente, Tipo de carrocería, Empresa, Conductor, Fecha, Hora, Latitud, Longitud, Dirección, Alerta, Odómetro (Km), Velocidad (Km/h), Horómetro (Hrs) |
| **Solo en Alertas** | IMEI, % Batería, Fecha GPS, Hora GPS, Estado GPS, Atención Alerta, Fecha Registro At., Hora Registro At. |
| **Solo en Historial** | Zona/Marca, Notas |

Dos aclaraciones importantes:

- **`Zona/Marca` (historial) no es necesariamente lo mismo que `Zona` (alertas).** El nombre distinto probablemente refleja que Onway usa ese campo para dos cosas distintas según el tipo de reporte (zona geográfica vs. marca del punto de interés). **Se recomienda mantenerlas como columnas separadas** en el consolidado (`Zona` y `Zona/Marca`) en vez de fusionarlas, hasta confirmar con más ejemplos que representan el mismo dato. Fusionarlas a ciegas podría mezclar información distinta en una sola columna.
- En el export de ejemplo, `Empresa`, `Tipo de carrocería`, `Conductor`, `Notas` y `Zona/Marca` llegaron **vacías en todas las filas**. Esto es consistente con la política ya definida (§2.2 del documento anterior): se podan si quedan vacías a nivel de todo el reporte del día, pero **no se debe asumir que siempre estarán vacías** — la plantilla debe contemplarlas igual.

También se confirmó que las filas de Historial **no son solo "puntos GPS neutros"**: la columna `Alerta` sí trae valores en varias filas (`Vehículo encendido`, `Vehículo apagado`, `Inicio de ralentí`, `Fin de ralentí`, `Exceso de velocidad en segmento vial`), es decir, el reporte de Historial es más parecido a un **log continuo de posición y eventos**, mientras que Alertas es un **listado curado solo de alertas**, con columnas de seguimiento/atención que Historial no tiene (`Estado GPS`, `Atención Alerta`, `IMEI`, etc.). Esto se retoma en el diseño del consolidado combinado (§4).

---

## 3. Cambio 1 — Renombrar `reportes_onway` a `alertas_onway`, y nueva carpeta `historial_onway`

### 3.1 Estructura de carpetas resultante

```
alertas_onway/                         ← antes "reportes_onway"
  setiembre/17-09-2026/*.xlsx          ← estructura actual del equipo (se mantiene)
  2026-09-17/alertas/*.xlsx            ← estructura recomendada (se mantiene)

historial_onway/                       ← nueva
  setiembre/17-09-2026/*.xlsx          ← misma convención que alertas hoy
  2026-09-17/historial/*.xlsx          ← equivalente recomendado, para consistencia futura

_procesados/
  2026-09-17/
    REPORTE_ALERTAS_2026-09-17.xlsx        ← se mantiene, por compatibilidad y para quien solo necesite alertas
    REPORTE_HISTORIAL_2026-09-17.xlsx      ← nuevo, historial solo (útil para depurar/validar el tipo por separado)
    REPORTE_CONSOLIDADO_2026-09-17.xlsx    ← nuevo, la unión de ambos por placa (ver §4)
```

**Nota de decisión de diseño:** se mantiene la generación del `REPORTE_ALERTAS_...xlsx` "solo alertas" y del `REPORTE_HISTORIAL_...xlsx` "solo historial" además del combinado, en vez de eliminar los individuales. Motivo: permite procesar y validar cada tipo de forma independiente (por ejemplo, si historial llega tarde o con error un día, alertas se sigue generando igual), y facilita las pruebas automatizadas por tipo. El combinado se genera como un tercer archivo, a partir de los dos primeros ya normalizados.

### 3.2 Tareas técnicas

- Actualizar la variable/constante de ruta raíz de alertas en el motor y en `config/reportes.yaml` de `reportes_onway` a `alertas_onway`.
- Agregar `historial_onway` como nueva raíz de carpetas, reutilizando exactamente la misma lógica de descubrimiento de fechas que ya existe para alertas (incluyendo la corrección P0 pendiente de "Descubrimiento de fechas" — debe implementarse pensando en ambas raíces desde el inicio, no solo en alertas).
- Actualizar `README.md` y cualquier script/documentación que mencione `reportes_onway`.
- Si existen archivos históricos ya guardados bajo `reportes_onway`, definir si se migran (mover/renombrar la carpeta) o se deja como carpeta legada de solo lectura. Se recomienda simplemente **renombrar la carpeta existente** (no copiar), ya que hoy solo contiene alertas.

---

## 4. Cambio 2 y 3 — Ingesta de Historial y consolidado combinado por placa

### 4.1 Ingesta y normalización de Historial (mismo motor que Alertas)

Se reutiliza el mismo pipeline ya construido para alertas (ingesta → normalización por nombre de columna → aplicación de plantilla → poda de columnas vacías), agregando una nueva entrada en `config/reportes.yaml`:

```yaml
reportes:
  historial:
    carpeta_entrada: "historial_onway"
    hoja_origen: "Report History"
    columna_placa: "Placa/Patente"
    columnas_obligatorias: ["Fecha", "Hora", "Placa/Patente"]
    columnas_plantilla:
      - "Secuencia"
      - "Grupo"
      - "Alias"
      - "Placa/Patente"
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
      - "Zona/Marca"
      - "Velocidad (Km/h)"
      - "Horómetro (Hrs)"
      - "Notas"
    podar_columnas_vacias: true
    nombre_salida: "REPORTE_HISTORIAL_{fecha}.xlsx"
```

Nota: a diferencia de Alertas (donde `Alerta` es prácticamente obligatoria porque cada fila **es** una alerta), en Historial `Alerta` puede venir vacía en la mayoría de filas (es normal, representa un punto de posición sin evento). No debe tratarse como columna obligatoria ni usarse para invalidar filas.

### 4.2 Diseño del consolidado combinado por placa

Este es el cambio de mayor impacto en el motor, porque hoy el sistema genera **un archivo por tipo de reporte**, y ahora se pide un archivo adicional que **combina dos tipos en un mismo libro, hoja por placa**.

**Columnas del consolidado combinado** (unión de ambas plantillas, sin duplicar las comunes):

| # | Columna | Origen |
|---|---|---|
| 1 | Secuencia | Común |
| 2 | Grupo | Común |
| 3 | Alias | Común |
| 4 | Placa/Patente | Común |
| 5 | **Origen del registro** *(nueva, recomendada)* | — |
| 6 | IMEI | Solo Alertas |
| 7 | Tipo de carrocería | Común |
| 8 | Empresa | Común |
| 9 | Conductor | Común |
| 10 | Fecha | Común |
| 11 | Hora | Común |
| 12 | Latitud | Común |
| 13 | Longitud | Común |
| 14 | Dirección | Común |
| 15 | Alerta | Común |
| 16 | Odómetro (Km) | Común |
| 17 | Zona | Solo Alertas |
| 18 | Zona/Marca | Solo Historial |
| 19 | Velocidad (Km/h) | Común |
| 20 | Horómetro (Hrs) | Común |
| 21 | % Batería | Solo Alertas |
| 22 | Fecha GPS | Solo Alertas |
| 23 | Hora GPS | Solo Alertas |
| 24 | Estado GPS | Solo Alertas |
| 25 | Atención Alerta | Solo Alertas |
| 26 | Fecha Registro At. | Solo Alertas |
| 27 | Hora Registro At. | Solo Alertas |
| 28 | Notas | Solo Historial |

Sobre esta tabla:

- Las filas que vienen de Alertas dejan vacías las columnas exclusivas de Historial (`Zona/Marca`, `Notas`), y viceversa. La **poda de columnas vacías se sigue aplicando sobre el resultado final** (si en un día ninguna fila usa `Notas`, se elimina igual que hoy).
- **Se recomienda agregar la columna "Origen del registro"** (valores `Alertas` / `Historial`), aunque no se pidió explícitamente, por una razón concreta: al unir ambos reportes en una sola hoja, una fila con `Alerta = "Vehículo encendido"` podría venir de Alertas (curada, con seguimiento) o de Historial (log crudo), y son operativamente distintas — una tiene `Estado GPS`/`Atención Alerta` con seguimiento, la otra no. Sin esta columna, sería imposible distinguir el origen de cada fila solo mirando el Excel. Si se prefiere no agregarla, se puede omitir, pero se perdería esa trazabilidad.
- **Orden sugerido de filas dentro de cada hoja:** por `Fecha` + `Hora`, mezclando registros de ambos orígenes cronológicamente (en vez de "primero todas las de Alertas, luego todas las de Historial"), porque así la hoja se lee como una línea de tiempo real del vehículo ese día. Confirmar si este orden es el esperado o si prefieren bloques separados por origen dentro de la misma hoja.
- **Deduplicación:** algunos eventos de Historial (`Vehículo encendido`, `Vehículo apagado`) podrían coincidir en fecha/hora con el mismo evento reportado en Alertas para esa placa. No se recomienda deduplicar automáticamente en esta primera versión (podría ocultar información real), pero sí dejarlo registrado como pregunta abierta a validar con más días de datos reales (ver §7).

### 4.3 Cambio de arquitectura necesario en el motor

Hoy el motor asume "1 tipo de reporte → 1 archivo de salida". Para el consolidado combinado se necesita un concepto nuevo: **un reporte compuesto**, que toma la salida ya normalizada de dos (o más) tipos base y los combina por placa. Se propone:

```yaml
reportes_compuestos:
  consolidado_diario:
    tipos_incluidos: ["alertas", "historial"]
    columna_origen: "Origen del registro"
    orden_filas: "fecha_hora"
    podar_columnas_vacias: true
    nombre_salida: "REPORTE_CONSOLIDADO_{fecha}.xlsx"
```

Este diseño es intencionalmente genérico para que, cuando se agreguen combustible o viajes más adelante, se pueda decidir por configuración si también entran al consolidado combinado, sin rediseñar el motor otra vez.

**Pendiente a validar con negocio:** ¿combustible y viajes también deberían entrar a este mismo consolidado combinado en el futuro, o el combinado es exclusivo de alertas + historial (por ser ambos "eventos de movimiento/posición"), mientras que combustible y viajes se quedan como reportes independientes por tener una granularidad distinta (un viaje no es un punto en el tiempo, es un rango)? Se recomienda esto último, pero queda como decisión a confirmar antes de la fase de viajes.

---

## 5. Cambio 4 — Corrección del campo Dirección (y de Estado GPS / Atención Alerta)

### 5.1 Solución para `Dirección` (lo solicitado explícitamente)

Tal como se describió, la dirección real está en el segundo argumento de la fórmula `HYPERLINK`, entre comillas, justo antes del paréntesis de cierre:

```
=HYPERLINK("https://www.google.com/maps/search/?api=1&query=-12.212955,-76.959015","Avenida Villa del Mar, Villa El Salvador, Lima")
                                                                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                                                      esto es lo que debe quedar en la celda "Dirección"
```

Solución técnica: al normalizar la celda `Dirección`, si el valor recibido es una fórmula (no texto plano), extraer con una expresión regular el contenido entre comillas que sigue a la última coma antes del paréntesis final de `HYPERLINK(...)`. No depender del "valor calculado" de la celda, porque se confirmó que Onway nunca guarda ese valor calculado en el archivo — hay que leer y parsear el texto de la fórmula.

Como beneficio adicional, esta misma extracción permite conservar también la URL del mapa (primer argumento) como un dato aparte si en el futuro se quiere ofrecer un enlace clicable a Google Maps en el dashboard o en el Excel de salida (no incluido en el alcance de este cambio, se deja solo como nota para el backlog).

### 5.2 Corrección relacionada: `Estado GPS` y `Atención Alerta`

Mismo problema, mismo tipo de solución, pero con fórmulas `IF` en vez de `HYPERLINK`. Se observó que Onway no calcula la condición: exporta la comparación ya resuelta en literales (por ejemplo `=IF(0=0,"Sin atender", IF(0=1,"Atendida","Atendida y Reportada"))`, donde el `0=0` siempre es válido cuando corresponde "Sin atender").

Se propone implementar un **evaluador mínimo de fórmulas literales**, capaz de resolver únicamente los dos patrones que Onway usa en estos exports:

- `HYPERLINK("url","texto")` → devuelve `texto`.
- `IF(a=b, "X", Y)`, incluyendo anidado (`IF(..., IF(...), ...)`), donde `a` y `b` son siempre literales (texto o número, nunca referencias a otras celdas) → se evalúa la comparación literal y se devuelve el resultado correspondiente.

No se requiere una librería completa de cálculo de fórmulas de Excel para esto — es un evaluador acotado a estos dos patrones conocidos, ya que así es como Onway genera estos tres campos hoy.

### 5.3 Manejo de casos no contemplados (robustez)

Para que este tipo de error no vuelva a ocurrir en silencio con otra columna en el futuro (por ejemplo, si Onway agrega una fórmula nueva en otro campo), se recomienda un cambio general en la capa de lectura de celdas:

- Si una celda contiene una fórmula que el evaluador acotado (§5.2) no reconoce, **no insertar el objeto crudo en el resultado**. En su lugar, dejar la celda vacía y registrar un `warning` en el log de esa ejecución (`"Fórmula no reconocida en columna X, fila Y, placa Z"`), para que quede visible en el dashboard como una alerta de calidad de datos, no como un dato incorrecto silencioso.
- Agregar una verificación de calidad post-generación (antes de dar la ejecución por `ok`): si el archivo de salida contiene la cadena literal `[object Object]` en cualquier celda, la ejecución debe marcarse como `parcial` o `error`, nunca como `ok`. Esto sirve como red de seguridad adicional, independiente de que se corrija el caso puntual de estas 3 columnas.

---

## 6. Plan de pruebas para esta ampliación

Además de las pruebas ya planificadas a nivel de motor (P1 del documento de estado actual), agregar específicamente:

- `Dirección` con fórmula `HYPERLINK` → se extrae el texto correcto, no la URL ni un objeto.
- `Estado GPS` y `Atención Alerta` con fórmulas `IF` (casos verdadero y falso, incluido el anidado) → se extrae el texto correcto.
- Una fórmula no reconocida en cualquier columna → la celda queda vacía y se registra el warning, la ejecución no queda como `ok`.
- Ingesta de historial con la carpeta `historial_onway` en ambas convenciones de fecha (actual y recomendada).
- Historial con columnas vacías (`Empresa`, `Conductor`, `Notas`, `Zona/Marca`) → se podan igual que en alertas.
- Consolidado combinado: una placa con datos en alertas y en historial el mismo día → una sola hoja, filas ordenadas por fecha/hora, columna "Origen del registro" correcta.
- Consolidado combinado: una placa con datos solo en alertas, o solo en historial (no ambos) → la hoja se genera igual, sin filas ni columnas rotas.
- Renombre de carpeta: confirmar que el descubrimiento de archivos deja de buscar en `reportes_onway` y busca en `alertas_onway` e `historial_onway`.

---

## 7. Preguntas abiertas a confirmar antes de programar

1. ¿`Zona` (alertas) y `Zona/Marca` (historial) representan el mismo dato o son conceptos distintos? Se recomienda mantenerlas separadas hasta confirmar con Onway o con más ejemplos.
2. ¿El orden de filas del consolidado combinado debe ser cronológico mezclado, o bloques separados (primero alertas, luego historial) dentro de la misma hoja?
3. ¿Se debe deduplicar cuando el mismo evento aparece en Alertas y en Historial el mismo día/hora para la misma placa, o se dejan ambas filas (con la columna Origen distinguiéndolas)?
4. ¿Combustible y viajes deben integrarse a futuro a este mismo consolidado combinado, o quedan como reportes independientes? (se recomienda que queden independientes, ver §4.3).
5. ¿Se debe seguir generando `REPORTE_ALERTAS_...xlsx` y `REPORTE_HISTORIAL_...xlsx` por separado además del combinado, o el combinado los reemplaza? (se recomienda mantener los tres, ver §3.1).
6. ¿La corrección de `Estado GPS` / `Atención Alerta` (no pedida explícitamente) se incluye en este mismo ciclo de trabajo, o se prioriza aparte? Se recomienda incluirla porque es la misma causa raíz que `Dirección` y el esfuerzo adicional es mínimo.

---

## 8. Fases y estimación

| Fase | Contenido | Estimación |
|---|---|---|
| **Fase A — Renombre y nueva carpeta** | Renombrar `reportes_onway` → `alertas_onway`, agregar `historial_onway`, actualizar descubrimiento de fechas para ambas raíces, actualizar README/config | 2-3 días |
| **Fase B — Ingesta y plantilla de Historial** | Configuración `historial` en `reportes.yaml`, normalización, plantilla de columnas, poda de vacíos, generación de `REPORTE_HISTORIAL_...xlsx` de forma independiente | 3-4 días |
| **Fase C — Corrección de fórmulas (Dirección, Estado GPS, Atención Alerta)** | Evaluador acotado de fórmulas `HYPERLINK`/`IF`, manejo de fórmulas no reconocidas, verificación de calidad post-generación (`[object Object]` nunca debe llegar a `ok`) | 3-4 días |
| **Fase D — Consolidado combinado por placa** | Reporte compuesto `alertas + historial`, columna "Origen del registro", unión de columnas, orden cronológico, poda de vacíos sobre el resultado combinado | 1-1.5 semanas |
| **Fase E — Dashboard** | Reflejar el nuevo tipo `historial` y el reporte combinado en el selector, resumen y descargas del dashboard | 3-5 días |
| **Fase F — Pruebas y documentación** | Casos de prueba de §6, actualizar `README.md` y `Estado actual y mejoras pendientes.md` con el nuevo estado | 3-5 días |

**Total estimado:** aproximadamente 3.5 - 4.5 semanas para un desarrollador full-stack, sin contar el tiempo de espera por confirmación de las preguntas abiertas del §7.

**Recomendación de orden respecto al backlog existente:** dado que ya se cuenta con un export real de historial (a diferencia de combustible y viajes, que siguen sin validar), se recomienda intercalar este trabajo **antes** de activar combustible, aprovechando además que las correcciones P0 del motor (descubrimiento de fechas, agrupación por placa, columnas obligatorias, estados consistentes) benefician por igual a alertas e historial, y conviene resolverlas una sola vez para ambos tipos.

---

## 9. Checklist de criterios de terminado

- [ ] La carpeta `alertas_onway` reemplaza a `reportes_onway` en código, configuración y documentación.
- [ ] `historial_onway` se descubre correctamente en ambas convenciones de fecha.
- [ ] `REPORTE_HISTORIAL_YYYY-MM-DD.xlsx` se genera con la plantilla definida en §4.1 y poda de columnas vacías.
- [ ] `REPORTE_CONSOLIDADO_YYYY-MM-DD.xlsx` combina alertas e historial en una hoja por placa, con las columnas de §4.2 y sin duplicar columnas comunes.
- [ ] Ninguna celda del resultado final contiene la cadena `[object Object]`.
- [ ] `Dirección` muestra el texto de la dirección, no la URL ni un objeto.
- [ ] `Estado GPS` y `Atención Alerta` muestran el texto resuelto, no un objeto.
- [ ] Una fórmula no reconocida no rompe la ejecución: queda vacía, con warning en el log, y la ejecución no se marca como `ok`.
- [ ] El dashboard permite seleccionar y descargar alertas, historial y el consolidado combinado por separado.
- [ ] Existen pruebas automatizadas para cada punto de §6.
- [ ] La documentación (`README.md`, `Estado actual y mejoras pendientes.md`) queda actualizada con el nuevo estado, incluyendo el cambio de nombre de "Historial operativo" a "Historial de ejecuciones" (§2.1).
