import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, loadFleetConfig, loadStoresCatalog, loadZonesConfig } from "../src/config.js";
import { buildFleetTimeline } from "../src/engine/timeline/index.js";
import { formatDuration, tsToHms } from "../src/engine/timeline/utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(__dirname, "fixtures");

export const ctx = {
  params: loadConfig().analitica_flota,
  zonesConfig: loadZonesConfig(),
  catalog: loadStoresCatalog(),
  flota: loadFleetConfig(),
};

export function timeline(tables, fecha = "2026-09-27", overrides = {}) {
  return buildFleetTimeline({ ...ctx, ...overrides, tables, fecha });
}

export const hms = tsToHms;
export const dur = formatDuration;

let seq = 0;
/** Fila sintética de alerta con el formato de REPORTE_ALERTAS. */
export function row(hora, alerta, zona = "", extra = {}) {
  seq += 1;
  return {
    Secuencia: String(seq),
    "Placa/Patente": extra.placa || "ZZZ-999",
    Fecha: extra.fecha || "28/09/2026",
    Hora: hora,
    Alerta: alerta,
    Zona: zona,
    "Estado GPS": extra.gps || "En línea",
    ...extra,
  };
}

export const IN = "Llegó a la zona";
export const OUT = "Salió de zona";
export const ON = "Vehículo encendido";
