import { ZONE_TYPES } from "./normalizeZone.js";
import { matchesAnyPattern, normalizeText, toTs } from "./utils.js";

function pick(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
  }
  const wanted = names.map((n) => normalizeText(n));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.includes(normalizeText(key)) && value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
}

/**
 * Filas de alertas de una placa -> eventos ordenados por tiempo y secuencia.
 * Cada evento: { ts, secuencia, alerta, zonaTexto, zona, kind: "in"|"out"|null, vel, gpsAntiguo }.
 */
export function buildEvents(rows, { zoneResolver, zonesConfig = {} }) {
  const ingreso = zonesConfig.alertas_ingreso || ["Llegó a la zona"];
  const salida = zonesConfig.alertas_salida || ["Salió de zona"];
  const events = [];
  let invalid = 0;

  rows.forEach((row, index) => {
    const ts = toTs(pick(row, "Fecha"), pick(row, "Hora"));
    if (ts == null) {
      invalid += 1;
      return;
    }
    const alerta = String(pick(row, "Alerta") ?? "").trim();
    const zonaTexto = String(pick(row, "Zona") ?? "").trim();
    const estadoGps = normalizeText(pick(row, "Estado GPS"));
    const secuencia = Number(pick(row, "Secuencia")) || index + 1;
    let kind = null;
    if (matchesAnyPattern(alerta, ingreso)) kind = "in";
    else if (matchesAnyPattern(alerta, salida)) kind = "out";
    const zona = kind && zonaTexto ? zoneResolver.resolve(zonaTexto) : null;
    events.push({
      ts,
      secuencia,
      alerta,
      zonaTexto,
      zona,
      kind: zona ? kind : null,
      vel: Number(pick(row, "Velocidad (Km/h)")) || 0,
      gpsAntiguo: estadoGps === "GPS ANTIGUO",
    });
  });

  events.sort((a, b) => a.ts - b.ts || a.secuencia - b.secuencia);

  const zoneEvents = [];
  const unknownZones = [];
  for (const ev of events) {
    if (!ev.kind) continue;
    if (ev.zona.tipo === ZONE_TYPES.DESCONOCIDA) {
      unknownZones.push({ ts: ev.ts, zona: ev.zonaTexto, kind: ev.kind });
      continue;
    }
    zoneEvents.push(ev);
  }

  return {
    events,
    zoneEvents,
    unknownZones,
    invalidRows: invalid,
    gpsAntiguo: events.filter((e) => e.gpsAntiguo).length,
    primerEvento: events[0]?.ts ?? null,
    ultimoEvento: events.length ? events[events.length - 1].ts : null,
  };
}

/**
 * Inicio de jornada (D3/H13): primer "Vehículo encendido"; si no hay,
 * "Se movio" (estimado); si tampoco, el primer evento del día (estimado).
 */
export function findDayStart(events, params = {}) {
  const principal = params.inicio_jornada_alertas || ["Vehículo encendido"];
  const respaldo = params.inicio_jornada_respaldo || ["Se movio"];
  const first = events.find((e) => matchesAnyPattern(e.alerta, principal));
  if (first) return { ts: first.ts, calidad: "real", fuente: first.alerta };
  const moved = events.find((e) => matchesAnyPattern(e.alerta, respaldo));
  if (moved) return { ts: moved.ts, calidad: "estimado", fuente: moved.alerta };
  // Sin encendido ni movimiento: el primer evento del día (aunque sea ralentí)
  // es la mejor aproximación (ej. BXT-918 el 27/09). Los eventos de
  // `ignorar_para_inicio` nunca cuentan como inicio "real".
  if (events[0]) return { ts: events[0].ts, calidad: "estimado", fuente: events[0].alerta };
  return { ts: null, calidad: "faltante", fuente: null };
}
