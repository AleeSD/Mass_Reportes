# Plan de desarrollo definitivo — Hoja maestra de tiempos de flota + Dashboard operativo

**Proyecto:** Reporte Alertas Onway · v1.3.0 → **v1.4.0**
**Fecha:** 2026-09-28
**Base:** `Estado_actual_y_mejoras_pendientes.md` + reportes reales del 24/09 y 27/09, exports crudos de Onway (alertas e historial), `TIENDAS-MASS.xlsx`, `GEOCERCAS.xlsx` y la lista de 22 placas.

---

## 1. Resumen ejecutivo

Se agregan al **`REPORTE_CONSOLIDADO`** tres hojas nuevas: `RESUMEN_FLOTA` (maestra, una fila por placa en orden alfabético), `VUELTAS` y `VISITAS`. Calculan, para cada vehículo, cuándo llega y sale de BSF, de cada tienda y de Base OS, y cuánto tarda cada tramo. El dashboard suma una vista **"Operación de flota"** con los mismos tiempos en gráficos y tablas.

Los reportes por placa de Alertas e Historial **no cambian**: misma carpeta de entrada, mismo formato. Las hojas por placa del consolidado tampoco cambian. Las hojas nuevas se colocan antes de ellas.

### 1.1 Decisiones confirmadas por operaciones

| # | Decisión |
|---|---|
| D1 | Se generan **3 hojas nuevas** (maestra + vueltas + visitas) para tener todo organizado y filtrable. |
| D2 | Solo en el **consolidado**. Los reportes por placa quedan tal cual. |
| D3 | **La ruta se corre desde el primer encendido del día**, sea cual sea la base de origen. No se controla dónde duerme ni de dónde sale cada vehículo. |
| D4 | **Fin de servicio y de vuelta:** tras una salida de tienda, si el vehículo no va a BSF, a Base OS ni a otra tienda, el servicio y la vuelta terminan en esa salida. |
| D5 | Se procesan los días **desde el 28/09 en adelante** (zonas y alertas ya configuradas). No se reprocesa el histórico. |
| D6 | Operación diaria: cada día a las **8 am** se generan y suben los reportes por placa del **día anterior**; el sistema genera el consolidado y el análisis de ese día completo. |
| D7 | `FILMS A OSLO` (fila sin código en las geocercas) **no es tienda**: se descarta. |
| D8 | Solo se visualizan **tiempos reales**. No hay tiempos previstos ni comparación contra ruta (la ruta cambia cada día). |

### 1.2 Zonas y alertas de Onway (confirmadas)

| Zona en Onway | Alerta en Onway | Qué es |
|---|---|---|
| `MASS BSF 1` | INGRESO/SALIDA BSF | Almacén central (BSF) |
| `BASE-OSLOGISTICS` | INGRESO/SALIDA BASE OS | Base de los vehículos OS |
| `CÓDIGO-LOCAL` (ej. `1160-ALLENDE1VMT MS`) | INGRESO/SALIDA TDA MASS | 115 tiendas MASS |

En los exports de Onway el nombre de la regla **no aparece**: la columna `Alerta` trae "Llegó a la zona" o "Salió de zona", y el dato que identifica el lugar es la columna `Zona`. Por eso el sistema clasifica **por nombre de zona**, no por nombre de alerta.

---

## 2. Alcance

**Incluye**
1. Motor de "línea de tiempo de flota": reconstruye visitas y vueltas desde las alertas.
2. Hojas `RESUMEN_FLOTA`, `VUELTAS` y `VISITAS` en el consolidado.
3. Persistencia en SQLite y endpoints nuevos.
4. Vista "Operación de flota" en el dashboard.
5. Pruebas automatizadas con reportes reales como fixtures.
6. Ajustes de operación diaria (procesar el día anterior, estabilidad de archivos).

**No incluye (fase futura, ya preparada)**
- Comparación contra ruta programada o tiempos previstos (D8).
- Reproceso de días anteriores al 28/09 (D5).
- Mapa, notificaciones, anomalías, autenticación.
- Control de bases propias de cada vehículo (D3).

**Opcional (F7, fuera del camino crítico):** validación cruzada con el historial por coordenadas y km reales por vuelta (ver §11).

---

## 3. Hallazgos en los datos reales que condicionan el diseño

