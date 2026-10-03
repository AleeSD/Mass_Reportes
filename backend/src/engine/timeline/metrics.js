import { ZONE_LABELS, ZONE_TYPES } from "./normalizeZone.js";
import { average, isoDateToTs, sum, tsToText } from "./utils.js";

export function visitRow(placa, stay, orden, params = {}) {
  const largaSeg = Number(params.resaltar_estancia_bsf_min ?? 240) * 60;
  const calidad =
    stay.llegada == null || stay.salida == null ? "faltante" : "real";
  return {
    placa,
    vuelta: stay.vuelta ?? null,
    orden,
    n_tienda: stay.paso ? null : stay.n_tienda ?? null,
    zona_tipo: stay.zona_tipo,
    zona_label: ZONE_LABELS[stay.zona_tipo] || stay.zona_tipo,
    codigo: stay.codigo,
    local: stay.local,
    nombre: stay.nombre,
    distrito: stay.distrito,
    cd: stay.cd,
    llegada: stay.llegada,
    salida: stay.salida,
    seg_permanencia: stay.seg_permanencia,
    seg_acumulado: stay.paso ? null : stay.seg_acumulado ?? null,
    seg_traslado: stay.paso ? null : stay.seg_traslado ?? null,
    calidad,
    marcas: [...stay.marcas],
    paso: !!stay.paso,
    larga:
      stay.zona_tipo === ZONE_TYPES.BSF &&
      stay.seg_permanencia != null &&
      stay.seg_permanencia >= largaSeg,
  };
}

export function tripRow(placa, trip) {
  return {
    placa,
    vuelta: trip.vuelta,
    origen_tipo: trip.origen_tipo,
    origen: trip.origen,
    inicio: trip.inicio,
    inicio_calidad: trip.inicio_calidad,
    llegada_bsf_prev: trip.llegada_bsf_prev,
    salida_bsf: trip.salida_bsf,
    seg_en_bsf: trip.seg_en_bsf,
    tiendas: trip.tiendas.map((s) => ({
      n: s.n_tienda,
      codigo: s.codigo,
      nombre: s.nombre,
      distrito: s.distrito,
      cd: s.cd,
      llegada: s.llegada,
      salida: s.salida,
      seg_permanencia: s.seg_permanencia,
      seg_acumulado: s.seg_acumulado,
      seg_traslado: s.seg_traslado,
      calidad: s.llegada == null || s.salida == null ? "faltante" : "real",
      marcas: [...s.marcas],
    })),
    n_tiendas: trip.n_tiendas,
    con_tiendas: trip.con_tiendas,
    seg_a_primera_tienda: trip.seg_a_primera_tienda,
    salida_ultima_tienda: trip.salida_ultima_tienda,
    seg_retorno: trip.seg_retorno,
    cierre_tipo: trip.cierre_tipo,
    cierre: trip.cierre,
    cierre_hora: trip.cierre_hora,
    seg_vuelta: trip.seg_vuelta,
    calidad: trip.calidad,
  };
}

function plural(n, singular, pluralText) {
  return `${n} ${n === 1 ? singular : pluralText}`;
}

export function qualityNotes(calidad) {
  const notes = [];
  if (calidad.sin_reporte) return "Sin reporte del día";
  if (calidad.inicio_estimado) notes.push("inicio estimado");
  if (calidad.duplicados) notes.push(plural(calidad.duplicados, "evento duplicado", "eventos duplicados"));
  if (calidad.rebotes) notes.push(plural(calidad.rebotes, "rebote fusionado", "rebotes fusionados"));
  if (calidad.llegadas_repetidas) notes.push(plural(calidad.llegadas_repetidas, "llegada repetida", "llegadas repetidas"));
  if (calidad.pasos) notes.push(plural(calidad.pasos, "paso por zona", "pasos por zona"));
  if (calidad.salidas_sin_llegada) notes.push(plural(calidad.salidas_sin_llegada, "salida sin llegada", "salidas sin llegada"));
  if (calidad.estancias_abiertas) notes.push(plural(calidad.estancias_abiertas, "estancia abierta", "estancias abiertas"));
  if (calidad.zonas_desconocidas?.length) notes.push(`zona(s) desconocida(s): ${calidad.zonas_desconocidas.join(", ")}`);
  if (calidad.gps_antiguo) notes.push(plural(calidad.gps_antiguo, "evento con GPS antiguo", "eventos con GPS antiguo"));
  if (calidad.filas_invalidas) notes.push(plural(calidad.filas_invalidas, "fila sin fecha/hora válida", "filas sin fecha/hora válida"));
  return notes.join("; ");
}

/** Descripción del estado final del día de una placa. */
function dayClosing(stays, trips) {
  const real = stays.filter((s) => !s.paso);
  const lastStay = real[real.length - 1];
  const lastTrip = trips[trips.length - 1];
  if (lastStay && lastStay.zona_tipo === ZONE_TYPES.BSF && lastStay.salida == null) {
    return "Cierre en BSF (precarga / documentos)";
  }
  if (lastStay && lastStay.zona_tipo === ZONE_TYPES.BASE_OS && lastStay.salida == null) {
    return "Regreso a Base OS";
  }
  if (lastTrip) return lastTrip.cierre;
  return real.length ? "Sin vueltas" : "Sin eventos de zona";
}

