// Formato de horas y duraciones de la analítica de flota.
// Las horas llegan como texto "YYYY-MM-DD HH:MM:SS" (hora local de Lima).

// Paleta validada (dataviz validate_palette: pasa CVD y visión normal).
export const ZONE_COLORS = {
  BSF: "#2563EB",
  BASE_OS: "#A21CAF",
  TIENDA: "#15803D",
  RUTA: "#CBD5E1",
  PASO: "#94A3B8",
};

export const ZONE_LABELS = { BSF: "BSF", BASE_OS: "Base OS", TIENDA: "Tienda" };

export function dur(secs) {
  if (secs == null || Number.isNaN(secs)) return "—";
  const s = Math.abs(Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const se = s % 60;
  return `${secs < 0 ? "-" : ""}${h}:${String(m).padStart(2, "0")}:${String(se).padStart(2, "0")}`;
}

/** 2 h 45 min / 38 min */
export function durShort(secs) {
  if (secs == null || Number.isNaN(secs)) return "—";
  const m = Math.round(Math.abs(secs) / 60);
  const h = Math.floor(m / 60);
  const mi = m % 60;
  if (!h) return `${mi} min`;
  return mi ? `${h} h ${String(mi).padStart(2, "0")} min` : `${h} h`;
}

export function hms(text) {
  if (!text) return "—";
  return String(text).slice(11, 19);
}

export function hm(text) {
  if (!text) return "—";
  return String(text).slice(11, 16);
}

function dayNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** Segundos desde la medianoche de `fecha` (puede pasar de 86400 si cruza el día). */
export function daySecs(text, fecha) {
  if (!text) return null;
  const m = String(text).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return (dayNumber(m[1]) - dayNumber(fecha)) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
}

export function secsToHm(secs) {
  if (secs == null) return "—";
  const s = Math.round(secs);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

export function average(list) {
  const v = list.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

export function fechaLarga(iso) {
  if (!iso) return "";
  const text = new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** KPIs de flota recalculados sobre los datos filtrados. */
export function computeKpis({ placas, trips, visits, fecha }) {
  const conReporte = placas.filter((p) => p.estado_reporte === "Con reporte");
  const firstExits = conReporte.map((p) => daySecs(p.primera_salida_bsf, fecha)).filter((v) => v != null);
  const withStores = trips.filter((t) => t.con_tiendas);
  const bsf = visits.filter((v) => v.zona_tipo === "BSF");
  const stores = visits.filter((v) => v.zona_tipo === "TIENDA" && !v.paso);
  return {
    esperadas: placas.filter((p) => p.en_flota).length,
    conReporte: conReporte.filter((p) => p.en_flota).length,
    fueraDeFlota: conReporte.filter((p) => !p.en_flota).length,
    primeraSalidaBsf: firstExits.length ? Math.min(...firstExits) : null,
    horaMediaSalidaBsf: average(firstExits),
    vueltasMedia: conReporte.length ? withStores.length / conReporte.length : null,
    vueltasConTiendas: withStores.length,
    segVueltaMedia: average(withStores.map((t) => t.seg_vuelta)),
    segPrimeraTiendaMedia: average(withStores.map((t) => t.seg_a_primera_tienda)),
    segBsfMedia: average(bsf.map((v) => v.seg_permanencia)),
    tiendasVisitadas: stores.length,
    tiendasDistintas: new Set(stores.map((v) => v.codigo)).size,
    finEnTienda: trips.filter((t) => t.cierre_tipo === "FIN_SERVICIO").length,
  };
}