| # | Hallazgo | Evidencia | Consecuencia |
|---|---|---|---|
| H1 | La zona se identifica por la columna `Zona`; `Alerta` es genérica. | 27/09: "Llegó a la zona" / "Salió de zona" con `MASS BSF 1` y `343-PASTOR SEVILLA 1`. | Clasificar por nombre de zona (BSF, Base OS, tienda). Alias de alertas en YAML por si Onway cambia el texto. |
| H2 | El nombre de tienda es `CÓDIGO-LOCAL`, pero el `LOCAL` del catálogo viene con espacios sobrantes (`' M. SUNSET1 PH'`, `'TORRES 3 SJM MS '`) y **un nombre de zona trae un espacio no separable** (`324-MASS\u00a0SAN JUAN`). | Cruce de 14 zonas del 27/09 contra `GEOCERCAS.xlsx`: 13 coinciden exacto, 1 no (espacio final); la 324 trae `\u00a0`. | Unir siempre **por código numérico** (`^(\d+)-`), y normalizar el texto (NFKC, quitar espacios raros, mayúsculas). |
| H3 | `GEOCERCAS.xlsx`: 115 tiendas con código, coordenadas válidas, sin duplicados; coincide 1 a 1 con `TIENDAS-MASS.xlsx`. Trae `CD MASS` (4 centros de distribución) y `DISTRITO` (2 tiendas sin ninguno: 1149 y 2927). Una fila sin código (`FILMS A OSLO`). | Lectura del archivo. | Catálogo de tiendas con CD y distrito. La fila sin código se descarta con un aviso en el log (D7). Solo hay un punto por tienda, sin radio: no se usa para detectar visitas (se usan las alertas). |
| H4 | **Las alertas de zona son la fuente principal** y ya traen tienda, BSF y (desde el 28/09) Base OS. | Reporte del 27/09: 26 "Llegó" y 27 "Salió". | El motor se basa en alertas, sin inferencia por coordenadas. |
| H5 | **Ruido en los eventos:** `Salió` duplicado (AAR-880 en BSF 11:24:50 y 11:24:55; BXQ-847 en la 257 07:53:24), `Llegó` repetido sin salida (AAR-880 en BSF 08:03:47 y 11:24:39), rebotes de geocerca (1191: sale 08:16:18, entra 08:24:05). | Hojas AAR-880 y BXQ-847 del 27/09. | Depuración: duplicados en 120 s, fusión de rebotes en 10 min, llegada repetida sin salida = misma estancia. |
| H6 | **Pasos por zona:** entradas de segundos que no son visitas. | Duraciones de los pasos del 27/09: 5 s, 13 s, 52 s, 52 s, 60 s, 71 s. Las visitas reales más cortas: 8 min 9 s y 8 min 35 s. | Una estancia en tienda de **menos de 3 min** (tras fusionar) se marca "paso por zona": no cuenta como visita. Hay separación clara entre 71 s y 8 min. |
| H7 | **Estancias largas en BSF.** 24/09: 1–3 h. 27/09: 1 h 28 a 5 h 09. | Estancias BSF de las 7 placas del 27/09. | El resaltado de estancia larga es configurable (inicial 240 min) y se recalibra con datos del 28/09 en adelante. |
| H8 | **El historial repite los eventos de alertas** y agrega la traza de posiciones (C6E-921: 767 filas, cada ~15 s en movimiento). Las 128 filas con `Alerta` coinciden con las del reporte de alertas. | `history_*.xlsx` vs hoja C6E-921. | Al construir el consolidado combinado **el análisis debe usar solo las filas con `Origen = Alertas`** (o la fuente Alertas antes de mezclar), o los eventos se duplican. Regla obligatoria con prueba. |
| H9 | `Empresa` y `Conductor` llegan vacíos en los exports. `Dirección`, `Estado GPS` y `Atención Alerta` son fórmulas sin valor calculado. | Lectura de ambos exports. | La empresa sale de `flota.yaml`. El parser de fórmulas existente ya cubre el resto. |
| H10 | Placas con formato mixto: la lista trae `AJQ739`, `CPH709`, `CPF781`; los reportes traen `AJQ-739`. Todos los vehículos tienen Grupo = `MASS BSF`. | Lista vs hojas. | Normalizar placa (mayúsculas, sin guion) como clave. El Grupo no distingue flota. |
| H11 | Cobertura variable: el 24/09 llegaron 20 de las 22 placas; el 27/09, 7. | Hojas de cada archivo. | La hoja maestra parte de la **lista de flota (22)**, y las que no tienen reporte salen como "Sin reporte del día". |
| H12 | Odómetro no confiable en algunos equipos (BXT-918: 0 km en el día). `Estado GPS = GPS Antiguo` en 27 de 414 eventos (la hora del evento difiere de la hora GPS). | Rango de odómetro; columna Estado GPS. | La hora oficial es `Hora` (coincide con lo que ve el usuario en Onway). No se calculan km en esta versión. Los eventos con GPS antiguo llevan una marca. |
| H13 | Un vehículo puede tener eventos en la madrugada (F6V-794: 01:19, "Fin de ralentí"). | Consolidado del 24/09. | El inicio de jornada es el primer **`Vehículo encendido`**, no el primer evento del día. |
| H14 | Plantillas del YAML vs export real de Historial: el real tiene 21 columnas (incluye `IMEI`, `Etiquetas`, `% Batería`); la plantilla tiene 18. | `history_*.xlsx`. | Ajuste en `reportes.yaml` (F0). El mapeo es por nombre de columna, así que el orden no afecta. |

