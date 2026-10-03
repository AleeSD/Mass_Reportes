import { ZONE_TYPES } from "./normalizeZone.js";

function newStay(ev) {
  return {
    zona_tipo: ev.zona.tipo,
    zonaKey: ev.zona.key,
    codigo: ev.zona.codigo ?? null,
    local: ev.zona.local ?? null,
    nombre: ev.zona.nombre,
    cd: ev.zona.cd ?? null,
    distrito: ev.zona.distrito ?? null,
    llegada: null,
    salida: null,
    llegada_calidad: "real",
    salida_calidad: "real",
    marcas: [],
    rebotes: [],
    llegadas_repetidas: [],
    gps_antiguo: false,
    paso: false,
    seg_permanencia: null,
  };
}

function addMark(stay, mark) {
  if (!stay.marcas.includes(mark)) stay.marcas.push(mark);
}

export function stayKeyTs(stay) {
  return stay.llegada ?? stay.salida;
}

/**
 * Llegó/Salió depurados -> estancias (§4.1, reglas 2 a 5) y pasos por zona.
 */
export function buildStays(zoneEvents, params = {}) {
  const reboteSeg = Number(params.fusion_rebote_minutos ?? 10) * 60;
  const pasoSeg = Number(params.paso_por_zona_segundos ?? 180);
  const stays = [];
  const open = new Map();
  const lastClosed = new Map();
  let lastArrival = null;

  for (const ev of zoneEvents) {
    const key = ev.zona.key;
    if (ev.kind === "in") {
      const current = open.get(key);
      if (current) {
        // Regla 2: llegada repetida sin salida -> misma estancia.
        current.llegadas_repetidas.push(ev.ts);
        addMark(current, "llegada repetida");
        if (ev.gpsAntiguo) current.gps_antiguo = true;
        lastArrival = { key, ts: ev.ts };
        continue;
      }
      const prev = lastClosed.get(key);
      const otherZoneBetween =
        prev && lastArrival && lastArrival.key !== key && lastArrival.ts >= prev.salida;
      if (prev && prev.salida != null && ev.ts - prev.salida <= reboteSeg && !otherZoneBetween) {
        // Regla 3: rebote de geocerca -> se reabre la estancia anterior.
        prev.rebotes.push({ salida: prev.salida, llegada: ev.ts });
        prev.salida = null;
        addMark(prev, "rebote fusionado");
        if (ev.gpsAntiguo) prev.gps_antiguo = true;
        open.set(key, prev);
        lastClosed.delete(key);
      } else {
        const stay = newStay(ev);
        stay.llegada = ev.ts;
        if (ev.gpsAntiguo) stay.gps_antiguo = true;
        stays.push(stay);
        open.set(key, stay);
      }
      lastArrival = { key, ts: ev.ts };
    } else if (ev.kind === "out") {
      const current = open.get(key);
      if (current) {
        current.salida = ev.ts;
        if (ev.gpsAntiguo) current.gps_antiguo = true;
        open.delete(key);
        lastClosed.set(key, current);
      } else {
        // Regla 4: salida sin llegada (el vehículo ya estaba dentro).
        const stay = newStay(ev);
        stay.salida = ev.ts;
        stay.llegada_calidad = "faltante";
        addMark(stay, "salida sin llegada");
        if (ev.gpsAntiguo) stay.gps_antiguo = true;
        stays.push(stay);
        lastClosed.set(key, stay);
      }
    }
  }

  // Regla 5: llegada sin salida al final del día -> estancia abierta.
  for (const stay of open.values()) {
    stay.salida = null;
    stay.salida_calidad = "faltante";
    addMark(stay, "estancia abierta");
  }

  for (const stay of stays) {
    if (stay.gps_antiguo) addMark(stay, "GPS antiguo");
    if (stay.llegada != null && stay.salida != null) {
      stay.seg_permanencia = stay.salida - stay.llegada;
    }
    if (
      stay.zona_tipo === ZONE_TYPES.TIENDA &&
      stay.seg_permanencia != null &&
      stay.seg_permanencia < pasoSeg
    ) {
      stay.paso = true;
      addMark(stay, "paso por zona");
    }
  }

  stays.sort((a, b) => stayKeyTs(a) - stayKeyTs(b));
  return stays;
}