export function plateSummary({ placa, flotaInfo, built, params }) {
  const { stays = [], trips = [], dayStart, calidad, ultimaSenal } = built;
  const largaSeg = Number(params.resaltar_estancia_bsf_min ?? 240) * 60;
  const bsf = stays.filter((s) => s.zona_tipo === ZONE_TYPES.BSF);
  const baseOs = stays.filter((s) => s.zona_tipo === ZONE_TYPES.BASE_OS);
  const tiendas = stays.filter((s) => s.zona_tipo === ZONE_TYPES.TIENDA && !s.paso);
  const tripsConTiendas = trips.filter((t) => t.con_tiendas);
  const lastStoreTrip = [...tripsConTiendas].pop() || null;

  return {
    placa,
    empresa: flotaInfo?.empresa || (flotaInfo ? "" : "No registrada en flota"),
    tipo: flotaInfo?.tipo || "",
    en_flota: !!flotaInfo,
    estado_reporte: built.conReporte ? "Con reporte" : "Sin reporte del día",
    inicio_jornada: dayStart?.ts ?? null,
    inicio_calidad: dayStart?.calidad ?? "faltante",
    inicio_fuente: dayStart?.fuente ?? null,
    origen_vuelta1: trips[0]?.origen ?? null,
    primera_llegada_bsf: bsf.find((s) => s.llegada != null)?.llegada ?? null,
    primera_salida_bsf: bsf.find((s) => s.salida != null)?.salida ?? null,
    ultima_salida_bsf: [...bsf].reverse().find((s) => s.salida != null)?.salida ?? null,
    n_ingresos_bsf: bsf.length,
    seg_total_bsf: sum(bsf.map((s) => s.seg_permanencia)),
    bsf_larga: bsf.some((s) => s.seg_permanencia != null && s.seg_permanencia >= largaSeg),
    vueltas: trips.map((t) => ({
      vuelta: t.vuelta,
      origen: t.origen,
      inicio: t.inicio,
      n_tiendas: t.n_tiendas,
      seg_a_primera_tienda: t.seg_a_primera_tienda,
      cierre_hora: t.cierre_hora,
      cierre_tipo: t.cierre_tipo,
      cierre: t.cierre,
      seg_vuelta: t.seg_vuelta,
      calidad: t.calidad,
    })),
    n_vueltas: trips.length,
    n_vueltas_con_tiendas: tripsConTiendas.length,
    tiendas_visitadas: tiendas.length,
    seg_permanencia_media: average(tiendas.map((s) => s.seg_permanencia)),
    n_estancias_base_os: baseOs.length,
    salida_base_os: baseOs.find((s) => s.salida != null)?.salida ?? null,
    regreso_base_os: [...baseOs].reverse().find((s) => s.llegada != null)?.llegada ?? null,
    salida_ultima_tienda: lastStoreTrip?.salida_ultima_tienda ?? null,
    destino_tras_ultima_tienda: lastStoreTrip
      ? lastStoreTrip.cierre_tipo === "FIN_SERVICIO"
        ? "Fin de servicio"
        : lastStoreTrip.cierre
      : null,
    seg_retorno: lastStoreTrip?.seg_retorno ?? null,
    cierre_dia: built.conReporte ? dayClosing(stays, trips) : null,
    seg_total_ruta: sum(trips.map((t) => t.seg_vuelta)),
    ultima_senal: ultimaSenal ?? null,
    calidad,
    observaciones: qualityNotes(calidad),
  };
}

export function fleetKpis(placas, trips, visits) {
  const conReporte = placas.filter((p) => p.estado_reporte === "Con reporte");
  const firstBsfExits = conReporte.map((p) => p.primera_salida_bsf).filter((v) => v != null);
  const withStores = trips.filter((t) => t.con_tiendas);
  const bsfStays = visits.filter((v) => v.zona_tipo === ZONE_TYPES.BSF);
  const storeVisits = visits.filter((v) => v.zona_tipo === ZONE_TYPES.TIENDA && !v.paso);
  return {
    placas_esperadas: placas.filter((p) => p.en_flota).length,
    placas_con_reporte: conReporte.length,
    placas_con_reporte_en_flota: conReporte.filter((p) => p.en_flota).length,
    placas_fuera_de_flota: conReporte.filter((p) => !p.en_flota).map((p) => p.placa),
    primera_salida_bsf: firstBsfExits.length ? Math.min(...firstBsfExits) : null,
    hora_media_salida_bsf: average(firstBsfExits),
    vueltas_total: trips.length,
    vueltas_con_tiendas: withStores.length,
    vueltas_media: conReporte.length
      ? Math.round((withStores.length / conReporte.length) * 10) / 10
      : null,
    seg_vuelta_media: average(withStores.map((t) => t.seg_vuelta)),
    seg_primera_tienda_media: average(withStores.map((t) => t.seg_a_primera_tienda)),
    seg_bsf_media: average(bsfStays.map((v) => v.seg_permanencia)),
    tiendas_visitadas: storeVisits.length,
    tiendas_distintas: new Set(storeVisits.map((v) => v.codigo)).size,
    servicios_fin_en_tienda: trips.filter((t) => t.cierre_tipo === "FIN_SERVICIO").length,
    pasos_por_zona: visits.filter((v) => v.paso).length,
  };
}