---

## 4. Definiciones y reglas de negocio

Todos los tiempos usan `Fecha` + `Hora` de la alerta (zona horaria America/Lima). Las duraciones se muestran en `h:mm:ss`.

### 4.1 Eventos y estancias

- **Evento de zona:** alerta "Llegó a la zona" o "Salió de zona" cuya `Zona` es `MASS BSF 1` (BSF), `BASE-OSLOGISTICS` (Base OS) o `CÓDIGO-LOCAL` (tienda, si el código está en el catálogo).
- **Estancia:** par Llegó→Salió de una zona. Reglas de depuración, en este orden:
  1. **Salió duplicado:** mismo tipo y zona dentro de 120 s de otro igual → se ignora el segundo.
  2. **Llegó repetido sin salida** (la zona ya está abierta) → se ignora; queda marca `llegada repetida`.
  3. **Rebote:** un Llegó a la misma zona dentro de 10 min del último Salió → se reabre la estancia anterior (sigue siendo la misma visita).
  4. **Salió sin Llegó:** la llegada queda `faltante` (el vehículo ya estaba dentro, por ejemplo al inicio del día en Base OS).
  5. **Llegó sin Salió** al final del día: estancia abierta, salida `faltante`.
- **Paso por zona:** estancia en tienda de menos de 180 s. Se guarda en `VISITAS` con la marca `paso por zona`, pero no cuenta como visita ni ocupa número de tienda.

### 4.2 Vueltas y fin de servicio

- **Inicio de jornada:** primer `Vehículo encendido` del día (D3). Si no hay ninguno, `Se movio` (marcado `estimado`). Se ignoran como inicio: `Encendido o Entró en cobertura`, ralentí, `Fuente principal conectada`, batería.
- **Vuelta:** tramo entre un **origen** y un **cierre**.
  - **Origen:** salida de BSF o de Base OS, o el inicio de jornada si el vehículo sale con la carga hecha (la **primera vuelta con precarga** empieza sin pasar por BSF).
  - **Cierre:** lo primero que ocurra entre: llegada a BSF, llegada a Base OS, o **fin de servicio** (regla D4).
- **Fin de servicio (D4):** tras la salida de una tienda, si el siguiente evento válido no es la llegada a BSF, a Base OS ni a otra tienda, la vuelta y el servicio terminan en esa salida. Etiqueta: `Fin de servicio en tienda`.
- **Salida de BSF sin tiendas después:** si tras la última salida de BSF no hay tiendas, se muestra como `Salida de BSF sin visitas registradas`. No cuenta como vuelta con tiendas.
- **Cierre en BSF:** si tras llegar a BSF ya no hay más salidas, `Cierre en BSF (precarga / documentos)`.
- **Tipo de vehículo y empresa:** se usan solo para filtrar y agrupar. **Las reglas de vuelta no dependen de si el vehículo es OS.**

### 4.3 Tiempos calculados

| Concepto | Fórmula |
|---|---|
| **Hora llegada a BSF / salida de BSF** | Primer Llegó y último Salió de cada estancia en BSF (tras depurar). |
| **Tiempo en BSF (carga)** | Salida de BSF − llegada a BSF (por estancia). |
| **Hora llegada a tienda k** | Llegada de la k-ésima visita real de la vuelta. |
| **Tiempo a la tienda k (acumulado)** | Llegada Tk − origen de la vuelta (salida de BSF o inicio de jornada). |
| **Tiempo a la 1.ª tienda** | Acumulado de T1. |
| **Traslado entre tiendas** | Llegada Tk − salida T(k−1). |
| **Permanencia en tienda** | Salida Tk − llegada Tk. |
| **Tiempo de retorno** | Llegada a BSF/Base OS − salida de la última tienda. |
| **Tiempo de vuelta completa** | Cierre − origen de la vuelta (llegada a BSF/Base OS, o salida de la última tienda si hay fin de servicio). |
| **Hora regreso / salida de Base OS** | Último Llegó y primer Salió en `BASE-OSLOGISTICS`. Un vehículo que amanece dentro de la zona solo genera "Salió". |
| **Tiempo total en ruta** | Suma de las duraciones de todas las vueltas. |
| **Tiempo total en BSF** | Suma de todas las estancias en BSF. |

Cada valor lleva una **calidad**: `real` (evento presente), `estimado` (inferido, por ejemplo inicio sin "encendido") o `faltante`. Todos los umbrales van en YAML.

---

## 5. Configuración nueva

