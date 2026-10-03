import { ZONE_TYPES } from "./normalizeZone.js";
import { stayKeyTs } from "./buildStays.js";

export const ORIGEN_LABELS = {
  PRECARGA: "Precarga",
  INICIO: "Inicio de jornada",
  BSF: "Salida BSF",
  BASE_OS: "Salida Base OS",
  SIN_ORIGEN: "Sin origen",
};

export const CIERRE_LABELS = {
  BSF: "BSF",
  BASE_OS: "Base OS",
  FIN_SERVICIO: "Fin de servicio en tienda",
  SIN_VISITAS_BSF: "Salida de BSF sin visitas registradas",
  SIN_VISITAS_BASE_OS: "Salida de Base OS sin visitas registradas",
};

const isDepot = (stay) => stay.zona_tipo === ZONE_TYPES.BSF || stay.zona_tipo === ZONE_TYPES.BASE_OS;

function openTrip(origenTipo, inicio, inicioCalidad, depotStay = null) {
  return {
    vuelta: null,
    origen_tipo: origenTipo,
    origen: ORIGEN_LABELS[origenTipo] || origenTipo,
    inicio,
    inicio_calidad: inicioCalidad,
    llegada_bsf_prev: depotStay?.zona_tipo === ZONE_TYPES.BSF ? depotStay.llegada : null,
    salida_bsf: depotStay?.zona_tipo === ZONE_TYPES.BSF ? depotStay.salida : null,
    seg_en_bsf: depotStay?.zona_tipo === ZONE_TYPES.BSF ? depotStay.seg_permanencia : null,
    depot: depotStay,
    tiendas: [],
    pasos: [],
    cierre_tipo: null,
    cierre: null,
    cierre_hora: null,
    cierre_stay: null,
  };
}

function closeTrip(trip, tipo, hora, stay = null) {
  trip.cierre_tipo = tipo;
  trip.cierre = CIERRE_LABELS[tipo] || tipo;
  trip.cierre_hora = hora;
  trip.cierre_stay = stay;
}

function finalizeTrip(trip) {
  const tiendas = trip.tiendas;
  trip.n_tiendas = tiendas.length;
  trip.con_tiendas = tiendas.length > 0;
  tiendas.forEach((stay, idx) => {
    stay.n_tienda = idx + 1;
    stay.seg_acumulado =
      trip.inicio != null && stay.llegada != null ? stay.llegada - trip.inicio : null;
    const prev = tiendas[idx - 1];
    stay.seg_traslado =
      prev && prev.salida != null && stay.llegada != null ? stay.llegada - prev.salida : null;
  });
  const first = tiendas[0];
  const last = tiendas[tiendas.length - 1];
  trip.seg_a_primera_tienda = first ? first.seg_acumulado : null;
  trip.salida_ultima_tienda = last ? last.salida : null;
  trip.seg_retorno =
    last && last.salida != null && trip.cierre_hora != null &&
    (trip.cierre_tipo === "BSF" || trip.cierre_tipo === "BASE_OS")
      ? trip.cierre_hora - last.salida
      : null;
  trip.seg_vuelta =
    trip.inicio != null && trip.cierre_hora != null ? trip.cierre_hora - trip.inicio : null;

  const faltante =
    (trip.cierre_hora == null && !String(trip.cierre_tipo).startsWith("SIN_VISITAS")) ||
    trip.inicio == null ||
    tiendas.some((s) => s.llegada == null || s.salida == null);
  trip.calidad = faltante ? "faltante" : trip.inicio_calidad === "estimado" ? "estimado" : "real";
  return trip;
}

/**
 * Estancias -> vueltas (§4.2). BSF y Base OS cierran la vuelta actual y abren
 * la siguiente al salir; las tiendas se agregan a la vuelta actual; la última
 * tienda sin continuación produce fin de servicio (D4). Los pasos por zona no
 * cuentan como visita ni ocupan número de tienda.
 */
export function buildTrips(stays, dayStart = { ts: null, calidad: "faltante" }) {
  const trips = [];
  let current = null;

  const realStays = stays.filter((s) => !s.paso);
  if (dayStart?.ts != null && realStays.length) {
    const firstTs = stayKeyTs(realStays[0]);
    const clamped = firstTs != null && firstTs < dayStart.ts;
    current = openTrip(
      "INICIO",
      clamped ? firstTs : dayStart.ts,
      clamped ? "estimado" : dayStart.calidad,
    );
  }

  for (const stay of stays) {
    if (stay.paso) {
      if (current) current.pasos.push(stay);
      stay._trip = current;
      continue;
    }
    if (isDepot(stay)) {
      const depotTipo = stay.zona_tipo === ZONE_TYPES.BSF ? "BSF" : "BASE_OS";
      if (current) {
        if (stay.llegada != null) {
          closeTrip(current, depotTipo, stay.llegada, stay);
          trips.push(current);
        } else if (current.tiendas.length) {
          // Llegada al depósito no registrada: se cierra con hora faltante.
          closeTrip(current, depotTipo, null, stay);
          trips.push(current);
        }
        // Un "Inicio de jornada" sin tiendas y sin llegada registrada se
        // descarta: el vehículo amaneció dentro del depósito.
        stay._closes = current;
        current = null;
      }
      if (stay.salida != null) {
        current = openTrip(depotTipo, stay.salida, "real", stay);
        stay._trip = current;
      } else {
        stay._trip = stay._closes || null;
      }
      continue;
    }
    // Tienda real
    if (!current) {
      current = openTrip("SIN_ORIGEN", dayStart?.ts ?? null, "estimado");
    }
    current.tiendas.push(stay);
    stay._trip = current;
  }

  if (current) {
    if (current.tiendas.length) {
      const last = current.tiendas[current.tiendas.length - 1];
      closeTrip(current, "FIN_SERVICIO", last.salida, last);
      trips.push(current);
    } else if (current.origen_tipo === "BSF" || current.origen_tipo === "BASE_OS") {
      closeTrip(current, current.origen_tipo === "BSF" ? "SIN_VISITAS_BSF" : "SIN_VISITAS_BASE_OS", null);
      trips.push(current);
    }
  }

  trips.forEach((trip, idx) => {
    trip.vuelta = idx + 1;
    if (trip.origen_tipo === "INICIO" && trip.tiendas.length) {
      trip.origen_tipo = "PRECARGA";
      trip.origen = ORIGEN_LABELS.PRECARGA;
    }
    finalizeTrip(trip);
  });

  for (const stay of stays) {
    const trip = stay._trip && trips.includes(stay._trip) ? stay._trip : null;
    stay.vuelta = trip ? trip.vuelta : null;
    delete stay._trip;
    delete stay._closes;
  }
  return trips;
}