// ── Utilidades para la API (trabajan con horas en texto "YYYY-MM-DD HH:MM:SS") ──

export function textToDaySeconds(text, isoDate) {
  if (text == null || text === "") return null;
  if (typeof text === "number") return text - isoDateToTs(isoDate);
  const m = String(text).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const day = isoDateToTs(m[1]);
  const base = isoDateToTs(isoDate);
  if (day == null || base == null) return null;
  return day - base + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
}

export function daySecondsToHms(secs) {
  if (secs == null) return null;
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const mi = Math.floor((s % 3600) / 60);
  const se = s % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(se).padStart(2, "0")}`;
}

/** Ranking de tiendas: visitas, hora media de llegada y permanencia media. */
export function storeRanking(visits, isoDate) {
  const byCode = new Map();
  for (const v of visits) {
    if (v.zona_tipo !== ZONE_TYPES.TIENDA || v.paso) continue;
    const key = v.codigo;
    if (!byCode.has(key)) {
      byCode.set(key, {
        codigo: v.codigo,
        local: v.local,
        nombre: v.nombre,
        distrito: v.distrito,
        cd: v.cd,
        visitas: 0,
        placas: new Set(),
        llegadas: [],
        permanencias: [],
      });
    }
    const entry = byCode.get(key);
    entry.visitas += 1;
    entry.placas.add(v.placa);
    const secs = textToDaySeconds(v.llegada, isoDate);
    if (secs != null) entry.llegadas.push(secs);
    if (v.seg_permanencia != null) entry.permanencias.push(v.seg_permanencia);
  }
  return [...byCode.values()]
    .map((e) => {
      const media = average(e.llegadas);
      return {
        codigo: e.codigo,
        local: e.local,
        nombre: e.nombre,
        distrito: e.distrito,
        cd: e.cd,
        visitas: e.visitas,
        placas: [...e.placas].sort(),
        hora_media_llegada: daySecondsToHms(media),
        seg_hora_media_llegada: media,
        primera_llegada: daySecondsToHms(e.llegadas.length ? Math.min(...e.llegadas) : null),
        seg_permanencia_media: average(e.permanencias),
        seg_permanencia_total: sum(e.permanencias),
      };
    })
    .sort((a, b) => b.visitas - a.visitas || (a.seg_hora_media_llegada ?? 0) - (b.seg_hora_media_llegada ?? 0));
}

/** Vehículos dentro de BSF por franja (por defecto 15 min). */
export function bsfOccupancy(visits, placas, isoDate, { desdeHora = 4, hastaHora = 20, minutos = 15 } = {}) {
  const lastSignal = new Map(
    placas.map((p) => [p.placa, textToDaySeconds(p.ultima_senal, isoDate)]),
  );
  const intervals = visits
    .filter((v) => v.zona_tipo === ZONE_TYPES.BSF)
    .map((v) => {
      const start = textToDaySeconds(v.llegada, isoDate) ?? 0;
      const end =
        textToDaySeconds(v.salida, isoDate) ?? lastSignal.get(v.placa) ?? hastaHora * 3600;
      return { placa: v.placa, start, end: Math.max(end, start) };
    });
  const step = minutos * 60;
  const out = [];
  for (let t = desdeHora * 3600; t < hastaHora * 3600; t += step) {
    const inside = new Set(
      intervals.filter((i) => i.start < t + step && i.end > t).map((i) => i.placa),
    );
    out.push({ franja: daySecondsToHms(t).slice(0, 5), segundos: t, vehiculos: inside.size, placas: [...inside].sort() });
  }
  return out;
}

// ── Serialización (horas numéricas -> texto) para SQLite / API ──

const TIME_KEYS = new Set([
  "inicio",
  "llegada_bsf_prev",
  "salida_bsf",
  "cierre_hora",
  "salida_ultima_tienda",
  "llegada",
  "salida",
  "inicio_jornada",
  "primera_llegada_bsf",
  "primera_salida_bsf",
  "ultima_salida_bsf",
  "salida_base_os",
  "regreso_base_os",
  "ultima_senal",
  "primera_salida_bsf",
  "hora_media_salida_bsf",
]);

export function serializeTimes(value) {
  if (Array.isArray(value)) return value.map(serializeTimes);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (TIME_KEYS.has(key) && typeof v === "number") out[key] = tsToText(v);
      else out[key] = serializeTimes(v);
    }
    return out;
  }
  return value;
}