Toda regla de negocio va en YAML, como ya define el proyecto.

### 5.1 `config/flota.yaml`
```yaml
fecha_actualizacion: 2026-09-28
placas:
  - { placa: "ARY-825", empresa: "AP. TRANSPORTES GENERALES E.I.R.L.", tipo: "MASS" }
  - { placa: "B1Y-801", empresa: "O.S. LOGISTICS PERU S.A.C.",         tipo: "OS"   }
  - { placa: "AJQ-739", alias: ["AJQ739"], empresa: "JAIME CAMPUSANO / MONGROUP E.I.R.L.", tipo: "MASS" }
  - { placa: "CPH-709", alias: ["CPH709"], empresa: "O.S. LOGISTICS PERU S.A.C.",          tipo: "OS"   }
  # ... 22 placas. OS: F1W-796, F6V-792, B1Y-801, CMV-853, CPH709, CPF781.
```

### 5.2 `config/zonas.yaml`
```yaml
alertas_ingreso: ["Llegó a la zona", "INGRESO*"]     # alias por si Onway cambia el texto
alertas_salida:  ["Salió de zona", "SALIDA*"]
zonas:
  bsf:      { nombre: "MASS BSF 1",        etiqueta: "BSF" }
  base_os:  { nombre: "BASE-OSLOGISTICS",  etiqueta: "BASE OS" }
  tienda:   { patron: "^(\\d+)[-\\s]", grupo_codigo: 1, catalogo: "config/tiendas_mass.csv" }
```
La comparación normaliza el texto (NFKC, `\u00a0` a espacio, espacios múltiples, mayúsculas).

### 5.3 `config/tiendas_mass.csv` (generado desde `GEOCERCAS.xlsx`)
Script `scripts/import-geocercas.js`:
- Columnas de salida: `codigo, local, cd, distrito, lat, lon, fecha_geocerca`.
- Recorta espacios, unifica mayúsculas del distrito (hoy hay `San Bartolo` y `SAN BARTOLO`), separa `GEOLOCALIZACIÓN` en lat/lon (viene como `"-12.19532 ,-76.92685"`).
- Descarta filas sin código (`FILMS A OSLO`) y las lista en el log.
- Valida: 115 códigos únicos, coordenadas en rango, cada código con `CD` (las dos sin CD, 1149 y 2927, quedan como `SIN CD`).
- Se ejecuta a mano cuando cambien las geocercas.

### 5.4 Parámetros del motor (`reportes.yaml`, bloque `analitica_flota`)
```yaml
analitica_flota:
  habilitado: true
  aplica_a: [consolidado]            # D2: solo el consolidado
  fuente_eventos: "alertas"          # nunca el historial mezclado (H8)
  dedupe_segundos: 120
  fusion_rebote_minutos: 10
  paso_por_zona_segundos: 180        # H6
  max_tiendas_por_vuelta_en_hoja: 7
  max_vueltas_en_resumen: 4
  resaltar_estancia_bsf_min: 240     # H7; recalibrar con datos reales
  inicio_jornada_alertas: ["Vehículo encendido"]     # fallback: "Se movio"
  ignorar_para_inicio: ["Encendido o Entró en cobertura", "Inicio de ralentí",
                        "Fin de ralentí", "Fuente principal conectada"]
```

---

## 6. Motor "línea de tiempo de flota" (backend)

Módulo puro y testeable, que no modifica la lógica actual de `processDay`.

```
backend/src/engine/timeline/
├── normalizeZone.js   ← texto de zona → {tipo: BSF|BASE_OS|TIENDA, codigo, local, cd, distrito}
├── buildEvents.js     ← filas de alertas → eventos {ts, placa, alerta, zona, vel, gps_antiguo}
├── cleanEvents.js     ← dedupe, llegada repetida, rebotes, pares incompletos
├── buildStays.js      ← Llegó/Salió → estancias; marca pasos por zona
├── buildTrips.js      ← vueltas, precarga, fin de servicio
├── metrics.js         ← tiempos por vuelta/placa y KPIs de flota
└── index.js           ← buildFleetTimeline(config, rowsByPlaca, fecha, flota)
```

### 6.1 Algoritmo
1. **Entrada:** filas de alertas por placa (ya normalizadas por `normalize.js`). En el consolidado combinado se usa solo `Origen = Alertas` (H8).
2. **Tiempos:** `Fecha`+`Hora` → fecha completa; se ordena por tiempo y luego por `Secuencia`.
3. **Inicio de jornada** (§4.2).
4. **Eventos de zona** clasificados con `normalizeZone`. Un evento de zona con código que no está en el catálogo se registra como `zona desconocida` (calidad de datos), no se descarta en silencio.
5. **Depuración y estancias** (§4.1) → lista de estancias con `calidad` y `marcas`.
6. **Vueltas** (§4.2): recorrer estancias en orden; BSF y Base OS cierran la vuelta actual y abren la siguiente al salir; las tiendas se agregan a la vuelta actual; la última tienda sin continuación produce fin de servicio.
7. **Métricas** (§4.3) por vuelta, por placa y para la flota.
8. **Calidad de datos** por placa: eventos duplicados, rebotes fusionados, llegadas repetidas, pasos por zona, salidas sin llegada, estancias abiertas, GPS antiguo, zonas desconocidas, placa sin reporte.

