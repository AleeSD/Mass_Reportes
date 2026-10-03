import { buildEvents, findDayStart } from "./buildEvents.js";
import { buildStays } from "./buildStays.js";
import { buildTrips } from "./buildTrips.js";
import { cleanEvents } from "./cleanEvents.js";
import { fleetKpis, plateSummary, tripRow, visitRow } from "./metrics.js";
import { createZoneResolver } from "./normalizeZone.js";
import { normalizePlateDisplay, normalizePlateKey } from "./utils.js";

export { serializeTimes, storeRanking, bsfOccupancy } from "./metrics.js";

/**
 * Filas que alimentan el análisis. En el consolidado combinado las filas del
 * historial repiten los eventos de alertas (H8): se usan SOLO las de alertas.
 */
export function selectAlertRows(rows, { fuente = "alertas", columnaOrigen = "Origen del registro", etiquetaOrigen = "Alertas" } = {}) {
  return rows.filter((row) => {
    if (row._base !== undefined) return row._base === fuente;
    if (row[columnaOrigen] !== undefined && row[columnaOrigen] !== "") {
      return String(row[columnaOrigen]).trim().toLowerCase() === String(etiquetaOrigen).toLowerCase();
    }
    return true;
  });
}

function fleetIndex(flota) {
  const byKey = new Map();
  for (const item of flota?.placas || []) {
    const display = normalizePlateDisplay(item.placa);
    const info = { ...item, placa: display };
    byKey.set(normalizePlateKey(item.placa), info);
    for (const alias of item.alias || []) byKey.set(normalizePlateKey(alias), info);
  }
  return byKey;
}

/** Analiza una placa: eventos -> depuración -> estancias -> vueltas. */
export function analyzePlate(rows, { params = {}, zonesConfig = {}, zoneResolver }) {
  const built = buildEvents(rows, { zoneResolver, zonesConfig });
  const dayStart = findDayStart(built.events, params);
  const { events: cleaned, duplicates } = cleanEvents(built.zoneEvents, params);
  const stays = buildStays(cleaned, params);
  const trips = buildTrips(stays, dayStart);
  const unknown = [...new Set(built.unknownZones.map((u) => u.zona))];
  const calidad = {
    sin_reporte: false,
    inicio_estimado: dayStart.calidad !== "real",
    duplicados: duplicates.length,
    rebotes: stays.reduce((n, s) => n + s.rebotes.length, 0),
    llegadas_repetidas: stays.reduce((n, s) => n + s.llegadas_repetidas.length, 0),
    pasos: stays.filter((s) => s.paso).length,
    salidas_sin_llegada: stays.filter((s) => s.llegada == null).length,
    estancias_abiertas: stays.filter((s) => s.salida == null).length,
    gps_antiguo: built.gpsAntiguo,
    zonas_desconocidas: unknown,
    filas_invalidas: built.invalidRows,
  };
  return {
    conReporte: rows.length > 0,
    events: built.events,
    dayStart,
    duplicates,
    stays,
    trips,
    calidad,
    ultimaSenal: built.ultimoEvento,
  };
}

/**
 * Motor "línea de tiempo de flota".
 * @param {object} opts
 * @param {Array<{plate: string, rows: object[]}>} opts.tables filas de alertas por placa
 * @param {object} opts.params bloque analitica_flota de reportes.yaml
 * @param {object} opts.zonesConfig config/zonas.yaml
 * @param {object[]} opts.catalog config/tiendas_mass.csv
 * @param {object} opts.flota config/flota.yaml
 * @param {string} opts.fecha YYYY-MM-DD
 */
export function buildFleetTimeline({ tables = [], params = {}, zonesConfig = {}, catalog = [], flota = {}, fecha }) {
  const zoneResolver = createZoneResolver(zonesConfig, catalog);
  const fleet = fleetIndex(flota);

  // Agrupar tablas por placa normalizada (placa con o sin guion = misma).
  const byKey = new Map();
  for (const table of tables) {
    const key = normalizePlateKey(table.plate);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { plate: table.plate, rows: [] });
    byKey.get(key).rows.push(...(table.rows || []));
  }

  const keys = new Set([...byKey.keys()]);
  for (const item of flota?.placas || []) keys.add(normalizePlateKey(item.placa));

  const placas = [];
  const trips = [];
  const visits = [];
  const empty = { stays: [], trips: [], dayStart: { ts: null, calidad: "faltante" }, calidad: null };

  for (const key of keys) {
    const info = fleet.get(key) || null;
    const table = byKey.get(key);
    const display = info?.placa || normalizePlateDisplay(table?.plate || key);
    let built;
    if (table && table.rows.length) {
      built = analyzePlate(table.rows, { params, zonesConfig, zoneResolver });
    } else {
      built = { ...empty, conReporte: false, calidad: { sin_reporte: true } };
    }
    placas.push(plateSummary({ placa: display, flotaInfo: info, built, params }));
    for (const trip of built.trips) trips.push(tripRow(display, trip));
    built.stays.forEach((stay, idx) => visits.push(visitRow(display, stay, idx + 1, params)));
  }

  placas.sort((a, b) => a.placa.localeCompare(b.placa));
  trips.sort((a, b) => a.placa.localeCompare(b.placa) || a.vuelta - b.vuelta);
  visits.sort((a, b) => a.placa.localeCompare(b.placa) || a.orden - b.orden);

  return {
    generado: true,
    fecha,
    kpis: fleetKpis(placas, trips, visits),
    placas,
    trips,
    visits,
    catalogo_tiendas: zoneResolver.catalogSize,
    parametros: {
      dedupe_segundos: params.dedupe_segundos ?? 120,
      fusion_rebote_minutos: params.fusion_rebote_minutos ?? 10,
      paso_por_zona_segundos: params.paso_por_zona_segundos ?? 180,
      resaltar_estancia_bsf_min: params.resaltar_estancia_bsf_min ?? 240,
      max_tiendas_por_vuelta_en_hoja: params.max_tiendas_por_vuelta_en_hoja ?? 7,
      max_vueltas_en_resumen: params.max_vueltas_en_resumen ?? 4,
    },
  };
}