### 6.2 Integración
- `processCompositeDay` llama a `buildFleetTimeline` después de unir las hojas y antes de escribir el workbook. `processDay` (Alertas/Historial por separado) **no cambia**.
- **Falla aislada:** si el timeline falla, el consolidado se genera igual, con las hojas por placa y sin hojas nuevas; el run queda `parcial` con un `warn` y el motivo. Nunca se rompe lo que ya funciona.
- Con `analitica_flota.habilitado: false` el resultado es idéntico al v1.3.

---

## 7. Hojas nuevas del consolidado

Las tres van **antes** de las hojas por placa, en este orden: `RESUMEN_FLOTA`, `VUELTAS`, `VISITAS`.

**Formato general**
- Horas como valor de hora real de Excel (`hh:mm:ss`), no texto, para filtrar y ordenar.
- Duraciones con formato `[h]:mm:ss`.
- Colores: **BSF** azul, **Base OS** morado, **tiendas** verde. Valores `estimado` en cursiva con relleno ámbar; `faltante` como `—`.
- Autofiltro, paneles congelados (placa y vuelta), encabezados agrupados y una leyenda de colores.

### 7.1 `RESUMEN_FLOTA` (maestra: una fila por placa, orden alfabético)

| Grupo | Columnas |
|---|---|
| Identificación | Placa, Empresa, Tipo (OS/MASS), Estado del reporte (Con reporte / Sin reporte del día) |
| Inicio | Inicio de jornada (primer encendido), Origen de la vuelta 1 (Precarga / BSF / Base OS) |
| BSF | 1.ª llegada a BSF, Última salida de BSF, N.º de ingresos a BSF, Tiempo total en BSF |
| Vueltas 1 a 4 (por cada una) | Inicio, N.º de tiendas, Tiempo a 1.ª tienda, Cierre (hora y tipo: BSF / Base OS / Fin de servicio), Duración |
| Tiendas | Tiendas visitadas (total), Permanencia media en tienda |
| Base OS | Hora de salida de Base OS, Hora de regreso a Base OS |
| Fin de servicio | Salida de la última tienda, Destino tras la última tienda (BSF / Base OS / Fin de servicio), Tiempo de retorno |
| Totales | Tiempo total en ruta, Última señal del día, Observaciones de calidad |

### 7.2 `VUELTAS` (una fila por placa × vuelta)
- Placa, Vuelta n.º, Origen (Precarga / Salida BSF / Salida Base OS)
- Llegada a BSF previa, Salida de BSF, Tiempo en BSF (carga)
- Por cada tienda de la vuelta (hasta 7), bloque de 6 columnas: **Tienda (código-local)**, **Llegada**, **Salida**, **Permanencia**, **Tiempo acumulado desde el origen**, **Traslado desde la anterior**. Si hay más de 7: "+n tiendas, ver VISITAS".
- Salida de la última tienda, Tiempo de retorno, Cierre (BSF / Base OS / Fin de servicio), Hora de cierre, **Tiempo de vuelta completa**, Calidad.

### 7.3 `VISITAS` (formato largo, una fila por estancia)
Placa, Vuelta, Orden, Tipo de zona (BSF / Base OS / Tienda), Código, Local, Distrito, CD, Llegada, Salida, Permanencia, Calidad, Marcas (rebote fusionado, paso por zona, llegada repetida, GPS antiguo). Sirve para tablas dinámicas y para alimentar el dashboard.

### 7.4 Ejemplo calculado con datos reales (27/09, BXT-918)

| Vuelta | Origen | Tienda | Llega | Sale | Permanencia | Acumulado |
|---|---|---|---|---|---|---|
| 1 | Precarga (inicio 05:29:00) | 1206-ROSALES 1 SJM MS | 05:59:54 | 07:11:15 | 1:11:21 | 0:30:54 |
| 1 | | 843-TRIU C21 SJM MS | 07:17:38 | 07:25:47 | 0:08:09 | 1:48:38 |
| 1 | | 1317-UMAMAC17 SJM MS | 07:29:04 | 07:46:44 | 0:17:40 | 2:00:04 |
| 1 | Cierre | BSF llega 08:13:45 | | | Retorno 0:27:01 | **Vuelta completa 2:44:45** |
| — | BSF | 08:13:45 → 11:43:45 | | | Carga **3:30:00** | |
| 2 | Salida BSF 11:43:45 | 343-PASTOR SEVILLA 1 | 13:03:19 | 13:57:14 | 0:53:55 | 1:19:34 |
| 2 | Cierre | Fin de servicio 13:57:14 | | | | **Vuelta 2:13:29** |

---

## 8. Persistencia y API

### 8.1 SQLite
Hoy solo se guardan runs y logs. Como el dashboard necesita vueltas y visitas (pocas: ~22 placas × ~20 estancias al día), se agregan tablas ligeras con `run_id` y `ON DELETE CASCADE`:

```sql
CREATE TABLE IF NOT EXISTS fleet_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL, placa TEXT NOT NULL, vuelta INTEGER NOT NULL,
  origen TEXT, inicio TEXT, llegada_bsf_prev TEXT, salida_bsf TEXT,
  cierre_tipo TEXT, cierre_hora TEXT, salida_ultima_tienda TEXT,
  seg_en_bsf INTEGER, seg_a_primera_tienda INTEGER, seg_retorno INTEGER, seg_vuelta INTEGER,
  n_tiendas INTEGER, calidad TEXT
);
CREATE TABLE IF NOT EXISTS fleet_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL, placa TEXT NOT NULL, vuelta INTEGER, orden INTEGER,
  zona_tipo TEXT NOT NULL, codigo TEXT, local TEXT, distrito TEXT, cd TEXT,
  llegada TEXT, salida TEXT, seg_permanencia INTEGER, calidad TEXT, marcas TEXT
);
CREATE INDEX IF NOT EXISTS idx_trips_fecha  ON fleet_trips(fecha, placa);
CREATE INDEX IF NOT EXISTS idx_visits_fecha ON fleet_visits(fecha, placa);
CREATE INDEX IF NOT EXISTS idx_visits_codigo ON fleet_visits(codigo);
```
El `.xlsx` sigue siendo la fuente de verdad. Reprocesar un día **reemplaza** sus filas (borrado + inserción en una transacción).

### 8.2 Endpoints nuevos
| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/fleet/timeline/:fecha` | KPIs de flota, filas de placas, vueltas, calidad |
| GET | `/api/fleet/timeline/:fecha/:placa` | Línea de tiempo completa de una placa |
| GET | `/api/fleet/stores/:fecha` | Ranking de tiendas: hora media de llegada, permanencia, n.º de visitas, distrito, CD |
| GET | `/api/fleet/bsf-occupancy/:fecha` | Vehículos dentro de BSF por franja de 15 min |
| GET | `/api/fleet/config` | Flota, zonas y parámetros vigentes (solo lectura) |

Validan fecha real (parte del P0 pendiente) y devuelven `{ generado: false }` si el día no tiene análisis, para que el frontend muestre un estado vacío claro.

---

## 9. Dashboard: vista "Operación de flota"

Nueva sección en la barra lateral con el tema actual (Tailwind v4 + Recharts). **Primero** se extraen de `App.jsx` los componentes compartidos (`KpiCard`, `SectionCard`, `StatusBadge`, selector de fecha) a `frontend/src/components/`, como ya indica el backlog.

**Fecha por defecto: el día anterior**, con acceso rápido a "Ayer" (D6).

1. **KPIs:** vehículos con reporte / esperados (22); primera salida de BSF; hora media de salida de BSF; N.º medio de vueltas; tiempo medio de vuelta completa; tiempo medio a la 1.ª tienda; tiempo medio de carga en BSF; tiendas visitadas; servicios terminados en tienda.
2. **Línea de tiempo tipo Gantt por placa** (gráfico principal): eje 04:00–20:00, una fila por placa en orden alfabético, tramos: en BSF (azul), en ruta (gris), en tienda (verde, con tooltip de código, local, hora y permanencia), en Base OS (morado), tramos estimados rayados. Se implementa como componente SVG propio (`FleetGantt.jsx`), porque Recharts no trae Gantt.
3. **Tabla maestra** (espejo de `RESUMEN_FLOTA`): ordenable y filtrable.
4. **Distribución de tiempos:** histograma de duración de vueltas; barras de tiempo a la 1.ª tienda por placa.
5. **Ocupación de BSF:** área con vehículos dentro de BSF por franja de 15 min.
6. **Ranking de tiendas:** hora media de llegada, permanencia media, visitas; agrupable por distrito y por CD.
7. **Detalle por placa** (panel lateral al hacer clic): secuencia cronológica de eventos con horas, tiempos y marcas de calidad, y botón para descargar el original (endpoint existente).
8. **Panel de calidad de datos:** placas sin reporte, estancias abiertas, pasos por zona descartados, zonas desconocidas, GPS antiguo.
9. **Filtros globales:** empresa, tipo (OS/MASS), placa, vuelta, CD.

**Estados:** skeletons al cargar; vacío explícito "Este día no tiene análisis de flota (procese el día)"; auto-refresh junto al existente. Las 4 vistas actuales no deben tener regresiones.

---

## 10. Operación diaria (D6)

**Flujo:**
1. ~8:00: se generan los reportes por placa del día anterior (Alertas e Historial) y se suben a `alertas_onway/<mes>/<DD-MM-YYYY>/alertas/` y `historial_onway/…/historial/`.
2. El sistema genera `REPORTE_ALERTAS`, `REPORTE_HISTORIAL` y `REPORTE_CONSOLIDADO` (ahora con las 3 hojas nuevas) en `consolidados_onway/_procesados/<mes>/<fecha>/`, y guarda el análisis en SQLite.
3. El dashboard muestra por defecto el día anterior.

**Ajustes al scheduler (pequeños):**
- Se mantiene el ciclo de 10 min y el orden Alertas → Historial → Consolidado.
- **Estabilidad de archivos:** no procesar un día si algún `.xlsx` cambió en los últimos 2 min (evita procesar una carga a medias).
- **Reproceso solo si cambió algo:** comparar cantidad/tamaño/fecha de archivos del día contra el último run.
- **Aviso de cobertura:** el run registra "N de 22 placas con reporte" (visible en el dashboard).
- Mutex por tipo+fecha (P0 ya pendiente) para que scheduler y `Procesar` manual no se pisen.

---

## 11. Fases de trabajo y cronograma

Días hábiles de una persona, ≈ **15–16 días** en la ruta crítica.

| Fase | Trabajo | Días | Entregable / criterio de aceptación |
|---|---|---|---|
| **P0 previo** | Suite base de pruebas del motor y mutex por tipo+fecha (ya en el backlog). Los tests nuevos se apoyan en ella. | (backlog) | `npm test` corre. |
| **F0. Preparación** | `flota.yaml`, `zonas.yaml`, `scripts/import-geocercas.js` → `tiendas_mass.csv`; ajustar plantilla de historial (H14); copiar los reportes reales como fixtures. | 1 | Catálogo de 115 tiendas cargado; `FILMS A OSLO` descartada con aviso; 22 placas normalizadas. |
| **F1. Eventos y estancias** | `normalizeZone`, `buildEvents`, `cleanEvents`, `buildStays`. | 2 | Sobre el fixture del 27/09: 0 zonas sin clasificar; duplicados y rebotes de H5 resueltos; `324-MASS\u00a0SAN JUAN` reconocida. |
| **F2. Vueltas y métricas** | `buildTrips`, `metrics`, calidad, fin de servicio. | 2.5 | Pruebas de oro (§12) coinciden con el cálculo verificado. |
| **F3. Excel** | Escritura de las 3 hojas con formato, colores y leyenda; enganche en `processCompositeDay`; filas de las 22 placas. | 2.5 | Se abre en Excel sin advertencias, horas como valor de hora, orden alfabético, 0 `[object Object]`, hojas por placa idénticas a v1.3. |
| **F4. SQLite + API** | Tablas, transacción de reemplazo, 5 endpoints, validación de fecha. | 1.5 | `curl` de cada endpoint coincide con el Excel. |
| **F5. Dashboard** | Refactor de componentes, KPIs, Gantt, tabla maestra, histogramas, ocupación BSF, ranking de tiendas, panel de placa, calidad, filtros. | 4.5 | Vista completa con datos reales; `vite build` sin errores; vistas anteriores intactas. |
| **F6. Ajuste con datos reales** | Correr 3–5 días reales desde el 28/09; recalibrar umbrales (paso por zona, rebote, estancia larga en BSF); README; actualizar el documento de estado. | 2 | Diferencia entre el cálculo y una revisión manual de 3 placas ≤ 1 min. |
| **F7 (opcional)** | Validación cruzada con el historial por coordenadas (usa las coordenadas de `tiendas_mass.csv`; requiere definir un radio por tienda) y km reales por vuelta. | 2 | Solo si operaciones lo pide. |

**Orden sugerido de entrega:** F0→F3 primero. Así el consolidado ya trae la hoja maestra mientras se construye el dashboard. El primer día completo con zonas activas (28/09, disponible el 29/09 a las 8 am) sirve para las pruebas de F6.

---

## 12. Estrategia de pruebas

Framework: `node:test` (sin dependencias nuevas, Node 22). Fixtures: recortes de los reportes reales.

**Pruebas de oro** (valores ya verificados con un prototipo de estas reglas sobre el reporte del 27/09; alertas solamente):

| Placa | Resultado esperado |
|---|---|
| **AAR-880** | Inicio 05:12:07. Vuelta 1: tienda 242-ATECA 05:50:22–06:29:32 (perm. 0:39:10; los 3 eventos se fusionan), llega a BSF 08:03:47, vuelta 2:51:40, retorno 1:34:15. BSF 08:03:47→11:24:50 (3:21:03). Vuelta 2: tienda 2606 12:16:56–12:34:22 (0:17:26), **fin de servicio 12:34:22**, vuelta 1:09:32. Marcas: `llegada repetida` 11:24:39, `salida duplicada` 11:24:55, **3 pasos por zona** (343: 71 s, 370: 5 s, 1160: 52 s). |
| **AKO-712** | Inicio 06:06:35. Vuelta 1: 2766 (0:10:00) y 1422 (0:33:34), llega a BSF 08:48:33, vuelta 2:41:58. BSF 4:39:45. Salida de BSF 13:28:18 sin tiendas reales (2 pasos por zona: 324 y 1049). |
| **BXQ-847** | Rebote fusionado en 1191: 08:16:03–08:24:38 (0:08:35). Un paso por zona en 257 (52 s) y una salida duplicada 07:53:24. Llega a BSF 08:33:11. |
| **BXT-918** | Ver tabla de §7.4. |
| **C6E-921** | 3 tramos sin tiendas: inicio 05:30:39 → BSF 07:31:09 (2:00:30); BSF 1:28:09; → BSF 10:19:52 (1:20:34); BSF 3:56:00; salida 14:15:52. Comprueba que "sin tiendas" es un estado válido, no un error. |

**Otros casos**
- **Consolidado combinado con historial:** el análisis de C6E-921 debe dar lo mismo con y sin las 767 filas de historial (H8).
- **Export crudo:** `alerts_*.xlsx` (AAR-880, 75 filas) y `history_*.xlsx` (C6E-921, 767 filas) se leen sin errores ni `[object Object]`.
- **Placa sin reporte:** CPH709 y CPF781 (24/09) generan fila "Sin reporte del día".
- **Primer evento nocturno:** F6V-794 (24/09, 01:19) inicia en su primer `Vehículo encendido`.
- **Zona Base OS:** primer archivo del 28/09 con `BASE-OSLOGISTICS`; caso sintético de vehículo que amanece dentro de la zona (solo "Salió").
- **Sintéticos:** cruce de medianoche, zona con código fuera del catálogo, placa con y sin guion, fecha inválida, archivo vacío, tienda visitada dos veces en el día.
- **No regresión:** con `analitica_flota.habilitado: false` el consolidado es idéntico al v1.3.

---

## 13. Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Aún no hay una muestra de alertas de `BASE-OSLOGISTICS` (las zonas se configuraron el 28/09). | Medio | Se valida con el primer día completo (F6). El nombre ya está confirmado y la regla no depende del tipo de vehículo. |
| Umbral de paso por zona (3 min) puede descartar una entrega rápida real. | Medio | Configurable; los pasos se conservan en `VISITAS` con su marca. Confirmar con operaciones en F6 (hoy hay separación clara: 71 s vs 8 min). |
| Estancias largas en BSF (hasta 5 h) marcan casi todo como "larga" con un umbral bajo. | Bajo | Umbral configurable (inicial 240 min) y recalibrado con datos nuevos. |
| Alertas de zona faltantes por fallas del GPS. | Medio | Estados `faltante`/`estimado` visibles y panel de calidad. F7 (historial) puede completarlos. |
| Eventos duplicados si se usa el consolidado combinado como fuente. | Alto si se olvida | Regla H8 con prueba obligatoria. |
| Carga de archivos a medias a las 8 am. | Medio | Chequeo de estabilidad + reproceso solo si cambió algo. |
| `App.jsx` monolítico. | Medio | Refactor de componentes al inicio de F5. |
| Cambio de nombres de zona en Onway. | Bajo | Nombres en `zonas.yaml`; catálogo por código. |

---

## 14. Pendientes menores (no bloquean el inicio)

1. **Confirmar con operaciones** en F6 los umbrales: 3 min (paso por zona), 10 min (rebote) y el de estancia larga en BSF.
2. Decidir si las **tiendas se agrupan también por CD** en el dashboard (el dato ya está en el catálogo; se incluye como filtro opcional).
3. Definir si F7 (historial por coordenadas y km reales) se hará después de F6.

---

## 15. Documentación a actualizar al cerrar
- `Estado_actual_y_mejoras_pendientes.md`: §2 (nueva área "Analítica de flota"), §3.5 (hojas nuevas), §3.6 (endpoints), §3.8 (tablas SQLite), §4.3 (archivos nuevos), checklist §23.
- README: cómo editar `flota.yaml` y `zonas.yaml`, cómo reimportar geocercas, parámetros del motor y flujo diario de las 8 am.
